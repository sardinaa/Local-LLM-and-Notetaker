export function toggleFilterMenu(tm, open) {
  const menu = tm.taskFilterMenu;
  const btn = tm.taskFilterBtn;
  if (!menu || !btn) return;
  const willOpen = typeof open === 'boolean' ? open : menu.classList.contains('is-hidden');
  menu.classList.toggle('is-hidden', !willOpen);
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen) {
    const first = menu.querySelector('.filter-option');
    if (first) first.focus();
  }
}

export function initFilterMenu(tm) {
  const wire = (container, key, dataAttr) => {
    if (!container) return;
    container.querySelectorAll('.filter-option').forEach((el) => {
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => {
        const val = el.dataset[dataAttr];
        tm.viewSettings[key] = val;
        try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
        updateMenuState(tm);
        if (typeof tm.render === 'function') tm.render();
        else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
        // Close the details panel when changing the view
        if (typeof tm.hidePanel === 'function') tm.hidePanel();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(container.querySelectorAll('.filter-option'));
          const idx = items.indexOf(el);
          const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[next].focus();
        } else if (e.key === 'Escape') {
          toggleFilterMenu(tm, false);
        }
      });
    });
  };

  wire(tm.groupByOptions, 'groupBy', 'group');
  wire(tm.sortByOptions, 'sortBy', 'sort');

  if (tm.sortOrderToggle) {
    tm.sortOrderToggle.addEventListener('click', () => {
      tm.viewSettings.sortOrder = tm.viewSettings.sortOrder === 'asc' ? 'desc' : 'asc';
      try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
      updateMenuState(tm);
      if (typeof tm.render === 'function') tm.render();
      else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
      if (typeof tm.hidePanel === 'function') tm.hidePanel();
    });
  }
}

export function updateMenuState(tm) {
  const { groupByOptions, sortByOptions, sortOrderToggle, viewSettings } = tm;
  if (groupByOptions) {
    groupByOptions.querySelectorAll('.filter-option').forEach((el) => {
      const checked = el.dataset.group === viewSettings.groupBy;
      el.setAttribute('aria-checked', checked ? 'true' : 'false');
    });
  }
  if (sortByOptions) {
    sortByOptions.querySelectorAll('.filter-option').forEach((el) => {
      const checked = el.dataset.sort === viewSettings.sortBy;
      el.setAttribute('aria-checked', checked ? 'true' : 'false');
    });
  }
  if (sortOrderToggle) {
    sortOrderToggle.setAttribute('data-order', viewSettings.sortOrder);
  }
}
