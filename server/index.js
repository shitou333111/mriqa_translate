import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import cors from "cors";
import { diffWords } from "diff";
import express from "express";
import helmet from "helmet";
import sanitizeHtml from "sanitize-html";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const enDir = path.join(rootDir, "en");
const zhDir = path.join(rootDir, "zh");
const baselineDir = path.join(rootDir, "baseline");
const frontendDistDir = path.join(rootDir, "frontend", "dist");
const frontendIndexPath = path.join(frontendDistDir, "index.html");
const publicMetaDir = path.join(rootDir, "public", "meta");
const rootMetaDir = path.join(rootDir, "meta");
const legacySrcMetaDir = path.join(rootDir, "frontend", "src", "meta");
const menuFile = path.join(publicMetaDir, "sidebar.json");
const metaInfoFile = path.join(publicMetaDir, "meta_info.json");
const overlayMapFile = path.join(publicMetaDir, "first_pic_texts_zh_map_basename.json");
const menuFileCandidates = [
  menuFile,
  path.join(rootMetaDir, "sidebar.json"),
  path.join(legacySrcMetaDir, "sidebar.json")
];
const metaInfoFileCandidates = [
  metaInfoFile,
  path.join(rootMetaDir, "meta_info.json"),
  path.join(legacySrcMetaDir, "meta_info.json")
];

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

const saveRateLimit = new Map();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use(express.static(frontendDistDir, { index: false }));
app.use(express.static(path.join(rootDir, "public"), { index: false }));
app.use("/en", express.static(enDir, { index: false }));
app.use("/zh", express.static(zhDir, { index: false }));
app.use("/baseline", express.static(baselineDir, { index: false }));

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function slugToRouteId(slug) {
  const normalized = String(slug || "").trim().replace(/^\//, "").replace(/\.html$/i, "");
  if (!normalized || /^index$/i.test(normalized)) {
    return "index";
  }
  return normalized;
}

function routeIdToSlug(id) {
  const normalized = String(id || "").trim().replace(/^\//, "");
  if (!normalized || /^index$/i.test(normalized)) {
    return "index.html";
  }
  return `${normalized}.html`;
}

function normalizeRequestedSlug(value) {
  const raw = String(value || "").trim().replace(/^\//, "");
  if (!raw) {
    return "";
  }
  if (/\.html?$/i.test(raw)) {
    return raw;
  }
  return routeIdToSlug(raw);
}

function getBaselinePath(slug) {
  return path.join(baselineDir, slug);
}

function getArticleFilePath(lang, slug) {
  const targetDir = lang === "en" ? enDir : zhDir;
  return path.join(targetDir, slug);
}

async function getAllowedSlugs() {
  const files = await fs.readdir(enDir);
  return new Set(files.filter((name) => name.toLowerCase().endsWith(".html")));
}

async function assertValidSlug(slug) {
  const allowed = await getAllowedSlugs();
  if (allowed.has(slug)) {
    return slug;
  }

  const lower = String(slug || "").toLowerCase();
  const canonical = Array.from(allowed).find((name) => name.toLowerCase() === lower);
  if (canonical) {
    return canonical;
  }

  if (!allowed.has(slug)) {
    const error = new Error(`Unknown slug: ${slug}`);
    error.status = 404;
    throw error;
  }
}

async function ensureZhFile(slug) {
  const zhPath = getArticleFilePath("zh", slug);
  try {
    await fs.access(zhPath);
  } catch {
    const enPath = getArticleFilePath("en", slug);
    const fallback = await fs.readFile(enPath, "utf8");
    await fs.writeFile(zhPath, fallback, "utf8");
  }
}

function parseArticle(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const title = $("title").first().text().trim() || "Untitled";
  const contentNode = $("#content");
  const contentHtml = contentNode.length > 0 ? contentNode.html() || "" : $("body").html() || "";
  return {
    title,
    contentHtml
  };
}

function injectArticleContent(fullHtml, contentHtml) {
  const $ = cheerio.load(fullHtml, { decodeEntities: false });
  const contentNode = $("#content");
  if (contentNode.length > 0) {
    contentNode.html(contentHtml);
  } else {
    $("body").html(contentHtml);
  }
  return $.html();
}

function sanitizeContent(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "div", "span", "strong", "b", "em", "i", "u", "s", "sup", "sub", "blockquote",
      "ul", "ol", "li", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "table",
      "thead", "tbody", "tr", "td", "th", "br", "hr", "font", "center", "small", "big",
      "pre", "code", "mark", "ins", "del", "iframe"
    ],
    allowedAttributes: {
      "*": ["class", "style", "id", "title", "data-image-slot"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["color", "size", "face"],
      iframe: ["src", "width", "height", "frameborder", "allowfullscreen", "title", "allow"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: true
  });
}

function restoreProtectedImages(currentContentHtml, incomingHtml) {
  const $current = cheerio.load(`<div id=\"current\">${currentContentHtml}</div>`, { decodeEntities: false });
  const currentImages = $current("#current img")
    .map((_, element) => $current.html(element))
    .get();

  const $incoming = cheerio.load(`<div id=\"incoming\">${incomingHtml}</div>`, { decodeEntities: false });

  $incoming("#incoming [data-image-slot]").each((_, element) => {
    const slot = Number($incoming(element).attr("data-image-slot"));
    const imageHtml = Number.isInteger(slot) ? currentImages[slot] : null;
    if (imageHtml) {
      $incoming(element).replaceWith(imageHtml);
    } else {
      $incoming(element).remove();
    }
  });

  // Do not allow client-side image changes; keep original image src/order.
  const incomingImages = $incoming("#incoming img").toArray();
  for (let index = 0; index < incomingImages.length; index += 1) {
    const imageHtml = currentImages[index] || "";
    if (imageHtml) {
      $incoming(incomingImages[index]).replaceWith(imageHtml);
    } else {
      $incoming(incomingImages[index]).remove();
    }
  }

  return $incoming("#incoming").html() || "";
}

async function readArticle(lang, slug) {
  slug = await assertValidSlug(slug);
  if (lang === "zh") {
    await ensureZhFile(slug);
  }
  const filePath = getArticleFilePath(lang, slug);
  const html = await fs.readFile(filePath, "utf8");
  const parsed = parseArticle(html);
  const stat = await fs.stat(filePath);
  return {
    id: slugToRouteId(slug),
    slug,
    lang,
    title: parsed.title,
    contentHtml: parsed.contentHtml,
    hash: sha256(parsed.contentHtml),
    updatedAt: stat.mtime.toISOString()
  };
}

async function getVersionFile(slug, versionName) {
  if (versionName === "current") {
    return getArticleFilePath("zh", slug);
  }
  if (versionName !== "baseline") {
    const error = new Error("Unsupported version");
    error.status = 400;
    throw error;
  }

  const baselinePath = getBaselinePath(slug);
  try {
    await fs.access(baselinePath);
    return baselinePath;
  } catch {
    // Simulate baseline when missing by cloning current zh version.
    const currentPath = getArticleFilePath("zh", slug);
    await fs.mkdir(baselineDir, { recursive: true });
    const currentHtml = await fs.readFile(currentPath, "utf8");
    await fs.writeFile(baselinePath, currentHtml, "utf8");
    return baselinePath;
  }
}

async function rotateVersions(slug, currentFullHtml) {
  await fs.mkdir(baselineDir, { recursive: true });

  const baseline = getBaselinePath(slug);

  try {
    await fs.access(baseline);
  } catch {
    await fs.writeFile(baseline, currentFullHtml, "utf8");
  }
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readJsonFromCandidates(candidates, fallbackValue) {
  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      // Try next candidate file.
    }
  }
  return fallbackValue;
}

async function readMetaInfoJson() {
  const data = await readJsonFromCandidates(metaInfoFileCandidates, {});
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data;
}

async function readOverlayMap() {
  const raw = await fs.readFile(overlayMapFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed.basename_map || parsed;
}

async function writeOverlayMap(mapData) {
  await fs.mkdir(path.dirname(overlayMapFile), { recursive: true });
  await fs.writeFile(overlayMapFile, JSON.stringify(mapData, null, 2), "utf8");
}

function buildDiffHtml(fromText, toText) {
  const chunks = diffWords(fromText, toText);
  return chunks
    .map((part) => {
      const text = escapeHtml(part.value);
      if (part.added) {
        return `<ins class=\"diff-add\">${text}</ins>`;
      }
      if (part.removed) {
        return `<del class=\"diff-remove\">${text}</del>`;
      }
      return `<span>${text}</span>`;
    })
    .join("");
}

function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = saveRateLimit.get(ip) || { count: 0, since: now };
  if (now - entry.since > 60_000) {
    entry.count = 0;
    entry.since = now;
  }
  entry.count += 1;
  saveRateLimit.set(ip, entry);

  if (entry.count > 20) {
    return res.status(429).json({ message: "Too many save requests. Please wait a minute." });
  }

  return next();
}

app.get("/api/menu", async (_req, res, next) => {
  try {
    const menuData = await readJsonFromCandidates(menuFileCandidates, []);
    res.json(Array.isArray(menuData) ? menuData : []);
  } catch (error) {
    next(error);
  }
});

app.get("/api/overlay-map", async (_req, res, next) => {
  try {
    const mapData = await readOverlayMap();
    res.json(mapData);
  } catch (error) {
    next(error);
  }
});

app.get("/api/slugs", async (_req, res, next) => {
  try {
    const allowed = await getAllowedSlugs();
    const ids = Array.from(allowed)
      .map((slug) => slugToRouteId(slug))
      .sort((a, b) => a.localeCompare(b));
    res.json(ids);
  } catch (error) {
    next(error);
  }
});

app.get("/api/article/meta", async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.query.slug || req.query.id || "");
    if (!slug) {
      return res.status(400).json({ message: "slug is required" });
    }
    let authors = [];
    try {
      const metaJson = await readMetaInfoJson();
      const metaEntry = metaJson[slug] || {};
      authors = metaEntry.author || metaEntry.authors || [];
      if (!Array.isArray(authors)) authors = [authors];
    } catch (e) {}
    return res.json({ authors });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/article", async (req, res, next) => {
  try {
    const lang = req.query.lang === "en" ? "en" : "zh";
    const slug = normalizeRequestedSlug(req.query.slug || req.query.id || "");
    if (!slug) {
      return res.status(400).json({ message: "slug/id is required" });
    }
    const article = await readArticle(lang, slug);
    return res.json(article);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/article/save", rateLimit, async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.body.slug || req.body.id || "");
    const html = String(req.body.html || "");
    const baseHash = String(req.body.baseHash || "");
    const overlayText = req.body.overlayText;
    const author = String(req.body.author || "").trim();

    if (!slug || !html || !baseHash) {
      return res.status(400).json({ message: "slug/id, html and baseHash are required" });
    }

    await assertValidSlug(slug);
    await ensureZhFile(slug);

    const zhPath = getArticleFilePath("zh", slug);
    const currentFullHtml = await fs.readFile(zhPath, "utf8");
    const current = parseArticle(currentFullHtml);
    const currentHash = sha256(current.contentHtml);

    if (currentHash !== baseHash) {
      return res.status(409).json({ message: "The article has changed. Please refresh and merge." });
    }

    await rotateVersions(slug, currentFullHtml);

    const sanitized = sanitizeContent(html);
    const protectedHtml = restoreProtectedImages(current.contentHtml, sanitized);
    const updatedFullHtml = injectArticleContent(currentFullHtml, protectedHtml);
    await fs.writeFile(zhPath, updatedFullHtml, "utf8");

    // 淇濆瓨overlay鍐呭
    console.log('Checking overlayText:', overlayText);
    // 鍙湁褰搊verlayText鏄庣‘鎻愪緵骞朵笖鏄湁鏁堟暟缁勬椂鎵嶆洿鏂?
    // 濡傛灉overlayText鏄痷ndefined鎴杗ull锛屽垯涓嶆洿鏂板師鏈夊唴瀹?
    if (overlayText !== undefined && overlayText !== null) {
      if (Array.isArray(overlayText) && overlayText.length > 0) {
        try {
          const overlayMap = await readOverlayMap();
          console.log('Loaded overlay map from canonical path:', overlayMapFile);

          console.log('Current overlayMap for', slug, ':', overlayMap[slug]);
          if (overlayMap[slug]) {
            overlayMap[slug].text = overlayText;
            console.log('Updated overlay text to:', overlayText);
          } else {
            console.log('No entry found for slug:', slug);
          }

          console.log('Writing to', overlayMapFile);
          await writeOverlayMap(overlayMap);

          console.log(`Overlay text saved successfully for ${slug}`);
        } catch (err) {
          console.error("Failed to save overlay text:", err);
          // 涓嶉樆姝富淇濆瓨娴佺▼
        }
      } else {
        console.log('overlayText is provided but is not a valid non-empty array');
      }
    } else {
      console.log('No overlayText provided, skipping overlay update');
    }

    const result = parseArticle(updatedFullHtml);

    try {
      let metaJson = await readMetaInfoJson();

      if (!metaJson[slug]) {
        metaJson[slug] = {};
      }

      if (author) {
        // Extract array
        let authors = metaJson[slug].author || metaJson[slug].authors || [];
        if (!Array.isArray(authors)) authors = [authors];

        // Always add author
        authors.push(author);

        metaJson[slug].author = authors;
        delete metaJson[slug].authors; // standardize layout
      }

      const now = new Date();
      const yyyy = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const timeStr = `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
      
      let updatedAts = metaJson[slug].updatedAt || [];
      if (!Array.isArray(updatedAts)) updatedAts = [updatedAts];
      updatedAts.push(timeStr);
      metaJson[slug].updatedAt = updatedAts;

      await fs.writeFile(metaInfoFile, JSON.stringify(metaJson, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to save author/timestamp:", e);
    }

    return res.json({
      message: "Saved successfully",
      hash: sha256(result.contentHtml),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/article/versions", async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.query.slug || req.query.id || "");
    if (!slug) {
      return res.status(400).json({ message: "slug/id is required" });
    }
    await assertValidSlug(slug);
    const versions = [];

    const baselinePath = getBaselinePath(slug);
    try {
      const baselineStat = await fs.stat(baselinePath);
      versions.push({ name: "baseline", updatedAt: baselineStat.mtime.toISOString() });
    } catch {
      // Ignore when baseline does not exist yet.
    }

    const currentPath = getArticleFilePath("zh", slug);
    const currentStat = await fs.stat(currentPath);
    versions.push({ name: "current", updatedAt: currentStat.mtime.toISOString() });

    res.json(versions);
  } catch (error) {
    next(error);
  }
});

app.get("/api/article/version", async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.query.slug || req.query.id || "");
    const version = String(req.query.version || "baseline");
    if (!slug) {
      return res.status(400).json({ message: "slug/id is required" });
    }

    await assertValidSlug(slug);
    await ensureZhFile(slug);

    const versionPath = await getVersionFile(slug, version);
    const html = await fs.readFile(versionPath, "utf8");
    const parsed = parseArticle(html);
    const stat = await fs.stat(versionPath);

    return res.json({
      id: slugToRouteId(slug),
      slug,
      version,
      title: parsed.title,
      contentHtml: parsed.contentHtml,
      hash: sha256(parsed.contentHtml),
      updatedAt: stat.mtime.toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/article/rollback", rateLimit, async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.body.slug || req.body.id || "");
    const version = String(req.body.version || "");
    if (!slug || !version) {
      return res.status(400).json({ message: "slug/id and version are required" });
    }
    await assertValidSlug(slug);
    await ensureZhFile(slug);

    const zhPath = getArticleFilePath("zh", slug);
    const currentFull = await fs.readFile(zhPath, "utf8");
    await rotateVersions(slug, currentFull);

    const sourceVersionPath = await getVersionFile(slug, version);
    const sourceHtml = await fs.readFile(sourceVersionPath, "utf8");
    await fs.writeFile(zhPath, sourceHtml, "utf8");

    const parsed = parseArticle(sourceHtml);
    res.json({
      message: `Rolled back to ${version}`,
      hash: sha256(parsed.contentHtml),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/article/approve-baseline", rateLimit, async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.body.slug || req.body.id || "");
    if (!slug) {
      return res.status(400).json({ message: "slug/id is required" });
    }

    await assertValidSlug(slug);
    await ensureZhFile(slug);

    const currentPath = getArticleFilePath("zh", slug);
    const currentHtml = await fs.readFile(currentPath, "utf8");

    await fs.mkdir(baselineDir, { recursive: true });
    const baselinePath = getBaselinePath(slug);
    await fs.writeFile(baselinePath, currentHtml, "utf8");

    const stat = await fs.stat(baselinePath);
    const parsed = parseArticle(currentHtml);
    return res.json({
      message: "Baseline updated from current version",
      id: slugToRouteId(slug),
      slug,
      hash: sha256(parsed.contentHtml),
      updatedAt: stat.mtime.toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/article/diff", async (req, res, next) => {
  try {
    const slug = normalizeRequestedSlug(req.query.slug || req.query.id || "");
    const from = String(req.query.from || "baseline");
    const to = String(req.query.to || "current");

    if (!slug) {
      return res.status(400).json({ message: "slug/id is required" });
    }

    await assertValidSlug(slug);
    await ensureZhFile(slug);

    const fromPath = await getVersionFile(slug, from);
    const toPath = await getVersionFile(slug, to);

    const fromHtml = await fs.readFile(fromPath, "utf8");
    const toHtml = await fs.readFile(toPath, "utf8");

    const fromContent = parseArticle(fromHtml).contentHtml;
    const toContent = parseArticle(toHtml).contentHtml;

    res.json({
      id: slugToRouteId(slug),
      slug,
      from,
      to,
      diffHtml: buildDiffHtml(fromContent, toContent)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/review-status", async (_req, res, next) => {
  try {
    const allowed = await getAllowedSlugs();
    const status = {};

    for (const slug of allowed) {
      try {
        const zhPath = getArticleFilePath("zh", slug);
        const zhStat = await fs.stat(zhPath);

        const baselinePath = getBaselinePath(slug);

        let baselineTime = null;
        try {
          const baselineStat = await fs.stat(baselinePath);
          baselineTime = baselineStat.mtime.toISOString();
        } catch {
          // baseline doesn't exist yet
        }

        const currentTime = zhStat.mtime.toISOString();

        let needsReview;
        if (!currentTime) {
          needsReview = false;
        } else if (!baselineTime) {
          needsReview = true;
        } else {
          needsReview = new Date(currentTime) > new Date(baselineTime);
        }

        status[slugToRouteId(slug)] = {
          slug,
          currentTime,
          baselineTime,
          needsReview
        };
      } catch {
        // skip if error
      }
    }

    res.json(status);
  } catch (error) {
    next(error);
  }
});

app.get("/api/legacy-css/:name", async (req, res, next) => {
  try {
    const name = String(req.params.name || "");
    if (!/^[a-zA-Z0-9_-]+\.css$/.test(name)) {
      return res.status(400).send("Invalid css file");
    }
    const cssPath = path.join(rootDir, "original_website", "css", name);
    const css = await fs.readFile(cssPath, "utf8");
    res.type("text/css").send(css);
  } catch (error) {
    next(error);
  }
});

app.get("*", async (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (path.extname(req.path)) {
    return next();
  }

  try {
    await fs.access(frontendIndexPath);
    return res.sendFile(frontendIndexPath);
  } catch {
    const error = new Error(`Cannot ${req.method} ${req.path}`);
    error.status = 404;
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || "Internal server error"
  });
});

app.listen(port, host, () => {
  console.log(`mriqa server listening on http://${host}:${port}`);
});




