// Radial layout for Gooey menu: items evenly spaced around the toggle
(function(){
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function getRadius(container){
    // Read radius from CSS variable or data attribute; fallback to 84px
    const style = getComputedStyle(container);
    const fromCss = parseFloat(style.getPropertyValue('--gooey-radius'));
    if (!Number.isNaN(fromCss) && fromCss > 0) return fromCss;
    const fromData = parseFloat(container.getAttribute('data-radius'));
    if (!Number.isNaN(fromData) && fromData > 0) return fromData;
    return 84; // sensible default for 40px items
  }

  function placeRadial(container){
    const toggle = qs('.menu-open-button', container);
    const items = qsa('.menu-item', container);
    const checkbox = qs('#menu-open', container);
    if (!toggle || !items.length || !checkbox) return;

    const isOpen = checkbox.checked;
    const radius = getRadius(container);
    const n = items.length;

    // Distribute items evenly over full 360 degrees around the toggle center
    // Origin for transforms is the toggle's top-left; since items and toggle share size,
    // translating by (dx,dy) puts their centers on a circle of given radius.
    items.forEach((item, idx) => {
      const angle = (2 * Math.PI * idx) / n; // 0..2π
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;

      if (isOpen) {
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
      } else {
        item.style.transform = 'translate(0,0)';
        item.style.opacity = '0';
        item.style.pointerEvents = 'none';
      }
    });
  }

  function init(){
    const menu = qs('.gooey-menu');
    if (!menu) return;
    const checkbox = qs('#menu-open', menu);
    const relayout = () => placeRadial(menu);
    if (checkbox) checkbox.addEventListener('change', relayout);
    window.addEventListener('resize', relayout);
    // Initial layout (closed state keeps items hidden at origin)
    placeRadial(menu);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
