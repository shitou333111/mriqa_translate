/*
Batch preprocess HTTrack HTML files by extracting the first <div id="content">...</div> block.
Processes only files directly under input directory (no recursion).
*/

const fs = require("node:fs/promises");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    input: "original_website/original_website_files",
    output: "original_website/processed_html",
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (token === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--verbose") {
      args.verbose = true;
    } else if (token === "--help" || token === "-h") {
      printHelpAndExit();
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Usage:\n  node scripts/extract-content-from-httrack.js [--input <dir>] [--output <dir>] [--dry-run] [--verbose]\n\nOptions:\n  --input   Input folder (default: original_website/original_website_files)\n  --output  Output folder (default: original_website/processed_html)\n  --dry-run Preview only, do not write files\n  --verbose Print per-file status\n`);
  process.exit(0);
}

function extractContentBlock(html) {
  // Accept both legacy and new forms: id="content", id='content', id=content
  const openRe = /<div\b[^>]*\bid\s*=\s*(?:"content"|'content'|content)(?=[\s>])[^>]*>/i;
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return null;
  }

  const startIndex = openMatch.index;
  const tokenRe = /<\/?div\b[^>]*>/gi;
  tokenRe.lastIndex = startIndex;

  let depth = 0;
  let firstOpenSeen = false;
  let token;

  while ((token = tokenRe.exec(html)) !== null) {
    const value = token[0];
    const isClose = /^<\s*\/\s*div\b/i.test(value);

    if (!isClose) {
      depth += 1;
      firstOpenSeen = true;
    } else {
      depth -= 1;
    }

    if (firstOpenSeen && depth === 0) {
      const endIndex = token.index + value.length;
      return html.slice(startIndex, endIndex);
    }
  }

  return null;
}

async function ensureDir(dirPath, dryRun) {
  if (dryRun) {
    return;
  }
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const inputDir = path.resolve(cwd, args.input);
  const outputDir = path.resolve(cwd, args.output);

  const summary = {
    scanned: 0,
    htmlFiles: 0,
    extracted: 0,
    skippedNoContent: 0,
    skippedFiles: [],
    failed: 0,
    failedFiles: [],
    failures: []
  };

  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  summary.scanned = files.length;

  await ensureDir(outputDir, args.dryRun);

  for (const entry of files) {
    const name = entry.name;
    if (!/\.html?$/i.test(name)) {
      continue;
    }

    summary.htmlFiles += 1;
    const inFile = path.join(inputDir, name);
    const outFile = path.join(outputDir, name);

    try {
      const html = await fs.readFile(inFile, "utf8");
      const contentBlock = extractContentBlock(html);
      if (contentBlock) {
        if (!args.dryRun) {
          await fs.writeFile(outFile, contentBlock, "utf8");
        }
        summary.extracted += 1;
        if (args.verbose) {
          console.log(`[EXTRACTED] ${name}`);
        }
      } else {
        if (!args.dryRun) {
          await fs.rm(outFile, { force: true });
        }
        summary.skippedNoContent += 1;
        summary.skippedFiles.push(name);
        if (args.verbose) {
          console.log(`[NO_CONTENT_SKIP] ${name}`);
        }
      }
    } catch (error) {
      summary.failed += 1;
      summary.failedFiles.push(name);
      summary.failures.push({ file: name, error: error.message || String(error) });
      console.error(`[FAILED] ${name}: ${error.message || error}`);
    }
  }

  const txtSummaryPath = path.join(cwd, "scripts", "extract-content-summary.txt");
  if (!args.dryRun) {
    const lines = [
      "HTTrack preprocess summary",
      `Input: ${inputDir}`,
      `Output: ${outputDir}`,
      `Scanned files: ${summary.scanned}`,
      `HTML files: ${summary.htmlFiles}`,
      `Extracted <div id=\"content\">: ${summary.extracted}`,
      `No <div id=\"content\"> (skipped): ${summary.skippedNoContent}`,
      `Failed: ${summary.failed}`,
      "",
      `Skipped files (${summary.skippedFiles.length}):`,
      ...(summary.skippedFiles.length > 0
        ? summary.skippedFiles.map((file) => `- ${file}`)
        : ["- None"]),
      "",
      `Failed files (${summary.failedFiles.length}):`,
      ...(summary.failedFiles.length > 0
        ? summary.failedFiles.map((file) => `- ${file}`)
        : ["- None"]),
      "",
      `Failure details (${summary.failures.length}):`,
      ...(summary.failures.length > 0
        ? summary.failures.map((item) => `- ${item.file}: ${item.error}`)
        : ["- None"]),
      ""
    ];
    await fs.writeFile(txtSummaryPath, lines.join("\n"), "utf8");
  }

  console.log("\nDone.");
  console.log(JSON.stringify(summary, null, 2));
  if (!args.dryRun) {
    console.log(`Summary TXT: ${txtSummaryPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
