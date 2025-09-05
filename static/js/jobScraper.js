/**
 * Job Scraper Frontend Integration
 */

class JobScraperManager {
    constructor() {
        this.isInitialized = false;
        this.configs = [];
        this.runs = [];
        this.selectedResults = new Set();
        this.currentSearchResults = []; // Store search results for import
        
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        this.bindEvents();
        this.loadStatus();
        this.isInitialized = true;
        
        console.log('Job Scraper Manager initialized');
    }
    
    bindEvents() {
        // Main buttons
        document.getElementById('jobScraperBtn')?.addEventListener('click', () => this.openScraperPanel());
        document.getElementById('manualSearchBtn')?.addEventListener('click', () => this.openManualSearch());
        
        // Scraper panel events
        document.getElementById('scraperPanelClose')?.addEventListener('click', () => this.closeScraperPanel());
        document.getElementById('scraperPanelRefresh')?.addEventListener('click', () => this.refreshScraperData());
        document.getElementById('newScraperConfig')?.addEventListener('click', () => this.openConfigModal());
        document.getElementById('manualJobSearch')?.addEventListener('click', () => this.openManualSearch());
        
        // Configuration modal events
        document.getElementById('jobScraperModalClose')?.addEventListener('click', () => this.closeConfigModal());
        document.getElementById('jobScraperCancel')?.addEventListener('click', () => this.closeConfigModal());
        document.getElementById('jobScraperForm')?.addEventListener('submit', (e) => this.saveConfiguration(e));
        
        // Close modal when clicking overlay
        document.getElementById('jobScraperModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeConfigModal();
            }
        });
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Manual search modal events
        document.getElementById('manualSearchModalClose')?.addEventListener('click', () => this.closeManualSearchModal());
        document.getElementById('manualSearchCancel')?.addEventListener('click', () => this.closeManualSearchModal());
        document.getElementById('manualSearchForm')?.addEventListener('submit', (e) => this.executeManualSearch(e));
        document.getElementById('manualSearchImport')?.addEventListener('click', () => this.importSelectedJobs());
        
        // Close manual search modal when clicking overlay
        document.getElementById('manualSearchModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeManualSearchModal();
            }
        });
        
        // Form interactions
        document.getElementById('scraperMinScore')?.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value).toFixed(1);
            document.getElementById('scraperMinScoreValue').textContent = value;
        });
        
        // Results selection
        document.getElementById('selectAllResults')?.addEventListener('click', () => this.selectAllResults());
        document.getElementById('clearAllResults')?.addEventListener('click', () => this.clearAllResults());
        
        // Click outside to close panels/modals
        document.addEventListener('click', (e) => {
            if (e.target.closest('.scraper-panel') || e.target.closest('#jobScraperBtn')) {
                return;
            }
            if (!e.target.closest('.modal-content') && !e.target.closest('#manualSearchBtn')) {
                // Close any open modals/panels when clicking outside
            }
        });
    }
    
    switchTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }
    
    async loadStatus() {
        try {
            const response = await fetch('/api/job-scraper/status');
            const data = await response.json();
            
            this.updateStatusDisplay(data);
        } catch (error) {
            console.error('Failed to load scraper status:', error);
        }
    }
    
    updateStatusDisplay(data) {
        const statusEl = document.getElementById('scraperStatus');
        const activeConfigsEl = document.getElementById('activeConfigs');
        
        if (statusEl) {
            statusEl.textContent = data.running ? 'Running' : 'Stopped';
            statusEl.className = `status-value ${data.running ? 'status-running' : 'status-stopped'}`;
        }
        
        if (activeConfigsEl) {
            activeConfigsEl.textContent = data.active_configs || 0;
        }
    }
    
    openScraperPanel() {
        const panel = document.getElementById('jobScraperPanel');
        if (panel) {
            panel.classList.remove('is-hidden');
            this.loadConfigurations();
            this.loadRecentRuns();
        }
    }
    
    closeScraperPanel() {
        const panel = document.getElementById('jobScraperPanel');
        if (panel) {
            panel.classList.add('is-hidden');
        }
    }
    
    openConfigModal(config = null) {
        const modal = document.getElementById('jobScraperModal');
        if (modal) {
            if (config) {
                this.populateConfigForm(config);
            } else {
                this.resetConfigForm();
            }
            modal.classList.remove('is-hidden');
            document.body.classList.add('modal-open');
        }
    }
    
    closeConfigModal() {
        const modal = document.getElementById('jobScraperModal');
        if (modal) {
            modal.classList.add('is-hidden');
            document.body.classList.remove('modal-open');
            this.resetConfigForm();
        }
    }
    
    openManualSearch() {
        const modal = document.getElementById('manualSearchModal');
        if (modal) {
            this.resetManualSearchForm();
            modal.classList.remove('is-hidden');
            document.body.classList.add('modal-open');
        }
    }
    
    closeManualSearchModal() {
        const modal = document.getElementById('manualSearchModal');
        if (modal) {
            modal.classList.add('is-hidden');
            document.body.classList.remove('modal-open');
            this.resetManualSearchForm();
        }
    }
    
    populateConfigForm(config) {
        // Basic fields
        document.getElementById('scraperName').value = config.name || '';
        document.getElementById('scraperSearchTerms').value = (config.search_terms || []).join('\n');
        document.getElementById('scraperLocations').value = (config.target_locations || []).join('\n');
        document.getElementById('scraperFrequency').value = config.scrape_frequency_hours || 24;
        document.getElementById('scraperEnabled').checked = config.enabled !== false;
        
        // Advanced fields (only update if elements exist)
        const maxResults = document.getElementById('scraperMaxResults');
        if (maxResults) maxResults.value = config.max_results_per_run || 50;
        
        const minSalary = document.getElementById('scraperMinSalary');
        if (minSalary) minSalary.value = config.min_salary || '';
        
        const currency = document.getElementById('scraperCurrency');
        if (currency) currency.value = config.salary_currency || 'EUR';
        
        const minScore = document.getElementById('scraperMinScore');
        const minScoreValue = document.getElementById('scraperMinScoreValue');
        if (minScore && minScoreValue) {
            minScore.value = config.min_score_threshold || 0.5;
            minScoreValue.textContent = (config.min_score_threshold || 0.5).toFixed(1);
        }
        
        // Checkboxes
        this.setCheckboxes('jobBoards', config.job_boards || ['linkedin']);
        this.setCheckboxes('workTypes', this.getWorkTypes(config));
        this.setCheckboxes('employmentTypes', config.employment_types || ['full-time']);
        this.setCheckboxes('seniorityLevels', config.seniority_levels || ['mid', 'senior']);
        
        // Start with basic tab active
        this.switchTab('basic');
    }
    
    getWorkTypes(config) {
        const types = [];
        if (config.remote_only) types.push('remote');
        if (config.hybrid_allowed) types.push('hybrid');
        if (config.onsite_allowed) types.push('onsite');
        return types;
    }
    
    setCheckboxes(name, values) {
        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
        checkboxes.forEach(cb => {
            cb.checked = values.includes(cb.value);
        });
    }
    
    resetConfigForm() {
        document.getElementById('jobScraperForm').reset();
        document.getElementById('scraperMinScoreValue').textContent = '0.5';
        
        // Switch to basic tab
        this.switchTab('basic');
        
        // Set default values
        document.getElementById('scraperFrequency').value = '24';
        document.getElementById('scraperMaxResults').value = '50';
        document.getElementById('scraperCurrency').value = 'EUR';
        document.getElementById('scraperMinScore').value = '0.5';
        document.getElementById('scraperEnabled').checked = true;
        
        // Set default checkboxes
        this.setCheckboxes('jobBoards', ['linkedin']);
        this.setCheckboxes('workTypes', ['remote', 'hybrid', 'onsite']);
        this.setCheckboxes('employmentTypes', ['full-time']);
        this.setCheckboxes('seniorityLevels', ['mid', 'senior']);
    }
    
    resetManualSearchForm() {
        document.getElementById('manualSearchForm').reset();
        document.getElementById('manualSearchResults').classList.add('is-hidden');
        document.getElementById('manualSearchImport').classList.add('is-hidden');
        this.selectedResults.clear();
        
        // Set default values
        document.getElementById('manualSearchHours').value = '72';
        document.getElementById('manualSearchMax').value = '50';
        this.setCheckboxes('manualJobBoards', ['linkedin']);
    }
    
    async saveConfiguration(event) {
        event.preventDefault();
        
        const formData = this.getConfigFormData();
        const saveBtn = document.getElementById('jobScraperSave');
        const saveText = saveBtn.querySelector('.save-text');
        
        try {
            // Show loading state
            saveBtn.disabled = true;
            saveBtn.classList.add('loading');
            if (saveText) saveText.textContent = 'Saving...';
            
            await this.createConfiguration(formData);
        } catch (error) {
            console.error('Failed to save configuration:', error);
            this.showNotification('Failed to save configuration: ' + error.message, 'error');
        } finally {
            // Reset button state
            saveBtn.disabled = false;
            saveBtn.classList.remove('loading');
            if (saveText) saveText.textContent = formData.enabled ? 'Save & Start Searching' : 'Save Configuration';
        }
    }
    
    getConfigFormData() {
        return {
            name: document.getElementById('scraperName').value,
            search_terms: document.getElementById('scraperSearchTerms').value.split('\n').filter(t => t.trim()),
            target_locations: document.getElementById('scraperLocations').value.split('\n').filter(l => l.trim()),
            job_boards: this.getCheckedValues('jobBoards'),
            scrape_frequency_hours: parseInt(document.getElementById('scraperFrequency').value),
            lookback_hours: parseInt(document.getElementById('scraperFrequency').value), // Use same as frequency for simplicity
            max_results_per_run: parseInt(document.getElementById('scraperMaxResults').value),
            max_results_per_source: Math.floor(parseInt(document.getElementById('scraperMaxResults').value) / 2), // Auto-calculate
            remote_only: this.getCheckedValues('workTypes').includes('remote') && this.getCheckedValues('workTypes').length === 1,
            hybrid_allowed: this.getCheckedValues('workTypes').includes('hybrid'),
            onsite_allowed: this.getCheckedValues('workTypes').includes('onsite'),
            employment_types: this.getCheckedValues('employmentTypes'),
            min_salary: parseFloat(document.getElementById('scraperMinSalary').value) || null,
            max_salary: null, // Not used in simplified form
            salary_currency: document.getElementById('scraperCurrency').value,
            seniority_levels: this.getCheckedValues('seniorityLevels'),
            min_score_threshold: parseFloat(document.getElementById('scraperMinScore').value),
            notifications: 'in_app', // Default to in-app
            enabled: document.getElementById('scraperEnabled').checked
        };
    }
    
    getCheckedValues(name) {
        return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
            .map(cb => cb.value);
    }
    
    async createConfiguration(data) {
        const response = await fetch('/api/job-scraper/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            const message = data.enabled 
                ? `Configuration "${data.name}" saved and started! Will search for jobs every ${data.scrape_frequency_hours} hours.`
                : `Configuration "${data.name}" saved successfully (currently disabled).`;
            this.showNotification(message, 'success');
            this.closeConfigModal();
            this.loadConfigurations();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save configuration');
        }
    }
    
    async runDryRun(data) {
        // For dry run, we'll use manual search with the configuration data
        const searchParams = {
            search_term: data.search_terms[0] || '',
            location: data.target_locations[0] || '',
            job_boards: data.job_boards,
            hours_old: data.lookback_hours,
            max_results: Math.min(data.max_results_per_source, 20), // Limit for preview
            employment_types: data.employment_types,
            seniority_levels: data.seniority_levels,
            min_salary: data.min_salary,
            salary_currency: data.salary_currency,
            remote_only: data.remote_only,
            hybrid_allowed: data.hybrid_allowed
        };
        
        this.closeConfigModal();
        this.openManualSearch();
        
        // Pre-fill the manual search form
        document.getElementById('manualSearchTerm').value = searchParams.search_term;
        document.getElementById('manualSearchLocation').value = searchParams.location;
        document.getElementById('manualSearchHours').value = searchParams.hours_old;
        document.getElementById('manualSearchMax').value = searchParams.max_results;
        this.setCheckboxes('manualJobBoards', searchParams.job_boards);
        
        // Auto-execute the search
        setTimeout(() => {
            this.executeManualSearchWithParams(searchParams);
        }, 500);
    }
    
    async executeManualSearch(event) {
        event.preventDefault();
        
        const searchParams = {
            search_term: document.getElementById('manualSearchTerm').value,
            location: document.getElementById('manualSearchLocation').value,
            job_boards: this.getCheckedValues('manualJobBoards'),
            hours_old: parseInt(document.getElementById('manualSearchHours').value),
            max_results: parseInt(document.getElementById('manualSearchMax').value)
        };
        
        await this.executeManualSearchWithParams(searchParams);
    }
    
    async executeManualSearchWithParams(searchParams) {
        try {
            this.showSearchLoading(true);
            
            const response = await fetch('/api/job-scraper/manual-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchParams)
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Search response received:', data);
                console.log('Jobs array:', data.jobs);
                console.log('Jobs count:', data.jobs ? data.jobs.length : 'undefined');
                this.displaySearchResults(data.jobs);
            } else {
                let errorMessage = 'Search failed';
                try {
                    const error = await response.json();
                    errorMessage = error.error || error.message || 'Search failed';
                } catch (jsonError) {
                    // If response is not JSON, try to get text
                    try {
                        const errorText = await response.text();
                        errorMessage = `Server error (${response.status}): ${errorText.substring(0, 100)}`;
                    } catch (textError) {
                        errorMessage = `Server error (${response.status})`;
                    }
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Manual search failed:', error);
            this.showNotification('Search failed: ' + error.message, 'error');
        } finally {
            this.showSearchLoading(false);
        }
    }
    
    showSearchLoading(loading) {
        const button = document.getElementById('manualSearchSubmit');
        const resultsContainer = document.getElementById('resultsList');
        
        if (button) {
            button.disabled = loading;
            button.innerHTML = loading ? 
                '<i class="fas fa-spinner fa-spin"></i> Searching...' : 
                '<i class="fas fa-search"></i> Search Jobs';
        }
        
        if (loading && resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="search-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Searching for jobs...</p>
                </div>
            `;
        }
    }
    
    displaySearchResults(jobs) {
        console.log('displaySearchResults called with:', jobs);
        console.log('Jobs length:', jobs ? jobs.length : 'undefined');
        
        this.currentSearchResults = jobs || [];
        const resultsContainer = document.getElementById('resultsList');
        const resultsHeader = document.querySelector('.results-header');
        const resultsFooter = document.querySelector('.results-footer');
        const resultsCount = document.getElementById('resultsCount');
        
        console.log('Results container found:', !!resultsContainer);
        console.log('Results header found:', !!resultsHeader);
        console.log('Results footer found:', !!resultsFooter);
        
        // Update results count
        if (resultsCount) {
            resultsCount.textContent = jobs.length;
        }
        
        if (!jobs || jobs.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results-message">
                    <i class="fas fa-search"></i>
                    <p>No jobs found for your search criteria. Try adjusting your filters.</p>
                </div>
            `;
            resultsHeader.classList.add('is-hidden');
            resultsFooter.classList.add('is-hidden');
            return;
        }
        
        // Show header and footer
        resultsHeader.classList.remove('is-hidden');
        resultsFooter.classList.remove('is-hidden');
        
        // Generate job cards with pill styling
        const jobsHtml = jobs.map((job, index) => {
            const salary = this.formatSalary(job.salary_min, job.salary_max, job.salary_currency);
            const workType = this.getWorkType(job);
            const matchScore = job.match_score ? (job.match_score * 100).toFixed(0) : '85';
            
            return `
                <div class="job-result" data-index="${index}">
                    <input type="checkbox" class="job-result-checkbox" 
                           id="job-${index}" onchange="jobScraperManager.toggleJobSelection(${index})">
                    
                    <h3 class="job-title">${this.escapeHtml(job.title || job.position || 'Untitled Position')}</h3>
                    
                    <div class="job-meta">
                        <span class="job-pill company">
                            <i class="fas fa-building"></i>
                            ${this.escapeHtml(job.company || 'Unknown Company')}
                        </span>
                        
                        <span class="job-pill location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${this.escapeHtml(job.location || 'Location not specified')}
                        </span>
                        
                        ${salary ? `
                            <span class="job-pill salary">
                                <i class="fas fa-dollar-sign"></i>
                                ${salary}
                            </span>
                        ` : ''}
                        
                        ${workType ? `
                            <span class="job-pill type">
                                <i class="fas fa-briefcase"></i>
                                ${workType}
                            </span>
                        ` : ''}
                        
                        ${job.is_remote !== undefined ? `
                            <span class="job-pill remote">
                                <i class="fas fa-home"></i>
                                ${job.is_remote ? 'Remote' : 'On-site'}
                            </span>
                        ` : ''}
                        
                        <span class="job-pill match-score" title="Match score based on your criteria">
                            <i class="fas fa-star"></i>
                            ${matchScore}% match
                        </span>
                    </div>
                    
                    ${job.description ? `
                        <div class="job-description">
                            ${this.truncateText(job.description, 150)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        resultsContainer.innerHTML = jobsHtml;
        
        // Add click handlers for job selection
        resultsContainer.querySelectorAll('.job-result').forEach((card, index) => {
            card.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = card.querySelector('.job-result-checkbox');
                    checkbox.checked = !checkbox.checked;
                    this.toggleJobSelection(index);
                }
            });
        });
        
        this.updateSelectionCount();
    }
    
    createJobResultHTML(job, index) {
        const alreadyExists = job.already_exists ? ' (Already exists)' : '';
        const scoreClass = job.match_score >= 0.8 ? 'score-high' : 
                          job.match_score >= 0.6 ? 'score-medium' : 'score-low';
        
        return `
            <div class="job-result ${job.already_exists ? 'job-exists' : ''}">
                <div class="result-header">
                    <label class="result-checkbox-label">
                        <input type="checkbox" class="result-checkbox" 
                               data-index="${index}" ${job.already_exists ? 'disabled' : ''}>
                        <span class="checkmark"></span>
                    </label>
                    <div class="result-title">
                        <h4>${job.title}${alreadyExists}</h4>
                        <div class="result-meta">
                            <span class="result-company">${job.company}</span>
                            <span class="result-location">${job.location}</span>
                            <span class="result-score ${scoreClass}">${Math.round(job.match_score * 100)}% match</span>
                        </div>
                    </div>
                </div>
                <div class="result-details">
                    <div class="result-salary">
                        ${this.formatSalary(job.salary_min, job.salary_max, job.salary_currency)}
                    </div>
                    <div class="result-type">${job.job_type || 'N/A'}</div>
                    <div class="result-remote">${job.is_remote ? 'Remote' : 'On-site'}</div>
                    <div class="result-posted">${job.date_posted || 'N/A'}</div>
                </div>
                <div class="result-description">
                    ${job.description || 'No description available'}
                </div>
                <div class="result-actions">
                    <a href="${job.source_url}" target="_blank" class="btn-secondary">
                        <i class="fas fa-external-link-alt"></i> View Original
                    </a>
                </div>
            </div>
        `;
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
    
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return this.escapeHtml(text);
        return this.escapeHtml(text.substring(0, maxLength)) + '...';
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    toggleJobSelection(index) {
        const checkbox = document.getElementById(`job-${index}`);
        const jobCard = checkbox?.closest('.job-result');
        
        if (checkbox?.checked) {
            this.selectedResults.add(index);
            jobCard?.classList.add('selected');
        } else {
            this.selectedResults.delete(index);
            jobCard?.classList.remove('selected');
        }
        
        this.updateSelectionCount();
    }
    
    updateSelectionCount() {
        const selectedCount = document.getElementById('selectedCount');
        const importBtn = document.getElementById('manualSearchImport');
        
        if (selectedCount) {
            selectedCount.textContent = this.selectedResults.size;
        }
        
        if (importBtn) {
            importBtn.disabled = this.selectedResults.size === 0;
            if (this.selectedResults.size === 0) {
                importBtn.classList.add('disabled');
            } else {
                importBtn.classList.remove('disabled');
            }
        }
    }
    
    selectAllResults() {
        if (!this.currentSearchResults) return;
        
        this.selectedResults.clear();
        this.currentSearchResults.forEach((job, index) => {
            this.selectedResults.add(index);
            const checkbox = document.getElementById(`job-${index}`);
            const jobCard = checkbox?.closest('.job-result');
            if (checkbox) checkbox.checked = true;
            if (jobCard) jobCard.classList.add('selected');
        });
        
        this.updateSelectionCount();
    }
    
    clearAllResults() {
        this.selectedResults.clear();
        
        document.querySelectorAll('.job-result-checkbox').forEach(checkbox => {
            checkbox.checked = false;
            const jobCard = checkbox.closest('.job-result');
            if (jobCard) jobCard.classList.remove('selected');
        });
        
        this.updateSelectionCount();
    }
    
    handleResultSelection(event) {
        const index = parseInt(event.target.dataset.index);
        const resultsContainer = document.getElementById('resultsContainer');
        const jobs = this.getJobsFromResults(resultsContainer);
        
        if (event.target.checked) {
            this.selectedResults.add(index);
        } else {
            this.selectedResults.delete(index);
        }
        
        this.updateImportButton();
    }
    
    selectAllResults() {
        const checkboxes = document.querySelectorAll('.result-checkbox:not(:disabled)');
        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = true;
            this.selectedResults.add(parseInt(checkbox.dataset.index));
        });
        this.updateImportButton();
    }
    
    clearAllResults() {
        const checkboxes = document.querySelectorAll('.result-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedResults.clear();
        this.updateImportButton();
    }
    
    updateImportButton() {
        const importButton = document.getElementById('manualSearchImport');
        const selectedCount = document.getElementById('selectedCount');
        
        if (importButton && selectedCount) {
            selectedCount.textContent = this.selectedResults.size;
            
            if (this.selectedResults.size > 0) {
                importButton.classList.remove('is-hidden');
            } else {
                importButton.classList.add('is-hidden');
            }
        }
    }
    
    async importSelectedJobs() {
        const resultsContainer = document.getElementById('resultsContainer');
        const jobs = this.getJobsFromResults(resultsContainer);
        const selectedJobs = Array.from(this.selectedResults).map(index => jobs[index]).filter(job => job != null);
        
        if (selectedJobs.length === 0) {
            this.showNotification('No jobs selected for import', 'warning');
            return;
        }
        
        try {
            // Show loading state
            const importBtn = document.getElementById('manualSearchImport');
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
            }
            
            const response = await fetch('/api/job-scraper/import-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobs: selectedJobs })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                let message = `Successfully imported ${data.imported} jobs`;
                if (data.skipped > 0) {
                    message += `, skipped ${data.skipped} duplicates`;
                }
                
                this.showNotification(message, 'success');
                
                if (data.errors && data.errors.length > 0) {
                    console.error('Import errors:', data.errors);
                    // Show first few errors to user
                    const errorSummary = data.errors.slice(0, 3).join('; ');
                    this.showNotification(`Some errors occurred: ${errorSummary}`, 'warning');
                }
                
                this.closeManualSearchModal();
                
                // Refresh jobs list if we're on the jobs tab
                if (window.jobsManager && typeof window.jobsManager.refreshJobs === 'function') {
                    window.jobsManager.refreshJobs();
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Import failed');
            }
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        } finally {
            // Reset button state
            const importBtn = document.getElementById('manualSearchImport');
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = '<i class="fas fa-download"></i> Import Selected';
            }
        }
    }
    
    getJobsFromResults(container) {
        // Return the stored search results
        return this.currentSearchResults || [];
    }
    
    async loadConfigurations() {
        try {
            const response = await fetch('/api/job-scraper/configs');
            const data = await response.json();
            
            this.configs = data.configs || [];
            this.renderConfigurations();
        } catch (error) {
            console.error('Failed to load configurations:', error);
        }
    }
    
    renderConfigurations() {
        const container = document.getElementById('scraperConfigs');
        if (!container) return;
        
        if (this.configs.length === 0) {
            container.innerHTML = '<div class="empty-state">No configurations yet.</div>';
            return;
        }
        
        container.innerHTML = this.configs.map(config => `
            <div class="config-item">
                <div class="config-header">
                    <h4>${config.name}</h4>
                    <div class="config-status ${config.enabled ? 'enabled' : 'disabled'}">
                        ${config.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                </div>
                <div class="config-details">
                    <div class="config-meta">
                        <span>Every ${config.scrape_frequency_hours}h</span>
                        <span>${config.search_terms.length} terms</span>
                        <span>${config.target_locations.length} locations</span>
                    </div>
                    <div class="config-actions">
                        <button class="btn-small" onclick="jobScraperManager.editConfig('${config.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn-small" onclick="jobScraperManager.runConfig('${config.id}')">
                            <i class="fas fa-play"></i> Run Now
                        </button>
                        <button class="btn-small btn-danger" onclick="jobScraperManager.deleteConfig('${config.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async loadRecentRuns() {
        try {
            const response = await fetch('/api/job-scraper/runs?limit=10');
            const data = await response.json();
            
            this.runs = data.runs || [];
            this.renderRecentRuns();
        } catch (error) {
            console.error('Failed to load recent runs:', error);
        }
    }
    
    renderRecentRuns() {
        const container = document.getElementById('scraperRuns');
        if (!container) return;
        
        if (this.runs.length === 0) {
            container.innerHTML = '<div class="empty-state">No runs yet.</div>';
            return;
        }
        
        container.innerHTML = this.runs.map(run => `
            <div class="run-item">
                <div class="run-header">
                    <span class="run-config">${run.config_name}</span>
                    <span class="run-status ${run.status}">${run.status}</span>
                </div>
                <div class="run-stats">
                    <span>${run.jobs_fetched} fetched</span>
                    <span>${run.jobs_inserted} inserted</span>
                    <span>${run.jobs_deduped} duplicates</span>
                    ${run.jobs_failed > 0 ? `<span class="errors">${run.jobs_failed} errors</span>` : ''}
                </div>
                <div class="run-time">${this.formatDateTime(run.started_at)}</div>
                ${run.error_message ? `<div class="run-error">${run.error_message}</div>` : ''}
            </div>
        `).join('');
    }
    
    formatDateTime(dateStr) {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    }
    
    async editConfig(configId) {
        const config = this.configs.find(c => c.id === configId);
        if (config) {
            this.openConfigModal(config);
        }
    }
    
    async runConfig(configId) {
        try {
            const response = await fetch(`/api/job-scraper/configs/${configId}/run`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('Scraper started in background', 'success');
                setTimeout(() => this.loadRecentRuns(), 2000);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start scraper');
            }
        } catch (error) {
            console.error('Failed to run config:', error);
            this.showNotification('Failed to start scraper: ' + error.message, 'error');
        }
    }
    
    async deleteConfig(configId) {
        if (!confirm('Are you sure you want to delete this configuration?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/job-scraper/configs/${configId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showNotification('Configuration deleted', 'success');
                this.loadConfigurations();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete configuration');
            }
        } catch (error) {
            console.error('Failed to delete config:', error);
            this.showNotification('Failed to delete configuration: ' + error.message, 'error');
        }
    }
    
    async refreshScraperData() {
        await Promise.all([
            this.loadStatus(),
            this.loadConfigurations(),
            this.loadRecentRuns()
        ]);
    }
    
    showNotification(message, type = 'info') {
        // Use the existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            // Fallback to console
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.jobScraperManager = new JobScraperManager();
});

// Export for use in other scripts
window.JobScraperManager = JobScraperManager;
