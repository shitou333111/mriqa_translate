/*
Batch translate HTML files in original_website/processed_html using a LLM API.
Writes translated files to original_website/machine_translated with same filenames.
Records per-file result lines to original_website/translate_record.txt.
*/

const fs = require("node:fs/promises");
const path = require("node:path");

const API_KEY = process.env.TRANSLATE_API_KEY || "sk-kU6RKmuZPzvezDdzB69HkHXRm1weKyiPE7zfR2ptqntUmTpW";
const BASE_URL = process.env.TRANSLATE_BASE_URL || "https://api.302.ai";
// const MODEL = process.env.TRANSLATE_MODEL || "deepseek-v3.2";
const MODEL = process.env.TRANSLATE_MODEL || "deepseek-v3.2-thinking";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "original_website", "processed_html");
const OUTPUT_DIR = path.join(ROOT, "original_website", "machine_translated");
const PROMPT_FILE = path.join(ROOT, "scripts", "translate_prompt.txt");
const RECORD_FILE = path.join(ROOT, "original_website", "translate_record.txt");

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    verbose: false,
    limit: 0,
    overwrite: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--dry-run") {
      args.dryRun = true;
    } else if (t === "--verbose") {
      args.verbose = true;
    } else if (t === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || 0;
      i += 1;
    } else if (t === "--overwrite") {
      args.overwrite = true;
    } else if (t === "--no-ref-extract") {
      // disable extracting Reference div before translation
      args.noRefExtract = true;
    } else if (t === "--help" || t === "-h") {
      printHelpAndExit();
    }
  }

  // default explicitly false if not set
  if (!Object.prototype.hasOwnProperty.call(args, 'noRefExtract')) args.noRefExtract = false;

  return args;
}

function printHelpAndExit() {
  console.log(`Usage:\n  node scripts/translate-processed-html.js [--dry-run] [--verbose] [--limit N] [--overwrite]\n\nDefaults:\n  Skip existing output files: true\n  Input: ${INPUT_DIR}\n  Output: ${OUTPUT_DIR}\n  Record: ${RECORD_FILE}\n  API: ${BASE_URL}\n  Model: ${MODEL}\n`);
  process.exit(0);
}

async function appendRecord(line) {
  await fs.appendFile(RECORD_FILE, `${line}\n`, "utf8");
}

function stripCodeFence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function getDivRangeFromStart(html, startIndex) {
  const tokenRe = /<\/?div\b[^>]*>/gi;
  tokenRe.lastIndex = startIndex;

  let depth = 0;
  let opened = false;
  let token;

  while ((token = tokenRe.exec(html)) !== null) {
    if (token.index < startIndex) {
      continue;
    }

    const value = token[0];
    const isClose = /^<\s*\/\s*div\b/i.test(value);

    if (!isClose) {
      depth += 1;
      opened = true;
    } else {
      depth -= 1;
    }

    if (opened && depth === 0) {
      return { start: startIndex, end: token.index + value.length };
    }
  }

  return null;
}

function findDivByKeyword(html, keyword, useLastMatch = true) {
  const keywordIndex = useLastMatch ? html.lastIndexOf(keyword) : html.indexOf(keyword);
  if (keywordIndex < 0) {
    return null;
  }

  let searchPos = keywordIndex;
  while (searchPos >= 0) {
    const divStart = html.lastIndexOf("<div", searchPos);
    if (divStart < 0) {
      return null;
    }

    const gt = html.indexOf(">", divStart);
    if (gt < 0 || gt > keywordIndex) {
      searchPos = divStart - 1;
      continue;
    }

    const range = getDivRangeFromStart(html, divStart);
    if (!range) {
      return null;
    }

    if (range.start <= keywordIndex && keywordIndex < range.end) {
      return {
        start: range.start,
        end: range.end,
        html: html.slice(range.start, range.end)
      };
    }

    searchPos = divStart - 1;
  }

  return null;
}

function extractReferenceDivOnly(html) {
  // 只提取包含 Reference 的 div，本 div 不翻译；其余部分（含后续 Related Questions）继续翻译。
  const refRange = findDivByKeyword(html, "Reference", true);
  if (!refRange) {
    return {
      beforeHtml: html,
      afterHtml: "",
      referenceHtml: "",
      referenceFound: false,
      referenceStart: -1,
      referenceEnd: -1
    };
  }

  const beforeHtml = html.slice(0, refRange.start);
  const afterHtml = html.slice(refRange.end);

  return {
    beforeHtml,
    afterHtml,
    referenceHtml: refRange.html,
    referenceFound: true,
    referenceStart: refRange.start,
    referenceEnd: refRange.end
  };
}

async function requestModelTranslation(htmlChunk, promptText) {
  if (!htmlChunk || !htmlChunk.trim()) {
    return "";
  }

  const endpoint = `${BASE_URL.replace(/\/$/, "")}/v1/chat/completions`;

  const payload = {
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: promptText
      },
      {
        role: "user",
        content: htmlChunk
      }
    ]
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${raw.slice(0, 400)}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${raw.slice(0, 400)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error("Empty model response content");
  }

  const translatedContent = stripCodeFence(content);
  return translatedContent;
}

async function translateHtml(html, promptText, opts = {}) {
  const { extractReference = true } = opts;

  if (!extractReference) {
    const translatedWhole = await requestModelTranslation(html, promptText);
    return {
      translatedHtml: translatedWhole,
      refInfo: {
        referenceFound: false,
        referenceStart: -1,
        referenceEnd: -1,
        strategy: "no_extract"
      },
      stats: {
        sourceLength: html.length,
        beforeLength: html.length,
        referenceLength: 0,
        afterLength: 0,
        modelOutputLength: translatedWhole.length,
        finalLength: translatedWhole.length
      }
    };
  }

  const refInfo = extractReferenceDivOnly(html);

  if (!refInfo.referenceFound) {
    const translatedWhole = await requestModelTranslation(refInfo.beforeHtml, promptText);
    return {
      translatedHtml: translatedWhole,
      refInfo: {
        referenceFound: false,
        referenceStart: -1,
        referenceEnd: -1,
        strategy: "single_call"
      },
      stats: {
        sourceLength: html.length,
        beforeLength: refInfo.beforeHtml.length,
        referenceLength: 0,
        afterLength: 0,
        modelOutputLength: translatedWhole.length,
        finalLength: translatedWhole.length
      }
    };
  }

  const translatedBefore = await requestModelTranslation(refInfo.beforeHtml, promptText);
  const translatedAfter = await requestModelTranslation(refInfo.afterHtml, promptText);
  const finalHtml = `${translatedBefore}${refInfo.referenceHtml}${translatedAfter}`;

  return {
    translatedHtml: finalHtml,
    refInfo: {
      referenceFound: refInfo.referenceFound,
      referenceStart: refInfo.referenceStart,
      referenceEnd: refInfo.referenceEnd,
      strategy: "split_before_after"
    },
    stats: {
      sourceLength: html.length,
      beforeLength: refInfo.beforeHtml.length,
      referenceLength: refInfo.referenceHtml.length,
      afterLength: refInfo.afterHtml.length,
      modelOutputLength: translatedBefore.length + translatedAfter.length,
      finalLength: finalHtml.length
    }
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!API_KEY) {
    throw new Error("Missing API key");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const promptText = await fs.readFile(PROMPT_FILE, "utf8");
  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const htmlFiles = entries
    .filter((e) => e.isFile() && /\.html?$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const selectedFiles = args.limit > 0 ? htmlFiles.slice(0, args.limit) : htmlFiles;

  await appendRecord(`\n=== Translate Run Start ${nowIso()} ===`);
  await appendRecord(`input=${INPUT_DIR}`);
  await appendRecord(`output=${OUTPUT_DIR}`);
  await appendRecord(`total=${selectedFiles.length}, model=${MODEL}, dryRun=${args.dryRun}, overwrite=${args.overwrite}, extractReference=${!args.noRefExtract}`);

  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < selectedFiles.length; i += 1) {
    const name = selectedFiles[i];
    const srcPath = path.join(INPUT_DIR, name);
    const dstPath = path.join(OUTPUT_DIR, name);
    const idx = i + 1;

    try {
      if (!args.overwrite && (await fileExists(dstPath))) {
        skipCount += 1;
        const line = `[${nowIso()}] SKIP ${name} (${idx}/${selectedFiles.length}) reason=exists src=${srcPath} dst=${dstPath}`;
        await appendRecord(line);
        if (args.verbose) {
          console.log(line);
        }
        continue;
      }

      if (args.dryRun) {
        skipCount += 1;
        const line = `[${nowIso()}] DRYRUN ${name} (${idx}/${selectedFiles.length}) src=${srcPath} dst=${dstPath}`;
        await appendRecord(line);
        if (args.verbose) {
          console.log(line);
        }
        continue;
      }

      const html = await fs.readFile(srcPath, "utf8");
      const result = await translateHtml(html, promptText, { extractReference: !args.noRefExtract });
      await fs.writeFile(dstPath, result.translatedHtml, "utf8");

      okCount += 1;
      const line = `[${nowIso()}] OK ${name} (${idx}/${selectedFiles.length}) refFound=${result.refInfo.referenceFound} refRange=[${result.refInfo.referenceStart},${result.refInfo.referenceEnd}) strategy=${result.refInfo.strategy} len(src/before/ref/after/model/final)=${result.stats.sourceLength}/${result.stats.beforeLength}/${result.stats.referenceLength}/${result.stats.afterLength}/${result.stats.modelOutputLength}/${result.stats.finalLength}`;
      await appendRecord(line);
      if (args.verbose) {
        console.log(line);
      }
    } catch (error) {
      failCount += 1;
      const line = `[${nowIso()}] FAIL ${name} (${idx}/${selectedFiles.length}) error=${String(error.message || error).slice(0, 500)}`;
      await appendRecord(line);
      console.error(line);
    }
  }

  await appendRecord(`summary ok=${okCount} fail=${failCount} skip=${skipCount}`);
  await appendRecord(`=== Translate Run End ${nowIso()} ===\n`);

  console.log("Done.");
  console.log({ total: selectedFiles.length, ok: okCount, fail: failCount, skip: skipCount, record: RECORD_FILE });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
