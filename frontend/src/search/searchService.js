import FlexSearch from "flexsearch";

let index = null;
let documents = {};

export async function initSearch(docArray = []) {
  // Use minimal options to avoid compatibility issues with different FlexSearch builds.
  // Use conservative, broadly compatible configuration for FlexSearch.Document.
  // Field-level tokenizer/encoder options vary between FlexSearch builds; keep minimal options
  // to avoid runtime errors across environments.
  index = new FlexSearch.Document({
    document: {
      id: "id",
      store: ["title", "url", "lang"],
      // index both English/Chinese title variants plus content so CJK queries match
      index: [
        { field: "title", weight: 3 },
        { field: "title_zh", weight: 4 },
        { field: "title_en", weight: 2 },
        { field: "content", weight: 1 }
      ]
    }
  });

  documents = {};
  let added = 0;
  for (const doc of docArray) {
    if (!doc || !doc.id) continue;
    documents[doc.id] = doc;
    try {
      index.add(doc);
      added += 1;
    } catch (err) {
      console.error("searchService.initSearch: index.add failed for id", doc.id, err);
    }
  }

  console.log("searchService.initSearch: index ready", { docs: added });
  return true;
}

export function search(query, lang = "all", limit = 50) {
  console.log("searchService.search called", { query, lang, limit, indexReady: !!index });
  if (!index || !query || !query.trim()) {
    console.log("searchService.search: no index or empty query", { indexReady: !!index, query });
    return [];
  }

  const normalizedLang = (lang || "all").toLowerCase();
  let candidates = [];
  try {
    candidates = index.search(query, { field: ["title", "title_zh", "title_en", "content"], limit });
  } catch (err) {
    console.log("searchService.search: index.search threw", err);
    return [];
  }

  console.log("searchService.search raw candidates", candidates);

  const uniqueIds = new Set();
  const results = [];

  // FlexSearch.Document can return different shapes depending on version/options:
  // - an array of groups: [{field: 'title', result: [ids]}, ...]
  // - a flat array of ids: [id1, id2, ...]
  // - an object mapping fields -> arrays
  if (Array.isArray(candidates) && candidates.length > 0) {
    // flat ids array
    if (typeof candidates[0] === "string" || typeof candidates[0] === "number") {
      for (const id of candidates) {
        if (uniqueIds.has(String(id))) continue;
        uniqueIds.add(String(id));
        const doc = documents[String(id)];
        if (!doc) continue;
        if (normalizedLang !== "all" && String(doc.lang || "").toLowerCase() !== normalizedLang) continue;
        results.push(doc);
        if (results.length >= limit) break;
      }
      return results;
    }

    // groups with .result
    for (const group of candidates) {
      const ids = group && group.result ? group.result : [];
      for (const id of ids) {
        const sid = String(id);
        if (uniqueIds.has(sid)) continue;
        uniqueIds.add(sid);
        const doc = documents[sid];
        if (!doc) continue;
        if (normalizedLang !== "all" && String(doc.lang || "").toLowerCase() !== normalizedLang) continue;
        results.push(doc);
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
    return results;
  }

  // object mapping fields -> arrays
  if (candidates && typeof candidates === "object") {
    for (const key of Object.keys(candidates)) {
      const arr = candidates[key] || [];
      for (const id of arr) {
        const sid = String(id);
        if (uniqueIds.has(sid)) continue;
        uniqueIds.add(sid);
        const doc = documents[sid];
        if (!doc) continue;
        if (normalizedLang !== "all" && String(doc.lang || "").toLowerCase() !== normalizedLang) continue;
        results.push(doc);
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}
