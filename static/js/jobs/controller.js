import { bindFilters, loadJobs } from './filters.js';
import { renderTable } from './table.js';
import { JobsAPI } from './api.js';
import { JobsState } from './state.js';
import { qs } from './dom.js';
import { ensureTagsLoaded } from './tags.js';
import { initScraper } from './scraper.js';

export function initJobs() {
  if (!document.getElementById('jobsSection')) return; // only if jobs UI exists

  // Wire filters and initial load
  bindFilters();
  document.addEventListener('jobs:render', renderTable);
  loadJobs();
  // Preload tags metadata for pills/editor
  ensureTagsLoaded().catch(() => {});
  // Initialize scraper panel manager if panel exists in template
  if (document.getElementById('jobScraperPanel')) {
    initScraper();
  }

  // New job
  qs('#jobsNewBtn')?.addEventListener('click', async () => {
    try {
      const job = await JobsAPI.create({ state: 'draft', applied: 0, responded: 0 });
      // Prepend and re-render
      JobsState.items = [job, ...(JobsState.items || [])];
      document.dispatchEvent(new CustomEvent('jobs:render'));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Could not create job');
    }
  });

  // Edit mode toggle
  qs('#jobsToggleEdit')?.addEventListener('click', () => {
    JobsState.editMode = !JobsState.editMode;
    const btn = qs('#jobsToggleEdit');
    if (btn) btn.textContent = JobsState.editMode ? 'Edit Mode: On' : 'Edit Mode';
    document.dispatchEvent(new CustomEvent('jobs:render'));
  });

  // View mode toggle
  qs('#jobsToggleView')?.addEventListener('click', () => {
    JobsState.viewMode = JobsState.viewMode === 'compact' ? 'detailed' : 'compact';
    // Update button label if element exists
    const btn = qs('#jobsToggleView');
    if (btn) btn.textContent = JobsState.viewMode === 'compact' ? 'Compact' : 'Detailed';
    document.dispatchEvent(new CustomEvent('jobs:render'));
  });
}
