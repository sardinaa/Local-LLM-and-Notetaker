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

  // Bulk actions button and menu
  const bulkBtn = qs('#jobsBulkActionsBtn');
  const bulkMenu = qs('#jobsBulkMenu');
  
  console.log('Bulk button found:', !!bulkBtn);
  console.log('Bulk menu found:', !!bulkMenu);
  
  if (bulkBtn && bulkMenu) {
    console.log('Setting up bulk actions handlers');
    // Toggle menu on button click
    bulkBtn.addEventListener('click', (e) => {
      console.log('Bulk button clicked');
      e.stopPropagation();
      const wasHidden = bulkMenu.classList.contains('is-hidden');
      bulkMenu.classList.toggle('is-hidden');
      console.log('Menu visibility changed from', wasHidden, 'to', bulkMenu.classList.contains('is-hidden'));
      // Ensure menu aligns under the button
      const wrap = qs('#jobsBulkWrap');
      if (wrap) {
        wrap.style.position = 'relative';
      }
    });

    // Hide menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!bulkMenu.contains(e.target) && e.target !== bulkBtn) {
        bulkMenu.classList.add('is-hidden');
      }
    });

    // Menu item handlers
    const archiveBtn = bulkMenu.querySelector('[data-act="archive"]');
    const markAppliedBtn = bulkMenu.querySelector('[data-act="mark-applied"]');
    const markRespondedBtn = bulkMenu.querySelector('[data-act="mark-responded"]');
    const tagsBtn = bulkMenu.querySelector('[data-act="tags"]');
    const deleteBtn = bulkMenu.querySelector('[data-act="delete"]');

    if (archiveBtn) {
      archiveBtn.addEventListener('click', async () => {
        await handleBulkArchive();
        bulkMenu.classList.add('is-hidden');
      });
    }

    if (markAppliedBtn) {
      markAppliedBtn.addEventListener('click', async () => {
        await handleBulkMark('applied', 1);
        bulkMenu.classList.add('is-hidden');
      });
    }

    if (markRespondedBtn) {
      markRespondedBtn.addEventListener('click', async () => {
        await handleBulkMark('responded', 1);
        bulkMenu.classList.add('is-hidden');
      });
    }

    if (tagsBtn) {
      tagsBtn.addEventListener('click', async () => {
        await handleBulkTags();
        bulkMenu.classList.add('is-hidden');
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        await handleBulkDelete();
        bulkMenu.classList.add('is-hidden');
      });
    }
  }
}

// Bulk action handlers
async function handleBulkMark(field, value) {
  const selectedIds = Array.from(JobsState.selection);
  if (!selectedIds.length) return;

  try {
    await Promise.all(selectedIds.map(id => JobsAPI.patch(id, { [field]: value })));
    // Refresh the jobs list to show updated data
    await loadJobs();
    // Clear selection
    JobsState.selection.clear();
    document.dispatchEvent(new CustomEvent('jobs:render'));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Bulk mark failed', e);
    // eslint-disable-next-line no-alert
    alert('Failed to update jobs');
  }
}

async function handleBulkArchive() {
  const selectedIds = Array.from(JobsState.selection);
  if (!selectedIds.length) return;

  try {
    // First ensure we have an "archived" tag
    let archivedTag;
    try {
      const tagsResponse = await fetch('/api/tags');
      if (tagsResponse.ok) {
        const tags = await tagsResponse.json();
        archivedTag = tags.find(t => t.name.toLowerCase() === 'archived');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to fetch tags', e);
    }

    // Create archived tag if it doesn't exist
    if (!archivedTag) {
      try {
        const response = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'archived' })
        });
        if (response.ok) {
          archivedTag = await response.json();
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to create archived tag', e);
        // eslint-disable-next-line no-alert
        alert('Failed to create archived tag');
        return;
      }
    }

    // Add archived tag to selected jobs
    await Promise.all(selectedIds.map(async (id) => {
      const job = JobsState.items.find(j => j.id.toString() === id);
      if (job) {
        const currentTagIds = new Set(job.tagIds || []);
        currentTagIds.add(archivedTag.id);
        await JobsAPI.patch(id, { tagIds: Array.from(currentTagIds) });
      }
    }));

    // Refresh and clear selection
    await loadJobs();
    JobsState.selection.clear();
    document.dispatchEvent(new CustomEvent('jobs:render'));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Bulk archive failed', e);
    // eslint-disable-next-line no-alert
    alert('Failed to archive jobs');
  }
}

async function handleBulkTags() {
  // For now, show a simple alert - this would need more complex UI
  // eslint-disable-next-line no-alert
  alert('Bulk tag editing feature coming soon. Please edit tags individually for now.');
}

async function handleBulkDelete() {
  const selectedIds = Array.from(JobsState.selection);
  if (!selectedIds.length) return;

  const plural = selectedIds.length > 1 ? 'jobs' : 'job';
  // eslint-disable-next-line no-alert
  if (!confirm(`Delete ${selectedIds.length} ${plural}? This cannot be undone.`)) return;

  try {
    // Optimistically remove from state
    JobsState.items = JobsState.items.filter(job => !JobsState.selection.has(job.id.toString()));
    JobsState.selection.clear();
    document.dispatchEvent(new CustomEvent('jobs:render'));

    // Delete on server
    await Promise.all(selectedIds.map(id => JobsAPI.remove(id)));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Bulk delete failed', e);
    // eslint-disable-next-line no-alert
    alert('Failed to delete some jobs');
    // Refresh to reconcile state
    await loadJobs();
  }
}
