import { useMemo, useEffect, useRef } from "react";
import { initLightbox } from "../lightbox";
import { useNavigate, useLocation } from "react-router-dom";
import overlayMapStatic from "../meta/first_pic_texts_zh_map_basename.json";

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

const ADVANCED_TOGGLE_DURATION = 500;
const advancedToggleTimers = new WeakMap();

export function createOverlayForImage(img, text, editable = false) {
  // 找到外层的 wsite-image div
  let wsiteImageDiv = img.closest('.wsite-image');
  
  // 如果找不到 wsite-image  div，则创建一个新的包装器
  if (!wsiteImageDiv) {
    wsiteImageDiv = document.createElement('div');
    wsiteImageDiv.className = 'ioc-wrapper-dom';
    const parent = img.parentNode;
    if (!parent) return;
    parent.insertBefore(wsiteImageDiv, img);
    wsiteImageDiv.appendChild(img);
  }
  
  // 确保 wsite-image div 有相对定位，以便覆盖层可以正确定位
  const originalPosition = window.getComputedStyle(wsiteImageDiv).position;
  if (originalPosition === 'static') {
    wsiteImageDiv.style.position = 'relative';
  }

  const card = document.createElement('div');
  card.className = 'ioc-card-dom ioc-show-text';
  // 确保容器大小与图片一致 - 使用 inline-block 保持与图片相同的尺寸
  card.style.display = 'inline-block';
  card.style.maxWidth = 'none';
  card.style.width = 'auto';

  // 将 img 移动到 card 中 - 检查 img 是否被 a 标签包裹
  let parentElement = img.parentNode;
  if (parentElement && parentElement.tagName === 'A') {
    // 如果被 a 标签包裹，保留 a 标签，把 card 放到 a 标签里面
    const aTag = parentElement;
    // 从 a 标签中移除 img
    aTag.removeChild(img);
    // 将 img 添加到 card 中
    img.classList.add('ioc-underlay-dom');
    card.appendChild(img);
    // 将 card 放到 a 标签里面（保留 a 标签）
    aTag.appendChild(card);
  } else {
    // 没有被 a 标签包裹，直接移动
    img.classList.add('ioc-underlay-dom');
    card.appendChild(img);
    // 将 card 添加到 wsite-image div 中
    wsiteImageDiv.appendChild(card);
  }

  // 处理text字段，支持数组和字符串两种格式
  let lines = [];
  if (Array.isArray(text)) {
    lines = text;
  } else if (typeof text === 'string') {
    lines = text.split('\n').filter(line => line.trim() !== '');
  }
  
  const overlay = document.createElement('div');
  overlay.className = 'ioc-overlay-dom';
  if (editable) {
    overlay.contentEditable = 'true';
    overlay.dataset.overlayEditable = 'true';
    overlay.dataset.overlayEdited = 'false';
    // 保存原始内容的JSON字符串，用于比较是否有修改
    overlay.dataset.originalText = JSON.stringify(lines);
    
    // 添加input事件监听器，标记overlay为已编辑
    overlay.addEventListener('input', () => {
      overlay.dataset.overlayEdited = 'true';
    });
  }
  
  // 为每行创建单独的div，以便平均分配空间
  lines.forEach(line => {
    const lineDiv = document.createElement('div');
    lineDiv.style.flex = '1';
    lineDiv.style.display = 'flex';
    
    // 检查是否以"• "开头
    if (line.trim().startsWith('• ')) {
      // 分离列表标记和文本
      const text = line.trim().substring(2); // 移除"• "
      
      // 计算文本行数（基于平均字符宽度和容器宽度估算）
      const estimatedCharWidth = 8; // 估算的平均字符宽度
      const containerWidth = 280; // 最小容器宽度
      const textLength = text.length;
      const estimatedLines = Math.ceil(textLength * estimatedCharWidth / (containerWidth - 30)); // 30px 用于列表标记
      
      // 无论多少行，都设置为竖直居中
      lineDiv.style.alignItems = 'center';
      
      // 创建列表标记元素
      const bullet = document.createElement('span');
      bullet.textContent = '• ';
      bullet.style.marginRight = '5px';
      bullet.style.flexShrink = '0';
      
      // 创建文本元素，设置缩进
      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      textSpan.style.flex = '1';
      textSpan.style.textIndent = '0';
      textSpan.style.lineHeight = '1.6';
      
      // 组合元素
      lineDiv.appendChild(bullet);
      lineDiv.appendChild(textSpan);
    } 
    // 检查是否以"─ "开头（二级无序列表）
    else if (line.trim().startsWith('─ ')) {
      // 分离列表标记和文本
      const text = line.trim().substring(2); // 移除"─ "
      
      // 计算文本行数（基于平均字符宽度和容器宽度估算）
      const estimatedCharWidth = 8; // 估算的平均字符宽度
      const containerWidth = 280; // 最小容器宽度
      const textLength = text.length;
      const estimatedLines = Math.ceil(textLength * estimatedCharWidth / (containerWidth - 60)); // 60px 用于列表标记和缩进
      
      // 无论多少行，都设置为竖直居中
      lineDiv.style.alignItems = 'center';
      
      // 创建缩进元素
      const indent = document.createElement('span');
      indent.style.width = '20px';
      indent.style.flexShrink = '0';
      
      // 创建列表标记元素
      const bullet = document.createElement('span');
      bullet.textContent = '─ ';
      bullet.style.marginRight = '5px';
      bullet.style.flexShrink = '0';
      
      // 创建文本元素，设置缩进
      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      textSpan.style.flex = '1';
      textSpan.style.textIndent = '0';
      textSpan.style.lineHeight = '1.6';
      
      // 组合元素
      lineDiv.appendChild(indent);
      lineDiv.appendChild(bullet);
      lineDiv.appendChild(textSpan);
    } else {
      // 普通文本行
      lineDiv.style.alignItems = 'center';
      lineDiv.textContent = line;
    }
    
    overlay.appendChild(lineDiv);
  });
  
  card.appendChild(overlay);
}

export let overlayMapCache = null;
export async function fetchOverlayMap(forceRefresh = false) {
  if (overlayMapCache && !forceRefresh) return overlayMapCache;

  if (IS_GITHUB_PAGES) {
    overlayMapCache = overlayMapStatic && (overlayMapStatic.basename_map || overlayMapStatic) || {};
    return overlayMapCache;
  }

  try {
    const res = await fetch('/api/overlay-map', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed ' + res.status);
    const data = await res.json();
    overlayMapCache = data && (data.basename_map || data) || {};
    console.log('Overlay map loaded:', overlayMapCache);
    return overlayMapCache;
  } catch (err) {
    console.error('Could not load basename map', err);
    return {};
  }
}

export function clearOverlayCache() {
  overlayMapCache = null;
  console.log('Overlay cache cleared');
}

export async function applyImageOverlays(container, currentPageSlug, editable = false, forceRefresh = false) {
  console.log('Applying image overlays for:', currentPageSlug);
  const map = await fetchOverlayMap(forceRefresh);
  if (!(currentPageSlug in map)) {
    console.log('No overlay config for:', currentPageSlug);
    return;
  }

  const entry = map[currentPageSlug];
  if (!entry || (!Array.isArray(entry.text) && typeof entry.text !== 'string') || !entry.image) {
    console.log('Invalid entry for:', currentPageSlug);
    return;
  }

  const targetImageBasename = entry.image;
  console.log('Looking for image with basename:', targetImageBasename);
  let matched = false;

  // 辅助函数：检查 img 是否已被处理过
  const isImgProcessed = (img) => {
    if (!img) return true;
    // 检查 img 是否有 ioc-underlay-dom 类（已被处理）
    if (img.classList.contains('ioc-underlay-dom')) return true;
    // 检查 img 的父元素是否有 ioc-wrapper-dom 或 ioc-card-dom
    let parent = img.parentElement;
    while (parent) {
      if (parent.classList && (parent.classList.contains('ioc-wrapper-dom') || parent.classList.contains('ioc-card-dom'))) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  // 辅助函数：从 URL 中提取文件名（去掉查询参数）
  const extractBasename = (url) => {
    if (!url) return '';
    const noQuery = url.split('?')[0];
    const parts = noQuery.split('/');
    return parts[parts.length - 1] || '';
  };

  // 方法1：查找所有 a 标签（不管是否有 href），匹配其 href 属性或内部 img 的 src
  const allAnchors = Array.from(container.querySelectorAll('a'));
  for (const anchor of allAnchors) {
    if (matched) break;
    try {
      const img = anchor.querySelector('img');
      if (!img) continue;
      if (isImgProcessed(img)) continue;

      // 首先检查 a 标签的 href 属性（优先级更高，因为通常包含原始图片名）
      const href = anchor.getAttribute('href') || '';
      const hrefFile = extractBasename(href);
      console.log('Found a href:', hrefFile);
      
      if (hrefFile && hrefFile === targetImageBasename) {
        console.log('Matched a href with:', hrefFile);
        matched = true;

        // 保存 a 标签的原始属性，而不是移除
        if (anchor.hasAttribute('href')) {
          anchor.dataset.originalHref = anchor.getAttribute('href');
          anchor.removeAttribute('href');
        }
        if (anchor.hasAttribute('onclick')) {
          anchor.dataset.originalOnclick = anchor.getAttribute('onclick');
          anchor.removeAttribute('onclick');
        }
        if (anchor.hasAttribute('target')) {
          anchor.dataset.originalTarget = anchor.getAttribute('target');
          anchor.removeAttribute('target');
        }
        anchor.style.pointerEvents = 'none';
        anchor.style.cursor = 'text';
        createOverlayForImage(img, entry.text, editable);
        continue;
      }

      // 如果 href 不匹配，再检查 img 的 src
      const src = img.getAttribute('src') || '';
      const file = extractBasename(src);
      console.log('Found img inside a:', file);
      if (!file || file !== targetImageBasename) continue;

      console.log('Matched img inside a with:', file);
      matched = true;

      // 保存 a 标签的原始属性，而不是移除
      if (anchor.hasAttribute('href')) {
        anchor.dataset.originalHref = anchor.getAttribute('href');
        anchor.removeAttribute('href');
      }
      if (anchor.hasAttribute('onclick')) {
        anchor.dataset.originalOnclick = anchor.getAttribute('onclick');
        anchor.removeAttribute('onclick');
      }
      if (anchor.hasAttribute('target')) {
        anchor.dataset.originalTarget = anchor.getAttribute('target');
        anchor.removeAttribute('target');
      }
      anchor.style.pointerEvents = 'none';
      anchor.style.cursor = 'text';
      createOverlayForImage(img, entry.text, editable);
    } catch (e) {
      console.error('inject_overlay error (method 1)', e);
    }
  }

  if (matched) return;

  // 方法2：直接查找所有 img 标签，匹配 src
  const allImgs = Array.from(container.querySelectorAll('img'));
  for (const img of allImgs) {
    if (matched) break;
    try {
      if (isImgProcessed(img)) continue;

      const src = img.getAttribute('src') || '';
      const file = extractBasename(src);
      console.log('Found img:', file);
      if (!file || file !== targetImageBasename) continue;

      console.log('Matched img with:', file);
      matched = true;

      // 直接为 img 创建 overlay（没有 a 标签包裹）
      createOverlayForImage(img, entry.text, editable);
    } catch (e) {
      console.error('inject_overlay error (method 2)', e);
    }
  }
}

export function extractOverlayText(container, currentPageSlug) {
  console.log('Extracting overlay text for:', currentPageSlug);
  console.log('Container:', container);
  
  const overlays = container.querySelectorAll('.ioc-overlay-dom');
  console.log('Found overlays:', overlays.length);
  
  if (overlays.length === 0) {
    console.log('No overlays found');
    return null;
  }

  const overlay = overlays[0];
  console.log('Overlay element:', overlay);
  console.log('Overlay children count:', overlay.children.length);
  console.log('Overlay edited:', overlay.dataset.overlayEdited);
  
  // 首先尝试直接使用children提取（原始结构）
  let lines = extractFromChildren(overlay);
  
  // 如果这种方式提取失败或结果不好，尝试使用innerText
  if (!lines || lines.length === 0 || lines.some(line => line === '•' || line === '• ' || line === '─' || line === '─ ')) {
    console.log('Falling back to innerText method');
    lines = extractFromInnerText(overlay);
  }
  
  // 验证提取结果，如果有问题则返回null
  if (!lines || lines.length === 0 || lines.some(line => line === '•' || line === '• ' || line === '─' || line === '─ ')) {
    console.log('Extracted lines are invalid, returning null');
    return null;
  }
  
  // 比较提取的内容和原始内容，如果没有改变则返回null
  if (overlay.dataset.originalText) {
    try {
      const originalLines = JSON.parse(overlay.dataset.originalText);
      const extractedJson = JSON.stringify(lines);
      const originalJson = JSON.stringify(originalLines);
      
      console.log('Comparing overlay content:');
      console.log('  Original:', originalJson);
      console.log('  Extracted:', extractedJson);
      
      if (extractedJson === originalJson) {
        console.log('Overlay content not changed, returning null');
        return null;
      }
    } catch (e) {
      console.error('Error comparing overlay content:', e);
    }
  }
  
  console.log('Final extracted overlay lines:', lines);
  return lines;
}

function extractFromChildren(overlay) {
  const lines = [];
  
  for (let i = 0; i < overlay.children.length; i++) {
    const child = overlay.children[i];
    let lineText = '';
    
    // 检查是否有span元素
    const spans = child.querySelectorAll('span');
    
    if (spans.length >= 2) {
      const firstSpanText = spans[0].textContent || '';
      
      if (firstSpanText === '• ') {
        // 一级列表
        lineText = '• ' + (spans[1].textContent || '');
      } else if (firstSpanText === '─ ' && spans.length >= 3) {
        // 二级列表
        lineText = '─ ' + (spans[2].textContent || '');
      } else {
        // 普通文本
        lineText = child.textContent || '';
      }
    } else {
      // 没有足够的span，直接使用文本
      lineText = child.textContent || '';
    }
    
    lineText = lineText.trim();
    if (lineText) {
      lines.push(lineText);
    }
  }
  
  return lines;
}

function extractFromInnerText(overlay) {
  const textContent = overlay.innerText || '';
  console.log('Raw innerText:', textContent);
  
  // 按换行符分割
  let lines = textContent.split(/\r?\n/).map(line => line.trim()).filter(line => line);
  
  // 处理被分割的列表项
  const mergedLines = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    if ((line === '•' || line === '• ') && i + 1 < lines.length) {
      // 合并下一行
      mergedLines.push('• ' + lines[i + 1]);
      i++;
    } else if ((line === '─' || line === '─ ') && i + 1 < lines.length) {
      // 合并下一行
      mergedLines.push('─ ' + lines[i + 1]);
      i++;
    } else if (!line.startsWith('• ') && !line.startsWith('─ ')) {
      // 检查是否以•或─开头但没有空格
      if (line.startsWith('•')) {
        mergedLines.push('• ' + line.substring(1).trim());
      } else if (line.startsWith('─')) {
        mergedLines.push('─ ' + line.substring(1).trim());
      } else {
        mergedLines.push(line);
      }
    } else {
      mergedLines.push(line);
    }
  }
  
  return mergedLines;
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

function normalizeResourceUrls(root) {
  if (!root) {
    return;
  }
  root.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const normalized = toRootRelativeUrl(src);
    if (normalized !== src) {
      img.setAttribute("src", normalized);
    }
  });
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

function clearAdvancedAnimation(element) {
  const timerId = advancedToggleTimers.get(element);
  if (timerId) {
    window.clearTimeout(timerId);
    advancedToggleTimers.delete(element);
  }
  element.style.transition = "";
  element.style.maxHeight = "";
  element.style.opacity = "";
  element.style.overflow = "";
  element.style.willChange = "";
}

function animateAdvancedToggle(element, shouldShow, duration = ADVANCED_TOGGLE_DURATION) {
  if (!element) {
    return;
  }

  clearAdvancedAnimation(element);
  const isVisible = window.getComputedStyle(element).display !== "none";
  if (isVisible === shouldShow) {
    return;
  }

  element.style.willChange = "max-height, opacity";
  element.style.overflow = "hidden";

  if (shouldShow) {
    applyDisplayStyle(element, "block");
    element.style.transition = "none";
    element.style.maxHeight = "0px";
    element.style.opacity = "0";
    void element.offsetHeight;

    element.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease`;
    element.style.maxHeight = `${element.scrollHeight}px`;
    element.style.opacity = "1";

    const timerId = window.setTimeout(() => {
      clearAdvancedAnimation(element);
    }, duration);
    advancedToggleTimers.set(element, timerId);
    return;
  }

  const startHeight = element.scrollHeight;
  element.style.transition = "none";
  element.style.maxHeight = `${startHeight}px`;
  element.style.opacity = "1";
  void element.offsetHeight;

  element.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease`;
  element.style.maxHeight = "0px";
  element.style.opacity = "0";

  const timerId = window.setTimeout(() => {
    applyDisplayStyle(element, "none");
    clearAdvancedAnimation(element);
  }, duration);
  advancedToggleTimers.set(element, timerId);
}

function normalizeAdvancedSections(root, expandedDefault) {
  if (!root) {
    return;
  }

  // 流程图（阅读态，高级讨论兼容）
  // [解析 HTML]
  //    -> [识别 #toggleBtn/#moreContent 成对结构]
  //    -> [识别 a#Q + div.Q 旧站结构]
  //    -> [仅打标记 data-advanced-*，不改按钮原文案]
  //    -> [点击时按原站语义执行 show/hide]
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
  });

  const qTriggers = Array.from(root.querySelectorAll("a#Q"));
  qTriggers.forEach((trigger) => {
    trigger.setAttribute("data-advanced-trigger", "1");
    trigger.setAttribute("data-advanced-mode", "q-class");
  });

  const qContents = Array.from(root.querySelectorAll("div.Q"));
  qContents.forEach((content) => {
    applyDisplayStyle(content, expandedDefault ? "block" : "none");
    content.setAttribute("data-advanced-content", "1");
    content.setAttribute("data-advanced-mode", "q-class");
  });
}

// 将后端返回的原始 HTML 做前端适配：
// 1) 把 .html 链接改写为站内路由（/:slug）
// 2) 识别并标准化高级讨论结构（保留原文案）
function rewriteLinks(rawHtml, advancedExpanded = false) {
  if (!rawHtml) {
    return "";
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id=\"r\">${rawHtml}</div>`, "text/html");
  const root = doc.querySelector("#r");

  root?.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/(^|\/)([^\/]+\.html)$/i);
    if (match) {
      const slug = match[2];
      const id = slug.replace(/\.html$/i, "");
      // 例如 Index.html -> /index，k-trans--permeability.html -> /k-trans--permeability
      // 后续由 App 的 normalizeRouteId/routeIdToSlug 再与后端 slug 对齐。
      const routeId = /^index$/i.test(id) ? "index" : id;
      anchor.setAttribute("href", `/${encodeURIComponent(routeId)}`);
      anchor.setAttribute("data-internal", "1");
    }
  });

  if (root) {
    normalizeResourceUrls(root);
    normalizeAdvancedSections(root, advancedExpanded);

    root.querySelectorAll("input[type=button][onclick]").forEach((button) => {
      const onclick = button.getAttribute("onclick") || "";
      const match = onclick.match(/^(showAnswer|showAllAnswers|scoreAnswers)\s*\(\s*(['"])([^'"]+)\2\s*\)$/);
      if (match) {
        const fnName = match[1];
        const arg = match[3];
        button.setAttribute("onclick", `${fnName}('${arg}', this)`);
      }
    });
  }

  return root?.innerHTML || rawHtml;
}

export default function HtmlContent({ html, className = "", advancedExpanded = false, viewMode = "zh", pageSlug = null, disableLightbox = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  // 只有 html 内容或展开策略变化时，才重新解析，避免频繁 DOMParser 开销。
  const renderedHtml = useMemo(() => rewriteLinks(html, advancedExpanded), [html, advancedExpanded]);

  useEffect(() => {
    // 只有当没有禁用lightbox时才初始化
    if (!disableLightbox) {
      const stop = initLightbox();
      return () => stop();
    }
  }, [renderedHtml, disableLightbox]);

  useEffect(() => {
    if (!containerRef.current || !renderedHtml) return;
    
    // 只在中文页面应用覆盖
    if (viewMode !== "zh") {
      console.log('Not applying overlay for viewMode:', viewMode);
    } else {
      // 从pageSlug参数或路由获取当前页面的slug
      let currentPageSlug = pageSlug;
      
      // 如果没有提供pageSlug参数，从路由获取
      if (!currentPageSlug) {
        currentPageSlug = location.pathname.slice(1); // 去掉开头的 /
        
        // 处理编辑页面的情况：路径是 /edit/slug，需要取第二个部分
        const pathParts = currentPageSlug.split('/');
        if (pathParts.length >= 2 && pathParts[0] === 'edit') {
          currentPageSlug = pathParts[1];
        }
        
        // 处理审核页面的情况：路径是 /review/slug，需要取第二个部分
        if (pathParts.length >= 2 && pathParts[0] === 'review') {
          currentPageSlug = pathParts[1];
        }
      }
      
      if (!currentPageSlug || currentPageSlug === '') {
        currentPageSlug = 'index';
      }
      // 确保有 .html 后缀（和我们的 JSON 中的键匹配）
      if (!currentPageSlug.endsWith('.html')) {
        currentPageSlug = currentPageSlug + '.html';
      }
      
      console.log('Current page slug for overlay:', currentPageSlug);
      applyImageOverlays(containerRef.current, currentPageSlug);
    }
    
    // 初始化音频播放器（不依赖 success 回调）
    const initAudioPlayers = () => {
      try {
        console.log('Initializing audio players...');
        
        if (window.MediaElementPlayer) {
          const audioElements = containerRef.current.querySelectorAll('audio');
          console.log('Found audio elements:', audioElements.length);
          
          audioElements.forEach((audio, index) => {
            try {
              // 确保音频路径是根路径
              const src = audio.getAttribute('src');
              if (src && !src.startsWith('/')) {
                audio.setAttribute('src', '/' + src.replace(/^\.?\/+/, ''));
              }
              
              new window.MediaElementPlayer(audio, {
                features: ['playpause', 'current', 'progress', 'duration', 'volume']
              });
            } catch (e) {
              console.error(`Error initializing MediaElementPlayer for audio ${index}:`, e);
            }
          });
        } else {
          console.log('MediaElementPlayer not available, using native audio controls');
          const audioElements = containerRef.current.querySelectorAll('audio');
          audioElements.forEach(audio => {
            if (!audio.hasAttribute('controls')) {
              audio.setAttribute('controls', 'controls');
            }
            const src = audio.getAttribute('src');
            if (src && !src.startsWith('/')) {
              audio.setAttribute('src', '/' + src.replace(/^\.?\/+/, ''));
            }
          });
        }
      } catch (e) {
        console.error('Error in audio player initialization:', e);
      }
    };
    
    // 延迟添加 wsite-mejs-track 元素和其他样式
    const addWsiteMejsTracks = () => {
      try {
        console.log('Adding wsite-mejs-track elements...');
        const audioElements = containerRef.current.querySelectorAll('audio');
        console.log('Found audio elements for track addition:', audioElements.length);
        
        audioElements.forEach((audio, index) => {
          try {
            const trackText = audio.getAttribute('data-track');
            const alignClass = audio.getAttribute('class');
            
            // 查找这个 audio 元素对应的 mejs-container
            let parent = audio.parentElement;
            let container = null;
            
            // 向上查找 mejs-container
            while (parent && !container) {
              if (parent.classList && parent.classList.contains('mejs-container')) {
                container = parent;
              } else {
                parent = parent.parentElement;
              }
            }
            
            if (container) {
              // 设置宽度
              container.style.width = '100%';
              container.style.maxWidth = '100%';
              
              // 添加 wsite 特定的类
              if (alignClass) {
                const classes = alignClass.split(' ');
                classes.forEach(cls => {
                  if (cls.startsWith('wsite-')) {
                    container.classList.add(cls);
                  }
                });
              }
              
              // 添加 wsite-mejs-track 元素
              if (trackText) {
                // 检查是否已经有了 wsite-mejs-track 元素
                const existingTrack = container.querySelector('.wsite-mejs-track');
                if (!existingTrack) {
                  const trackDiv = document.createElement('div');
                  trackDiv.className = 'wsite-mejs-track';
                  const trackSpan = document.createElement('span');
                  trackSpan.className = 'wsite-mejs-title';
                  trackSpan.textContent = trackText;
                  trackDiv.appendChild(trackSpan);
                  container.appendChild(trackDiv);
                  console.log(`Added track element for audio ${index}:`, trackText);
                }
              }
            }
          } catch (e) {
            console.error(`Error adding track for audio ${index}:`, e);
          }
        });
      } catch (e) {
        console.error('Error in adding wsite-mejs-track elements:', e);
      }
    };
    
    // 初始化 slideshow
    const initSlideshow = () => {
      try {
        console.log('Checking for slideshow initialization...');
        console.log('window.jQuery:', !!window.jQuery);
        console.log('window._W:', !!window._W);
        console.log('window._W.Slideshow:', !!(window._W && window._W.Slideshow));
        
        // 检查是否有 .wsite-header 元素
        const wsiteHeader = containerRef.current.querySelector('.wsite-header');
        console.log('.wsite-header element found:', !!wsiteHeader);
        
        // 检查是否有 _W 对象和 Slideshow 模块
        if (window._W && window._W.Slideshow && window._W.Slideshow.initHeaderSlideshow && wsiteHeader) {
          // 从原始 HTML 中提取 slideshow 配置
          const configMatch = html.match(/initHeaderSlideshow\(([\s\S]*?)\)/);
          console.log('Slideshow config match:', !!configMatch);
          
          if (configMatch) {
            try {
              const configStr = configMatch[1];
              // 使用 eval 来执行配置（因为这是从我们自己的 HTML 文件来的，是安全的）
              const config = eval('(' + configStr + ')');
              console.log('Initializing slideshow with config:', config);
              
              // 确保配置中的图片路径正确
              if (config.slides && Array.isArray(config.slides)) {
                config.slides.forEach((slide, index) => {
                  console.log(`Slide ${index} originalUrl:`, slide.originalUrl);
                  console.log(`Slide ${index} publishedUrl:`, slide.publishedUrl);
                  // 确保图片路径是根路径
                  if (slide.originalUrl && !slide.originalUrl.startsWith('/')) {
                    slide.originalUrl = '/' + slide.originalUrl.replace(/^\.?\/+/, '');
                  }
                  if (slide.publishedUrl && !slide.publishedUrl.startsWith('/')) {
                    slide.publishedUrl = '/' + slide.publishedUrl.replace(/^\.?\/+/, '');
                  }
                });
              }
              
              window._W.Slideshow.initHeaderSlideshow(config);
              console.log('Slideshow initialized!');
            } catch (e) {
              console.error('Error parsing slideshow config:', e);
            }
          }
        } else {
          if (!wsiteHeader) {
            console.log('No .wsite-header element found, not initializing slideshow');
          } else {
            console.log('Slideshow not available yet, waiting...');
          }
        }
      } catch (e) {
        console.error('Error in slideshow initialization:', e);
      }
    };
    
    // 等待 jQuery 和其他脚本加载完成，并且 DOM 渲染完成
    const checkAndInit = () => {
      // 先初始化音频播放器
      setTimeout(initAudioPlayers, 100);
      
      // 多次尝试添加 wsite-mejs-track 元素
      setTimeout(addWsiteMejsTracks, 500);
      setTimeout(addWsiteMejsTracks, 1000);
      setTimeout(addWsiteMejsTracks, 2000);
      
      // 然后初始化 slideshow
      if (window.jQuery && window._W && window._W.Slideshow) {
        setTimeout(initSlideshow, 300);
      } else {
        setTimeout(checkAndInit, 100);
      }
    };
    
    checkAndInit();
    
    // 处理参考文献折叠功能
    const setupReferencesCollapsible = () => {
      if (!containerRef.current) return;
      
      console.log('setupReferencesCollapsible: 开始查找参考文献...');
      
      // 检查是否已经处理过（如果找到任何 references-collapsible，说明已处理）
      const existingCollapsible = containerRef.current.querySelector('.references-collapsible');
      if (existingCollapsible) {
        console.log('setupReferencesCollapsible: 已经有折叠卡片了，跳过');
        return;
      }
      
      // 查找所有包含"参考文献"的 div.paragraph
      const allParagraphs = Array.from(containerRef.current.querySelectorAll('div.paragraph'));
      console.log('setupReferencesCollapsible: 找到 div.paragraph 数量:', allParagraphs.length);
      
      const allReferences = allParagraphs.filter(el => el.textContent.includes('参考文献'));
      console.log('setupReferencesCollapsible: 找到包含"参考文献"的元素数量:', allReferences.length);
      
      allReferences.forEach((el, i) => {
        console.log(`setupReferencesCollapsible: 参考文献 ${i+1}:`, el.textContent.substring(0, 50));
      });
      
      // 选择最后一个
      if (allReferences.length === 0) {
        console.log('setupReferencesCollapsible: 没有找到参考文献');
        return;
      }
      
      const referencesEl = allReferences[allReferences.length - 1];
      console.log('setupReferencesCollapsible: 使用最后一个参考文献:', referencesEl.textContent.substring(0, 50));
      
      // 检查是否已经被处理过
      if (referencesEl.closest('.references-collapsible')) {
        console.log('setupReferencesCollapsible: 已经被处理过了，跳过');
        return;
      }
      
      // 创建折叠容器
      const wrapper = document.createElement('div');
      wrapper.className = 'references-collapsible';
      
      // 从原始元素中提取参考文献标题文本，并且删除原元素中的"参考文献"4个字
      const referencesText = referencesEl.textContent;
      const titleMatch = referencesText.match(/^(.*?参考文献)/);
      const titleText = titleMatch ? titleMatch[1].trim() : '参考文献';
      
      // 删除原元素内容中的"参考文献"4个字（保留原HTML结构）
      const originalInnerHTML = referencesEl.innerHTML;
      referencesEl.innerHTML = originalInnerHTML.replace(/(<[^>]*>)?参考文献(<[^>]*>)?/, (match, openTag, closeTag) => {
        return (openTag || '') + (closeTag || '');
      });
      
      // 创建折叠按钮
      const header = document.createElement('div');
      header.className = 'references-header';
      header.innerHTML = `
        <span class="references-title"><strong>参考文献（展开/折叠）</strong></span>
      `;
      
      // 创建内容容器
      const content = document.createElement('div');
      content.className = 'references-content';
      
      // 保存原来的位置
      const originalParent = referencesEl.parentNode;
      const originalNextSibling = referencesEl.nextSibling;
      
      // 先移动参考文献本身
      content.appendChild(referencesEl);
      
      // 继续移动后面的兄弟元素，直到遇到空的段落或非段落元素
      let next = originalNextSibling;
      while (next) {
        const currentNext = next;
        next = currentNext.nextSibling;
        
        // 检查是否应该继续包含这个元素
        let shouldInclude = true;
        
        // 如果是 div.paragraph
        if (currentNext.tagName === 'DIV' && currentNext.classList.contains('paragraph')) {
          // 检查是否是空段落或包含新的标题
          const text = currentNext.textContent.trim();
          if (text === '' || text.match(/^[一二三四五六七八九十]+、/) || text.match(/^\d+\./) || text.includes('相关问题')) {
            shouldInclude = false;
          }
        } else {
          // 非段落元素不包含
          shouldInclude = false;
        }
        
        if (shouldInclude) {
          console.log('setupReferencesCollapsible: 包含兄弟元素:', currentNext.tagName, currentNext.textContent?.substring(0, 30));
          content.appendChild(currentNext);
        } else {
          console.log('setupReferencesCollapsible: 停止，遇到:', currentNext.tagName, currentNext.textContent?.substring(0, 30));
          // 把元素放回正确位置，我们在最后一起处理插入
          next = currentNext;
          break;
        }
      }
      
      // 组装
      wrapper.appendChild(header);
      wrapper.appendChild(content);
      
      // 默认折叠
      content.style.display = 'none';
      
      // 添加点击事件
      header.addEventListener('click', () => {
        const isVisible = content.style.display !== 'none';
        content.style.display = isVisible ? 'none' : 'block';
      });
      
      // 插入到原来的位置
      if (originalParent) {
        if (next) {
          originalParent.insertBefore(wrapper, next);
        } else {
          originalParent.appendChild(wrapper);
        }
        console.log('setupReferencesCollapsible: 插入完成');
      }
    };
    
    // 延迟执行，确保 DOM 渲染完成
    setTimeout(setupReferencesCollapsible, 100);
    setTimeout(setupReferencesCollapsible, 500);
  }, [renderedHtml, html, location.pathname, viewMode, pageSlug]);

  return (
    <div className="article-wrapper" style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        className={`article-html ${className}`.trim()}
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }
          
          // 如果禁用了lightbox，阻止图片和lightbox链接的点击
          if (disableLightbox) {
            const lightboxAnchor = target.closest('a[rel^="lightbox"]');
            const img = target.closest('img');
            if (lightboxAnchor || img) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
          }
          
          const advancedTrigger = target.closest("[data-advanced-trigger='1']");
          if (advancedTrigger) {
            // 按原站语义处理：
            // - mode=q-class: 点击 #Q 切换所有 .Q
            // - mode=pair: 点击 toggleBtn 切换配对的 #moreContent
            event.preventDefault();
            const mode = advancedTrigger.getAttribute("data-advanced-mode") || "pair";
            const container = event.currentTarget;

            if (mode === "q-class") {
              const qBlocks = Array.from(container.querySelectorAll("div.Q"));
              const isAnyOpen = qBlocks.some((node) => window.getComputedStyle(node).display !== "none");
              qBlocks.forEach((node) => animateAdvancedToggle(node, !isAnyOpen));
            } else {
              const content = advancedTrigger.nextElementSibling;
              if (content instanceof HTMLElement) {
                const isOpen = window.getComputedStyle(content).display !== "none";
                animateAdvancedToggle(content, !isOpen);
              }
            }
            return;
          }
          // 站内链接统一走 react-router，避免整页刷新。
          const anchor = target.closest("a[data-internal='1']");
          if (anchor) {
            event.preventDefault();
            navigate(anchor.getAttribute("href"));
          }
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />

      {/* Screenshot button moved to header */}
    </div>
  );
}
