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

    // Close when selecting an item
    const items = qsa('.menu-item', menu);
    const closeMenu = () => {
      if (!checkbox) return;
      if (!checkbox.checked) return;
      checkbox.checked = false;
      // Force a layout reflow before dispatch (helps some browsers sync styles)
      // eslint-disable-next-line no-unused-expressions
      checkbox.offsetWidth;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    };

    if (checkbox && items.length){
      items.forEach(item => {
        item.addEventListener('click', (e) => {
          if (item.getAttribute('href') === '#') {
            e.preventDefault();
          }
          // Allow any other listeners (e.g., tab creation) to run first next tick
          setTimeout(closeMenu, 0);
        });
        item.addEventListener('touchend', (e) => {
          if (item.getAttribute('href') === '#') {
            e.preventDefault();
          }
          setTimeout(closeMenu, 0);
        }, { passive: false });
      });
    }

    // Delegated fallback (in case items added later dynamically)
    menu.addEventListener('click', (e) => {
      const target = e.target.closest('.menu-item');
      if (!target || !menu.contains(target)) return;
      if (target.getAttribute('href') === '#') e.preventDefault();
      setTimeout(closeMenu, 0);
    });

    // Close when clicking outside the menu
    // Use capture so we catch it before other handlers that might stopPropagation
    document.addEventListener('click', (e) => {
      if (!checkbox || !checkbox.checked) return;
      if (!menu.contains(e.target)) {
        closeMenu();
      }
    }, true);

    // Also listen on mousedown (helps if focus shifts) without preventing default
    document.addEventListener('mousedown', (e) => {
      if (!checkbox || !checkbox.checked) return;
      if (!menu.contains(e.target)) {
        closeMenu();
      }
    });

    // Close on Escape key for accessibility
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
