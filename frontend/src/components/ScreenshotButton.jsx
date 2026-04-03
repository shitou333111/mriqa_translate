import { useState, useCallback, useRef } from "react";
import { toPng } from "html-to-image";

export default function ScreenshotButton({ targetRef, filenamePrefix = "screenshot", iconOnly = false }) {
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const previewRef = useRef(null);

  const handleClick = useCallback(async () => {
    const node = (targetRef && targetRef.current) || document.querySelector('.card.card-single') || document.querySelector('.article-html');
    if (!node) {
      window.alert('未找到截屏目标元素');
      return;
    }

    // 重置状态
    setShowPreview(false);
    setPreviewDataUrl(null);
    setErrorMessage(null);

    try {
      setBusy(true);

      // Collect elements to hide (so we can restore later)
      const hiddenRecords = [];
      const hideEl = (el) => {
        if (!el) return;
        hiddenRecords.push({ el, originalDisplay: el.style.display });
        el.style.display = 'none';
      };

      // 0) hide elements explicitly marked for screenshot exclusion
      Array.from(node.querySelectorAll('[data-screenshot-hide]')).forEach(hideEl);

      // 1) 删除“相关问题”部分
      try {
        const paras = Array.from(node.querySelectorAll('div.paragraph'));
        const related = paras.find(el => el.textContent && el.textContent.includes('相关问题'));
        if (related) {
          hideEl(related);
          const nextEl = related.nextElementSibling;
          if (nextEl && nextEl.tagName === 'DIV' && nextEl.querySelector('hr.styled-hr')) hideEl(nextEl);
        }
      } catch (e) { console.error('hide related failed', e); }

      // 2) 删除“上一问题/下一问题/问题完整列表”按钮及其容器
      try {
        const allButtons = Array.from(node.querySelectorAll('a.wsite-button'));
        const navButtons = allButtons.filter(btn => btn.textContent && (
          btn.textContent.includes('上一问题') || btn.textContent.includes('下一问题') || btn.textContent.includes('问题完整列表')
        ));
        navButtons.forEach(btn => {
          const parent = btn.closest('.wsite-multicol') || btn.closest('div[style*="text-align"]') || btn.closest('div');
          if (parent) hideEl(parent);
          else hideEl(btn);
        });
      } catch (e) { console.error('hide nav buttons failed', e); }

      // 3) 删除“参考文献”区域：直接隐藏 class="references-collapsible"
      try {
        const refsEls = Array.from(node.querySelectorAll('.references-collapsible'));
        refsEls.forEach(hideEl);
      } catch (e) { console.error('hide references failed', e); }

      // 4) 展开“进阶讨论”部分（把 display:none 的 div.Q 展开）
      const advancedRestores = [];
      try {
        const advanced = Array.from(node.querySelectorAll('div.Q'));
        advanced.forEach(el => {
          advancedRestores.push({ el, originalDisplay: el.style.display });
          el.style.display = 'block';
        });
      } catch (e) { console.error('expand advanced failed', e); }

      // 5) 删除所有剩余的分隔线（hr.styled-hr）
      try {
        const dividers = Array.from(node.querySelectorAll('hr.styled-hr'));
        dividers.forEach(hr => {
          const wrapper = hr.closest('div');
          if (wrapper) hideEl(wrapper);
          else hideEl(hr);
        });
      } catch (e) { console.error('hide dividers failed', e); }

      // iOS 检测
      const isIOS = typeof navigator !== 'undefined' && /iP(ad|hone|od)/.test(navigator.userAgent);
      
      // 更保守的配置，确保兼容性
      const options = {
        cacheBust: true,
        backgroundColor: '#ffffff',
        skipAutoScale: true,
        pixelRatio: isIOS ? 1 : (window.devicePixelRatio || 2),
        style: {
          transform: 'scale(1)',
        }
      };

      console.log('Starting toPng with options:', options);

      // 导出为 PNG
      const dataUrl = await toPng(node, options);
      
      console.log('toPng completed, dataUrl length:', dataUrl ? dataUrl.length : 0);

      // 恢复原始样式/显示状态
      try {
        hiddenRecords.forEach(({ el, originalDisplay }) => { el.style.display = originalDisplay || ''; });
        advancedRestores.forEach(({ el, originalDisplay }) => { el.style.display = originalDisplay || ''; });
      } catch (e) { console.error('restore failed', e); }

      if (!dataUrl) {
        throw new Error('生成的图片为空');
      }

      // 所有设备都显示预览，让用户可以长按保存
      setPreviewDataUrl(dataUrl);
      setShowPreview(true);
      
    } catch (err) {
      console.error('screenshot failed', err);
      const msg = '截图失败：' + (err && err.message ? err.message : String(err));
      setErrorMessage(msg);
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  }, [targetRef, filenamePrefix]);

  const closePreview = useCallback(() => {
    setShowPreview(false);
    setPreviewDataUrl(null);
    setErrorMessage(null);
  }, []);

  const handlePreviewClick = useCallback((e) => {
    if (e.target === previewRef.current) {
      closePreview();
    }
  }, [closePreview]);

  const commonProps = {
    type: 'button',
    onClick: handleClick,
    disabled: busy,
    title: busy ? '正在生成截图…' : '保存截图为 PNG'
  };

  return (
    <>
      {iconOnly ? (
        <button {...commonProps} className="toolbar-screenshot-btn">
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 修改 width 和 height 属性即可调整图标大小，例如这里调成 18 */}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="4" x2="12" y2="16" />
              <polyline points="7 11 12 16 17 11" />
              <line x1="5" y1="20" x2="19" y2="20" />
            </svg>
          </span>
        </button>
      ) : (
        <button {...commonProps} className="screenshot-overlay-btn">
          {busy ? '处理中...' : '保存截图'}
        </button>
      )}

      {showPreview && previewDataUrl && (
        <div
          ref={previewRef}
          className="screenshot-preview-modal"
          onClick={handlePreviewClick}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
        >
          <div style={{ 
            marginBottom: '15px', 
            color: 'white', 
            textAlign: 'center', 
            fontSize: '16px',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}>
            长按/右键图片保存到相册
          </div>
          <img
            src={previewDataUrl}
            alt="Screenshot Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              backgroundColor: 'white',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            draggable={false}
          />
        </div>
      )}
    </>
  );
}
