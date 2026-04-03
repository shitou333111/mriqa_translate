// translated-mock.js
// Find each .wsite-image img and the following .translated-mock, compute the
// image natural aspect ratio and set --tm-aspect (percentage) on the mock so
// CSS padding-top creates the same height as the image at any rendered width.
(function(){
  function setAspectForPair(img, mock){
    function apply(){
      var nw = img.naturalWidth || img.width;
      var nh = img.naturalHeight || img.height;
      if (!nw || !nh) return;
      var pct = (nh / nw) * 100;
      mock.style.setProperty('--tm-aspect', pct + '%');
    }

    if (img.complete) apply(); else img.addEventListener('load', apply);

    var resizeDebounce;
    window.addEventListener('resize', function(){
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(apply, 120);
    });
  }

  function init(){
    var containers = document.querySelectorAll('.wsite-image');
    containers.forEach(function(container){
      var img = container.querySelector('img');
      var mock = container.querySelector('.translated-mock');
      if (img && mock) setAspectForPair(img, mock);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
