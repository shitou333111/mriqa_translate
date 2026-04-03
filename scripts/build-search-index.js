const fs = require("fs");
const path = require("path");

function stripHtml(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[^>]*-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");

  // decode common HTML entities and numeric entities
  const entityMap = {
    nbsp: ' ',
    lt: '<',
    gt: '>',
    amp: '&',
    quot: '"',
    apos: "'",
    mdash: '—',
    ndash: '–',
    hellip: '…',
    copy: '©',
    reg: '®',
    trade: '™',
    euro: '€',
    pound: '£',
    cent: '¢'
  };
  // Replace named entities like &nbsp; &amp; etc. Prefer known map, leave unknown intact.
  s = s.replace(/&([a-zA-Z]+);/g, (m, name) => {
    const key = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(entityMap, key)) return entityMap[key];
    return m;
  });
  // Handle some malformed cases without trailing semicolon (e.g. &nbsp)
  // Ensure we replace "&nbsp" or "&nbsp;" even when immediately followed by letters,
  // forcing a single normal space to be inserted.
  s = s.replace(/&nbsp;?/gi, ' ');
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  s = s.replace(/&#(\d+);/g, (m, num) => String.fromCharCode(parseInt(num, 10)));

  // remove any remaining HTML entity-looking tokens (safety fallback)
  // e.g. unknown &name; sequences -> replace with a single space to avoid leaving encoded artifacts
  s = s.replace(/&[a-zA-Z0-9#]+;?/g, ' ');

  // collapse whitespace sequences (including multiple non-breaking spaces) into single normal space
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function readHtmlFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const titleMatch = text.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath);
  const content = stripHtml(text);
  return { title, content };
}

function collectFiles(dir, ext = ".html") {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (entry.isFile() && full.toLowerCase().endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const root = path.resolve(__dirname, "..");
  const enDir = path.join(root, "en");
  const zhDir = path.join(root, "zh");

  const docs = [];
  let id = 1;

  // load sidebar title map to prefer canonical titles per language
  let sidebarMap = {};
  try {
    const sidebar = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'src', 'meta', 'sidebar.json'), 'utf8'));
    function walk(items) {
      for (const it of items || []) {
        if (it && it.id) {
          sidebarMap[it.id] = it.title || sidebarMap[it.id] || {};
        }
        if (it && it.children && it.children.length) walk(it.children);
      }
    }
    walk(sidebar);
  } catch (err) {
    // ignore if sidebar not present
  }

  [
    { dir: enDir, lang: "en" },
    { dir: zhDir, lang: "zh" }
  ].forEach(({ dir, lang }) => {
    if (!fs.existsSync(dir)) return;
    const htmlFiles = collectFiles(dir, ".html");
    htmlFiles.forEach((filePath) => {
      const filename = path.basename(filePath); // e.g. index.html
      const rel = path.relative(root, filePath).replace(/\\/g, "/");
      const { title: rawTitle, content } = readHtmlFile(filePath);
      // derive slug/id from filename without .html
      const slug = filename.replace(/\.html?$/i, "");
      // prefer sidebar title when available
      const mapped = sidebarMap[slug] || {};
      const titleCanonical = (mapped[lang] && String(mapped[lang]).trim().length > 0) ? mapped[lang] : rawTitle;
      // build both language title fields when possible
      const title_en = (lang === "en") ? titleCanonical : (mapped.en || rawTitle);
      const title_zh = (lang === "zh") ? titleCanonical : (mapped.zh || rawTitle);
      // url use root-relative path (preserve subfolders) and normalize
      const url = `/${rel.replace(/^\//, "")}`;
      docs.push({
        id: String(id++),
        title: titleCanonical,
        title_en: String(title_en || "").trim(),
        title_zh: String(title_zh || "").trim(),
        content,
        url,
        lang
      });
    });
  });

  const outDir = path.join(root, "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "search-index.json");
  fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), "utf8");
  console.log(`search index written: ${outPath} (${docs.length} docs)`);
}

main();
