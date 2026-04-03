import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import HtmlContent, { applyImageOverlays, extractOverlayText, clearOverlayCache } from "./components/HtmlContent";
import Sidebar from "./components/Sidebar";
import CompleteListOfQuestions from "./components/CompleteListOfQuestions";
import ScreenshotButton from "./components/ScreenshotButton";
import SiteFooter from "./components/SiteFooter";
import GuidePage from "./components/GuidePage";
import * as searchService from "./search/searchService";
import sidebarData from "./meta/sidebar.json";


// Modern tray-style segmented control with sliding animation
function TrayControl({ value, onChange, options, ariaLabel, className = "" }) {
  const buttonRefs = useRef([]);
  const [indicatorStyle, setIndicatorStyle] = useState({});

  useEffect(() => {
    const activeIndex = options.findIndex(opt => opt.value === value);
    if (activeIndex >= 0 && buttonRefs.current[activeIndex]) {
      const button = buttonRefs.current[activeIndex];
      const rect = button.getBoundingClientRect();
      const parentRect = button.parentElement.getBoundingClientRect();
      setIndicatorStyle({
        left: rect.left - parentRect.left - 1.5,
        width: rect.width
      });
    }
  }, [value, options]);

  return (
    <div className={`tray-control-group ${className}`} role="radiogroup" aria-label={ariaLabel}>
      <div className="tray-control-indicator" style={indicatorStyle} />
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={el => buttonRefs.current[index] = el}
          type="button"
          className={`tray-control-btn ${value === option.value ? 'active' : ''}`}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const DEFAULT_VIEW_MODE = "zh";
const SIDEBAR_WIDTH = 288;
const SHELL_SIDE_PADDING = 32;
const REVIEW_PASSWORD = "333";
const ADVANCED_TOGGLE_DURATION = 500;
const advancedToggleTimers = new WeakMap();
const GUIDE_TOUR_STAGE_IDLE = "idle";
const GUIDE_TOUR_STAGE_HOME = "home";
const GUIDE_TOUR_STAGE_EDIT = "edit";
const GUIDE_TOUR_STAGE_REVIEW_ENTRY = "review-entry";
const GUIDE_TOUR_STAGE_REVIEW = "review";
const GUIDE_TOUR_TOTAL_STEPS = 15;
const APP_BASE_URL = import.meta.env.BASE_URL || "/";
const IS_GITHUB_PAGES = typeof window !== "undefined" && /github\.io$/i.test(window.location.hostname);

function withBase(path) {
  const base = APP_BASE_URL.startsWith("/") ? APP_BASE_URL : `/${APP_BASE_URL}`;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const clean = String(path || "").replace(/^\/+/, "");

  if (!clean) {
    return normalizedBase;
  }

  const baseNoLeadingSlash = normalizedBase.replace(/^\//, "");
  if (clean.startsWith(baseNoLeadingSlash)) {
    return `/${clean}`;
  }

  return `${normalizedBase}${clean}`.replace(/\/\/{2,}/g, "/");
}

function isHtmlDocumentString(text) {
  const trimmed = String(text || "").trimStart();
  return trimmed.startsWith("<") || /<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed);
}

function collectLeafIdsFromMenu(nodes) {
  const result = [];

  function walk(items) {
    if (!Array.isArray(items)) {
      return;
    }
    items.forEach((item) => {
      if (!item || !item.id) {
        return;
      }
      if (Array.isArray(item.children) && item.children.length > 0) {
        walk(item.children);
        return;
      }
      if (item.id !== "index" && item.id !== "complete-list-of-questions") {
        result.push(item.id);
      }
    });
  }

  walk(nodes);
  return result;
}

function parseArticleFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const title = doc.querySelector("title")?.textContent?.trim() || "Untitled";
  const contentNode = doc.querySelector("#content");
  const contentHtml = contentNode ? (contentNode.innerHTML || "") : (doc.body?.innerHTML || "");
  return { title, contentHtml };
}

async function fetchStaticArticle(lang, routeId) {
  const slug = (!routeId || routeId === "index") ? "index.html" : `${routeId}.html`;
  const url = withBase(`${lang}/${slug}`);
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`fetch ${url} status ${resp.status}`);
  }
  const html = await resp.text();
  if (!isHtmlDocumentString(html)) {
    throw new Error(`invalid article html from ${url}`);
  }
  const parsed = parseArticleFromHtml(html);
  return {
    id: routeId || "index",
    slug,
    lang,
    title: parsed.title,
    contentHtml: parsed.contentHtml
  };
}

// 兼容旧版Quiz静态HTML中通过onclick调用的函数（比如 showAnswer/showAllAnswers/scoreAnswers）。
function queryControl(id, boundaryElement) {
  if (boundaryElement instanceof HTMLElement) {
    const scoped = boundaryElement.closest(".article-html");
    if (scoped) {
      const scopedEl = scoped.querySelector(`#${id}`);
      if (scopedEl) {
        return scopedEl;
      }
    }
  }
  return document.getElementById(id);
}

function showAnswer(q_string, sourceNode) {
  if (!q_string) {
    return;
  }

  const button = sourceNode instanceof HTMLElement ? sourceNode : queryControl(`show_${q_string}`, sourceNode);
  const answerEl = queryControl(`a_${q_string}`, button);
  const correctLabel = queryControl(`correct_${q_string}`, button);
  const correctInput = queryControl(`c_${q_string}`, button);

  if (!button || !answerEl) {
    return;
  }

  const isChinese = button instanceof HTMLInputElement && /显示|隐藏/.test(button.value);
  const showText = isChinese ? "显示答案" : "Show Answer";
  const hideText = isChinese ? "隐藏答案" : "Hide Answer";

  const currentlyShown = button.value === hideText || window.getComputedStyle(answerEl).display !== "none";

  if (!currentlyShown) {
    answerEl.style.display = "block";
    if (correctLabel) {
      correctLabel.style.fontWeight = "bold";
      if (correctInput instanceof HTMLInputElement) {
        correctLabel.style.color = correctInput.checked ? "Green" : "Red";
      }
    }
    if (button instanceof HTMLInputElement) {
      button.value = hideText;
    }
  } else {
    answerEl.style.display = "none";
    if (button instanceof HTMLInputElement) {
      button.value = showText;
    }
  }
}

function showAllAnswers(topic, sourceNode) {
  if (!topic) {
    return;
  }

  const button = sourceNode instanceof HTMLElement ? sourceNode : queryControl(`show_all_${topic}`, sourceNode);
  if (!button) {
    return;
  }

  const container = button instanceof HTMLElement ? button.closest(".article-html") : null;
  const isChinese = button instanceof HTMLInputElement && /显示|隐藏/.test(button.value);
  const showAllText = isChinese ? "显示本节所有答案" : "Show All Answers for Section";
  const hideAllText = isChinese ? "隐藏本节所有答案" : "Hide All Answers for Section";
  const isCurrentlyShown = button instanceof HTMLInputElement && button.value === hideAllText;
  let i = 0;
  let correct = 0;

  while (true) {
    const answerEl = container?.querySelector(`#a_${topic}_${i}`) || document.getElementById(`a_${topic}_${i}`);
    if (!answerEl) {
      break;
    }

    const correctInput = container?.querySelector(`#c_${topic}_${i}`) || document.getElementById(`c_${topic}_${i}`);
    const correctLabel = container?.querySelector(`#correct_${topic}_${i}`) || document.getElementById(`correct_${topic}_${i}`);

    if (!isCurrentlyShown) {
      answerEl.style.display = "block";
      if (correctLabel) {
        correctLabel.style.fontWeight = "bold";
        if (correctInput instanceof HTMLInputElement) {
          correctLabel.style.color = correctInput.checked ? "Green" : "Red";
        }
      }
    } else {
      answerEl.style.display = "none";
    }

    if (correctInput instanceof HTMLInputElement && correctInput.checked) {
      correct += 1;
    }

    i += 1;
  }

  const scoretext = container?.querySelector(`#scoretxt_${topic}`) || document.getElementById(`scoretxt_${topic}`);
  if (scoretext) {
    scoretext.innerHTML = `You answered ${correct}/${i} correct, for a score of ${i ? Math.round((correct / i) * 100) : 0}%`;
  }

  if (button instanceof HTMLInputElement) {
    button.value = isCurrentlyShown ? showAllText : hideAllText;
  }
}

function scoreAnswers(topic) {
  if (!topic) {
    return;
  }

  let i = 0;
  let correct = 0;

  while (true) {
    const answerEl = document.getElementById(`a_${topic}_${i}`);
    if (!answerEl) {
      break;
    }

    const correctInput = document.getElementById(`c_${topic}_${i}`);
    if (correctInput instanceof HTMLInputElement && correctInput.checked) {
      correct += 1;
    }

    i += 1;
  }

  const scoretext = document.getElementById(`scoretxt_${topic}`);
  if (scoretext) {
    scoretext.innerHTML = `You answered ${correct}/${i} correct, for a score of ${i ? Math.round((correct / i) * 100) : 0}%`;
  }
}

if (typeof window !== "undefined") {
  window.showAnswer = showAnswer;
  window.showAllAnswers = showAllAnswers;
  window.scoreAnswers = scoreAnswers;
}

// 时间显示统一格式：用于“改进翻译/审核翻译”按钮下的审计时间。

function formatActionTime(iso) {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function forceWindowScrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
  }
}

function waitForSelectors(selectors, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      const ready = selectors.every((selector) => !!document.querySelector(selector));
      if (ready) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

function getGuideTourSteps(stage) {
  if (stage === GUIDE_TOUR_STAGE_HOME) {
    return [
      {
        element: ".app-sidebar .sidebar-node.level-1.has-children .sidebar-group",
        popover: {
          title: `1/${GUIDE_TOUR_TOTAL_STEPS} 侧边栏层级目录`,
          description: "这里按层级组织所有问题。点击带三角标的标题可以展开/收起章节，快速定位目标内容。"
        }
      },
      {
        element: ".topbar .tray-control-group",
        popover: {
          title: `2/${GUIDE_TOUR_TOTAL_STEPS} 中英文切换`,
          description: "顶部这组按钮可以切换中文、英文和双语对照阅读模式。"
        }
      },
      {
        element: ".topbar .search-control",
        popover: {
          title: `3/${GUIDE_TOUR_TOTAL_STEPS} 搜索框`,
          description: "支持按标题和正文关键词搜索，适合跨页面检索术语或知识点。"
        }
      },
      {
        element: ".topbar .toolbar-screenshot-btn",
        popover: {
          title: `4/${GUIDE_TOUR_TOTAL_STEPS} 截屏按钮`,
          description: "可以对当前文章内容截图，系统会自动裁掉导航和参考区域，适合分享。"
        }
      },
      {
        element: "[data-tour-enter-edit]",
        actionKey: "enter-edit",
        popover: {
          title: `5/${GUIDE_TOUR_TOTAL_STEPS} 改进翻译`,
          description: "这里是改进翻译入口。你可手动点击，或直接点下一步，系统会自动点击并进入编辑页。"
        }
      }
    ];
  }

  if (stage === GUIDE_TOUR_STAGE_EDIT) {
    return [
      {
        element: ".tour-edit-left-switch",
        popover: {
          title: `6/${GUIDE_TOUR_TOTAL_STEPS} 左侧三版本切换`,
          description: "可在英文原文、基版翻译、当前翻译之间切换，方便对照修订。"
        }
      },
      {
        element: "[data-tour-edit-panel] .editor-html",
        popover: {
          title: `7/${GUIDE_TOUR_TOTAL_STEPS} 右侧编辑卡片`,
          description: "这是实际编辑区。你在此改动文本，系统会自动记录本地草稿并做差异高亮。"
        }
      },
      {
        element: "[data-tour-edit-revert]",
        popover: {
          title: `8/${GUIDE_TOUR_TOTAL_STEPS} 撤销按钮`,
          description: "用于放弃当前未提交改动，恢复到当前线上中文版本。"
        }
      },
      {
        element: "[data-tour-edit-submit]",
        popover: {
          title: `9/${GUIDE_TOUR_TOTAL_STEPS} 提交按钮`,
          description: "完成修改后点击提交，内容会写入后台并记录作者与时间。"
        }
      },
      {
        element: ".tour-authors",
        popover: {
          title: `10/${GUIDE_TOUR_TOTAL_STEPS} 本篇翻译作者`,
          description: "这里展示参与者。后台保存完整历史，页面上做去重展示，方便快速查看贡献者。"
        }
      },
      {
        element: "[data-tour-exit-edit]",
        actionKey: "exit-edit",
        popover: {
          title: `11/${GUIDE_TOUR_TOTAL_STEPS} 退出编辑`,
          description: "这里用于离开编辑页。你可手动点击，或点下一步自动退出并返回引导页。"
        }
      }
    ];
  }

  if (stage === GUIDE_TOUR_STAGE_REVIEW_ENTRY) {
    return [
      {
        element: "[data-tour-enter-review]",
        actionKey: "enter-review",
        popover: {
          title: `12/${GUIDE_TOUR_TOTAL_STEPS} 审核按钮`,
          description: "这里进入审核页。你可手动点击，或点下一步自动进入审核流程。"
        }
      }
    ];
  }

  if (stage === GUIDE_TOUR_STAGE_REVIEW) {
    return [
      {
        element: "[data-tour-review-rollback='true']",
        popover: {
          title: `13/${GUIDE_TOUR_TOTAL_STEPS} 回滚按钮`,
          description: "当当前版本出现严重问题时，可用基版覆盖当前版本。此步骤高亮定位在回滚按钮所在顶部栏。"
        }
      },
      {
        element: "[data-tour-review-approve]",
        popover: {
          title: `14/${GUIDE_TOUR_TOTAL_STEPS} 通过按钮`,
          description: "审核通过会把当前翻译提升为新的基版，作为后续改进的稳定基线。"
        }
      },
      {
        element: "[data-tour-exit-review]",
        actionKey: "exit-review",
        popover: {
          title: `15/${GUIDE_TOUR_TOTAL_STEPS} 退出审核`,
          description: "你可手动点击退出审核，或点下一步自动退出并返回首页。"
        }
      }
    ];
  }

  return [];
}

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored || initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}

// 保存前把图片替换为占位槽，避免编辑器在提交时引入不稳定的图片节点差异。
function createImageSlotHtml(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const images = wrapper.querySelectorAll("img");
  images.forEach((img, index) => {
    const slot = document.createElement("span");
    slot.setAttribute("data-image-slot", String(index));
    img.replaceWith(slot);
  });
  return wrapper.innerHTML;
}

function toRootRelativeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    return raw;
  }
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return withBase(raw);
  }
  return withBase(raw.replace(/^\.?\/+/, ""));
}

function normalizeResourceUrls(root, { markOriginal = false } = {}) {
  if (!root) {
    return;
  }

  root.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const normalized = toRootRelativeUrl(src);
    if (normalized !== src) {
      if (markOriginal) {
        img.setAttribute("data-original-src", src);
      }
      img.setAttribute("src", normalized);
    }
  });
}

function restoreOriginalResourceUrls(root) {
  if (!root) {
    return;
  }
  root.querySelectorAll("img[data-original-src]").forEach((img) => {
    const original = img.getAttribute("data-original-src");
    if (original) {
      img.setAttribute("src", original);
    }
    img.removeAttribute("data-original-src");
  });
}

const NON_EDITABLE_SECTION_KEYWORDS = ["参考文献", "相关问题", "上一问题", "下一问题", "问题完整列表"];

function normalizeKeywordText(text) {
  return String(text || "").replace(/\s+/g, "");
}

function lockNodeForEditing(node, lockedType) {
  if (!(node instanceof Element)) {
    return;
  }

  const nodes = [node, ...Array.from(node.querySelectorAll("*"))];
  nodes.forEach((el) => {
    el.setAttribute("data-locked-content", "1");
    el.setAttribute("data-locked-type", lockedType);
    el.setAttribute("contenteditable", "false");
  });
}

function getTopLevelChild(container, node) {
  if (!(container instanceof Element) || !(node instanceof Element)) {
    return null;
  }

  let current = node;
  while (current.parentElement && current.parentElement !== container) {
    current = current.parentElement;
  }
  return current.parentElement === container ? current : null;
}

function findBestLockContainer(root, target) {
  if (!(root instanceof Element) || !(target instanceof Element)) {
    return root;
  }

  let current = target;
  while (current.parentElement && current.parentElement !== root) {
    const parent = current.parentElement;
    if (parent.children.length > 1) {
      return parent;
    }
    current = parent;
  }
  return root;
}

function findLastKeywordElement(root, keyword) {
  if (!(root instanceof Element) || !keyword) {
    return null;
  }

  const normalizedKeyword = normalizeKeywordText(keyword);
  if (!normalizedKeyword) {
    return null;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let found = null;

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = normalizeKeywordText(textNode.nodeValue || "");
    if (!text.includes(normalizedKeyword)) {
      continue;
    }

    const parent = textNode.parentElement;
    if (!parent || parent.closest("[data-locked-section='1']")) {
      continue;
    }

    const anchor = parent.closest("p, div, li, h1, h2, h3, h4, h5, h6, table, tr, td, th, section, article") || parent;
    found = anchor;
  }

  return found;
}

function isHorizontalDividerElement(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.tagName === "HR") {
    return true;
  }

  const text = normalizeKeywordText(node.textContent || "");
  if (!text) {
    return false;
  }

  // 常见横线写法：---、——、___、··· 等连续分隔符。
  return /^[-_=~·—─]{3,}$/.test(text);
}

function getLockStartElementWithDivider(target) {
  if (!(target instanceof Element)) {
    return target;
  }

  const previous = target.previousElementSibling;
  if (isHorizontalDividerElement(previous)) {
    return previous;
  }

  return target;
}

function lockFromStartToEditorEnd(root, startNode) {
  if (!(root instanceof Element) || !(startNode instanceof Element) || !root.contains(startNode)) {
    return;
  }

  startNode.setAttribute("data-locked-start", "1");

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let shouldLock = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!shouldLock && node === startNode) {
      shouldLock = true;
    }
    if (shouldLock) {
      lockNodeForEditing(node, "post-references");
    }
  }
}

function lockPostReferenceSections(root) {
  if (!(root instanceof Element)) {
    return;
  }

  root.querySelectorAll("[data-locked-start='1']").forEach((node) => {
    node.removeAttribute("data-locked-start");
  });

  // 若已经存在锁区，先还原，避免重复包裹。
  root.querySelectorAll("[data-locked-section='1']").forEach((section) => {
    while (section.firstChild) {
      section.parentNode?.insertBefore(section.firstChild, section);
    }
    section.remove();
  });

  const lastMatchesByKeyword = NON_EDITABLE_SECTION_KEYWORDS.map((keyword) => ({
    keyword,
    element: findLastKeywordElement(root, keyword)
  }));
  const firstExisting = lastMatchesByKeyword.find((entry) => entry.element);
  const firstExistingTarget = firstExisting?.element || null;
  if (!firstExistingTarget) {
    return;
  }

  const targetWithDivider = firstExisting?.keyword === "参考文献"
    ? getLockStartElementWithDivider(firstExistingTarget)
    : firstExistingTarget;

  lockFromStartToEditorEnd(root, targetWithDivider);
}

function blockImagePasteAndDrop(event) {
  const hasImageInClipboard = event.type === "paste"
    && Array.from(event.clipboardData?.items || []).some((item) => item.type.startsWith("image/"));
  const hasImageInDrop = event.type === "drop"
    && Array.from(event.dataTransfer?.files || []).some((file) => file.type.startsWith("image/"));

  if (hasImageInClipboard || hasImageInDrop) {
    event.preventDefault();
  }

  if (event.type === "drop") {
    event.preventDefault();
  }
}

function applyDisplayStyle(element, displayValue) {
  if (!element) {
    return;
  }
  const current = element.getAttribute("style") || "";
  const withoutDisplay = current.replace(/display\s*:\s*[^;]+;?/gi, "").trim();
  const trailing = withoutDisplay.length > 0 && !withoutDisplay.endsWith(";") ? `${withoutDisplay}; ` : withoutDisplay;
  element.setAttribute("style", `${trailing}display:${displayValue};`);
}

function normalizeAdvancedSections(root, expandedDefault = false, lockTrigger = false) {
  if (!root) {
    return;
  }

  // 流程图（编辑态，保持与原站一致）
  // [解析编辑器 HTML]
  //    -> [标记 #toggleBtn/#moreContent 为 pair]
  //    -> [标记 a#Q + div.Q 为 q-class]
  //    -> [保存 lockTrigger 只读约束]
  //    -> [点击时根据 mode 执行切换]
  const pairSections = [];
  const moreContentNodes = Array.from(root.querySelectorAll("#moreContent"));
  moreContentNodes.forEach((content) => {
    const trigger = content.previousElementSibling?.matches("#toggleBtn, button, a")
      ? content.previousElementSibling
      : content.parentElement?.querySelector("#toggleBtn");
    pairSections.push({ trigger, content });
  });

  const seen = new Set();
  pairSections.forEach(({ trigger, content }) => {
    if (!content || seen.has(content)) {
      return;
    }
    seen.add(content);
    applyDisplayStyle(content, expandedDefault ? "block" : "none");
    content.setAttribute("data-advanced-content", "1");
    content.setAttribute("data-advanced-mode", "pair");

    if (!trigger) {
      return;
    }

    trigger.setAttribute("data-advanced-trigger", "1");
    trigger.setAttribute("data-advanced-mode", "pair");
    if (lockTrigger) {
      trigger.setAttribute("contenteditable", "false");
      trigger.setAttribute("data-noedit-trigger", "1");
    }
  });

  const qTriggers = Array.from(root.querySelectorAll("a#Q"));
  qTriggers.forEach((trigger) => {
    trigger.setAttribute("data-advanced-trigger", "1");
    trigger.setAttribute("data-advanced-mode", "q-class");
    if (lockTrigger) {
      trigger.setAttribute("contenteditable", "false");
      trigger.setAttribute("data-noedit-trigger", "1");
    }
  });

  const qContents = Array.from(root.querySelectorAll("div.Q"));
  qContents.forEach((content) => {
    applyDisplayStyle(content, expandedDefault ? "block" : "none");
    content.setAttribute("data-advanced-content", "1");
    content.setAttribute("data-advanced-mode", "q-class");
  });
}

function prepareEditableHtml(rawHtml) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHtml || "";
  normalizeResourceUrls(wrapper, { markOriginal: true });
  normalizeAdvancedSections(wrapper, true, true);
  lockPostReferenceSections(wrapper);
  return wrapper.innerHTML;
}

function prepareHtmlForSave(rawHtml) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHtml || "";
  restoreOriginalResourceUrls(wrapper);
  normalizeAdvancedSections(wrapper, false, false);

  // 1. 清理diff相关的标签和样式
  // 先清理word-level的diff span
  const diffWordSpans = Array.from(wrapper.querySelectorAll(".diff-left-word, .diff-right-word"));
  diffWordSpans.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) {
      return;
    }
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  });

  // 再清理block-level的diff class
  wrapper.querySelectorAll(".diff-left, .diff-right, .active-left-block, .active-edit-block").forEach((node) => {
    node.classList.remove("diff-left");
    node.classList.remove("diff-right");
    node.classList.remove("active-left-block");
    node.classList.remove("active-edit-block");
  });

  // 2. 清理overlay相关的DOM元素，避免保存到HTML文件中
  // 找到所有的ioc-card-dom元素，从后往前处理
  const cards = Array.from(wrapper.querySelectorAll('.ioc-card-dom'));

  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    const img = card.querySelector('img.ioc-underlay-dom');

    if (img) {
      // 移除图片上的overlay类
      img.classList.remove('ioc-underlay-dom');

      // 找到card的父元素
      let parent = card.parentNode;

      if (parent) {
        // 检查父元素是不是a标签（因为现在a标签被保留了）
        let aTag = null;
        if (parent.tagName === 'A') {
          aTag = parent;
        } else {
          // 查找内部的a标签
          aTag = parent.querySelector('a');
        }

        if (aTag) {
          // 恢复a标签的原始属性
          if (aTag.dataset.originalHref) {
            aTag.setAttribute('href', aTag.dataset.originalHref);
            delete aTag.dataset.originalHref;
          }
          if (aTag.dataset.originalOnclick) {
            aTag.setAttribute('onclick', aTag.dataset.originalOnclick);
            delete aTag.dataset.originalOnclick;
          }
          if (aTag.dataset.originalTarget) {
            aTag.setAttribute('target', aTag.dataset.originalTarget);
            delete aTag.dataset.originalTarget;
          }

          // 恢复a标签的样式
          aTag.style.pointerEvents = '';
          aTag.style.cursor = '';

          // 将img放回a标签内部
          if (parent.tagName === 'A') {
            // card 在 a 标签内部，把 img 放回 a 标签并移除 card
            aTag.insertBefore(img, card);
          } else {
            aTag.appendChild(img);
          }
        } else {
          // 没有 a 标签，处理 wrapper 情况
          // 检查父元素是否是wsite-image
          const isWsiteImage = parent.classList.contains('wsite-image');
          // 检查父元素是否是ioc-wrapper-dom（没有wsite-image时创建的）
          const isIocWrapper = parent.classList.contains('ioc-wrapper-dom');

          if (isIocWrapper) {
            // 对于ioc-wrapper-dom，把img放到wrapper外面，然后移除wrapper
            parent.parentNode.insertBefore(img, parent);
          } else if (isWsiteImage) {
            // 对于wsite-image，把img放到card的位置
            parent.insertBefore(img, card);
            // 恢复wsite-image的样式
            parent.style.position = '';
          }
        }
      }
    }

    // 移除card
    card.remove();
  }

  // 清理剩余的所有overlay相关元素
  wrapper.querySelectorAll('.ioc-wrapper-dom, .ioc-overlay-dom, .ioc-underlay-dom').forEach(el => el.remove());

  // 清理所有data-original-*属性
  wrapper.querySelectorAll('[data-original-href], [data-original-onclick], [data-original-target]').forEach(el => {
    delete el.dataset.originalHref;
    delete el.dataset.originalOnclick;
    delete el.dataset.originalTarget;
  });

  // 3. 清理其他属性
  wrapper.querySelectorAll("[data-locked-content], [data-locked-type], [data-locked-section], [data-locked-start], [data-noedit-trigger], [data-advanced-trigger], [data-advanced-content]").forEach((node) => {
    if (node instanceof Element && node.hasAttribute("data-locked-section")) {
      while (node.firstChild) {
        node.parentNode?.insertBefore(node.firstChild, node);
      }
      node.remove();
      return;
    }
    node.removeAttribute("data-locked-content");
    node.removeAttribute("data-locked-type");
    node.removeAttribute("data-locked-section");
    node.removeAttribute("data-locked-start");
    node.removeAttribute("data-noedit-trigger");
    node.removeAttribute("data-advanced-trigger");
    node.removeAttribute("data-advanced-content");
    node.removeAttribute("contenteditable");
  });
  return wrapper.innerHTML;
}

function selectionTouchesLockedContent(editorElement, selectionRange) {
  if (!editorElement || !selectionRange) {
    return false;
  }
  const protectedNodes = Array.from(editorElement.querySelectorAll("[data-locked-content='1'], [data-advanced-trigger='1'], [data-noedit-trigger='1']"));
  return protectedNodes.some((node) => {
    const nodeRange = document.createRange();
    nodeRange.selectNode(node);
    const startsBeforeEnd = selectionRange.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
    const endsAfterStart = selectionRange.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0;
    return startsBeforeEnd && endsAfterStart;
  });
}

function Header({
  viewMode,
  onViewModeChange,
  themeMode,
  onThemeModeChange,
  systemDark,
  sidebarCollapsed,
  onOpenSidebar,
  searchOpen,
  onSearchToggle,
  searchQuery,
  onSearchQueryChange,
  isEditing,
  isReviewing,
  onEnterEdit,
  onEnterReview,
  onSave,
  onApproveReview,
  onExitEdit,
  onExitReview,
  canEnterReview,
  reviewDisabledReason,
  editTimeText,
  reviewTimeText,
  originalUrl,
  activeSlug,
  isGuideMode,
  hasUnsavedChanges,
  onTopbarHeightChange
}) {
  const [authors, setAuthors] = useState([]);
  const [exitPrompt, setExitPrompt] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setExitPrompt(false);
      if (pendingExit) {
        setPendingExit(false);
        onExitEdit();
      }
    }
  }, [hasUnsavedChanges, pendingExit, onExitEdit]);

  useEffect(() => {
    if (!activeSlug || IS_GITHUB_PAGES) {
      setAuthors([]);
      return;
    }
    fetch("/api/article/meta?slug=" + activeSlug)
      .then(r => r.json())
      .then(d => setAuthors(d.authors || []))
      .catch(() => {});
  }, [activeSlug, editTimeText]);

  const topbarRef = useRef(null);
  const topbarLeftRef = useRef(null);
  const toolbarMainRef = useRef(null);
  const toolbarRef = useRef(null);
  const sourceLinkRef = useRef(null);
  const decreaseTimerRef = useRef(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [topbarWidth, setTopbarWidth] = useState(0);
  const [collapseLevel, setCollapseLevel] = useState(0);
  const compactOriginalUrl = useMemo(() => {
    const raw = String(originalUrl || "").trim();
    if (!raw) {
      return "";
    }
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/\.html(?=([?#]|$))/i, "");
  }, [originalUrl]);
  const effectiveTheme = (themeMode === "light" || themeMode === "dark") ? themeMode : (systemDark ? "dark" : "light");
  const isDark = effectiveTheme === "dark";

  useEffect(() => {
    function handleWindowClick(event) {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (!event.target.closest(".overflow-wrap")) {
        setOverflowOpen(false);
      }
    }

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(() => {
    if (!topbarRef.current) {
      return;
    }

    const element = topbarRef.current;
    const syncTopbarHeight = () => {
      // Use rendered border-box height; contentRect.height under-reports when padding exists.
      const measuredHeight = element.getBoundingClientRect().height || element.offsetHeight || element.clientHeight;
      const nextHeight = Number(measuredHeight) || 0;
      if (nextHeight > 0) {
        onTopbarHeightChange?.(nextHeight);
      }
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setTopbarWidth(entry.contentRect.width);
      }
      syncTopbarHeight();
    });

    observer.observe(element);
    setTopbarWidth(element.getBoundingClientRect().width || element.clientWidth);
    syncTopbarHeight();

    return () => observer.disconnect();
  }, [onTopbarHeightChange]);

  // Simple, predictable collapse based on screen width and sidebar state
  const collapseSource = collapseLevel >= 1;
  const collapseTheme = collapseLevel >= 2;
  const collapseActions = collapseLevel >= 3;
  const collapseReviewAction = collapseLevel >= 3;
  const collapseEditAction = collapseLevel >= 4;
  const collapseMode = collapseLevel >= 5;
  const collapseSearch = collapseLevel >= 6;
  const collapseNormalActions = collapseReviewAction || collapseEditAction;
  const hasOverflowItems = collapseSource || collapseTheme || collapseMode || collapseSearch || (isEditing || isReviewing ? collapseActions : collapseNormalActions);

  useEffect(() => {
    if (!topbarRef.current) return;

    const compute = () => {
      try {
        const windowWidth = window.innerWidth;
        let collapseCount = 0;

        const leftButtonVisible = sidebarCollapsed;
        const isSearchIconOnly = windowWidth <= 640;

        if (leftButtonVisible) {
          if (isSearchIconOnly) {
            if (windowWidth < 320) collapseCount = 6;
            else if (windowWidth < 370) collapseCount = 5;
            else if (windowWidth < 420) collapseCount = 4;
            else if (windowWidth < 480) collapseCount = 3;
            else if (windowWidth < 550) collapseCount = 2;
            else if (windowWidth < 630) collapseCount = 1;
            else collapseCount = 0;
          } else {
            if (windowWidth < 380) collapseCount = 6;
            else if (windowWidth < 450) collapseCount = 5;
            else if (windowWidth < 520) collapseCount = 4;
            else if (windowWidth < 600) collapseCount = 3;
            else if (windowWidth < 680) collapseCount = 2;
            else if (windowWidth < 800) collapseCount = 1;
            else collapseCount = 0;
          }
        } else {
          if (isSearchIconOnly) {
            if (windowWidth < 280) collapseCount = 6;
            else if (windowWidth < 330) collapseCount = 5;
            else if (windowWidth < 380) collapseCount = 4;
            else if (windowWidth < 430) collapseCount = 3;
            else if (windowWidth < 500) collapseCount = 2;
            else if (windowWidth < 580) collapseCount = 1;
            else collapseCount = 0;
          } else {
            if (windowWidth < 340) collapseCount = 6;
            else if (windowWidth < 410) collapseCount = 5;
            else if (windowWidth < 480) collapseCount = 4;
            else if (windowWidth < 550) collapseCount = 3;
            else if (windowWidth < 630) collapseCount = 2;
            else if (windowWidth < 750) collapseCount = 1;
            else collapseCount = 0;
          }
        }

        const newLevel = Math.min(6, Math.max(0, collapseCount));

        if (newLevel > collapseLevel) {
          if (decreaseTimerRef.current) { clearTimeout(decreaseTimerRef.current); decreaseTimerRef.current = null; }
          setCollapseLevel(newLevel);
        } else if (newLevel < collapseLevel) {
          if (decreaseTimerRef.current) clearTimeout(decreaseTimerRef.current);
          decreaseTimerRef.current = setTimeout(() => {
            setCollapseLevel((cur) => (newLevel < cur ? newLevel : cur));
            decreaseTimerRef.current = null;
          }, 300);
        }
      } catch (e) {
        // ignore
      }
    };

    compute();

    window.addEventListener('resize', compute);

    return () => {
      window.removeEventListener('resize', compute);
      if (decreaseTimerRef.current) { clearTimeout(decreaseTimerRef.current); decreaseTimerRef.current = null; }
    };
  }, [viewMode, isEditing, isReviewing, originalUrl, sidebarCollapsed, collapseLevel]);

  useEffect(() => {
    if (!hasOverflowItems && overflowOpen) {
      setOverflowOpen(false);
    }
  }, [hasOverflowItems, overflowOpen]);

  function closeOverflowAnd(action) {
    setOverflowOpen(false);
    action();
  }

  function handleEnterReviewClick() {
    if (!canEnterReview) {
      window.alert(reviewDisabledReason || "当前版本就是基版，无需审核");
      return;
    }
    onEnterReview();
  }

  if (isGuideMode) {
    return (
      <header ref={topbarRef} className={`topbar guide-topbar ${searchOpen ? 'search-open' : ''}`}>
        <div className="topbar-left">
          <button
            type="button"
            className={`sidebar-trigger mobile-only`}
            onClick={onOpenSidebar}
            title="打开菜单"
          >
            ☰
          </button>
        </div>

        <div className="spacer" />

        <div ref={toolbarRef} className="toolbar">
          <div ref={toolbarMainRef} className="toolbar-main">
            <div className="toolbar-inline">
              {!collapseSearch ? (
                <div className={`search-control ${searchOpen ? 'open' : ''}`}>
                  <input
                    type="search"
                    name="site-search"
                    className="search-input"
                    placeholder="搜索标题/内容..."
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    aria-label="搜索文本"
                    inputMode="search"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="search"
                  />
                  <button
                    type="button"
                    className="search-mobile-btn"
                    aria-label="打开搜索"
                    onClick={(e) => {
                      e.preventDefault();
                      try {
                        const control = toolbarRef.current?.querySelector('.search-control');
                        if (control && !control.classList.contains('open')) {
                          control.classList.add('open');
                          const input = control.querySelector('.search-input');
                          if (input && typeof input.focus === 'function') {
                            input.focus();
                          }
                        }
                      } catch (err) {}
                      onSearchToggle(true);
                    }}
                  >
                    <svg viewBox="0 0 16 16" height="16" width="16" data-slot="geist-icon" style={{ color: 'currentColor' }}>
                      <path fill="currentColor" fillRule="evenodd" d="M1.5 6.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0m5-6.5a6.5 6.5 0 1 0 4.04 11.6l3.43 3.43.53.53 1.06-1.06-.53-.53-3.43-3.43A6.5 6.5 0 0 0 6.5 0" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="search-close-btn"
                    aria-label="关闭搜索"
                    onClick={(e) => {
                      e.preventDefault();
                      onSearchToggle();
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {!collapseTheme ? (
            <div className="theme-group" role="group" aria-label="主题模式">
              <button
                type="button"
                className="theme-switch"
                onClick={() => onThemeModeChange(isDark ? "light" : "dark")}
                title={isDark ? "切换浅色" : "切换深色"}
                aria-label={isDark ? "切换浅色" : "切换深色"}
              >
                <span className="theme-switch-icon" aria-hidden="true">{isDark ? "☀" : "🌙"}</span>
              </button>
            </div>
          ) : null}

        </div>

      </header>
    );
  }

  return (
    <header ref={topbarRef} className={`topbar ${searchOpen ? 'search-open' : ''}`}>
      <div ref={topbarLeftRef} className="topbar-left">
        <button
          type="button"
          className={`sidebar-trigger ${sidebarCollapsed ? "show" : "mobile-only"}`}
          onClick={onOpenSidebar}
          title="打开菜单"
        >
          ☰
        </button>
        {!collapseSource ? (
          <div className="source-link" ref={sourceLinkRef}>
            <div>
              <span><strong>本篇原文:</strong></span>
              <a href={originalUrl} target="_blank" rel="noreferrer" style={{marginLeft: '4px'}}>
                {compactOriginalUrl || originalUrl}
              </a>
            </div>
            <div className="tour-authors" style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span><strong>本篇翻译:</strong></span>
              {Array.from(new Set(authors)).map((author, index) => (
                  <span key={String(author) + '-' + index} style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', background: '#e2e8f0', color: '#475569', fontSize: '12px', fontWeight: 500 }}>{author}</span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="spacer" />
      <div ref={toolbarRef} className="toolbar">
          <div ref={toolbarMainRef} className="toolbar-main">
          <div className="toolbar-inline">
            {!collapseSearch ? (
              <div className={`search-control ${searchOpen ? 'open' : ''}`}>
                <input
                  type="search"
                  name="site-search"
                  className="search-input"
                  placeholder="搜索标题/内容..."
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  aria-label="搜索文本"
                  inputMode="search"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                <button
                  type="button"
                  className="search-mobile-btn"
                  aria-label="打开搜索"
                  onClick={(e) => {
                    e.preventDefault();
                    // Attempt to make the control visible immediately and focus synchronously
                    try {
                      const control = toolbarRef.current?.querySelector('.search-control');
                      if (control && !control.classList.contains('open')) {
                        control.classList.add('open');
                        const input = control.querySelector('.search-input');
                        if (input && typeof input.focus === 'function') {
                          input.focus();
                        }
                      }
                    } catch (err) {}
                    // inform app to open search and request focus if needed
                    onSearchToggle(true);
                  }}
                >
                  <svg viewBox="0 0 16 16" height="16" width="16" data-slot="geist-icon" style={{ color: 'currentColor' }}>
                    <path fill="currentColor" fillRule="evenodd" d="M1.5 6.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0m5-6.5a6.5 6.5 0 1 0 4.04 11.6l3.43 3.43.53.53 1.06-1.06-.53-.53-3.43-3.43A6.5 6.5 0 0 0 6.5 0" clipRule="evenodd" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="search-close-btn"
                  aria-label="关闭搜索"
                  onClick={(e) => {
                    e.preventDefault();
                    // use provided toggle to ensure shared logic runs
                    onSearchToggle();
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
            <ScreenshotButton iconOnly filenamePrefix={activeSlug || 'page'} />
            {!collapseMode ? (
              <TrayControl
                value={viewMode}
                onChange={onViewModeChange}
                ariaLabel="阅读模式"
                className="tour-topbar-mode-switch"
                options={[
                  { value: "zh", label: "中" },
                  { value: "en", label: "英" },
                  { value: "bi", label: "双" }
                ]}
              />
            ) : null}

            {!(isEditing || isReviewing ? collapseActions : false) ? (
              isReviewing ? (
                <>
                  <div className="action-col">
                    <button type="button" className="toolbar-btn btn-fixed" data-tour-exit-review onClick={onExitReview}>
                      退出审核
                    </button>
                  </div>
                </>
              ) : !isEditing ? (
                <>
                  {!collapseEditAction ? (
                    <div className="action-col">
                      <button type="button" className="toolbar-btn btn-fixed" data-tour-enter-edit onClick={onEnterEdit}>
                        改进翻译
                      </button>
                      <span className="action-time">{editTimeText || ""}</span>
                    </div>
                  ) : null}
                  {!collapseReviewAction ? (
                    <div className="action-col">
                      <button
                        type="button"
                        className={`toolbar-btn btn-fixed ${!canEnterReview ? "is-disabled" : ""}`.trim()}
                        data-tour-enter-review
                        onClick={handleEnterReviewClick}
                        aria-disabled={!canEnterReview}
                        title={canEnterReview ? "进入审核模式" : reviewDisabledReason}
                      >
                        审核翻译
                      </button>
                      <span className="action-time">{reviewTimeText || ""}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="action-col" style={{flexDirection: 'row', alignItems: 'center', gap: '8px'}}>
                    <button type="button" className="toolbar-btn btn-fixed" data-tour-exit-edit onClick={() => { if (hasUnsavedChanges) setExitPrompt(true); else onExitEdit(); }}>
                      退出编辑
                    </button>
                  </div>
                </>
              )
            ) : null}
          </div>
        </div>

        {!collapseTheme ? (
          <div className="theme-group" role="group" aria-label="主题模式">
            <button
              type="button"
              className="theme-switch"
              onClick={() => onThemeModeChange(isDark ? "light" : "dark")}
              title={isDark ? "切换浅色" : "切换深色"}
              aria-label={isDark ? "切换浅色" : "切换深色"}
            >
              <span className="theme-switch-icon" aria-hidden="true">{isDark ? "☀" : "🌙"}</span>
            </button>
          </div>
        ) : null}

        {hasOverflowItems ? (
          <div className="overflow-wrap">
            <button
              type="button"
              className="overflow-toggle"
              title="更多操作"
              aria-label="更多操作"
              onClick={(event) => {
                event.stopPropagation();
                setOverflowOpen((v) => !v);
              }}
            >
              ▾
            </button>
            <div className={`overflow-menu ${overflowOpen ? "open" : ""}`}>
              {/* <div className="overflow-title">快速操作</div> */}

              {collapseTheme ? (
                <div className="theme-group theme-group-overflow" role="group" aria-label="主题模式">
                  <button
                    type="button"
                    className="theme-switch"
                    onClick={() => closeOverflowAnd(() => onThemeModeChange(isDark ? "light" : "dark"))}
                    title={isDark ? "切换浅色" : "切换深色"}
                    aria-label={isDark ? "切换浅色" : "切换深色"}
                  >
                    <span className="theme-switch-icon" aria-hidden="true">{isDark ? "☀" : "🌙"}</span>
                  </button>
                </div>
              ) : null}

              {collapseMode ? (
                <div className="mode-group mode-group-overflow" role="radiogroup" aria-label="阅读模式">
                  <button
                    type="button"
                    className={`mode-btn ${viewMode === "zh" ? "active" : ""}`}
                    role="radio"
                    aria-checked={viewMode === "zh"}
                    onClick={() => closeOverflowAnd(() => onViewModeChange("zh"))}
                  >
                    中
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${viewMode === "en" ? "active" : ""}`}
                    role="radio"
                    aria-checked={viewMode === "en"}
                    onClick={() => closeOverflowAnd(() => onViewModeChange("en"))}
                  >
                    英
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${viewMode === "bi" ? "active" : ""}`}
                    role="radio"
                    aria-checked={viewMode === "bi"}
                    onClick={() => closeOverflowAnd(() => onViewModeChange("bi"))}
                  >
                    双
                  </button>
                </div>
              ) : null}

              {(isEditing || isReviewing ? collapseActions : collapseNormalActions) ? (
                isReviewing ? (
                  <>
                    <button type="button" className="toolbar-btn" data-tour-exit-review onClick={() => closeOverflowAnd(onExitReview)}>
                      退出审核
                    </button>
                  </>
                ) : !isEditing ? (
                  <>
                    {collapseEditAction ? (
                      <button type="button" className="toolbar-btn" data-tour-enter-edit onClick={() => closeOverflowAnd(onEnterEdit)}>
                        改进翻译
                      </button>
                    ) : null}
                    {collapseReviewAction ? (
                      <button
                        type="button"
                        className={`toolbar-btn ${!canEnterReview ? "is-disabled" : ""}`.trim()}
                        data-tour-enter-review
                        onClick={() => closeOverflowAnd(handleEnterReviewClick)}
                        aria-disabled={!canEnterReview}
                        title={canEnterReview ? "进入审核模式" : reviewDisabledReason}
                      >
                        审核翻译
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button type="button" className="toolbar-btn" data-tour-exit-edit onClick={(e) => {
                      if (hasUnsavedChanges) {
                        e.stopPropagation();
                        setExitPrompt(true);
                      } else {
                        closeOverflowAnd(onExitEdit);
                      }
                    }}>
                      退出编辑
                    </button>
                  </>
                )
              ) : null}

              {collapseSource ? (
                <a href={originalUrl} target="_blank" rel="noreferrer" className="overflow-link" onClick={() => setOverflowOpen(false)}>
                  原始英文网页
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {exitPrompt && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-body, #fff)',
            color: 'var(--text-main, #333)',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            minWidth: '340px',
            border: '1px solid var(--border)'
          }}>
            <h3 style={{ margin: 0, color: '#f44336', fontSize: '20px', textAlign: 'center' }}>有未提交的改动</h3>
            <p style={{ margin: 0, fontSize: '15px', color: 'inherit', textAlign: 'center' }}>你当前的编辑尚未提交到服务器，<br />但已经保存在本地缓存中，下次可以继续编辑。<br />请选择操作：</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              <button type="button" className="submit-btn" style={{ padding: '12px', height: '48px', fontSize: '15px', justifyContent: 'center' }} onClick={() => { setPendingExit(true); onSave(); }}>提交并退出</button>
              <button type="button" className="toolbar-btn" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, #ff6b6b 90%, #ffe6e6), #d93a3a)', color: '#ffffff', border: '1px solid color-mix(in srgb, var(--line) 80%, transparent)', padding: '12px', height: '48px', fontSize: '15px', fontWeight: 500, justifyContent: 'center' }} onClick={() => { setExitPrompt(false); setPendingExit(false); onExitEdit(); }}>直接退出</button>
              <button type="button" className="toolbar-btn" style={{ background: 'var(--bg-hover, #f1f5f9)', color: 'inherit', padding: '12px', height: '48px', fontSize: '15px', justifyContent: 'center' }} onClick={() => { setExitPrompt(false); setPendingExit(false); }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function useDualArticles(slug) {
  const [articles, setArticles] = useState({ zh: null, en: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const readArticle = async (lang) => {
          try {
            const resp = await fetch(`/api/article?lang=${lang}&slug=${encodeURIComponent(slug)}`);
            if (resp.ok) {
              const contentType = (resp.headers.get("content-type") || "").toLowerCase();
              if (contentType.includes("application/json")) {
                return await resp.json();
              }
              const text = await resp.text();
              if (!isHtmlDocumentString(text)) {
                return JSON.parse(text);
              }
            }
          } catch {
            // fallback below
          }

          if (IS_GITHUB_PAGES) {
            return fetchStaticArticle(lang, slug);
          }

          return null;
        };

        const [zhArticle, enArticle] = await Promise.all([
          readArticle("zh"),
          readArticle("en")
        ]);

        if (ignore) {
          return;
        }

        if (!zhArticle && !enArticle) {
          throw new Error("加载文章失败");
        }

        setArticles({
          zh: zhArticle,
          en: enArticle
        });

        if (!zhArticle || !enArticle) {
          setError("部分语言内容未加载成功，已显示可用内容。");
        }
      } catch (err) {
        if (!ignore) {
          setArticles({ zh: null, en: null });
          setError(err.message || "加载文章失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    if (slug) {
      load();
    }

    return () => {
      ignore = true;
    };
  }, [slug]);

  return { articles, loading, error };
}

function routeIdToSlug(id) {
  // 路由 id 与文件名互转：index -> index.html，其它 -> xxx.html。
  if (!id || id === "index") {
    return "index.html";
  }
  return `${id}.html`;
}

function normalizeRouteId(value) {
  // 支持两种入参：/foo 或 foo.html，统一转成路由用的 id。
  const raw = decodeURIComponent(String(value || "")).trim().replace(/^\//, "");
  if (!raw) {
    return "index";
  }
  if (/\.html$/i.test(raw)) {
    const base = raw.replace(/\.html$/i, "");
    return /^index$/i.test(base) ? "index" : base;
  }
  return raw;
}

function ArticlePage({ viewMode }) {
  // 浏览页根据 slug 读取 zh/en 两份 HTML，
  // 然后按阅读模式（中文/英文/双语）选择渲染策略。
  const { slug } = useParams();
  const activeId = normalizeRouteId(slug || "index");
  const { articles, loading, error } = useDualArticles(activeId);
  const zhArticle = articles.zh;
  const enArticle = articles.en;

  if (loading && !zhArticle && !enArticle) {
    return <div className="card">正在加载文章...</div>;
  }

  if (!zhArticle && !enArticle) {
    return <div className="card error">{error || "文章不存在"}</div>;
  }

  if (viewMode === "bi") {
    return (
      <section className="card card-bi">
        {error ? <div className="status">{error}</div> : null}
        <div className="reading-grid">
          <div className="panel reading-panel">
            <HtmlContent html={enArticle?.contentHtml || ""} advancedExpanded={false} viewMode="en" />
          </div>
          <div className="panel reading-panel">
            <HtmlContent html={zhArticle?.contentHtml || ""} advancedExpanded={false} viewMode="zh" />
          </div>
        </div>
      </section>
    );
  }

  const selectedArticle = viewMode === "en" ? (enArticle || zhArticle) : (zhArticle || enArticle);

  return (
    <section className="card card-single">
      {error ? <div className="status">{error}</div> : null}
      <HtmlContent html={selectedArticle?.contentHtml || ""} advancedExpanded={false} viewMode={viewMode} />
    </section>
  );
}

function getComparableBlocks(root) {
  if (!root) {
    return [];
  }
  const mainSelector = "p, li, div.paragraph, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, pre";

  // 首先，特别处理进阶讨论容器，展开它们的内容
  const processAdvancedContainer = (container) => {
    const result = [];

    // 检查容器内是否有直接文本内容（没有被其他标签包裹）
    const hasDirectText = Array.from(container.childNodes).some(node =>
      node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );

    if (hasDirectText) {
      // 如果有直接文本且内容非空，将容器本身也添加为一个块
      if (normalizeBlockText(container).length > 0) {
        result.push(container);
      }
    }

    // 添加容器内的主要块
    const innerBlocks = Array.from(container.querySelectorAll(mainSelector)).filter((node) => {
      if (node.querySelector('.ioc-overlay-dom, [class*="ioc-overlay"]')) {
        return false;
      }
      return normalizeBlockText(node).length > 0;
    });

    return result.concat(innerBlocks);
  };

  let blocks = [];

  // 处理进阶讨论容器
  const advancedContainers = Array.from(root.querySelectorAll('div.Q, #moreContent'));
  advancedContainers.forEach((container) => {
    blocks = blocks.concat(processAdvancedContainer(container));
  });

  // 然后找到所有主要块（排除进阶讨论容器内的，避免重复）
  const mainBlocks = Array.from(root.querySelectorAll(mainSelector)).filter((node) => {
    // 跳过包含overlay的块，避免左右对比错位
    if (node.querySelector('.ioc-overlay-dom, [class*="ioc-overlay"]')) {
      return false;
    }
    // 跳过已经在进阶讨论容器内的块
    if (node.closest('div.Q, #moreContent')) {
      return false;
    }
    return normalizeBlockText(node).length > 0;
  });

  blocks = blocks.concat(mainBlocks);

  // 去重
  blocks = Array.from(new Set(blocks));

  if (blocks.length > 0) {
    return blocks;
  }

  // Fallback: detect any text-bearing leaf-like element so unusual paragraphs can still be mapped.
  const fallback = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof Element)) {
        return NodeFilter.FILTER_SKIP;
      }
      if (node === root) {
        return NodeFilter.FILTER_SKIP;
      }
      // 跳过包含overlay的块
      if (node.querySelector('.ioc-overlay-dom, [class*="ioc-overlay"]')) {
        return NodeFilter.FILTER_SKIP;
      }
      if (normalizeBlockText(node).length === 0) {
        return NodeFilter.FILTER_SKIP;
      }
      if (node.querySelector(mainSelector)) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    fallback.push(current);
    current = walker.nextNode();
  }

  if (fallback.length > 0) {
    return fallback;
  }

  return Array.from(root.children).filter((node) => {
    // 跳过包含overlay的块
    if (node.querySelector && node.querySelector('.ioc-overlay-dom, [class*="ioc-overlay"]')) {
      return false;
    }
    return normalizeBlockText(node).length > 0;
  });
}

function getSelectionBlockIndex(editorElement) {
  if (!editorElement) {
    return -1;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return -1;
  }

  const anchor = selection.anchorNode;
  if (!anchor || !editorElement.contains(anchor)) {
    return -1;
  }

  const anchorElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
  if (!anchorElement) {
    return -1;
  }

  const targetBlock = anchorElement.closest("p, li, div.paragraph, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, pre");
  if (!targetBlock) {
    const blocks = getComparableBlocks(editorElement);
    const containingIndex = blocks.findIndex((block) => block.contains(anchorElement));
    return containingIndex;
  }

  const blocks = getComparableBlocks(editorElement);
  return blocks.indexOf(targetBlock);
}

function applyWordDiffToBlock(blockElement, rightText, className) {
  const wordMask = getWordDiffMask(blockElement.textContent || "", rightText || "");
  const textNodes = [];
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }

  let wordIndex = 0;
  textNodes.forEach((textNode) => {
    const sourceText = textNode.textContent || "";
    if (!sourceText.trim()) {
      return;
    }

    const parts = tokenizeForDiff(sourceText);
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (part.trim() === "") {
        fragment.appendChild(document.createTextNode(part));
        return;
      }
      const keep = wordMask[wordIndex] || false;
      wordIndex += 1;
      if (keep) {
        fragment.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = part;
        fragment.appendChild(span);
      }
    });

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  });
}


function normalizeBlockText(node) {
  return (node?.textContent || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(input) {
  return (input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tokenizeForDiff(text) {
  // 字符级别的diff - 每个字符作为一个token
  return String(text || "").split("");
}

function getWordDiffMask(sourceText, targetText) {
  const sourceTokens = tokenizeForDiff(sourceText).filter((t) => t.trim() !== "");
  const targetTokens = tokenizeForDiff(targetText).filter((t) => t.trim() !== "");

  const n = sourceTokens.length;
  const m = targetTokens.length;
  if (n === 0) {
    return [];
  }
  if (n * m > 1000000) {
    // Fallback for very large blocks: keep old behavior cost bounded.
    return new Array(n).fill(false);
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (sourceTokens[i] === targetTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const keep = new Array(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sourceTokens[i] === targetTokens[j]) {
      keep[i] = true;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return keep;
}

function renderWordDiffHtml(leftText, rightText, className) {
  const parts = tokenizeForDiff(leftText);
  const wordMask = getWordDiffMask(leftText, rightText);
  let wordIndex = 0;

  return parts
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return escapeHtml(part);
      }
      const isKeep = wordMask[wordIndex] || false;
      wordIndex += 1;
      const text = escapeHtml(part);
      return isKeep ? text : `<span class="${className}">${text}</span>`;
    })
    .join("");
}

function buildMarkedHtml(leftHtml, rightHtml, className, activeIndex = -1) {
  const leftWrapper = document.createElement("div");
  const rightWrapper = document.createElement("div");
  leftWrapper.innerHTML = leftHtml || "";
  rightWrapper.innerHTML = rightHtml || "";

  // 处理进阶讨论板块，确保内容正确显示
  normalizeAdvancedSections(leftWrapper, true, false);
  normalizeAdvancedSections(rightWrapper, true, false);

  const leftBlocks = getComparableBlocks(leftWrapper);
  const rightBlocks = getComparableBlocks(rightWrapper);
  const count = Math.max(leftBlocks.length, rightBlocks.length);

  for (let i = 0; i < count; i += 1) {
    const leftBlock = leftBlocks[i];
    if (!leftBlock) {
      continue;
    }
    const leftText = normalizeBlockText(leftBlock);
    const rightText = normalizeBlockText(rightBlocks[i]);
    if (leftText !== rightText) {
      // 左侧卡片使用字符级别的diff标记
      applyWordDiffToBlock(leftBlock, rightText, className || "diff-left-word");
    }

    if (i === activeIndex) {
      leftBlock.classList.add("active-left-block");
    }
  }

  return leftWrapper.innerHTML;
}

function buildMarkedHtmlForRight(leftHtml, rightHtml, className) {
  const leftWrapper = document.createElement("div");
  const rightWrapper = document.createElement("div");
  leftWrapper.innerHTML = leftHtml || "";
  rightWrapper.innerHTML = rightHtml || "";

  // 处理进阶讨论板块，确保内容正确显示
  normalizeAdvancedSections(leftWrapper, true, false);
  normalizeAdvancedSections(rightWrapper, true, false);

  const leftBlocks = getComparableBlocks(leftWrapper);
  const rightBlocks = getComparableBlocks(rightWrapper);
  const count = Math.max(leftBlocks.length, rightBlocks.length);

  for (let i = 0; i < count; i += 1) {
    const rightBlock = rightBlocks[i];
    if (!rightBlock) {
      continue;
    }
    const leftText = normalizeBlockText(leftBlocks[i]);
    const rightText = normalizeBlockText(rightBlock);
    if (leftText !== rightText) {
      // 右侧卡片使用字符级别的diff标记 - 和编辑页面一样
      applyWordDiffToBlock(rightBlock, leftText, className || "diff-right-word");
    }
  }

  return rightWrapper.innerHTML;
}

function markEditorDiff(editorElement, leftHtml, activeIndex = -1, shouldShowDiff = true) {
  if (!editorElement) {
    return;
  }
  const leftWrapper = document.createElement("div");
  leftWrapper.innerHTML = leftHtml || "";

  // 处理进阶讨论板块，确保内容正确显示
  normalizeAdvancedSections(leftWrapper, true, false);

  const leftBlocks = getComparableBlocks(leftWrapper);
  const rightBlocks = getComparableBlocks(editorElement);
  const count = Math.max(leftBlocks.length, rightBlocks.length);

  // 只清理旧的diff标记
  rightBlocks.forEach((block, index) => {
    if (index === activeIndex) {
      // 对于活动块，只添加active-edit-block类，不做其他修改
      block.classList.add("active-edit-block");
      block.classList.remove("diff-right");
      // 清理活动块的diff标记
      const wordSpans = Array.from(block.querySelectorAll(".diff-right-word"));
      wordSpans.forEach((span) => {
        const parent = span.parentNode;
        if (!parent) {
          return;
        }
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
      });
      return;
    }

    // 对于非活动块，清理旧的diff标记
    const wordSpans = Array.from(block.querySelectorAll(".diff-right-word"));
    wordSpans.forEach((span) => {
      const parent = span.parentNode;
      if (!parent) {
        return;
      }
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
    block.classList.remove("diff-right");
    block.classList.remove("active-edit-block");
  });

  // 对非活动块应用新的diff标记
  for (let i = 0; i < count; i += 1) {
    const rightBlock = rightBlocks[i];
    if (!rightBlock) {
      continue;
    }

    // 跳过活动块，不应用任何diff
    if (i === activeIndex) {
      continue;
    }

    const leftText = normalizeBlockText(leftBlocks[i]);
    const rightText = normalizeBlockText(rightBlock);
    if (shouldShowDiff && leftText !== rightText) {
      // 对于非活动块，使用字符级别的diff标记
      applyWordDiffToBlock(rightBlock, leftText, "diff-right-word");
    }
  }
}

function normalizeHtmlForCompare(html) {
  return String(html || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function EditPage({ slug, saveSignal, onSaveDone, onSave, onUnsavedChange }) {
  const [enArticle, setEnArticle] = useState(null);
  const [baselineArticle, setBaselineArticle] = useState(null);
  const [zhArticle, setZhArticle] = useState(null);
  const [editableHtml, setEditableHtml] = useState("");
  const [leftView, setLeftView] = useState("current");
  const [localDraftStatus, setLocalDraftStatus] = useState("");
  const [status, setStatus] = useState("");
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);
  const [lockedOverlayTop, setLockedOverlayTop] = useState(null);
  const [hasEdited, setHasEdited] = useState(false);
  const [authorName, setAuthorName] = useStoredState("mriqa-author", "");
  const editorRef = useRef(null);
  const editorPanelRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const hasEditedRef = useRef(false);
  const lastActiveBlockIndexRef = useRef(-1);

  const draftKey = useMemo(() => `mriqa-draft-${slug}`, [slug]);

  useEffect(() => {
    onUnsavedChange?.(hasEdited);
  }, [hasEdited, onUnsavedChange]);

  useEffect(() => {
    return () => onUnsavedChange?.(false);
  }, [onUnsavedChange]);

  const leftSourceHtml = useMemo(() => {
    if (leftView === "baseline") {
      return baselineArticle?.contentHtml || "";
    }
    if (leftView === "current") {
      return zhArticle?.contentHtml || "";
    }
    return enArticle?.contentHtml || "";
  }, [leftView, baselineArticle, zhArticle, enArticle]);

  const shouldShowDiff = leftView === "baseline" || leftView === "current";
  const canRevert = useMemo(() => {
    if (!zhArticle) {
      return false;
    }
    const currentHtml = normalizeHtmlForCompare(zhArticle.contentHtml || "");
    const editingHtml = normalizeHtmlForCompare(editableHtml || "");
    return currentHtml !== editingHtml;
  }, [zhArticle, editableHtml]);

  const leftDisplayHtml = useMemo(() => {
    if (!shouldShowDiff) {
      if (activeBlockIndex >= 0) {
        return buildMarkedHtml(leftSourceHtml, leftSourceHtml, "diff-left", activeBlockIndex);
      }
      return leftSourceHtml;
    }
    return buildMarkedHtml(leftSourceHtml, editableHtml, "diff-left", activeBlockIndex);
  }, [leftSourceHtml, editableHtml, shouldShowDiff, activeBlockIndex]);

  function updateLockedOverlayPosition() {
    const panel = editorPanelRef.current;
    const editor = editorRef.current;
    if (!panel || !editor) {
      setLockedOverlayTop(null);
      return;
    }

    const lockStart = editor.querySelector("[data-locked-start='1']");
    if (!(lockStart instanceof HTMLElement)) {
      setLockedOverlayTop(null);
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const lockStartRect = lockStart.getBoundingClientRect();
    const nextTop = Math.max(0, lockStartRect.top - panelRect.top);
    const panelHeight = panel.clientHeight || 0;
    const normalizedTop = Math.min(nextTop, Math.max(0, panelHeight - 1));
    setLockedOverlayTop(normalizedTop);
  }

  async function loadZhCurrent(preferLocalDraft = true) {
    // 编辑器右侧永远基于“当前中文版本”，可选择覆盖为本地草稿。
    const zhResp = await fetch(`/api/article?lang=zh&slug=${encodeURIComponent(slug)}`);
    const zhData = await zhResp.json();
    if (!zhResp.ok) {
      throw new Error(zhData.message || "加载中文内容失败");
    }
    setZhArticle(zhData);

    const localDraft = preferLocalDraft ? localStorage.getItem(draftKey) : "";
    if (localDraft && localDraft.length > 0) {
      setEditableHtml(prepareEditableHtml(localDraft));
      setLocalDraftStatus("");
      hasEditedRef.current = true;
      setHasEdited(true);
    } else {
      setEditableHtml(prepareEditableHtml(zhData.contentHtml || ""));
      setLocalDraftStatus("");
    }
    setActiveBlockIndex(-1);
  }

  async function loadBaseline() {
    // baseline 是审核通过后生成的基线版本，用于左侧差异对照。
    try {
      const baselineResp = await fetch(`/api/article/version?slug=${encodeURIComponent(slug)}&version=baseline`);
      const baselineData = await baselineResp.json();
      if (baselineResp.ok) {
        setBaselineArticle(baselineData);
        return;
      }
      setBaselineArticle(null);
    } catch (err) {
      console.error("加载基板翻译失败:", err);
      setBaselineArticle(null);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function load() {
      setStatus("正在加载编辑器...");
      try {
        const enResp = await fetch(`/api/article?lang=en&slug=${encodeURIComponent(slug)}`);
        const enData = await enResp.json();
        if (!enResp.ok) {
          throw new Error(enData.message || "加载英文内容失败");
        }

        if (!ignore) {
          setEnArticle(enData);
        }

        await loadZhCurrent(true);
        await loadBaseline();

        if (!ignore) {
          setStatus("");
        }
      } catch (err) {
        if (!ignore) {
          setStatus(err.message || "加载编辑器失败");
        }
      }
    }

    if (slug) {
      load();
    }

    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== editableHtml) {
      editorRef.current.innerHTML = editableHtml;
      editorRef.current.querySelectorAll("img").forEach((img) => {
        img.setAttribute("contenteditable", "false");
        img.setAttribute("draggable", "false");
      });

      // 应用overlay，可编辑模式，强制刷新缓存
      let currentPageSlug = slug;
      if (!currentPageSlug.endsWith('.html')) {
        currentPageSlug = currentPageSlug + '.html';
      }
      applyImageOverlays(editorRef.current, currentPageSlug, true, true);
      requestAnimationFrame(updateLockedOverlayPosition);
    }
  }, [editableHtml, slug]);

  useEffect(() => {
    const rafId = requestAnimationFrame(updateLockedOverlayPosition);
    return () => cancelAnimationFrame(rafId);
  }, [editableHtml, leftView, activeBlockIndex]);

  useEffect(() => {
    function onResize() {
      updateLockedOverlayPosition();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    markEditorDiff(editorRef.current, leftSourceHtml, activeBlockIndex, shouldShowDiff);
  }, [leftSourceHtml, shouldShowDiff, activeBlockIndex]);

  useEffect(() => {
    if (!hasEditedRef.current) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setLocalDraftStatus("");

    autoSaveTimerRef.current = setTimeout(() => {
      const htmlToStore = editorRef.current?.innerHTML || editableHtml;
      localStorage.setItem(draftKey, htmlToStore);
      setLocalDraftStatus("");
    }, 20_000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editableHtml, draftKey]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!saveSignal || !zhArticle) {
      return;
    }

    async function save() {
      // 提交流程：
      // 1) 先提取overlay内容（在清理DOM之前）
      let currentPageSlug = slug;
      if (!currentPageSlug.endsWith('.html')) {
        currentPageSlug = currentPageSlug + '.html';
      }
      const overlayText = extractOverlayText(editorRef.current, currentPageSlug);

      // 2) 把可编辑 HTML 还原为可持久化结构（这会清理overlay DOM）
      const prepared = prepareHtmlForSave(editorRef.current?.innerHTML || editableHtml);
      const html = createImageSlotHtml(prepared);

      // 准备要发送的数据
      const saveData = {
        slug,
        html,
        baseHash: zhArticle.hash,
        editor: "guest",
        author: authorName
      };

      // 只有当overlayText不为null时才发送，否则不更新overlay内容
      if (overlayText !== null) {
        saveData.overlayText = overlayText;
      }

      setStatus("正在保存...");
      const resp = await fetch("/api/article/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData)
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(data.message || "保存失败");
        onSaveDone(false);
        return;
      }

      localStorage.removeItem(draftKey);
      hasEditedRef.current = false;
      setHasEdited(false);
      setLocalDraftStatus("");

      // 清除overlay缓存并重新加载
      clearOverlayCache();

      await loadZhCurrent(false);
      setStatus(`提交成功：${new Date(data.updatedAt).toLocaleString()}`);
      onSaveDone(true, data.updatedAt);
    }

    save();
  }, [saveSignal]);

  function revertToCurrentVersion() {
    if (!zhArticle || !canRevert) {
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    localStorage.removeItem(draftKey);
    hasEditedRef.current = false;
      setHasEdited(false);
    setLocalDraftStatus("");
    setEditableHtml(prepareEditableHtml(zhArticle.contentHtml || ""));
    setActiveBlockIndex(-1);
  }

  function handleEditorInput(event) {
    hasEditedRef.current = true;
      setHasEdited(true);

    setEditableHtml(event.currentTarget.innerHTML);
    setActiveBlockIndex(getSelectionBlockIndex(editorRef.current));
  }

  function handleEditorClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    // 禁用图片的lightbox效果，阻止图片和a标签的点击事件
    if (target.closest('img, a[rel="lightbox"]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const trigger = target.closest("[data-advanced-trigger='1']");
    if (!trigger) {
      return;
    }

    event.preventDefault();
    const mode = trigger.getAttribute("data-advanced-mode") || "pair";
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (mode === "q-class") {
      const qBlocks = Array.from(editor.querySelectorAll("div.Q"));
      const isAnyOpen = qBlocks.some((node) => window.getComputedStyle(node).display !== "none");
      qBlocks.forEach((node) => animateAdvancedToggle(node, !isAnyOpen));
    } else {
      const content = trigger.nextElementSibling;
      if (!(content instanceof HTMLElement)) {
        return;
      }
      const isOpen = window.getComputedStyle(content).display !== "none";
      animateAdvancedToggle(content, !isOpen);
    }

    hasEditedRef.current = true;
      setHasEdited(true);
    setEditableHtml(editor.innerHTML || "");
  }

  function handleEditorPasteOrDrop(event) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-locked-content='1'], [data-advanced-trigger='1'], [data-noedit-trigger='1']")) {
      event.preventDefault();
      return;
    }
    blockImagePasteAndDrop(event);
  }

  function updateActiveBlockFromSelection() {
    const newIndex = getSelectionBlockIndex(editorRef.current);

    // 如果活动块发生了变化
    if (newIndex !== lastActiveBlockIndexRef.current) {
      // 保存新的活动块索引
      lastActiveBlockIndexRef.current = newIndex;

      // 更新活动块索引
      setActiveBlockIndex(newIndex);

      // 稍微延迟一点，确保状态更新后再应用diff
      setTimeout(() => {
        if (editorRef.current) {
          markEditorDiff(editorRef.current, leftSourceHtml, newIndex, shouldShowDiff);
        }
      }, 50);
    } else {
      // 块没有变化，只更新索引
      setActiveBlockIndex(newIndex);
    }
  }

  function handleEditorKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      const br = document.createElement('br');
      range.insertNode(br);

      range.setStartAfter(br);
      range.setEndAfter(br);
      selection.removeAllRanges();
      selection.addRange(range);

      return;
    }

    if (event.key !== "Backspace" && event.key !== "Delete") {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }
      const range = selection.getRangeAt(0);
      if (selectionTouchesLockedContent(editorRef.current, range)) {
        event.preventDefault();
      }
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (selectionTouchesLockedContent(editorRef.current, range)) {
      event.preventDefault();
      return;
    }

    const commonElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (commonElement && commonElement.querySelector && commonElement.querySelector("img")) {
      event.preventDefault();
      return;
    }

    const editorElement = editorRef.current;
    if (!editorElement) {
      return;
    }

    const imgNodes = Array.from(editorElement.querySelectorAll("img"));
    const touchingImage = imgNodes.some((img) => {
      const imgRange = document.createRange();
      imgRange.selectNode(img);
      const startsBeforeEnd = range.compareBoundaryPoints(Range.START_TO_END, imgRange) > 0;
      const endsAfterStart = range.compareBoundaryPoints(Range.END_TO_START, imgRange) < 0;
      return startsBeforeEnd && endsAfterStart;
    });

    if (touchingImage) {
      event.preventDefault();
    }
  }

  return (
    <section className="editor-shell">
      <div className="editor-grid">
        <div className="panel-block panel-block-en">
        <div className="panel-header-row">
          <TrayControl
            value={leftView}
            onChange={setLeftView}
            ariaLabel="左侧只读内容"
            className="tour-edit-left-switch"
            options={[
              { value: "en", label: "英文原文（只读）" },
              { value: "baseline", label: "基版翻译（只读）" },
              { value: "current", label: "当前翻译（只读）" }
            ]}
          />
        </div>
          <div className={`panel panel-emphasis ${leftView === "en" ? "panel-en" : "panel-zh"}`}>
            <HtmlContent html={leftDisplayHtml} advancedExpanded viewMode={leftView === "en" ? "en" : "zh"} pageSlug={slug} disableLightbox={true} />
          </div>
        </div>
        <div className="panel-block panel-block-zh">
          <div className="panel-title-row">
            <button type="button" className="revert-btn" data-tour-edit-revert onClick={revertToCurrentVersion} disabled={!canRevert}>
              <span aria-hidden="true">↶</span>
              <span>撤销本地更改</span>
            </button>
            <h3 className="panel-title">中文翻译（可编辑）</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                placeholder="可输入昵称"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                style={{ width: '100px', padding: '4px 6px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                className="submit-btn"
                data-tour-edit-submit
                style={!hasEdited ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                onClick={(e) => {
                  if (!hasEdited) {
                    e.preventDefault();
                    window.alert("没有改动需要提交");
                    return;
                  }
                  onSave();
                }}
              >
                {hasEdited ? "提 交" : "✓ 已提交"}
              </button>
            </div>
            <span className="local-draft-status">{localDraftStatus}</span>
          </div>
          <div ref={editorPanelRef} className="panel panel-emphasis panel-zh" data-tour-edit-panel>
            <div
              className="editor-html"
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={handleEditorPasteOrDrop}
              onDrop={handleEditorPasteOrDrop}
              onInput={handleEditorInput}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={updateActiveBlockFromSelection}
              onMouseUp={updateActiveBlockFromSelection}
              onFocus={updateActiveBlockFromSelection}
              onBlur={() => {
                if (editorRef.current) {
                  markEditorDiff(editorRef.current, leftSourceHtml, -1, shouldShowDiff);
                }
              }}
            />
            {lockedOverlayTop !== null ? (
              <div
                className="editor-locked-overlay"
                style={{ top: `${lockedOverlayTop}px` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewPage({ slug, approveSignal, onApproveDone, onRollback }) {
  const [enArticle, setEnArticle] = useState(null);
  const [baselineArticle, setBaselineArticle] = useState(null);
  const [zhArticle, setZhArticle] = useState(null);
  const [leftView, setLeftView] = useState("baseline");
  const [status, setStatus] = useState("");

  async function loadAll() {
    // 审核页固定三方数据：英文原文(en) + 中文基版(baseline) + 当前中文(zh)。
    const [enResp, baselineResp, zhResp] = await Promise.all([
      fetch(`/api/article?lang=en&slug=${encodeURIComponent(slug)}`),
      fetch(`/api/article/version?slug=${encodeURIComponent(slug)}&version=baseline`),
      fetch(`/api/article?lang=zh&slug=${encodeURIComponent(slug)}`)
    ]);

    const [enData, baselineData, zhData] = await Promise.all([enResp.json(), baselineResp.json(), zhResp.json()]);
    if (!enResp.ok) {
      throw new Error(enData.message || "加载英文原文失败");
    }
    if (!baselineResp.ok) {
      throw new Error(baselineData.message || "加载基版失败");
    }
    if (!zhResp.ok) {
      throw new Error(zhData.message || "加载当前翻译失败");
    }

    setEnArticle(enData);
    setBaselineArticle(baselineData);
    setZhArticle(zhData);
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await loadAll();
        if (!ignore) {
          setStatus("");
        }
      } catch (error) {
        if (!ignore) {
          setStatus(error.message || "加载审核页面失败");
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!approveSignal || !zhArticle) {
      return;
    }

    async function approveBaseline() {
      // 审核通过：把"当前中文版本"提升为 baseline。
      const confirmed = window.confirm("将当前版本确定为基版baseline，现在的基版将被覆盖，不可恢复。\n请仔细审核，确认当前版本比基版更优。");
      if (!confirmed) {
        onApproveDone(false);
        return;
      }

      setStatus("正在更新基版...");
      const resp = await fetch("/api/article/approve-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(data.message || "更新基版失败");
        onApproveDone(false);
        return;
      }

      await loadAll();
      setStatus(`审核通过：${new Date(data.updatedAt).toLocaleString()}`);
      onApproveDone(true, data.updatedAt);
    }

    approveBaseline();
  }, [approveSignal]);

  async function handleRollback() {
    const confirmed = window.confirm("此操作将用基版替换当前翻译版本，当前版本被覆盖，不可恢复。只有当现在版本有样式错误或严重混乱时，才建议这么做。");
    if (!confirmed) {
      return;
    }

    setStatus("正在回滚...");
    try {
      const resp = await fetch("/api/article/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, version: "baseline" })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(data.message || "回滚失败");
        return;
      }

      await loadAll();
      setStatus(`回滚成功：${new Date(data.updatedAt).toLocaleString()}`);
      if (onRollback) {
        onRollback(true, data.updatedAt);
      }
    } catch (error) {
      setStatus("回滚失败：" + (error.message || "未知错误"));
    }
  }

  const leftHtml = useMemo(() => {
    if (leftView === "en") {
      return enArticle?.contentHtml || "";
    }
    return buildMarkedHtml(baselineArticle?.contentHtml || "", zhArticle?.contentHtml || "", "diff-left");
  }, [leftView, enArticle, baselineArticle, zhArticle]);

  const rightHtml = useMemo(() => {
    if (leftView === "baseline") {
      return buildMarkedHtmlForRight(baselineArticle?.contentHtml || "", zhArticle?.contentHtml || "", "diff-right-word");
    }
    return zhArticle?.contentHtml || "";
  }, [leftView, zhArticle, baselineArticle]);

  return (
    <section className="editor-shell review-shell">
      {status ? <div className="status">{status}</div> : null}
      <div className="editor-grid">
        <div className="panel-block panel-block-en">
          <div className="panel-header-row" data-tour-review-rollback-anchor>
            {/* <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}> */}
              <TrayControl
                value={leftView}
                onChange={setLeftView}
                ariaLabel="左侧只读内容"
                options={[
                  { value: "en", label: "英文原文（只读）" },
                  { value: "baseline", label: "基版翻译" }
                ]}
              />
            {/* </div> */}
            <button
              type="button"
              className="rollback-btn"
              data-tour-review-rollback="true"
              onClick={handleRollback}
            >
              回滚（基版覆盖当前）
            </button>
          </div>
          <div className={`panel panel-emphasis ${leftView === "en" ? "panel-en" : "panel-zh"}`}>
            <HtmlContent html={leftHtml} advancedExpanded viewMode={leftView === "en" ? "en" : "zh"} pageSlug={slug} />
          </div>
        </div>

        <div className="panel-block panel-block-zh">
          <div className="panel-header-row">
            <button type="button" className="approve-baseline-btn" data-tour-review-approve onClick={() => {
              const confirmed = window.confirm("将当前版本确定为基版baseline，现在的基版将被覆盖，不可恢复。\n请仔细审核，确认当前版本比基版更优。");
              if (confirmed) {
                (async () => {
                  setStatus("正在更新基版...");
                  const resp = await fetch("/api/article/approve-baseline", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug })
                  });
                  const data = await resp.json();
                  if (!resp.ok) {
                    setStatus(data.message || "更新基版失败");
                    if (onApproveDone) {
                      onApproveDone(false);
                    }
                    return;
                  }

                  await loadAll();
                  setStatus(`审核通过：${new Date(data.updatedAt).toLocaleString()}`);
                  if (onApproveDone) {
                    onApproveDone(true, data.updatedAt);
                  }
                })();
              }
            }}>
              通过（当前覆盖基版）
            </button>
            <h3 className="panel-title">当前翻译</h3>
            <span className="local-draft-status" />
          </div>
          <div className="panel panel-emphasis panel-zh">
            <HtmlContent html={rightHtml} advancedExpanded viewMode="zh" pageSlug={slug} />
          </div>
        </div>
      </div>
    </section>
  );
}

function EditRoute({ saveSignal, onSaveDone, onSave, onUnsavedChange }) {
  const { slug } = useParams();
  const activeId = normalizeRouteId(slug || "index");
  if (IS_GITHUB_PAGES) {
    return <Navigate to={`/${encodeURIComponent(activeId)}`} replace />;
  }
  return <EditPage slug={activeId} saveSignal={saveSignal} onSaveDone={onSaveDone} onSave={onSave} onUnsavedChange={onUnsavedChange} />;
}

function ReviewRoute({ approveSignal, onApproveDone, onRollback }) {
  const { slug } = useParams();
  const activeId = normalizeRouteId(slug || "index");
  if (IS_GITHUB_PAGES) {
    return <Navigate to={`/${encodeURIComponent(activeId)}`} replace />;
  }
  return <ReviewPage slug={activeId} approveSignal={approveSignal} onApproveDone={onApproveDone} onRollback={onRollback} />;
}

function PageRouter({ viewMode, saveSignal, onSaveDone, approveSignal, onApproveDone, onRollback, onSave, onUnsavedChange, onStartGuideTour }) {
  // 路由约定：
  // /:slug        只读浏览
  // /edit/:slug   编辑并提交到 zh 当前版本
  // /review/:slug 审核并可将 zh 当前版本提升为 baseline
  return (
    <Routes>
      <Route path="/" element={<GuidePage onStartGuideTour={onStartGuideTour} />} />
      <Route path="/guide" element={<GuidePage onStartGuideTour={onStartGuideTour} />} />
      <Route path="/complete-list-of-questions" element={<CompleteListOfQuestions />} />
      <Route path="/edit/:slug" element={<EditRoute saveSignal={saveSignal} onSaveDone={onSaveDone} onSave={onSave} onUnsavedChange={onUnsavedChange} />} />
      <Route path="/review/:slug" element={<ReviewRoute approveSignal={approveSignal} onApproveDone={onApproveDone} onRollback={onRollback} />} />
      <Route path="/:slug" element={<ArticlePage viewMode={viewMode} />} />
      <Route path="*" element={<Navigate to="/index" replace />} />
    </Routes>
  );
}

export default function App() {
  const [menu, setMenu] = useState([]);
  const [slugs, setSlugs] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useStoredState("mriqa-view-mode", DEFAULT_VIEW_MODE);
  const [themeMode, setThemeMode] = useStoredState("mriqa-theme", "auto");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [saveSignal, setSaveSignal] = useState(0);
  const [approveSignal, setApproveSignal] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const mainAreaRef = useRef(null);
  const contentScaleRef = useRef(null);
  const [mainAreaWidth, setMainAreaWidth] = useState(0);
  const [contentScaleHeight, setContentScaleHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth || 0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1180);
  const [canEnterReview, setCanEnterReview] = useState(true);
  const [reviewDisabledReason, setReviewDisabledReason] = useState("");
  const [editAuditMap, setEditAuditMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mriqa-edit-audit") || "{}");
    } catch {
      return {};
    }
  });
  const [reviewAuditMap, setReviewAuditMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mriqa-review-audit") || "{}");
    } catch {
      return {};
    }
  });

  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchReady, setSearchReady] = useState(false);
  const [searchIndexData, setSearchIndexData] = useState([]);
  const [searchFilter, setSearchFilter] = useState("all");
  const [topbarHeightPx, setTopbarHeightPx] = useState(64);
  const [guideTourStage, setGuideTourStage] = useStoredState("mriqa-guide-tour-stage", GUIDE_TOUR_STAGE_IDLE);
  const guideTourDriverRef = useRef(null);
  const guideTourLaunchKeyRef = useRef("");

  const navigate = useNavigate();
  const location = useLocation();
  const isGuideMode = location.pathname === "/" || location.pathname === "/guide" || location.pathname === "/complete-list-of-questions";
  const handleTopbarHeightChange = useCallback((height) => {
    const next = Math.max(0, Math.ceil(Number(height) || 0));
    if (!next) {
      return;
    }
    setTopbarHeightPx((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  }, []);

  const stopGuideTour = () => {
    setGuideTourStage(GUIDE_TOUR_STAGE_IDLE);
    guideTourLaunchKeyRef.current = "";
    if (guideTourDriverRef.current) {
      try {
        guideTourDriverRef.current.destroy();
      } catch {
        // ignore
      }
      guideTourDriverRef.current = null;
    }
  };

  const startGuideTour = () => {
    guideTourLaunchKeyRef.current = "";
    setGuideTourStage(GUIDE_TOUR_STAGE_HOME);
    navigate("/test");
  };

  const clickTourElement = (selector) => {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.click();
      return true;
    }
    return false;
  };

  const runGuideTourAction = (actionKey) => {
    if (!actionKey) {
      return;
    }

    if (guideTourDriverRef.current) {
      try {
        guideTourDriverRef.current.destroy();
      } catch {
        // ignore
      }
      guideTourDriverRef.current = null;
    }
    guideTourLaunchKeyRef.current = "";

    if (actionKey === "enter-edit") {
      clickTourElement("[data-tour-enter-edit]");
      setGuideTourStage(GUIDE_TOUR_STAGE_EDIT);
      return;
    }
    if (actionKey === "exit-edit") {
      clickTourElement("[data-tour-exit-edit]");
      setGuideTourStage(GUIDE_TOUR_STAGE_REVIEW_ENTRY);
      return;
    }
    if (actionKey === "enter-review") {
      clickTourElement("[data-tour-enter-review]");
      setGuideTourStage(GUIDE_TOUR_STAGE_REVIEW);
      return;
    }
    if (actionKey === "exit-review") {
      clickTourElement("[data-tour-exit-review]");
      stopGuideTour();
    }
  };

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) {
      return;
    }
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const onPageShow = () => {
      forceWindowScrollTop();
      requestAnimationFrame(forceWindowScrollTop);
    };

    onPageShow();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // 监听路径变化，滚动到页面顶部
  useEffect(() => {
    const scrollToTop = () => {
      forceWindowScrollTop();
    };

    // 立即滚动
    scrollToTop();

    // 多次尝试确保滚动到顶部
    const attempts = [0, 50, 120, 240, 400, 700, 1000];
    attempts.forEach(delay => {
      setTimeout(scrollToTop, delay);
    });

    // 使用 requestAnimationFrame 确保在 DOM 更新后滚动
    requestAnimationFrame(scrollToTop);
    requestAnimationFrame(() => requestAnimationFrame(scrollToTop));
  }, [location.pathname]);

  const focusRequestedRef = useRef(false);

  const activeSlug = useMemo(() => {
    if (location.pathname === "/" || location.pathname === "/guide") {
      return "index";
    }
    if (location.pathname === "/complete-list-of-questions") {
      return "complete-list-of-questions";
    }
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "edit") {
      return normalizeRouteId(parts[1] || "index");
    }
    if (parts[0] === "review") {
      return normalizeRouteId(parts[1] || "index");
    }
    return normalizeRouteId(parts[0] || "index");
  }, [location.pathname]);

  const isEditing = location.pathname.startsWith("/edit/");
  const isReviewing = location.pathname.startsWith("/review/");
  const layoutMode = (viewMode === "bi" || isEditing || isReviewing) ? "bi" : "single";
  const baseWidth = layoutMode === "bi" ? 1434 : 710;
  const appShellTopPaddingPx = topbarHeightPx + (viewportWidth <= 720 ? 0 : 10);

  useEffect(() => {
    if (guideTourStage === GUIDE_TOUR_STAGE_HOME && location.pathname.startsWith("/edit/")) {
      setGuideTourStage(GUIDE_TOUR_STAGE_EDIT);
      return;
    }
    if (guideTourStage === GUIDE_TOUR_STAGE_EDIT && location.pathname === "/test") {
      setGuideTourStage(GUIDE_TOUR_STAGE_REVIEW_ENTRY);
      return;
    }
    if (guideTourStage === GUIDE_TOUR_STAGE_REVIEW_ENTRY && location.pathname.startsWith("/review/")) {
      setGuideTourStage(GUIDE_TOUR_STAGE_REVIEW);
      return;
    }
    if (guideTourStage === GUIDE_TOUR_STAGE_REVIEW && (location.pathname === "/" || location.pathname === "/guide")) {
      stopGuideTour();
    }
  }, [guideTourStage, location.pathname]);

  useEffect(() => {
    const stageRoutes = {
      [GUIDE_TOUR_STAGE_HOME]: "/test",
      [GUIDE_TOUR_STAGE_EDIT]: "/edit/",
      [GUIDE_TOUR_STAGE_REVIEW_ENTRY]: "/test",
      [GUIDE_TOUR_STAGE_REVIEW]: "/review/"
    };

    const routeRule = stageRoutes[guideTourStage];
    if (!routeRule) {
      return;
    }

    const matchesRoute = routeRule.endsWith("/")
      ? location.pathname.startsWith(routeRule)
      : location.pathname === routeRule;
    if (!matchesRoute) {
      return;
    }

    const launchKey = `${guideTourStage}@${location.pathname}`;
    if (guideTourLaunchKeyRef.current === launchKey) {
      return;
    }
    guideTourLaunchKeyRef.current = launchKey;

    const steps = getGuideTourSteps(guideTourStage);
    const selectors = steps.map((step) => step.element).filter(Boolean);
    let cancelled = false;

    (async () => {
      await waitForSelectors(selectors, 5000);
      if (cancelled) {
        return;
      }

      const availableSteps = steps.filter((step) => !!document.querySelector(step.element));
      if (availableSteps.length === 0) {
        return;
      }

      if (guideTourDriverRef.current) {
        try {
          guideTourDriverRef.current.destroy();
        } catch {
          // ignore
        }
      }

      const stepsWithActions = availableSteps.map((step) => {
        if (!step.actionKey) {
          return step;
        }
        return {
          ...step,
          popover: {
            ...step.popover,
            showButtons: ["previous", "next"],
            onNextClick: () => {
              runGuideTourAction(step.actionKey);
            }
          }
        };
      });

      const guide = driver({
        showProgress: true,
        nextBtnText: "下一步",
        prevBtnText: "上一步",
        doneBtnText: "完成",
        overlayColor: "rgba(15, 23, 42, 0.56)",
        stagePadding: 8,
        allowClose: true,
        steps: stepsWithActions
      });

      guideTourDriverRef.current = guide;
      guide.drive();
    })();

    return () => {
      cancelled = true;
    };
  }, [guideTourStage, location.pathname]);

  useEffect(() => {
    return () => {
      if (guideTourDriverRef.current) {
        try {
          guideTourDriverRef.current.destroy();
        } catch {
          // ignore
        }
        guideTourDriverRef.current = null;
      }
    };
  }, []);

  const stageScale = useMemo(() => {
    if (!mainAreaWidth || mainAreaWidth <= 0) {
      return 1;
    }
    return Math.min(1, mainAreaWidth / baseWidth);
  }, [mainAreaWidth, baseWidth]);

  const stageOuterWidth = stageScale < 1 ? mainAreaWidth : baseWidth;

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth || 0);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const minWidthForSidebar = baseWidth + SIDEBAR_WIDTH + SHELL_SIDE_PADDING + 24;
    const collapseEnter = minWidthForSidebar;
    const collapseExit = minWidthForSidebar + 68;

    setSidebarCollapsed((prev) => {
      if (!prev && viewportWidth < collapseEnter) {
        return true;
      }
      if (prev && viewportWidth > collapseExit) {
        return false;
      }
      return prev;
    });
  }, [viewportWidth, baseWidth]);

  useEffect(() => {
    if (sidebarCollapsed) {
      setSidebarOpen(false);
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    const resolvedTheme = (themeMode === "light" || themeMode === "dark") ? themeMode : (systemDark ? "dark" : "light");
    document.documentElement.dataset.theme = resolvedTheme;
  }, [themeMode, systemDark]);

  useEffect(() => {
    async function loadIndex() {
      const candidates = [
        withBase("search-index.json"),
        "/search-index.json",
        "/public/search-index.json",
        "/static/search-index.json"
      ];
      let lastError = null;
      for (const url of candidates) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            lastError = new Error(`fetch ${url} status ${resp.status}`);
            continue;
          }

          const contentType = (resp.headers.get("content-type") || "").toLowerCase();
          if (contentType.includes("application/json")) {
            try {
              const data = await resp.json();
              console.log("loadIndex: read from", url, Array.isArray(data) ? data.length : typeof data, "(content-type)");
              await searchService.initSearch(data);
              setSearchIndexData(data || []);
              setSearchReady(true);
              return;
            } catch (err) {
              lastError = new Error(`invalid JSON from ${url}: ${err.message}`);
              continue;
            }
          }

          const text = await resp.text();
          const trimmed = text.trimStart();
          if (trimmed.startsWith("<") || /<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
            lastError = new Error(`response from ${url} looks like HTML`);
            continue;
          }

          try {
            const data = JSON.parse(text);
            console.log("loadIndex: read from", url, Array.isArray(data) ? data.length : typeof data);
            await searchService.initSearch(data);
            setSearchIndexData(data || []);
            setSearchReady(true);
            return;
          } catch (err) {
            lastError = new Error(`invalid JSON from ${url}: ${err.message}`);
            continue;
          }
        } catch (err) {
          lastError = err;
          continue;
        }
      }
      console.error("Search index init failed:", lastError);
      setSearchReady(false);
    }
    loadIndex();
  }, []);

  useEffect(() => {
    localStorage.setItem("mriqa-edit-audit", JSON.stringify(editAuditMap));
  }, [editAuditMap]);

  useEffect(() => {
    localStorage.setItem("mriqa-review-audit", JSON.stringify(reviewAuditMap));
  }, [reviewAuditMap]);

  useEffect(() => {
    async function bootstrap() {
      if (IS_GITHUB_PAGES) {
        setMenu(Array.isArray(sidebarData) ? sidebarData : []);
        setSlugs(collectLeafIdsFromMenu(sidebarData));
        return;
      }

      try {
        const [menuResp, slugsResp] = await Promise.all([fetch("/api/menu"), fetch("/api/slugs")]);
        if (!menuResp.ok || !slugsResp.ok) {
          throw new Error("menu/slugs fetch failed");
        }
        const [menuData, slugData] = await Promise.all([menuResp.json(), slugsResp.json()]);
        setMenu(menuData);
        setSlugs(slugData);
      } catch {
        setMenu(Array.isArray(sidebarData) ? sidebarData : []);
        setSlugs(collectLeafIdsFromMenu(sidebarData));
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function checkReviewAvailable() {
      // 只有“当前中文版本”与 baseline hash 不一致时，才允许进入审核。
      if (isEditing || isReviewing || !activeSlug) {
        setCanEnterReview(false);
        setReviewDisabledReason("");
        return;
      }

      if (IS_GITHUB_PAGES) {
        setCanEnterReview(false);
        setReviewDisabledReason("GitHub Pages 为静态预览，不支持审核");
        return;
      }

      try {
        const [baselineResp, currentResp] = await Promise.all([
          fetch(`/api/article/version?slug=${encodeURIComponent(activeSlug)}&version=baseline`),
          fetch(`/api/article?lang=zh&slug=${encodeURIComponent(activeSlug)}`)
        ]);
        const [baselineData, currentData] = await Promise.all([baselineResp.json(), currentResp.json()]);

        if (ignore) {
          return;
        }

        if (!baselineResp.ok || !currentResp.ok) {
          setCanEnterReview(false);
          setReviewDisabledReason("当前版本状态未知，暂不可审核");
          return;
        }

        if (baselineData.hash === currentData.hash) {
          setCanEnterReview(false);
          setReviewDisabledReason("当前版本就是基版，无需审核");
          return;
        }

        setCanEnterReview(true);
        setReviewDisabledReason("");
      } catch {
        if (!ignore) {
          setCanEnterReview(false);
          setReviewDisabledReason("当前版本状态未知，暂不可审核");
        }
      }
    }

    checkReviewAvailable();
    return () => {
      ignore = true;
    };
  }, [activeSlug, isEditing, isReviewing, saveSignal, approveSignal]);

  useEffect(() => {
    if (!mainAreaRef.current) {
      return;
    }

    const element = mainAreaRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setMainAreaWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    setMainAreaWidth(element.clientWidth);

    return () => observer.disconnect();
  }, [layoutMode]);

  useEffect(() => {
    if (!contentScaleRef.current) {
      return;
    }

    const element = contentScaleRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.height) {
        setContentScaleHeight(entry.contentRect.height);
      } else {
        setContentScaleHeight(element.clientHeight);
      }
    });

    observer.observe(element);
    setContentScaleHeight(element.clientHeight);

    return () => observer.disconnect();
  }, [activeSlug]); // activeSlug changes when changing page

  const searchMode = viewMode === "en" ? "en" : (viewMode === "zh" ? "zh" : "all");

  // close search when clicking outside (but ignore clicks inside the search UI or search input)
  useEffect(() => {
    function onDocClick(e) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest && (target.closest('.search-results') || target.closest('.search-control') || target.closest('.mode-group') || target.closest('.mode-btn'))) {
        return;
      }
      if (searchEnabled) {
        clearSearch();
      }
    }
    if (searchEnabled) {
      window.addEventListener('click', onDocClick);
      return () => window.removeEventListener('click', onDocClick);
    }
    return undefined;
  }, [searchEnabled]);

  function handleSearchToggle(requestFocus = false) {
    if (requestFocus) focusRequestedRef.current = true;
    setSearchEnabled((prev) => {
      if (prev) {
        setSearchQuery("");
        setSearchResults([]);
      }
      return !prev;
    });
  }

  // When search is enabled and a focus was requested from the button click,
  // try to focus the input promptly. Use a short timeout to wait for render.
  useEffect(() => {
    if (!searchEnabled) return;
    if (!focusRequestedRef.current) return;
    setTimeout(() => {
      try {
        const input = document.querySelector('.search-control.open .search-input');
        if (input && typeof input.focus === 'function') input.focus();
      } catch (err) {}
      focusRequestedRef.current = false;
    }, 50);
  }, [searchEnabled]);

  async function handleSearchQueryChange(query) {
    console.log("handleSearchQueryChange", { query, searchReady, searchMode });
    setSearchQuery(query);
    if (!query || !searchReady) {
      setSearchResults([]);
      return;
    }
    // Always search across all languages regardless of topbar language button
    const results = searchService.search(query, "all", 50);
    console.log("handleSearchQueryChange results", results.length);
    setSearchResults(results);
  }

  // Close search when navigating to a different route so topbar returns to normal
  useEffect(() => {
    // whenever the pathname changes, clear any transient search UI
    clearSearch();
  }, [location.pathname]);

  // Note: do not re-run search when viewMode changes; search is language-independent

  const displayedResults = useMemo(() => {
    if (!searchResults || !Array.isArray(searchResults)) return [];
    const f = String(searchFilter || "all").toLowerCase();
    if (f === "all") return searchResults;
    return searchResults.filter((it) => String(it.lang || "").toLowerCase() === f);
  }, [searchResults, searchFilter]);

  function clearSearch() {
    setSearchQuery("");
    setSearchResults([]);
    setSearchEnabled(false);
  }

  function buildSnippet(content, query) {
    if (!content) return "";
    const text = String(content || "");
    const q = String(query || "").trim();
    if (!q) return escapeHtml(text.slice(0, 200));

    // split query into tokens; if no whitespace (likely CJK), use the full query
    let tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) tokens = [q];

    // escape tokens for regex
    const esc = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const pattern = tokens.map(esc).join("|");
    const re = new RegExp(pattern, "i");
    const m = text.search(re);
    let start = 0;
    if (m > 0) start = Math.max(0, m - 40);
    const end = Math.min(text.length, (m > -1 ? m : 0) + 120);
    let snippet = text.slice(start, end);
    // highlight all token matches in snippet
    const safe = escapeHtml(snippet);
    const hiRe = new RegExp(tokens.map(esc).join("|"), "gi");
    const highlighted = safe.replace(hiRe, (match) => `<mark>${escapeHtml(match)}</mark>`);
    if (start > 0) {
      return `...${highlighted}`;
    }
    return highlighted;
  }

  function highlightText(text, query) {
    const src = String(text || "");
    const q = String(query || "").trim();
    if (!q) return escapeHtml(src);

    let tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) tokens = [q];
    const esc = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const hiRe = new RegExp(tokens.map(esc).join("|"), "gi");
    const safe = escapeHtml(src);
    return safe.replace(hiRe, (m) => `<mark>${escapeHtml(m)}</mark>`);
  }

  function getDisplayTitle(item) {
    if (!item) return "";
    // If title is an object with language keys, prefer the matching language
    const langHint = String(item.lang || "").toLowerCase();
    // helper: find title in sidebar/menu by id or slug
    function findMenuTitle(idOrSlug, lang) {
      if (!menu || !Array.isArray(menu)) return null;
      const needle = String(idOrSlug || "").toLowerCase();
      let found = null;
      function walk(items) {
        for (const it of items || []) {
          if (!it) continue;
          const iid = String(it.id || "").toLowerCase();
          if (iid === needle) {
            found = it;
            return true;
          }
          if (it.children && it.children.length) {
            if (walk(it.children)) return true;
          }
        }
        return false;
      }
      walk(menu);
      if (!found) return null;
      const t = found.title || null;
      if (!t) return null;
      return (lang && t[lang]) ? t[lang] : (t.zh || t.en || null);
    }
    try {
      if (item.title && typeof item.title === "object") {
        if (langHint && item.title[langHint]) return item.title[langHint];
        if (item.title.zh) return item.title.zh;
        if (item.title.en) return item.title.en;
      }
    } catch (e) {}

    // Prefer stored title if present and not a filename (string case)
    if (item.title && typeof item.title === "string" && String(item.title).trim() && !/\.html?$/i.test(String(item.title).trim())) return item.title;

    // fallback: try to find the original doc in the loaded index and use its title
    try {
      const id = String(item.id || "");
      const byId = searchIndexData.find((d) => String(d.id) === id);
      // if result is zh, prefer the canonical sidebar/menu zh title when available
      if (String(item.lang || "").toLowerCase() === "zh") {
        // derive slug from url
        const urlForSlug = String(item.url || "").replace(/^\//, "");
        const slugForLookup = urlForSlug.replace(/^(?:en\/+|zh\/+)?/i, "").replace(/\.html?$/i, "").replace(/^\//, "") || "index";
        const menuT = findMenuTitle(slugForLookup, "zh") || findMenuTitle(id, "zh");
        if (menuT) return menuT;
        // prefer title_zh from index if available
        if (byId && byId.title_zh && String(byId.title_zh).trim()) {
          return byId.title_zh;
        }
      }
      // if result is en, prefer title_en
      if (String(item.lang || "").toLowerCase() === "en") {
        if (byId && byId.title_en && String(byId.title_en).trim()) {
          return byId.title_en;
        }
      }
      // fallback to generic title field
      if (byId && byId.title && String(byId.title).trim() && !/\.html?$/i.test(String(byId.title).trim())) {
        return byId.title;
      }

      // if byId's title is a filename or missing, try to match by slug (ignore /en or /zh prefix)
      const url = String(item.url || "").replace(/^\//, "");
      const slug = url.replace(/^\/(?:en|zh)\//i, "").replace(/\.html?$/i, "") || "index";
      const candidate = searchIndexData.find((d) => {
        try {
          const durl = String(d.url || "").replace(/^\/(?:en|zh)\//i, "").replace(/^\//, "").replace(/\.html?$/i, "");
          const matchesSlug = durl === slug;
          const matchesLang = String(d.lang || "").toLowerCase() === String(item.lang || "").toLowerCase();
          return matchesSlug && matchesLang && d.title && String(d.title).trim() && !/\.html?$/i.test(String(d.title).trim());
        } catch (e) {
          return false;
        }
      });
      if (candidate) {
        const t = candidate.title;
        if (t && typeof t === "object") {
          const langHint2 = String(item.lang || "").toLowerCase();
          if (langHint2 && t[langHint2]) return t[langHint2];
          if (t.zh) return t.zh;
          if (t.en) return t.en;
        }
        return t;
      }
    } catch (e) {}

    // final fallback: generate readable text from filename/slug
    const url = String(item.url || "").replace(/^\//, "");
    const base = url.replace(/\.html?$/i, "");
    const parts = base.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || base || "index";
    const text = decodeURIComponent(last).replace(/[-_]+/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const defaultSlug = useMemo(() => slugs[0] || "index", [slugs]);
  const sidebarLang = viewMode === "en" ? "en" : "zh";
  const editTimeText = useMemo(() => formatActionTime(editAuditMap[activeSlug]), [editAuditMap, activeSlug]);
  const reviewTimeText = useMemo(() => formatActionTime(reviewAuditMap[activeSlug]), [reviewAuditMap, activeSlug]);
  const originalUrl = useMemo(() => {
    // 原文外链始终拼成 mriquestions.com/{slug}.html
    const slug = routeIdToSlug(activeSlug || defaultSlug);
    return `https://mriquestions.com/${slug}`;
  }, [activeSlug, defaultSlug]);

  return (
    <div className={`page-root ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isGuideMode ? "guide-mode" : ""} view-${viewMode}`}>
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        systemDark={systemDark}
        sidebarCollapsed={sidebarCollapsed}
        onOpenSidebar={() => setSidebarOpen((open) => !open)}
        searchOpen={searchEnabled}
        onSearchToggle={handleSearchToggle}
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchQueryChange}
        searchResults={searchResults}
        isEditing={isEditing}
        isReviewing={isReviewing}
        activeSlug={activeSlug}
        onEnterEdit={() => {
          if (IS_GITHUB_PAGES) {
            window.alert("GitHub Pages 为静态预览，不支持编辑页面");
            return;
          }
          navigate(`/edit/${encodeURIComponent(activeSlug || defaultSlug)}`);
        }}
        onEnterReview={() => {
          if (IS_GITHUB_PAGES) {
            window.alert("GitHub Pages 为静态预览，不支持审核页面");
            return;
          }
          if (guideTourStage === GUIDE_TOUR_STAGE_REVIEW_ENTRY) {
            navigate(`/review/${encodeURIComponent(activeSlug || defaultSlug)}`);
            return;
          }
          if (!canEnterReview) {
            window.alert(reviewDisabledReason || "当前版本就是基版，无需审核");
            return;
          }
          const entered = window.prompt("⚠️请输入审核密码⚠️\n(审核是将当前翻译版本设置为基版baseline，主要用作版本备份，为了数据安全设置了密码。如果只是想改进本页翻译，请点击<改进翻译>，每次的改进提交后是立即生效的。如果你确定想参与审核，请发送邮件到 songbenshen@126.com 索要密码，欢迎！)");
          if (entered === null) {
            return;
          }
          if (entered !== REVIEW_PASSWORD) {
            window.alert("密码错误");
            return;
          }
          navigate(`/review/${encodeURIComponent(activeSlug || defaultSlug)}`);
        }}
        onExitEdit={() => {
          if (guideTourStage === GUIDE_TOUR_STAGE_EDIT) {
            navigate("/test");
            return;
          }
          navigate(`/${encodeURIComponent(activeSlug || defaultSlug)}`);
        }}
        onExitReview={() => {
          if (guideTourStage === GUIDE_TOUR_STAGE_REVIEW) {
            navigate("/");
            return;
          }
          navigate(`/${encodeURIComponent(activeSlug || defaultSlug)}`);
        }}
        onSave={() => setSaveSignal((n) => n + 1)}
        onApproveReview={() => setApproveSignal((n) => n + 1)}
        canEnterReview={canEnterReview}
        reviewDisabledReason={reviewDisabledReason}
        editTimeText={editTimeText}
        reviewTimeText={reviewTimeText}
        originalUrl={originalUrl}
        isGuideMode={isGuideMode}
        hasUnsavedChanges={hasUnsavedChanges}
        onTopbarHeightChange={handleTopbarHeightChange}
      />
      {/* search panel is rendered inside main-area below */}

      <div className="app-shell" style={{ paddingTop: `${appShellTopPaddingPx}px` }}>
        {sidebarOpen && sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="收起侧边栏"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <Sidebar
          menu={menu}
          lang={sidebarLang}
          activeId={activeSlug === "index" ? null : activeSlug}
          collapsed={sidebarCollapsed}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main ref={mainAreaRef} className={`main-area mode-${layoutMode} ${stageScale < 1 ? "is-scaled" : ""}`}>
            {/* Search panel rendered inside main-area so it centers relative to content-stage */}
            {searchQuery ? (
              <>
                <div className="search-backdrop" onClick={clearSearch} />
                <div className="search-results" onClick={(e) => e.stopPropagation()}>
                  <div className="search-results-header-row">
                    <div className="search-results-header">搜索 "{searchQuery}"：共 {displayedResults.length} 条结果。</div>
                    <div className="search-results-controls">
                      <TrayControl
                        value={searchFilter}
                        onChange={setSearchFilter}
                        ariaLabel="语言过滤"
                        className="search-filter-tray"
                        options={[
                          { value: "all", label: "全部" },
                          { value: "zh", label: "中文" },
                          { value: "en", label: "英文" }
                        ]}
                      />
                    </div>
                  </div>
                  <ul>
                    {displayedResults.map((item) => {
                        // normalize url: remove leading /en/ or /zh/ if present
                        let url = String(item.url || "");
                        url = url.replace(/^\/(?:en|zh)\//i, "/");
                        url = url.replace(/^\//, "");
                        const slug = url.replace(/\.html?$/i, "") || "index";
                        return (
                          <li key={item.id} className="search-result-item">
                            <div className="search-left">
                              <div className="search-result-header-row">
                                <a
                                  href={`/${slug}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    try {
                                      setViewMode(item.lang === "en" ? "en" : "zh");
                                    } catch (err) {}
                                    clearSearch();
                                    navigate(`/${encodeURIComponent(slug)}`);
                                  }}
                                      dangerouslySetInnerHTML={{ __html: highlightText(getDisplayTitle(item), searchQuery) }}
                                      />
                                <span className="search-lang">{item.lang}</span>
                              </div>
                              <div className="search-snippet" dangerouslySetInnerHTML={{ __html: buildSnippet(item.content, searchQuery) }} />
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              </>
            ) : null}

            <div
              className="content-stage"
              style={{
                width: `${stageOuterWidth}px`,
                height: stageScale < 1 && contentScaleHeight > 0 ? `${contentScaleHeight * stageScale}px` : undefined,
              }}
            >
              <div
                ref={contentScaleRef}
                className="content-scale"
                style={{ width: `${baseWidth}px`, transform: `scale(${stageScale})` }}
              >
                <PageRouter
                  onStartGuideTour={startGuideTour}
                  onUnsavedChange={setHasUnsavedChanges}
                  viewMode={viewMode}
                  saveSignal={saveSignal}
                  onSave={() => setSaveSignal((n) => n + 1)}
                  onSaveDone={(ok, updatedAt) => {
                    if (!ok || !updatedAt) {
                      return;
                    }
                    setEditAuditMap((prev) => ({ ...prev, [activeSlug]: updatedAt }));
                  }}
                  approveSignal={approveSignal}
                  onApproveDone={(ok, updatedAt) => {
                    if (!ok || !updatedAt) {
                      return;
                    }
                    setReviewAuditMap((prev) => ({ ...prev, [activeSlug]: updatedAt }));
                  }}
                  onRollback={(ok, updatedAt) => {
                    if (!ok || !updatedAt) {
                      return;
                    }
                    setEditAuditMap((prev) => ({ ...prev, [activeSlug]: updatedAt }));
                  }}
                />
              </div>
            </div>
          </main>
      </div>

      <SiteFooter />
    </div>
  );
}











