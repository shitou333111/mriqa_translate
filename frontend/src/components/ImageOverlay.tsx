import React, { useEffect, useMemo, useState } from 'react';
import '../image-overlay.css';

type RawMapping = {
  [pageBasename: string]: {
    text: string;
    image?: string;
  };
};

interface ImageOverlayProps {
  mappingUrl?: string;
  initialShowText?: boolean;
}

function lastPathComponent(s: string) {
  const clean = s.split('?')[0];
  return clean.split('/').pop() || '';
}

function basenameFromPath(s: string) {
  const name = lastPathComponent(s);
  return name.replace(/\.[^.]+$/, '');
}

function getFileName(s: string) {
  return lastPathComponent(s).toLowerCase();
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({
  mappingUrl = '/api/overlay-map',
  initialShowText = true,
}) => {
  const [mapping, setMapping] = useState<RawMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(initialShowText);
  const [targetImg, setTargetImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    async function loadAndBind() {
      try {
        const res = await fetch(mappingUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`load fail ${res.status}`);
        const json = await res.json();
        const data = (json && (json.basename_map || json)) as RawMapping;
        setMapping(data);
        const currentPage = lastPathComponent(window.location.pathname);
        if (!currentPage || !data[currentPage]) {
          return;
        }

        const entry = data[currentPage];
        if (!entry || !entry.text || !entry.image) {
          return;
        }

        const targetName = getFileName(entry.image);
        const imgs = Array.from(document.getElementsByTagName('img')) as HTMLImageElement[];
        const found = imgs.find((img) => getFileName(img.currentSrc || img.src) === targetName);
        if (found) {
          setTargetImg(found);
        }
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }

    loadAndBind();
  }, [mappingUrl]);

  useEffect(() => {
    if (!targetImg || !mapping) return;
    const currentPage = lastPathComponent(window.location.pathname);
    const entry = mapping[currentPage];
    if (!entry || !entry.text) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ioc-wrapper-dom';

    const controls = document.createElement('div');
    controls.className = 'ioc-controls-dom';
    const btn = document.createElement('button');
    btn.className = 'ioc-toggle-dom';
    btn.textContent = '查看原图';
    controls.appendChild(btn);

    const card = document.createElement('div');
    card.className = 'ioc-card-dom ioc-show-text';

    const parent = targetImg.parentElement;
    if (!parent) return;
    parent.insertBefore(wrapper, targetImg);
    wrapper.appendChild(controls);
    wrapper.appendChild(card);

    targetImg.classList.add('ioc-underlay-dom');
    card.appendChild(targetImg);

    const overlay = document.createElement('div');
    overlay.className = 'ioc-overlay-dom';
    overlay.textContent = entry.text;
    card.appendChild(overlay);

    btn.addEventListener('click', function () {
      const isText = card.classList.contains('ioc-show-text');
      if (isText) {
        card.classList.remove('ioc-show-text');
        card.classList.add('ioc-show-image');
        btn.textContent = '查看翻译 (可复制)';
      } else {
        card.classList.remove('ioc-show-image');
        card.classList.add('ioc-show-text');
        btn.textContent = '查看原图';
      }
    });

    return () => {
      // 还原原 img 结构
      if (wrapper.parentElement) {
        wrapper.parentElement.insertBefore(targetImg, wrapper);
        wrapper.remove();
      }
    };
  }, [targetImg, mapping]);

  if (loading) {
    return <div className="ioc-status">正在读取覆盖映射...</div>;
  }

  if (error) {
    return <div className="ioc-status error">覆盖映射加载失败：{error}</div>;
  }

  if (!mapping) {
    return null;
  }

  const currentPage = lastPathComponent(window.location.pathname);
  if (!currentPage || !(currentPage in mapping)) {
    return null;
  }

  if (!targetImg) {
    return <div className="ioc-status">未找到目标图片: {mapping[currentPage].image ?? '(无)'} </div>;
  }

  return null;
};

export default ImageOverlay;
