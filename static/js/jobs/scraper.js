// Modular Job Scraper UI (panel, config modal, manual search, import)
import { qs, qsa } from './dom.js';
import { JobsAPI } from './api.js';
import { JobsState } from './state.js';
import { CLASSES } from '../constants/classes.js';
import { show, hide, toggle } from '../utils/dom.js';

class JobsScraper {
  constructor() {
    this.isInitialized = false;
    this.selectedResults = new Set();
    this.currentSearchResults = [];
  }

  init() {
    if (this.isInitialized) return;
    this.bindEvents();
    this.loadStatus();
    this.isInitialized = true;
  }

  // Event wiring
  bindEvents() {
    this.on('#jobScraperBtn', 'click', () => this.toggleScraperPanel());
    this.on('#manualSearchBtn', 'click', () => this.openManualSearch());

    // Panel controls
    this.on('#scraperPanelClose', 'click', () => this.closeScraperPanel());
    this.on('#scraperPanelRefresh', 'click', () => this.refreshScraperData());
    this.on('#newScraperConfig', 'click', () => this.openConfigModal());
    this.on('#manualJobSearch', 'click', () => this.openManualSearch());

    // Config modal
    this.on('#jobScraperModalClose', 'click', () => this.closeConfigModal());
    this.on('#jobScraperCancel', 'click', () => this.closeConfigModal());
    this.on('#jobScraperForm', 'submit', (e) => this.saveConfiguration(e));
    this.on('#jobScraperModal', 'click', (e) => { if (e.target.classList?.contains('modal-overlay')) this.closeConfigModal(); });

    // Manual search modal
    this.on('#manualSearchModalClose', 'click', () => this.closeManualSearchModal());
    this.on('#manualSearchCancel', 'click', () => this.closeManualSearchModal());
    this.on('#manualSearchForm', 'submit', (e) => this.executeManualSearch(e));
    this.on('#manualSearchImportFooter', 'click', () => this.importSelectedJobs());
    this.on('#manualSearchModal', 'click', (e) => { if (e.target.classList?.contains('modal-overlay')) this.closeManualSearchModal(); });

    // Select all toggle for manual search results
    this.on('#selectAllToggle', 'change', (e) => this.toggleSelectAll(e.target.checked));

    // Inline search term pill creation
    this.on('#scraperSearchTerm', 'blur', (e) => {
      const value = e.target.value.trim();
      if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
        this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
      }
    });
    this.on('#scraperSearchTerm', 'change', (e) => {
      const value = e.target.value.trim();
      if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
        this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
      }
    });
    this.on('#manualSearchTerm', 'blur', (e) => {
      const value = e.target.value.trim();
      if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
        this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
      }
    });
    this.on('#manualSearchTerm', 'change', (e) => {
      const value = e.target.value.trim();
      if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
        this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
      }
    });
    // Add Enter key support for creating pills immediately
    this.on('#scraperSearchTerm', 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('scraperSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
        }
      }
    });
    this.on('#manualSearchTerm', 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = e.target.value.trim();
        if (value && !this.hasInlineSearchTermPill('manualSearchTermPills')) {
          this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
        }
      }
    });
    // When user focuses on search input, if there's a pill, populate the input with the pill's value for editing
    this.on('#scraperSearchTerm', 'focus', (e) => {
      const container = qs('#scraperSearchTermPills');
      const pill = container?.querySelector('.location-pill');
      if (pill && pill.dataset.term && !e.target.value.trim()) {
        e.target.value = pill.dataset.term;
        e.target.disabled = false;
      }
    });
    this.on('#manualSearchTerm', 'focus', (e) => {
      const container = qs('#manualSearchTermPills');
      const pill = container?.querySelector('.location-pill');
      if (pill && pill.dataset.term && !e.target.value.trim()) {
        e.target.value = pill.dataset.term;
        e.target.disabled = false;
      }
    });

    // Sliders
    this.initializeSliders();
  }

  // Helpers
  on(sel, evt, fn) { const el = qs(sel); if (el) el.addEventListener(evt, fn); }

  // Status
  async loadStatus() {
    try {
      const res = await fetch('/api/job-scraper/status');
      const data = await res.json();
      const statusEl = qs('#scraperStatus');
      const activeConfigsEl = qs('#activeConfigs');
      if (statusEl) { statusEl.textContent = data.running ? 'Running' : 'Stopped'; statusEl.className = `status-value ${data.running ? 'status-running' : 'status-stopped'}`; }
      if (activeConfigsEl) activeConfigsEl.textContent = data.active_configs || 0;
    } catch (e) { /* no-op */ }
  }

  async refreshScraperData() {
    await this.loadStatus();
    await this.loadRecentRuns();
    await this.loadConfigurations();
  }

  async loadRecentRuns() {
    try {
      const res = await fetch('/api/job-scraper/runs?limit=20');
      const data = await res.json();
      const runs = data && Array.isArray(data.runs) ? data.runs : [];
      this.renderRuns(runs);
      return runs;
    } catch (e) {
      this.renderRuns([]);
      return null;
    }
  }

  async loadConfigurations() {
    try {
      const res = await fetch('/api/job-scraper/configs');
      const data = await res.json();
      const configs = data && Array.isArray(data.configs) ? data.configs : [];
      this.renderConfigs(configs);
      return configs;
    } catch (e) {
      this.renderConfigs([]);
      return null;
    }
  }

  // Panel open/close
  toggleScraperPanel() {
    const sidebar = qs('#jobScraperPanel');
    if (!sidebar) return;
    if (sidebar.classList.contains(CLASSES.isHidden)) this.openScraperPanel(); else this.closeScraperPanel();
  }
  openScraperPanel() {
    const sidebar = qs('#jobScraperPanel');
    const mainContent = document.querySelector('.jobs-main-content');
    if (sidebar) { show(sidebar); this.refreshScraperData(); }
    if (mainContent) mainContent.classList.add('with-sidebar');
  }
  closeScraperPanel() {
    const sidebar = qs('#jobScraperPanel');
    const mainContent = document.querySelector('.jobs-main-content');
    if (sidebar) hide(sidebar);
    if (mainContent) mainContent.classList.remove('with-sidebar');
  }

  // Config modal
  openConfigModal() {
    const modal = qs('#jobScraperModal');
    if (modal) { modal.classList.remove(CLASSES.isHidden); document.body.classList.add('modal-open'); }
  }
  closeConfigModal() {
    const modal = qs('#jobScraperModal');
    if (modal) { modal.classList.add(CLASSES.isHidden); document.body.classList.remove('modal-open'); }
  }

  // Manual search modal
  openManualSearch() {
    const modal = qs('#manualSearchModal');
    if (modal) {
      modal.classList.remove(CLASSES.isHidden);
      document.body.classList.add('modal-open');
      this.resetManualSearchUI();
    }
  }
  closeManualSearchModal() {
    const modal = qs('#manualSearchModal');
    if (modal) { modal.classList.add(CLASSES.isHidden); document.body.classList.remove('modal-open'); }
  }

  // Sliders
  initializeSliders() {
    const hoursSlider = qs('#manualSearchHours');
    const hoursDisplay = qs('#hoursDisplay');
    if (hoursSlider && hoursDisplay) {
      const apply = (val) => { const snapped = this.snapToLogicalHoursValue(parseInt(val || '72', 10)); hoursSlider.value = snapped; hoursDisplay.textContent = this.formatHoursDisplay(snapped); };
      hoursSlider.addEventListener('input', (e) => apply(e.target.value)); apply(hoursSlider.value);
    }
    const freqSlider = qs('#scraperFrequencySlider');
    const freqDisplay = qs('#frequencyDisplay');
    if (freqSlider && freqDisplay) {
      const apply = (val) => { const snapped = this.snapToLogicalHoursValue(parseInt(val || '24', 10)); freqSlider.value = snapped; freqDisplay.textContent = this.formatHoursDisplay(snapped); };
      freqSlider.addEventListener('input', (e) => apply(e.target.value)); apply(freqSlider.value);
    }
    const maxSlider = qs('#manualSearchMax');
    const maxDisplay = qs('#maxDisplay');
    if (maxSlider && maxDisplay) { maxSlider.addEventListener('input', (e) => { maxDisplay.textContent = `${parseInt(e.target.value, 10)} jobs`; }); maxDisplay.textContent = `${maxSlider.value} jobs`; }
    const sMax = qs('#scraperMaxResults');
    const sMaxDisp = qs('#scraperMaxDisplay');
    if (sMax && sMaxDisp) { sMax.addEventListener('input', (e) => { sMaxDisp.textContent = `${parseInt(e.target.value, 10)} jobs`; }); sMaxDisp.textContent = `${sMax.value} jobs`; }
  }
  snapToLogicalHoursValue(hours) {
    const vals = [1,2,3,4,5,6,7,8,9,10,12,16,20,24,36,48,60,72,84,96,108,120];
    let closest = vals[0]; let diff = Math.abs(hours - closest);
    for (const v of vals) { const d = Math.abs(hours - v); if (d < diff) { diff = d; closest = v; } }
    return closest;
  }
  formatHoursDisplay(h) {
    if (h === 1) return '1 hour'; if (h < 24) return `${h} hours`; if (h === 24) return '1 day';
    const days = Math.round((h / 24) * 10) / 10; return `${days} days`;
  }

  // Config save (minimal)
  async saveConfiguration(e) {
    e.preventDefault();
    const term = (qs('#scraperSearchTerm')?.value || this.getInlineSearchTerm('#scraperSearchTermPills'))?.trim();
    const locations = this.getLocations('#scraperLocationsPills');
    if (!term || !locations.length) { this.notify('Position and at least one location are required', 'error'); return; }
    
    // Generate configuration name from job title
    const configName = this.generateConfigName(term, locations);
    
    const body = {
      name: configName,
      search_terms: [term],
      target_locations: locations,
      scrape_frequency_hours: parseInt(qs('#scraperFrequencySlider')?.value || '24', 10),
      max_results_per_run: parseInt(qs('#scraperMaxResults')?.value || '50', 10),
      min_score_threshold: parseFloat(qs('#scraperMinScore')?.value || '0.5'),
      enabled: !!qs('#scraperEnabled')?.checked,
      job_boards: this.getCheckedValues('jobBoards'),
      employment_types: this.getCheckedValues('employmentTypes'),
      seniority_levels: this.getCheckedValues('seniorityLevels')
    };
    const btn = qs('#jobScraperSave'); const text = btn?.querySelector('.save-text');
    try {
      if (btn) { btn.disabled = true; btn.classList.add('loading'); if (text) text.textContent = 'Saving...'; }
      const res = await fetch('/api/job-scraper/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Save failed');
      this.notify('Configuration saved', 'success');
      this.closeConfigModal();
      this.refreshScraperData();
    } catch (e) { this.notify('Failed to save configuration', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.classList.remove('loading'); if (text) text.textContent = 'Save'; } }
  }

  // Manual search + import
  async executeManualSearch(e) {
    e.preventDefault();
    const term = (qs('#manualSearchTerm')?.value || this.getInlineSearchTerm('#manualSearchTermPills'))?.trim();
    const locations = this.getLocations('#locationsPills'); // use correct pills container
    if (!term || !locations.length) { this.notify('Position and at least one location are required', 'error'); return; }
    
    // Manual search only supports one location at a time (JobSpy limitation)
    const firstLocation = locations[0];
    if (locations.length > 1) {
      this.notify(`Searching in "${firstLocation}" only. Manual search supports one location at a time.`, 'info');
    }
    
    const params = {
      search_term: term,
      location: firstLocation,
      job_boards: this.getCheckedValues('manualJobBoards'),
      hours_old: parseInt(qs('#manualSearchHours')?.value || '72', 10),
      max_results: parseInt(qs('#manualSearchMax')?.value || '50', 10)
    };
    await this.runManualSearch(params);
  }

  async runManualSearch(params) {
    const button = qs('#manualSearchSubmit');
    const importButtonFooter = qs('#manualSearchImportFooter');
    const resultsContainer = qs('#resultsList');
    try {
      if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...'; }
      if (importButtonFooter) importButtonFooter.classList.add(CLASSES.isHidden);
      if (resultsContainer) resultsContainer.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Searching for jobs...</p></div>';
      const res = await fetch('/api/job-scraper/manual-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
      if (!res.ok) throw new Error((await res.json()).error || 'Search failed');
      const data = await res.json();
      this.displaySearchResults(data.jobs || []);
    } catch (e) { this.notify(`Search failed: ${e.message || e}`, 'error'); }
    finally { if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-search"></i> Search Jobs'; } }
  }

  displaySearchResults(jobs) {
    this.currentSearchResults = jobs || [];
    this.selectedResults.clear();
    const section = qs('#manualSearchResults');
    const header = section?.querySelector('.results-header');
    const footer = section?.querySelector('.results-footer');
    const list = qs('#resultsList');
    const countEl = qs('#resultsCount');
    if (section) section.classList.remove(CLASSES.isHidden);
    if (countEl) countEl.textContent = String(jobs.length);
    if (!list) return;
    if (!jobs.length) {
      list.innerHTML = '<div class="no-results-message"><i class="fas fa-search"></i><p>No jobs found for your search criteria.</p></div>';
      if (header) header.classList.add(CLASSES.isHidden);
      if (footer) footer.classList.add(CLASSES.isHidden);
      return;
    }
    if (header) header.classList.remove(CLASSES.isHidden);
    if (footer) footer.classList.remove(CLASSES.isHidden);
    list.innerHTML = jobs.map((job, i) => {
      const title = this.escape(job.title || job.position || 'Untitled Position');
      const company = this.escape(job.company || 'Unknown Company');
      const location = this.escape(job.location || 'Location not specified');
      
      // Format posted date with relative time
      const postedDate = this.formatPostedDate(job.date_posted);
      
      // Format salary
      const salary = this.formatSalary(job.salary_min, job.salary_max, job.salary_currency);
      
      // Get work type
      const workType = this.getWorkType(job);
      
      // Get remote status
      const isRemote = job.is_remote || (job.location && job.location.toLowerCase().includes('remote'));
      
      // Format match score if available
      const matchScore = job.relevance_score || job.match_score;
      
      // Format job description
      const description = this.formatJobDescription(job.description, i);
      
      return `
        <div class="job-result" data-index="${i}">
          <div class="job-result-header">
            <input type="checkbox" class="job-result-checkbox" id="job-${i}">
            <h3 class="job-title">${title}</h3>
            ${matchScore ? `<span class="match-score" title="Relevance Score">${Math.round(matchScore * 100)}%</span>` : ''}
          </div>
          <div class="job-meta">
            <span class="job-pill company"><i class="fas fa-building"></i>${company}</span>
            <span class="job-pill location"><i class="fas fa-map-marker-alt"></i>${location}</span>
            ${postedDate ? `<span class="job-pill posted-date"><i class="fas fa-clock"></i>${postedDate}</span>` : ''}
            ${salary ? `<span class="job-pill salary"><i class="fas fa-dollar-sign"></i>${salary}</span>` : ''}
            ${workType ? `<span class="job-pill work-type"><i class="fas fa-briefcase"></i>${workType}</span>` : ''}
            ${isRemote ? `<span class="job-pill remote"><i class="fas fa-home"></i>Remote</span>` : ''}
          </div>
          ${description ? `<div class="job-description">${description}</div>` : ''}
        </div>`;
    }).join('');
    // Toggle selection on click
    list.querySelectorAll('.job-result').forEach((card, idx) => {
      card.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox' && !e.target.classList.contains('description-toggle')) {
          const cb = card.querySelector('.job-result-checkbox');
          cb.checked = !cb.checked; this.toggleJobSelection(idx);
        }
      });
    });
    this.updateSelectionCount();
  }

  toggleJobSelection(index) {
    const cb = qs(`#job-${index}`);
    const card = cb?.closest('.job-result');
    if (cb?.checked) { this.selectedResults.add(index); card?.classList.add(CLASSES.selected); }
    else { this.selectedResults.delete(index); card?.classList.remove(CLASSES.selected); }
    this.updateSelectionCount();
  }

  updateSelectionCount() {
    const count = this.selectedResults.size;
    const total = this.currentSearchResults.length;
    const sel = qs('#selectedCount'); const selFooter = qs('#selectedCountFooter');
    const importBtnFooter = qs('#manualSearchImportFooter');
    const searchBtn = qs('#manualSearchSubmit');
    const selectAllToggle = qs('#selectAllToggle');
    const selectAllLabel = qs('.select-all-label');
    
    if (sel) sel.textContent = String(count);
    if (selFooter) selFooter.textContent = String(count);
    if (importBtnFooter) importBtnFooter.classList.toggle(CLASSES.isHidden, count === 0);
    if (searchBtn) searchBtn.classList.toggle(CLASSES.isHidden, count > 0);
    
    // Update select all toggle state
    if (selectAllToggle && selectAllLabel) {
      if (count === 0) {
        selectAllToggle.checked = false;
        selectAllToggle.indeterminate = false;
        selectAllLabel.textContent = 'Select All';
      } else if (count === total) {
        selectAllToggle.checked = true;
        selectAllToggle.indeterminate = false;
        selectAllLabel.textContent = 'Clear All';
      } else {
        selectAllToggle.checked = false;
        selectAllToggle.indeterminate = true;
        selectAllLabel.textContent = 'Select All';
      }
    }
  }

  toggleSelectAll(selectAll) {
    const checkboxes = document.querySelectorAll('.job-result-checkbox');
    const label = qs('.select-all-label');
    
    checkboxes.forEach((cb, idx) => {
      cb.checked = selectAll;
      if (selectAll) {
        this.selectedResults.add(idx);
        cb.closest('.job-result')?.classList.add(CLASSES.selected);
      } else {
        this.selectedResults.delete(idx);
        cb.closest('.job-result')?.classList.remove(CLASSES.selected);
      }
    });
    
    if (label) {
      label.textContent = selectAll ? 'Clear All' : 'Select All';
    }
    
    this.updateSelectionCount();
  }

  async importSelectedJobs() {
    const selectedJobs = Array.from(this.selectedResults).map((idx) => this.currentSearchResults[idx]).filter(Boolean);
    if (!selectedJobs.length) return;
    try {
      const res = await fetch('/api/job-scraper/import-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobs: selectedJobs }) });
      if (!res.ok) throw new Error('Import failed');
      this.notify('Imported selected jobs', 'success');
      this.closeManualSearchModal();
    } catch (e) { this.notify('Import failed', 'error'); }
  }

  // UI helpers
  resetManualSearchUI() {
    this.selectedResults.clear();
    const section = qs('#manualSearchResults');
    const header = section?.querySelector('.results-header');
    const footer = section?.querySelector('.results-footer');
    const list = qs('#resultsList');
    if (section) section.classList.remove(CLASSES.isHidden);
    if (header) header.classList.add(CLASSES.isHidden);
    if (footer) footer.classList.add(CLASSES.isHidden);
    if (list) list.innerHTML = '<div class="no-results-message"><i class="fas fa-search"></i><p>Enter your search criteria and click "Search Jobs"</p></div>';
    const selectAll = qs('#selectAllToggle'); const label = qs('.select-all-label');
    if (selectAll) selectAll.checked = false; if (label) label.textContent = 'Select All';
    const importBtnFooter = qs('#manualSearchImportFooter'); const searchBtn = qs('#manualSearchSubmit');
    if (importBtnFooter) importBtnFooter.classList.add(CLASSES.isHidden); if (searchBtn) searchBtn.classList.remove(CLASSES.isHidden);
  }

  // Form helpers
  getCheckedValues(groupName) { return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`)).map((el) => el.value); }
  getInlineSearchTerm(containerSel) { const cont = qs(containerSel); const pill = cont?.querySelector('.location-pill'); return pill ? pill.dataset.term : (qs(containerSel.replace('Pills',''))?.value || '').trim(); }
  getLocations(containerSel) {
    // Prefer pills container, fallback to csv input
    const cont = qs(containerSel);
    if (cont) {
      const pills = Array.from(cont.querySelectorAll('[data-location]')).map((el) => el.getAttribute('data-location')).filter(Boolean);
      if (pills.length) return pills;
    }
    const raw = (qs('#manualSearchLocation')?.value || '').trim();
    return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }

  // Location pill management (for compatibility with locationSuggestions.js)
  addLocationPill(location) {
    const container = qs('#locationsPills');
    if (!container) return;
    
    // Check if pill already exists
    const existing = container.querySelector(`[data-location="${this.escape(location)}"]`);
    if (existing) return;
    
    const pill = document.createElement('span');
    pill.className = 'location-pill';
    pill.setAttribute('data-location', location);
    pill.innerHTML = `
      ${this.escape(location)}
      <button type="button" class="pill-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(pill);
  }

  addScraperLocationPill(location) {
    const container = qs('#scraperLocationsPills');
    if (!container) return;
    
    // Check if pill already exists
    const existing = container.querySelector(`[data-location="${this.escape(location)}"]`);
    if (existing) return;
    
    const pill = document.createElement('span');
    pill.className = 'location-pill';
    pill.setAttribute('data-location', location);
    pill.innerHTML = `
      ${this.escape(location)}
      <button type="button" class="pill-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(pill);
  }

  // Inline search term pill management
  addInlineSearchTermPill(term, containerId, inputId) {
    if (!term || term.length === 0) return;
    const container = qs(`#${containerId}`);
    const input = qs(`#${inputId}`);
    if (!container || !input) return;
    
    // Clear existing pills first (only one allowed)
    container.innerHTML = '';
    
    const pill = document.createElement('span');
    pill.className = 'location-pill'; // Use same styling as location pills
    pill.dataset.term = term;
    pill.innerHTML = `${this.escape(term)} <button type="button" class="pill-remove" onclick="jobsScraper.removeInlineSearchTermPill('${containerId}', '${inputId}')">×</button>`;
    container.appendChild(pill);
    
    // Disable the input field since we have a pill
    input.disabled = true;
    input.value = '';
  }
  
  removeInlineSearchTermPill(containerId, inputId) {
    const container = qs(`#${containerId}`);
    const input = qs(`#${inputId}`);
    if (!container || !input) return;
    
    container.innerHTML = '';
    input.disabled = false;
    input.focus();
  }
  
  hasInlineSearchTermPill(containerId) {
    const container = qs(`#${containerId}`);
    return container && container.querySelector('.location-pill') !== null; // Updated to match new class
  }

  // Notifications
  notify(msg, type = 'info') { try { if (window.toast) return window.toast(msg, type); } catch {} console.log(`[scraper] ${msg}`); }
  escape(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // Date and formatting utilities
  formatPostedDate(dateString) {
    if (!dateString) return null;
    
    try {
      const postedDate = new Date(dateString);
      const now = new Date();
      const diffInMs = now - postedDate;
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) {
        return 'Today';
      } else if (diffInDays === 1) {
        return 'Yesterday';
      } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
      } else if (diffInDays < 30) {
        const weeks = Math.floor(diffInDays / 7);
        return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
      } else if (diffInDays < 365) {
        const months = Math.floor(diffInDays / 30);
        return months === 1 ? '1 month ago' : `${months} months ago`;
      } else {
        return postedDate.toLocaleDateString();
      }
    } catch (error) {
      return dateString; // Return original string if parsing fails
    }
  }

  formatSalary(min, max, currency) {
    if (!min && !max) return null;
    currency = currency || 'EUR';
    
    if (min && max) {
      return `${min.toLocaleString()}-${max.toLocaleString()} ${currency}`;
    } else if (min) {
      return `${min.toLocaleString()}+ ${currency}`;
    } else if (max) {
      return `Up to ${max.toLocaleString()} ${currency}`;
    }
    return null;
  }

  getWorkType(job) {
    if (job.job_type) {
      return job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1);
    }
    return null;
  }

  formatJobDescription(description, jobIndex, isExpanded = false) {
    if (!description) return '';
    
    // Clean and format the description
    let cleanedDescription = this.cleanAndFormatDescription(description);
    
    // Always show full description if it's short
    if (cleanedDescription.length <= 200) {
      return `<div class="job-description-content">${cleanedDescription}</div>`;
    }
    
    // For longer descriptions, create expandable content
    const shortVersion = cleanedDescription.substring(0, 200);
    
    if (isExpanded) {
      return `
        <div class="job-description-content expanded" id="desc-${jobIndex}">
          ${cleanedDescription}
          <button class="description-toggle" onclick="jobsScraper.toggleDescription(${jobIndex}, false)">
            <i class="fas fa-chevron-up"></i> Show Less
          </button>
        </div>
      `;
    } else {
      return `
        <div class="job-description-content" id="desc-${jobIndex}">
          ${shortVersion}...
          <button class="description-toggle" onclick="jobsScraper.toggleDescription(${jobIndex}, true)">
            <i class="fas fa-chevron-down"></i> Read Full Description
          </button>
        </div>
      `;
    }
  }

  cleanAndFormatDescription(description) {
    if (!description) return '';
    
    // Don't truncate - preserve the full description
    let cleaned = description.trim();
    
    // Handle different line break formats
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Convert markdown-style formatting to HTML
    cleaned = this.convertMarkdownToHtml(cleaned);
    
    // Clean up any existing HTML tags and ensure they're safe
    cleaned = this.sanitizeHtml(cleaned);
    
    return cleaned;
  }

  convertMarkdownToHtml(text) {
    // Convert common markdown patterns to HTML while preserving the full content
    return text
      // Bold text: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic text: *text* or _text_ (but not at word boundaries to avoid conflicts)
      .replace(/\*([^*\s][^*]*[^*\s])\*/g, '<em>$1</em>')
      .replace(/_([^_\s][^_]*[^_\s])_/g, '<em>$1</em>')
      // Headers: # ## ###
      .replace(/^### (.*$)/gm, '<h6>$1</h6>')
      .replace(/^## (.*$)/gm, '<h5>$1</h5>')
      .replace(/^# (.*$)/gm, '<h4>$1</h4>')
      // Bullet points: • or - or * at start of line
      .replace(/(?:^|\n)[\s]*[•\-\*][\s]+(.+)/g, '<br>• $1')
      // Numbers lists: 1. 2. etc
      .replace(/(?:^|\n)[\s]*(\d+)\.[\s]+(.+)/g, '<br>$1. $2')
      // Multiple line breaks
      .replace(/\n\s*\n/g, '<br><br>')
      // Single line breaks
      .replace(/\n/g, '<br>');
  }

  sanitizeHtml(html) {
    // Basic HTML sanitization - remove dangerous tags but keep formatting
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
      .replace(/javascript:/gi, ''); // Remove javascript: protocols
  }

  toggleDescription(jobIndex, expand) {
    const job = this.currentSearchResults[jobIndex];
    if (!job) return;
    
    const descContainer = qs(`#desc-${jobIndex}`);
    if (!descContainer) return;
    
    const newHtml = this.formatJobDescription(job.description, jobIndex, expand);
    descContainer.outerHTML = newHtml;
  }

  // Rendering
  renderConfigs(configs) {
    const wrap = qs('#scraperConfigs');
    if (!wrap) return;
    if (!configs.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-inbox"></i></div><p class="empty-description">No configurations yet</p></div>';
      return;
    }
    wrap.innerHTML = configs.map((c) => this.configCard(c)).join('');
    // Bind actions
    wrap.querySelectorAll('[data-act="run"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        try {
          const r = await fetch(`/api/job-scraper/configs/${id}/run`, { method: 'POST' });
          if (!r.ok) throw new Error('start_failed');
          this.notify('Scrape started', 'success');
          this.loadRecentRuns();
        } catch (e) { this.notify('Failed to start run', 'error'); }
      });
    });
    wrap.querySelectorAll('[data-act="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const enabled = btn.getAttribute('data-enabled') === 'true';
        try {
          const r = await fetch(`/api/job-scraper/configs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) });
          if (!r.ok) throw new Error('update_failed');
          this.notify(!enabled ? 'Enabled' : 'Disabled', 'info');
          this.loadConfigurations();
          this.loadStatus();
        } catch (e) { this.notify('Failed to update', 'error'); }
      });
    });
    wrap.querySelectorAll('[data-act="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Delete this configuration?')) return;
        try {
          const r = await fetch(`/api/job-scraper/configs/${id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error('deletion_failed');
          this.notify('Configuration deleted', 'success');
          this.loadConfigurations();
          this.loadStatus();
        } catch (e) { this.notify('Failed to delete', 'error'); }
      });
    });
  }

  configCard(c) {
    const terms = Array.isArray(c.search_terms) ? c.search_terms : [c.search_terms].filter(Boolean);
    const locs = Array.isArray(c.target_locations) ? c.target_locations : [c.target_locations].filter(Boolean);
    const boards = Array.isArray(c.job_boards) ? c.job_boards : [c.job_boards].filter(Boolean);
    const freq = c.scrape_frequency_hours || c.frequency_hours || 24;
    const max = c.max_results_per_run || c.max_results || 50;
    const enabled = !!c.enabled;
    const name = this.escape(c.name || terms.join(', ') || 'Untitled');
    
    return `
      <div class="config-item" data-id="${c.id}">
        <div class="config-header">
          <h4>${name}</h4>
          <div class="config-status ${enabled ? 'enabled' : 'disabled'}">
            ${enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        <div class="config-details">
          <div class="config-meta">
            <span>Every ${freq}h</span>
            <span>${terms.length} terms</span>
            <span>${locs.length} locations</span>
          </div>
          <div class="config-actions">
            <button class="btn-small" data-act="run" data-id="${c.id}" title="Run now">
              <i class="fas fa-play"></i> Run
            </button>
            <button class="btn-small config-toggle-btn ${enabled ? 'btn-stop' : 'btn-start'}" 
                    data-act="toggle" data-id="${c.id}" data-enabled="${enabled}" 
                    title="${enabled ? 'Disable' : 'Enable'}">
              <i class="fas ${enabled ? 'fa-stop' : 'fa-play'}"></i> 
              ${enabled ? 'Stop' : 'Start'}
            </button>
            <button class="btn-small btn-danger" data-act="delete" data-id="${c.id}" title="Delete">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>`;
  }

  // Generate a meaningful configuration name based on job title and locations
  generateConfigName(jobTitle, locations) {
    const title = jobTitle?.trim();
    if (!title) return 'Untitled Config';
    
    // Capitalize the first letter of the job title
    const formattedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    
    // Handle locations - show first location if multiple, or "Multiple locations"
    let locationStr = '';
    if (locations && locations.length > 0) {
      if (locations.length === 1) {
        locationStr = ` in ${locations[0]}`;
      } else {
        locationStr = ` in ${locations[0]} +${locations.length - 1} more`;
      }
    }
    
    return `${formattedTitle}${locationStr}`;
  }

  renderRuns(runs) {
    const wrap = qs('#scraperRuns');
    if (!wrap) return;
    if (!runs.length) {
      wrap.innerHTML = '<div class="empty-state">No runs yet.</div>';
      return;
    }
    wrap.innerHTML = runs.map((r) => {
      const st = String(r.status || 'completed').toLowerCase();
      const statusText = st.charAt(0).toUpperCase() + st.slice(1);
      const cfg = this.escape(r.config_name || r.config_id || 'Unknown Config');
      const when = r.started_at ? new Date(r.started_at).toLocaleString() : '—';
      const fetchedCount = r.jobs_fetched || 0;
      const insertedCount = r.jobs_inserted || 0;
      const dedupedCount = r.jobs_deduped || 0;
      const errorCount = r.jobs_failed || 0;
      
      return `
        <div class="run-item">
          <div class="run-header">
            <span class="run-config">${cfg}</span>
            <span class="run-status ${st}">${statusText}</span>
          </div>
          <div class="run-stats">
            <span>${fetchedCount} fetched</span>
            <span>${insertedCount} inserted</span>
            <span>${dedupedCount} duplicates</span>
            ${errorCount > 0 ? `<span class="errors">${errorCount} errors</span>` : ''}
          </div>
          <div class="run-time">${when}</div>
          ${r.error_message ? `<div class="run-error">${this.escape(r.error_message)}</div>` : ''}
        </div>`;
    }).join('');
  }
}

export function initScraper() {
  // Avoid double-init when legacy is loaded
  if (typeof window !== 'undefined' && window.jobScraperManager) return window.jobScraperManager;
  const mgr = new JobsScraper();
  mgr.init();
  try { 
    window.jobScraperManager = mgr; 
    window.jobsScraper = mgr; // Also expose as jobsScraper for description toggle
  } catch {}
  return mgr;
}
