// Runtime injector: fetch basename->text map, find <img> by basename, add overlay UI
(function () {
  function safeFetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('fetch failed ' + r.status);
      return r.json();
    });
  }

  function injectStyles() {
    if (document.getElementById('ioc-dom-styles')) return;
    var css = `
      .ioc-wrapper-dom { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial; margin:6px 0 }
      .ioc-controls-dom { margin-bottom:6px }
      .ioc-toggle-dom { background:#2266cc;color:#fff;border:0;padding:6px 10px;border-radius:4px;cursor:pointer }
      .ioc-card-dom { position:relative; display:inline-block; width:100%; max-width:900px }
      .ioc-underlay-dom { display:block; width:100%; height:auto }
      .ioc-noimg-dom { width:100%; height:200px; background:#eee; display:flex;align-items:center;justify-content:center;color:#666 }
      .ioc-overlay-dom { position:absolute; top:0; left:0; right:0; bottom:0; padding:12px; overflow:auto; background:rgba(255,255,255,0.96); color:#111; white-space:pre-wrap; user-select:text }
      .ioc-overlay-dom ul{ margin:0; padding-left:1.2em }
      .ioc-overlay-dom li{ margin:0 0 0.5em 0 }
      .ioc-card-dom.ioc-show-text .ioc-underlay-dom { visibility:hidden; pointer-events:none }
      .ioc-card-dom.ioc-show-image .ioc-overlay-dom { display:none }
      .ioc-loading-dom, .ioc-missing-dom { padding:8px; color:#666 }
    `;
    var s = document.createElement('style');
    s.id = 'ioc-dom-styles';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function basenameCandidatesFromSrc(src) {
    if (!src) return [];
    var noQuery = src.split('?')[0];
    var parts = noQuery.split('/');
    var file = parts[parts.length - 1] || '';
    var nameNoExt = file.replace(/\.[^.]+$/, '');
    var candidates = [];
    candidates.push(file);
    if (nameNoExt) candidates.push(nameNoExt);
    if (nameNoExt) candidates.push(nameNoExt + '.html');
    candidates.push(file + '.html');
    return candidates;
  }

  function createOverlayForImage(img, text) {
    injectStyles();

    var wrapper = document.createElement('div');
    wrapper.className = 'ioc-wrapper-dom';

    var controls = document.createElement('div');
    controls.className = 'ioc-controls-dom';
    var btn = document.createElement('button');
    btn.className = 'ioc-toggle-dom';
    btn.textContent = '查看原图';
    controls.appendChild(btn);

    var card = document.createElement('div');
    card.className = 'ioc-card-dom ioc-show-text';

    var parent = img.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, img);
    wrapper.appendChild(controls);
    wrapper.appendChild(card);

    img.classList.add('ioc-underlay-dom');
    card.appendChild(img);

    var overlay = document.createElement('div');
    overlay.className = 'ioc-overlay-dom';
    overlay.textContent = text || '';
    card.appendChild(overlay);

    btn.addEventListener('click', function () {
      var isText = card.classList.contains('ioc-show-text');
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
  }

  document.addEventListener('DOMContentLoaded', function () {
    var mapUrl = '/api/overlay-map';
    safeFetchJson(mapUrl)
      .then(function (data) {
        var map = data && (data.basename_map || data) || {};

        var pathName = window.location.pathname || '';
        var currentPage = pathName.split('/').pop() || '';
        if (!currentPage || !(currentPage in map)) {
          return;
        }

        var entry = map[currentPage];
        if (!entry || typeof entry.text !== 'string' || !entry.image) {
          return;
        }

        var targetImageBasename = entry.image;
        var imgs = Array.prototype.slice.call(document.getElementsByTagName('img'));
        imgs.forEach(function (img) {
          try {
            var src = img.getAttribute('src') || '';
            var noQuery = src.split('?')[0];
            var parts = noQuery.split('/');
            var file = parts[parts.length - 1] || '';
            if (!file || file !== targetImageBasename) return;

            createOverlayForImage(img, entry.text);
          } catch (e) {
            console.error('inject_overlay error', e);
          }
        });
      })
      .catch(function (err) {
        console.error('could not load basename map', err);
      });
  });
})();
