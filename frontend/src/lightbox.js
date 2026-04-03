// Lightweight delegated lightbox implementation
// Usage: import { initLightbox } from './lightbox'; const stop = initLightbox(); // call stop() to remove listeners

// 防止重复初始化的全局变量
let lightboxInstance = null;
let refCount = 0;

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'mriqa-lightbox-overlay';
  overlay.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:9999;`;

  const container = document.createElement('div');
  container.className = 'mriqa-lightbox-container';
  container.style.cssText = 'max-width:90vw;max-height:90vh;display:flex;align-items:center;justify-content:center;position:relative;background:#fff;padding:10px;box-sizing:border-box;border-radius:6px';

  const img = document.createElement('img');
  img.className = 'mriqa-lightbox-image';
  img.style.cssText = 'max-width:100%;max-height:100%;border-radius:4px;';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mriqa-lightbox-close';
  closeBtn.innerText = '✕';
  closeBtn.style.cssText = 'position:absolute;top:-14px;right:-14px;background:#222;color:#fff;border-radius:50%;width:32px;height:32px;border:none;cursor:pointer;transition:none;outline:none;user-select:none;';

  const navPrev = document.createElement('button');
  const navNext = document.createElement('button');
  navPrev.innerText = '◀'; navNext.innerText = '▶';
  navPrev.className = 'mriqa-lightbox-prev'; navNext.className = 'mriqa-lightbox-next';
  // make nav buttons circular, slightly farther from image, with reduced shadow
  navPrev.style.cssText = navNext.style.cssText = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.45);border:none;color:#fff;font-size:18px;width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:none;outline:none;user-select:none;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.25);';
  navPrev.style.left = '-64px'; navNext.style.right = '-64px';
  // subtle hover effect without movement; slightly increase shadow on hover
  const onEnter = (btn) => () => { btn.style.background = 'rgba(255,255,255,0.08)'; btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.28)'; };
  const onLeave = (btn) => () => { btn.style.background = 'rgba(0,0,0,0.45)'; btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)'; };
  navPrev.addEventListener('mouseenter', onEnter(navPrev)); navPrev.addEventListener('mouseleave', onLeave(navPrev));
  navNext.addEventListener('mouseenter', onEnter(navNext)); navNext.addEventListener('mouseleave', onLeave(navNext));

  container.appendChild(img);
  container.appendChild(closeBtn);
  container.appendChild(navPrev);
  container.appendChild(navNext);
  overlay.appendChild(container);
  return { overlay, img, closeBtn, navPrev, navNext };
}

function findGroupAnchors(startAnchor) {
  const rel = startAnchor.getAttribute('rel') || '';
  if (!rel) return [startAnchor];
  // group by exact rel value
  return Array.from(document.querySelectorAll(`a[rel="${CSS.escape(rel)}"]`));
}

export function initLightbox() {
  // 检查是否已经初始化过，防止重复初始化
  if (lightboxInstance) {
    console.log('Lightbox already initialized, increasing refCount');
    refCount++;
    return lightboxInstance.destroy;
  }

  let overlayEl = null;
  let imgEl = null;
  let closeBtn = null;
  let prevBtn = null;
  let nextBtn = null;
  let currentGroup = null;
  let currentIndex = 0;

  function showAnchor(anchor) {
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (!overlayEl) {
      const parts = createOverlay();
      overlayEl = parts.overlay;
      imgEl = parts.img;
      closeBtn = parts.closeBtn;
      prevBtn = parts.navPrev;
      nextBtn = parts.navNext;
      document.body.appendChild(overlayEl);

      overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) close();
      });
      closeBtn.addEventListener('click', close);
      prevBtn.addEventListener('click', showPrev);
      nextBtn.addEventListener('click', showNext);
      document.addEventListener('keydown', onKey);
    }

    imgEl.src = href;
    // preload
    imgEl.alt = anchor.getAttribute('title') || '';
    overlayEl.style.display = 'flex';
  }

  function close() {
    if (overlayEl) overlayEl.style.display = 'none';
    currentGroup = null;
    currentIndex = 0;
  }

  function showPrev() {
    if (!currentGroup) return;
    currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
    showAnchor(currentGroup[currentIndex]);
  }

  function showNext() {
    if (!currentGroup) return;
    currentIndex = (currentIndex + 1) % currentGroup.length;
    showAnchor(currentGroup[currentIndex]);
  }

  function onKey(e) {
    if (!overlayEl || overlayEl.style.display === 'none') return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  }

  function delegatedClick(e) {
    const target = e.target instanceof Element ? e.target.closest('a[rel^="lightbox"]') : null;
    if (!target) return;
    e.preventDefault();
    // build group
    currentGroup = findGroupAnchors(target);
    currentIndex = currentGroup.indexOf(target);
    if (currentIndex < 0) currentIndex = 0;
    showAnchor(target);
  }

  // mark legacy guard as satisfied so inline onclick guards don't block our delegated handler
  try { window.lightboxLoaded = true; } catch (e) {}
  document.addEventListener('click', delegatedClick);

  const destroy = function() {
    refCount--;
    console.log('Lightbox destroy called, refCount:', refCount);
    if (refCount <= 0) {
      console.log('RefCount reached 0, destroying lightbox');
      document.removeEventListener('click', delegatedClick);
      document.removeEventListener('keydown', onKey);
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null;
      imgEl = null;
      closeBtn = null;
      prevBtn = null;
      nextBtn = null;
      lightboxInstance = null;
      refCount = 0;
      try { window.lightboxLoaded = false; } catch (e) {}
    }
  };

  // 保存实例引用
  refCount = 1;
  lightboxInstance = {
    destroy
  };

  return destroy;
}

export default initLightbox;
