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
        document.getElementById('jobScraperBtn')?.addEventListener('click', () => this.toggleScraperPanel());
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
        
        // Manual search modal events
        document.getElementById('manualSearchModalClose')?.addEventListener('click', () => this.closeManualSearchModal());
        document.getElementById('manualSearchCancel')?.addEventListener('click', () => this.closeManualSearchModal());
        document.getElementById('manualSearchForm')?.addEventListener('submit', (e) => this.executeManualSearch(e));
        document.getElementById('manualSearchImport')?.addEventListener('click', () => this.importSelectedJobs());
        document.getElementById('manualSearchImportFooter')?.addEventListener('click', () => this.importSelectedJobs());
        
        // Close manual search modal when clicking overlay
        document.getElementById('manualSearchModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeManualSearchModal();
            }
        });
        
        // Configuration modal - inline pill creation for search terms
        document.getElementById('scraperSearchTerm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const input = e.target;
                const value = input.value.trim();
                if (value && !this.hasInlineSearchTermPill()) {
                    this.addInlineSearchTermPill(value, 'scraperSearchTermPills', 'scraperSearchTerm');
                    input.value = '';
                    input.disabled = true;
                    input.placeholder = 'Remove pill to add new position';
                    this.updateConfigPreview();
                }
            }
        });
        
        // Location pill creation still enabled
        document.getElementById('scraperLocation')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                // Check if location suggestions are active - if so, let them handle the Enter key
                if (window.locationSuggestions && window.locationSuggestions.activeSuggestionBox) {
                    return; // Let location suggestions handle this
                }
                
                e.preventDefault();
                const value = e.target.value.trim();
                if (value) {
                    const locations = value.split(',').map(loc => loc.trim()).filter(loc => loc);
                    locations.forEach(location => this.addScraperLocationPill(location));
                    e.target.value = '';
                    this.updateConfigPreview();
                }
            }
        });
        
        // Manual search - inline pill creation for search terms
        document.getElementById('manualSearchTerm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const input = e.target;
                const value = input.value.trim();
                if (value && !this.hasInlineManualSearchTermPill()) {
                    this.addInlineSearchTermPill(value, 'manualSearchTermPills', 'manualSearchTerm');
                    input.value = '';
                    input.disabled = true;
                    input.placeholder = 'Remove pill to add new position';
                }
            }
        });
        
        // Location pill creation still enabled
        document.getElementById('manualSearchLocation')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                // Check if location suggestions are active - if so, let them handle the Enter key
                if (window.locationSuggestions && window.locationSuggestions.activeSuggestionBox) {
                    return; // Let location suggestions handle this
                }
                
                e.preventDefault();
                const value = e.target.value.trim();
                if (value) {
                    const locations = value.split(',').map(loc => loc.trim()).filter(loc => loc);
                    locations.forEach(location => this.addLocationPill(location));
                    e.target.value = '';
                }
            }
        });
        
        // Configuration preview updates
        document.getElementById('scraperSearchTerm')?.addEventListener('input', () => {
            this.updateConfigPreview();
            this.updateConfigFormButtons();
        });
        document.getElementById('scraperFrequencySlider')?.addEventListener('input', () => this.updateConfigPreview());
        document.getElementById('scraperMaxResults')?.addEventListener('input', () => this.updateConfigPreview());
        document.getElementById('scraperEnabled')?.addEventListener('change', () => this.updateConfigPreview());
        document.getElementById('scraperMinScore')?.addEventListener('input', () => this.updateConfigPreview());
        
        // Update preview when checkboxes change
        document.querySelectorAll('input[name="jobBoards"], input[name="workTypes"], input[name="employmentTypes"], input[name="seniorityLevels"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateConfigPreview());
        });
        
        // Manual search validation updates
        document.getElementById('manualSearchTerm')?.addEventListener('input', () => {
            this.updateManualSearchButtons();
        });
        
        // Results selection
        document.getElementById('selectAllToggle')?.addEventListener('change', (e) => this.toggleSelectAll(e));
        
        // Initialize custom sliders
        this.initializeSliders();
    }
    
    initializeSliders() {
        // Manual search hours slider with smart stepping
        const hoursSlider = document.getElementById('manualSearchHours');
        const hoursDisplay = document.getElementById('hoursDisplay');
        
        if (hoursSlider && hoursDisplay) {
            hoursSlider.addEventListener('input', (e) => {
                const rawValue = parseInt(e.target.value);
                const snappedValue = this.snapToLogicalHoursValue(rawValue);
                
                if (snappedValue !== rawValue) {
                    e.target.value = snappedValue;
                }
                
                hoursDisplay.textContent = this.formatHoursDisplay(snappedValue);
            });
            
            const initialValue = this.snapToLogicalHoursValue(parseInt(hoursSlider.value));
            hoursSlider.value = initialValue;
            hoursDisplay.textContent = this.formatHoursDisplay(initialValue);
        }
        
        // Configuration frequency slider with smart stepping
        const frequencySlider = document.getElementById('scraperFrequencySlider');
        const frequencyDisplay = document.getElementById('frequencyDisplay');
        
        if (frequencySlider && frequencyDisplay) {
            frequencySlider.addEventListener('input', (e) => {
                const rawValue = parseInt(e.target.value);
                const snappedValue = this.snapToLogicalHoursValue(rawValue);
                
                if (snappedValue !== rawValue) {
                    e.target.value = snappedValue;
                }
                
                frequencyDisplay.textContent = this.formatHoursDisplay(snappedValue);
                this.updateConfigPreview();
            });
            
            const initialValue = this.snapToLogicalHoursValue(parseInt(frequencySlider.value));
            frequencySlider.value = initialValue;
            frequencyDisplay.textContent = this.formatHoursDisplay(initialValue);
        }
        
        // Manual search max results slider
        const maxSlider = document.getElementById('manualSearchMax');
        const maxDisplay = document.getElementById('maxDisplay');
        
        if (maxSlider && maxDisplay) {
            maxSlider.addEventListener('input', (e) => {
                const max = parseInt(e.target.value);
                maxDisplay.textContent = `${max} jobs`;
            });
            
            maxDisplay.textContent = `${maxSlider.value} jobs`;
        }
        
        // Configuration max results slider
        const scraperMaxSlider = document.getElementById('scraperMaxResults');
        const scraperMaxDisplay = document.getElementById('scraperMaxDisplay');
        
        if (scraperMaxSlider && scraperMaxDisplay) {
            scraperMaxSlider.addEventListener('input', (e) => {
                const max = parseInt(e.target.value);
                scraperMaxDisplay.textContent = `${max} jobs`;
                this.updateConfigPreview();
            });
            
            scraperMaxDisplay.textContent = `${scraperMaxSlider.value} jobs`;
        }
        
        // Configuration quality filter slider
        const qualitySlider = document.getElementById('scraperMinScore');
        const qualityDisplay = document.getElementById('scraperMinScoreValue');
        
        if (qualitySlider && qualityDisplay) {
            qualitySlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value).toFixed(1);
                qualityDisplay.textContent = value;
                this.updateConfigPreview();
            });
            
            qualityDisplay.textContent = parseFloat(qualitySlider.value).toFixed(1);
        }
    }
    
    snapToLogicalHoursValue(hours) {
        // Define logical hour values for different ranges
        const logicalValues = [
            // Hours: 1-24 (every hour)
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            // Days: 2-5 days (every 12 hours after 24h)
            36, 48, 60, 72, 84, 96, 108, 120
        ];
        
        // Find the closest logical value
        let closest = logicalValues[0];
        let minDiff = Math.abs(hours - closest);
        
        for (const value of logicalValues) {
            const diff = Math.abs(hours - value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = value;
            }
        }
        
        return closest;
    }
    
    formatHoursDisplay(hours) {
        if (hours === 1) return '1 hour';
        if (hours < 24) return `${hours} hours`;
        if (hours === 24) return '1 day';
        if (hours === 36) return '1.5 days';
        if (hours === 48) return '2 days';
        if (hours === 60) return '2.5 days';
        if (hours === 72) return '3 days';
        if (hours === 84) return '3.5 days';
        if (hours === 96) return '4 days';
        if (hours === 108) return '4.5 days';
        if (hours === 120) return '5 days';
        
        // Fallback for any other values
        if (hours <= 120) {
            const days = Math.round(hours / 24 * 10) / 10; // Round to 1 decimal
            return `${days} days`;
        }
        // Fallback for values above 120 (shouldn't happen with new max)
        const days = Math.round(hours / 24 * 10) / 10;
        return `${days} days`;
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
    
    toggleScraperPanel() {
        const sidebar = document.getElementById('jobScraperPanel');
        
        if (sidebar) {
            const isHidden = sidebar.classList.contains('is-hidden');
            
            if (isHidden) {
                this.openScraperPanel();
            } else {
                this.closeScraperPanel();
            }
        }
    }
    
    openScraperPanel() {
        const sidebar = document.getElementById('jobScraperPanel');
        const mainContent = document.querySelector('.jobs-main-content');
        
        if (sidebar) {
            sidebar.classList.remove('is-hidden');
            this.loadConfigurations();
            this.loadRecentRuns();
        }
        
        if (mainContent) {
            mainContent.classList.add('with-sidebar');
        }
    }
    
    closeScraperPanel() {
        const sidebar = document.getElementById('jobScraperPanel');
        const mainContent = document.querySelector('.jobs-main-content');
        
        if (sidebar) {
            sidebar.classList.add('is-hidden');
        }
        
        if (mainContent) {
            mainContent.classList.remove('with-sidebar');
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
            
            // Initialize preview and button states after modal is shown
            setTimeout(() => {
                this.updateConfigPreview();
                this.updateConfigFormButtons();
            }, 100);
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
            
            // Initialize button states after modal is shown
            setTimeout(() => {
                this.updateManualSearchButtons();
            }, 100);
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
        // Set single search term as inline pill (first one from array, or empty)
        this.clearInlineSearchTermPill('scraperSearchTermPills', 'scraperSearchTerm');
        if (config.search_terms && config.search_terms.length > 0) {
            this.addInlineSearchTermPill(config.search_terms[0], 'scraperSearchTermPills', 'scraperSearchTerm');
            const input = document.getElementById('scraperSearchTerm');
            if (input) {
                input.disabled = true;
                input.placeholder = 'Remove pill to add new position';
            }
        }
        
        this.clearScraperLocationPills();
        if (config.target_locations && config.target_locations.length > 0) {
            config.target_locations.forEach(location => this.addScraperLocationPill(location));
        }
        
        // Frequency slider
        const frequency = config.scrape_frequency_hours || 24;
        const snappedFreq = this.snapToLogicalHoursValue(frequency);
        document.getElementById('scraperFrequencySlider').value = snappedFreq;
        document.getElementById('frequencyDisplay').textContent = this.formatHoursDisplay(snappedFreq);
        
        // Other controls
        document.getElementById('scraperEnabled').checked = config.enabled !== false;
        
        // Advanced fields
        const maxResults = document.getElementById('scraperMaxResults');
        if (maxResults) maxResults.value = config.max_results_per_run || 50;
        
        const maxDisplay = document.getElementById('scraperMaxDisplay');
        if (maxDisplay) maxDisplay.textContent = `${config.max_results_per_run || 50} jobs`;
        
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
        
        // Update preview and button states
        setTimeout(() => {
            this.updateConfigPreview();
            this.updateConfigFormButtons();
        }, 100);
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
        
        // Clear inline search term pills and re-enable input
        this.clearInlineSearchTermPill('scraperSearchTermPills', 'scraperSearchTerm');
        
        // Clear location pills only
        this.clearScraperLocationPills();
        
        // Set default values
        const defaultFrequency = this.snapToLogicalHoursValue(24);
        document.getElementById('scraperFrequencySlider').value = defaultFrequency;
        document.getElementById('frequencyDisplay').textContent = this.formatHoursDisplay(defaultFrequency);
        
        document.getElementById('scraperMaxResults').value = '50';
        document.getElementById('scraperMaxDisplay').textContent = '50 jobs';
        
        document.getElementById('scraperMinScore').value = '0.5';
        document.getElementById('scraperMinScoreValue').textContent = '0.5';
        document.getElementById('scraperEnabled').checked = true;
        
        // Set default checkboxes
        this.setCheckboxes('jobBoards', ['linkedin']);
        this.setCheckboxes('workTypes', ['remote', 'hybrid', 'onsite']);
        this.setCheckboxes('employmentTypes', ['full-time']);
        this.setCheckboxes('seniorityLevels', ['mid', 'senior']);
        
        // Update preview and button states
        this.updateConfigPreview();
        this.updateConfigFormButtons();
    }
    
    resetManualSearchForm() {
        document.getElementById('manualSearchForm').reset();
        
        // Clear inline search term pills and re-enable input
        this.clearInlineSearchTermPill('manualSearchTermPills', 'manualSearchTerm');
        
        // Clear location pills only
        this.clearLocationPills();
        
        // Show the search results column but hide the header and footer
        const resultsSection = document.getElementById('manualSearchResults');
        const resultsHeader = document.querySelector('#manualSearchResults .results-header');
        const resultsFooter = document.querySelector('#manualSearchResults .results-footer');
        const resultsList = document.getElementById('resultsList');
        const searchBtn = document.getElementById('manualSearchSubmit');
        const importBtnFooter = document.getElementById('manualSearchImportFooter');
        
        if (resultsSection) {
            resultsSection.classList.remove('is-hidden');
        }
        if (resultsHeader) {
            resultsHeader.classList.add('is-hidden');
        }
        if (resultsFooter) {
            resultsFooter.classList.add('is-hidden');
        }
        
        // Reset footer buttons state
        if (searchBtn) {
            searchBtn.classList.remove('is-hidden');
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Search Jobs';
        }
        if (importBtnFooter) {
            importBtnFooter.classList.add('is-hidden');
        }
        
        // Show the initial message
        if (resultsList) {
            resultsList.innerHTML = `
                <div class="no-results-message">
                    <i class="fas fa-search"></i>
                    <p>Enter your search criteria and click "Search Jobs" to find opportunities</p>
                </div>
            `;
        }
        
        document.getElementById('manualSearchImport').classList.add('is-hidden');
        
        // Reset select all toggle
        const selectAllToggle = document.getElementById('selectAllToggle');
        const selectAllLabel = document.querySelector('.select-all-label');
        if (selectAllToggle) {
            selectAllToggle.checked = false;
        }
        if (selectAllLabel) {
            selectAllLabel.textContent = 'Select All';
        }
        
        this.selectedResults.clear();
        
        // Set default values
        const defaultHours = this.snapToLogicalHoursValue(72);
        document.getElementById('manualSearchHours').value = defaultHours;
        document.getElementById('manualSearchMax').value = '50';
        
        // Update slider displays
        const hoursDisplay = document.getElementById('hoursDisplay');
        const maxDisplay = document.getElementById('maxDisplay');
        if (hoursDisplay) hoursDisplay.textContent = this.formatHoursDisplay(defaultHours);
        if (maxDisplay) maxDisplay.textContent = '50 jobs';
        
        this.setCheckboxes('manualJobBoards', ['linkedin']);
        
        // Update button states
        this.updateManualSearchButtons();
    }
    
    // Inline pill methods for search terms
    addInlineSearchTermPill(term, containerId, inputId) {
        if (!term || term.length === 0) return;
        
        const pillsContainer = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!pillsContainer || !input) return;
        
        // Clear existing pills first (only one allowed)
        pillsContainer.innerHTML = '';
        
        const pill = document.createElement('span');
        pill.className = 'inline-pill';
        pill.dataset.term = term;
        pill.innerHTML = `
            ${this.escapeHtml(term)}
            <button type="button" class="inline-pill-remove" onclick="jobScraperManager.removeInlineSearchTermPill('${containerId}', '${inputId}')">×</button>
        `;
        
        pillsContainer.appendChild(pill);
        
        // Update button states based on which form this is for
        if (containerId === 'scraperSearchTermPills') {
            this.updateConfigFormButtons();
        } else if (containerId === 'manualSearchTermPills') {
            this.updateManualSearchButtons();
        }
    }
    
    removeInlineSearchTermPill(containerId, inputId) {
        const pillsContainer = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!pillsContainer || !input) return;
        
        pillsContainer.innerHTML = '';
        input.disabled = false;
        input.placeholder = 'e.g., Software Engineer';
        input.focus();
        
        // Update preview if it's the scraper form
        if (containerId === 'scraperSearchTermPills') {
            this.updateConfigPreview();
            this.updateConfigFormButtons();
        } else if (containerId === 'manualSearchTermPills') {
            this.updateManualSearchButtons();
        }
    }
    
    hasInlineSearchTermPill() {
        const pillsContainer = document.getElementById('scraperSearchTermPills');
        return pillsContainer && pillsContainer.children.length > 0;
    }
    
    hasInlineManualSearchTermPill() {
        const pillsContainer = document.getElementById('manualSearchTermPills');
        return pillsContainer && pillsContainer.children.length > 0;
    }
    
    getInlineSearchTerm(containerId) {
        const pillsContainer = document.getElementById(containerId);
        if (!pillsContainer) return null;
        
        const pill = pillsContainer.querySelector('.inline-pill');
        return pill ? pill.dataset.term : null;
    }
    
    clearInlineSearchTermPill(containerId, inputId) {
        const pillsContainer = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!pillsContainer || !input) return;
        
        pillsContainer.innerHTML = '';
        input.disabled = false;
        input.placeholder = 'e.g., Software Engineer';
    }
    
    // Search term pill methods removed - now using inline pills
    
    addScraperLocationPill(location) {
        if (!location || location.length === 0) return;
        
        // Validate location with LocationSuggestions if available
        if (window.locationSuggestions && !window.locationSuggestions.isValidJobSpyLocation(location)) {
            const message = window.locationSuggestions.getLocationValidationMessage(location);
            if (typeof showNotification === 'function') {
                showNotification(message, 'warning');
            } else {
                alert(message);
            }
            return;
        }
        
        const pillsContainer = document.getElementById('scraperLocationsPills');
        if (!pillsContainer) return;
        
        // Check if pill already exists
        const existingPills = pillsContainer.querySelectorAll('.location-pill');
        for (let pill of existingPills) {
            if (pill.dataset.location === location) {
                return; // Don't add duplicates
            }
        }
        
        const pill = document.createElement('span');
        pill.className = 'location-pill';
        pill.dataset.location = location;
        pill.innerHTML = `
            ${this.escapeHtml(location)}
            <button type="button" class="pill-remove" onclick="jobScraperManager.removeScraperLocationPill('${this.escapeHtml(location)}')">×</button>
        `;
        
        pillsContainer.appendChild(pill);
        this.updatePillsOverflowState(pillsContainer);
        this.updateConfigFormButtons();
    }
    
    removeScraperLocationPill(location) {
        const pillsContainer = document.getElementById('scraperLocationsPills');
        if (!pillsContainer) return;
        
        const pill = pillsContainer.querySelector(`[data-location="${location}"]`);
        if (pill) {
            pill.remove();
            this.updatePillsOverflowState(pillsContainer);
            this.updateConfigPreview();
            this.updateConfigFormButtons();
        }
    }
    
    clearScraperLocationPills() {
        const pillsContainer = document.getElementById('scraperLocationsPills');
        if (pillsContainer) {
            pillsContainer.innerHTML = '';
            this.updatePillsOverflowState(pillsContainer);
            this.updateConfigPreview();
            this.updateConfigFormButtons();
        }
    }
    
    // Search term pill methods removed - now using single input field
    
    addLocationPill(location) {
        if (!location || location.length === 0) return;
        
        // Validate location with LocationSuggestions if available
        if (window.locationSuggestions && !window.locationSuggestions.isValidJobSpyLocation(location)) {
            const message = window.locationSuggestions.getLocationValidationMessage(location);
            if (typeof showNotification === 'function') {
                showNotification(message, 'warning');
            } else {
                alert(message);
            }
            return;
        }
        
        const pillsContainer = document.getElementById('locationsPills');
        if (!pillsContainer) return;
        
        // Check if pill already exists
        const existingPills = pillsContainer.querySelectorAll('.location-pill');
        for (let pill of existingPills) {
            if (pill.dataset.location === location) {
                return; // Don't add duplicates
            }
        }
        
        const pill = document.createElement('span');
        pill.className = 'location-pill';
        pill.dataset.location = location;
        pill.innerHTML = `
            ${this.escapeHtml(location)}
            <button type="button" class="pill-remove" onclick="jobScraperManager.removeLocationPill('${this.escapeHtml(location)}')">×</button>
        `;
        
        pillsContainer.appendChild(pill);
        this.updatePillsOverflowState(pillsContainer);
        this.updateManualSearchButtons();
    }
    
    removeLocationPill(location) {
        const pillsContainer = document.getElementById('locationsPills');
        if (!pillsContainer) return;
        
        const pill = pillsContainer.querySelector(`[data-location="${location}"]`);
        if (pill) {
            pill.remove();
            this.updatePillsOverflowState(pillsContainer);
            this.updateManualSearchButtons();
        }
    }
    
    clearLocationPills() {
        const pillsContainer = document.getElementById('locationsPills');
        if (pillsContainer) {
            pillsContainer.innerHTML = '';
            this.updatePillsOverflowState(pillsContainer);
            this.updateManualSearchButtons();
        }
    }
    
    getSearchTerms() {
        // Get search term from inline pill or input field
        const inlineTerm = this.getInlineSearchTerm('manualSearchTermPills');
        if (inlineTerm) {
            return [inlineTerm];
        }
        
        // Fallback to input field if no pill exists
        const searchTermInput = document.getElementById('manualSearchTerm');
        if (!searchTermInput) return [];
        
        const term = searchTermInput.value.trim();
        return term ? [term] : [];
    }
    
    getLocations() {
        const pillsContainer = document.getElementById('locationsPills');
        if (!pillsContainer) return [];
        
        return Array.from(pillsContainer.querySelectorAll('.location-pill'))
            .map(pill => pill.dataset.location);
    }
    
    getScraperSearchTerms() {
        // Get search term from inline pill or input field
        const inlineTerm = this.getInlineSearchTerm('scraperSearchTermPills');
        if (inlineTerm) {
            return [inlineTerm];
        }
        
        // Fallback to input field if no pill exists
        const searchTermInput = document.getElementById('scraperSearchTerm');
        if (!searchTermInput) return [];
        
        const term = searchTermInput.value.trim();
        return term ? [term] : [];
    }
    
    getScraperLocations() {
        const pillsContainer = document.getElementById('scraperLocationsPills');
        if (!pillsContainer) return [];
        
        return Array.from(pillsContainer.querySelectorAll('.location-pill'))
            .map(pill => pill.dataset.location);
    }
    
    updateConfigPreview() {
        // Update configuration name using job position
        const searchTerms = this.getScraperSearchTerms();
        const name = searchTerms.length > 0 ? searchTerms[0] : 'Enter a job position';
        const previewName = document.getElementById('previewName');
        if (previewName) previewName.textContent = name;
        
        // Update frequency
        const frequencySlider = document.getElementById('scraperFrequencySlider');
        const previewFrequency = document.getElementById('previewFrequency');
        if (frequencySlider && previewFrequency) {
            const hours = parseInt(frequencySlider.value);
            previewFrequency.textContent = `Every ${this.formatHoursDisplay(hours)}`;
        }
        
        // Update max results
        const maxResults = document.getElementById('scraperMaxResults');
        const previewMaxResults = document.getElementById('previewMaxResults');
        if (maxResults && previewMaxResults) {
            previewMaxResults.textContent = `${maxResults.value} jobs`;
        }
        
        // Update status
        const enabled = document.getElementById('scraperEnabled')?.checked;
        const previewStatus = document.getElementById('previewStatus');
        if (previewStatus) {
            if (enabled) {
                previewStatus.textContent = 'Will start automatically';
                previewStatus.className = 'status-enabled';
            } else {
                previewStatus.textContent = 'Will be saved as disabled';
                previewStatus.className = 'status-disabled';
            }
        }
        
        // Update search terms
        const previewSearchTerms = this.getScraperSearchTerms();
        const previewPositions = document.getElementById('previewPositions');
        if (previewPositions) {
            if (previewSearchTerms.length === 0) {
                previewPositions.innerHTML = '<span class="preview-placeholder">Add job positions...</span>';
            } else {
                previewPositions.innerHTML = previewSearchTerms.map(term => 
                    `<span class="board-pill-mini">${this.escapeHtml(term)}</span>`
                ).join('');
            }
        }
        
        // Update locations
        const locations = this.getScraperLocations();
        const previewLocations = document.getElementById('previewLocations');
        if (previewLocations) {
            if (locations.length === 0) {
                previewLocations.innerHTML = '<span class="preview-placeholder">Add locations...</span>';
            } else {
                previewLocations.innerHTML = locations.map(location => 
                    `<span class="board-pill-mini">${this.escapeHtml(location)}</span>`
                ).join('');
            }
        }
        
        // Update job boards
        const jobBoards = this.getCheckedValues('jobBoards');
        const previewJobBoards = document.getElementById('previewJobBoards');
        if (previewJobBoards) {
            if (jobBoards.length === 0) {
                previewJobBoards.innerHTML = '<span class="preview-placeholder">Select job boards...</span>';
            } else {
                previewJobBoards.innerHTML = jobBoards.map(board => {
                    const displayName = this.getJobBoardDisplayName(board);
                    return `<span class="board-pill-mini ${board}">${displayName}</span>`;
                }).join('');
            }
        }
        
        // Update work types
        const workTypes = this.getCheckedValues('workTypes');
        const previewWorkTypes = document.getElementById('previewWorkTypes');
        if (previewWorkTypes) {
            previewWorkTypes.innerHTML = workTypes.map(type => 
                `<span class="filter-pill-mini">${type.charAt(0).toUpperCase() + type.slice(1)}</span>`
            ).join('');
        }
        
        // Update employment types
        const employmentTypes = this.getCheckedValues('employmentTypes');
        const previewEmploymentTypes = document.getElementById('previewEmploymentTypes');
        if (previewEmploymentTypes) {
            previewEmploymentTypes.innerHTML = employmentTypes.map(type => 
                `<span class="filter-pill-mini">${type.charAt(0).toUpperCase() + type.slice(1)}</span>`
            ).join('');
        }
        
        // Update seniority levels
        const seniorityLevels = this.getCheckedValues('seniorityLevels');
        const previewSeniority = document.getElementById('previewSeniority');
        if (previewSeniority) {
            previewSeniority.innerHTML = seniorityLevels.map(level => 
                `<span class="filter-pill-mini">${level.charAt(0).toUpperCase() + level.slice(1)}</span>`
            ).join('');
        }
        
        // Update quality threshold
        const quality = document.getElementById('scraperMinScore')?.value;
        const previewQuality = document.getElementById('previewQuality');
        if (previewQuality && quality) {
            const qualityValue = parseFloat(quality);
            let qualityText = 'Low';
            if (qualityValue >= 0.8) qualityText = 'Very High';
            else if (qualityValue >= 0.6) qualityText = 'High';
            else if (qualityValue >= 0.4) qualityText = 'Medium';
            
            previewQuality.textContent = `${qualityValue.toFixed(1)} (${qualityText})`;
        }
    }
    
    getJobBoardDisplayName(board) {
        const names = {
            'linkedin': 'LinkedIn',
            'indeed': 'Indeed',
            'zip_recruiter': 'ZipRecruiter',
            'glassdoor': 'Glassdoor',
            'google': 'Google',
            'bayt': 'Bayt',
            'naukri': 'Naukri',
            'bdjobs': 'BDJobs'
        };
        return names[board] || board;
    }
    
    updatePillsOverflowState(container) {
        if (!container) return;
        
        // Check if content is overflowing
        const hasOverflow = container.scrollHeight > container.clientHeight;
        
        if (hasOverflow) {
            container.classList.add('has-overflow');
        } else {
            container.classList.remove('has-overflow');
        }
        
        // Auto-scroll to bottom when new pills are added
        if (hasOverflow) {
            container.scrollTop = container.scrollHeight;
        }
    }
    
    updateConfigFormButtons() {
        const validation = this.validateConfigurationForm();
        const saveBtn = document.getElementById('jobScraperSave');
        const dryRunBtn = document.getElementById('jobScraperDryRun');
        
        if (saveBtn) {
            saveBtn.disabled = !validation.isValid;
            if (validation.isValid) {
                saveBtn.classList.remove('disabled');
                saveBtn.title = '';
            } else {
                saveBtn.classList.add('disabled');
                saveBtn.title = validation.errors.join('. ');
            }
        }
        
        if (dryRunBtn) {
            dryRunBtn.disabled = !validation.isValid;
            if (validation.isValid) {
                dryRunBtn.classList.remove('disabled');
                dryRunBtn.title = '';
            } else {
                dryRunBtn.classList.add('disabled');
                dryRunBtn.title = validation.errors.join('. ');
            }
        }
    }
    
    updateManualSearchButtons() {
        const validation = this.validateManualSearchForm();
        const searchBtn = document.getElementById('manualSearchSubmit');
        
        if (searchBtn) {
            searchBtn.disabled = !validation.isValid;
            if (validation.isValid) {
                searchBtn.classList.remove('disabled');
                searchBtn.title = '';
            } else {
                searchBtn.classList.add('disabled');
                searchBtn.title = validation.errors.join('. ');
            }
        }
    }

    validateConfigurationForm() {
        const searchTerms = this.getScraperSearchTerms();
        const locations = this.getScraperLocations();
        
        const errors = [];
        
        if (searchTerms.length === 0) {
            errors.push('Position/Job title is required');
        }
        
        if (locations.length === 0) {
            errors.push('At least one location is required');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    validateManualSearchForm() {
        const searchTerms = this.getSearchTerms();
        const locations = this.getLocations();
        
        const errors = [];
        
        if (searchTerms.length === 0) {
            errors.push('Position/Job title is required');
        }
        
        if (locations.length === 0) {
            errors.push('At least one location is required');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    async saveConfiguration(event) {
        event.preventDefault();
        
        // Validate form before saving
        const validation = this.validateConfigurationForm();
        if (!validation.isValid) {
            this.showNotification(validation.errors.join('. '), 'error');
            return;
        }
        
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
        const searchTerms = this.getScraperSearchTerms();
        const locations = this.getScraperLocations();
        const frequency = parseInt(document.getElementById('scraperFrequencySlider').value);
        
        // Use job position as configuration name
        const jobPosition = searchTerms.length > 0 ? searchTerms[0] : 'Untitled Configuration';
        
        return {
            name: jobPosition, // Use job position as configuration name
            search_terms: searchTerms, // No fallback - validation ensures this is not empty
            target_locations: locations, // No fallback - validation ensures this is not empty
            job_boards: this.getCheckedValues('jobBoards'),
            scrape_frequency_hours: frequency,
            lookback_hours: frequency, // Use same as frequency for simplicity
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
        
        const snappedHours = this.snapToLogicalHoursValue(parseInt(searchParams.hours_old));
        document.getElementById('manualSearchHours').value = snappedHours;
        document.getElementById('manualSearchMax').value = searchParams.max_results;
        
        // Update slider displays
        const hoursDisplay = document.getElementById('hoursDisplay');
        const maxDisplay = document.getElementById('maxDisplay');
        if (hoursDisplay) hoursDisplay.textContent = this.formatHoursDisplay(snappedHours);
        if (maxDisplay) maxDisplay.textContent = `${searchParams.max_results} jobs`;
        
        this.setCheckboxes('manualJobBoards', searchParams.job_boards);
        
        // Auto-execute the search
        setTimeout(() => {
            this.executeManualSearchWithParams(searchParams);
        }, 500);
    }
    
    async executeManualSearch(event) {
        event.preventDefault();
        
        // Validate form before searching
        const validation = this.validateManualSearchForm();
        if (!validation.isValid) {
            this.showNotification(validation.errors.join('. '), 'error');
            return;
        }
        
        const searchTerms = this.getSearchTerms();
        const locations = this.getLocations();
        
        // searchTerms will already contain the single search term from input field
        // No need for fallback logic since getSearchTerms() handles the input directly
        
        // Backend expects singular fields, so join multiple values
        const searchParams = {
            search_term: searchTerms.join(', '), // Join with commas for backend
            location: locations.join(', '), // Join with commas for backend
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
        const importButton = document.getElementById('manualSearchImportFooter');
        const resultsContainer = document.getElementById('resultsList');
        
        if (button) {
            button.disabled = loading;
            button.innerHTML = loading ? 
                '<i class="fas fa-spinner fa-spin"></i> Searching...' : 
                '<i class="fas fa-search"></i> Search Jobs';
        }
        
        // Hide import button when searching
        if (importButton && loading) {
            importButton.classList.add('is-hidden');
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
        const resultsSection = document.getElementById('manualSearchResults');
        const resultsContainer = document.getElementById('resultsList');
        const resultsHeader = document.querySelector('#manualSearchResults .results-header');
        const resultsFooter = document.querySelector('#manualSearchResults .results-footer');
        const resultsCount = document.getElementById('resultsCount');
        const searchButton = document.getElementById('manualSearchSubmit');
        const importButton = document.getElementById('manualSearchImportFooter');
        
        console.log('Results section found:', !!resultsSection);
        console.log('Results container found:', !!resultsContainer);
        console.log('Results header found:', !!resultsHeader);
        console.log('Results footer found:', !!resultsFooter);
        
        // Show search button, hide import button initially
        if (searchButton) {
            searchButton.classList.remove('is-hidden');
        }
        if (importButton) {
            importButton.classList.add('is-hidden');
        }
        
        // Show the results section
        if (resultsSection) {
            resultsSection.classList.remove('is-hidden');
            console.log('Results section shown');
        } else {
            console.error('Results section not found!');
        }
        
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
            if (resultsHeader) resultsHeader.classList.add('is-hidden');
            if (resultsFooter) resultsFooter.classList.add('is-hidden');
            return;
        }
        
        // Show header and footer
        if (resultsHeader) resultsHeader.classList.remove('is-hidden');
        if (resultsFooter) resultsFooter.classList.remove('is-hidden');
        
        // Generate job cards with pill styling
        const jobsHtml = jobs.map((job, index) => {
            const salary = this.formatSalary(job.salary_min, job.salary_max, job.salary_currency);
            const workType = this.getWorkType(job);
            const matchScore = job.match_score ? (job.match_score * 100).toFixed(0) : '85';
            const postedDate = this.formatPostedDate(job.date_posted);
            
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
                        
                        ${postedDate ? `
                            <span class="job-pill posted-date" title="Posted date">
                                <i class="fas fa-clock"></i>
                                ${postedDate}
                            </span>
                        ` : ''}
                    </div>
                    
                    ${job.description ? `
                        <div class="job-description">
                            ${this.formatJobDescription(job.description, index)}
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
        const expandId = `expand-${jobIndex}`;
        
        if (isExpanded) {
            return `
                <div class="job-description-content expanded" id="desc-${jobIndex}">
                    ${cleanedDescription}
                    <button class="description-toggle" onclick="jobScraperManager.toggleDescription(${jobIndex}, false)">
                        <i class="fas fa-chevron-up"></i> Show Less
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="job-description-content" id="desc-${jobIndex}">
                    ${shortVersion}...
                    <button class="description-toggle" onclick="jobScraperManager.toggleDescription(${jobIndex}, true)">
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
            .replace(/\n\n+/g, '<br><br>')
            // Single line breaks
            .replace(/\n/g, '<br>');
    }
    
    sanitizeHtml(html) {
        // More comprehensive HTML sanitization while preserving formatting
        const allowedTags = ['strong', 'em', 'br', 'b', 'i', 'u', 'p', 'ul', 'li', 'ol', 'h4', 'h5', 'h6', 'span', 'div'];
        const div = document.createElement('div');
        div.innerHTML = html;
        
        // Remove dangerous elements
        const dangerousTags = div.querySelectorAll('script, style, link, meta, iframe, object, embed');
        dangerousTags.forEach(tag => tag.remove());
        
        // Remove dangerous attributes
        const allElements = div.querySelectorAll('*');
        allElements.forEach(element => {
            // Remove event handlers and dangerous attributes
            Array.from(element.attributes).forEach(attr => {
                if (attr.name.startsWith('on') || ['href', 'src', 'action', 'formaction'].includes(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });
            
            // Convert non-allowed tags to spans while preserving content
            if (!allowedTags.includes(element.tagName.toLowerCase())) {
                const span = document.createElement('span');
                span.innerHTML = element.innerHTML;
                element.parentNode.replaceChild(span, element);
            }
        });
        
        return div.innerHTML;
    }
    
    toggleDescription(jobIndex, expand) {
        const jobResult = document.querySelector(`[data-index="${jobIndex}"]`).closest('.job-result');
        const descriptionContainer = jobResult.querySelector('.job-description');
        
        if (!descriptionContainer) return;
        
        // Get the original job data
        const job = this.currentSearchResults[jobIndex];
        if (!job) return;
        
        // Replace the description content
        const newDescription = this.formatJobDescription(job.description, jobIndex, expand);
        descriptionContainer.innerHTML = newDescription;
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
        const selectedCountFooter = document.getElementById('selectedCountFooter');
        const importBtn = document.getElementById('manualSearchImport');
        const importBtnFooter = document.getElementById('manualSearchImportFooter');
        const searchBtn = document.getElementById('manualSearchSubmit');
        const selectAllToggle = document.getElementById('selectAllToggle');
        const selectAllLabel = document.querySelector('.select-all-label');
        
        // Update both count displays
        if (selectedCount) {
            selectedCount.textContent = this.selectedResults.size;
        }
        if (selectedCountFooter) {
            selectedCountFooter.textContent = this.selectedResults.size;
        }
        
        // Update both import buttons
        const hasSelection = this.selectedResults.size > 0;
        
        if (importBtn) {
            importBtn.disabled = !hasSelection;
            if (hasSelection) {
                importBtn.classList.remove('disabled');
            } else {
                importBtn.classList.add('disabled');
            }
        }
        
        // Manage footer buttons - show import when selection exists, hide search
        if (importBtnFooter && searchBtn) {
            if (hasSelection) {
                importBtnFooter.classList.remove('is-hidden', 'disabled');
                searchBtn.classList.add('is-hidden');
            } else {
                importBtnFooter.classList.add('is-hidden', 'disabled');
                searchBtn.classList.remove('is-hidden');
            }
        }
        
        // Update select all toggle state
        if (selectAllToggle && this.currentSearchResults) {
            const selectableJobs = this.currentSearchResults.filter(job => !job.already_exists);
            const allSelected = selectableJobs.length > 0 && this.selectedResults.size === selectableJobs.length;
            
            selectAllToggle.checked = allSelected;
            
            if (selectAllLabel) {
                if (allSelected) {
                    selectAllLabel.textContent = 'Clear All';
                } else {
                    selectAllLabel.textContent = 'Select All';
                }
            }
        }
    }
    
    toggleSelectAll(event) {
        const isChecked = event.target.checked;
        const selectAllLabel = document.querySelector('.select-all-label');
        
        if (isChecked) {
            this.selectAllResults();
            if (selectAllLabel) {
                selectAllLabel.textContent = 'Clear All';
            }
        } else {
            this.clearAllResults();
            if (selectAllLabel) {
                selectAllLabel.textContent = 'Select All';
            }
        }
    }
    
    selectAllResults() {
        if (!this.currentSearchResults) return;
        
        this.selectedResults.clear();
        this.currentSearchResults.forEach((job, index) => {
            if (!job.already_exists) { // Don't select jobs that already exist
                this.selectedResults.add(index);
                const checkbox = document.getElementById(`job-${index}`);
                const jobCard = checkbox?.closest('.job-result');
                if (checkbox) checkbox.checked = true;
                if (jobCard) jobCard.classList.add('selected');
            }
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
                        <button class="btn-small config-toggle-btn ${config.enabled ? 'btn-stop' : 'btn-start'}" 
                                onclick="jobScraperManager.toggleConfig('${config.id}')"
                                data-config-id="${config.id}">
                            <i class="fas ${config.enabled ? 'fa-stop' : 'fa-play'}"></i> 
                            ${config.enabled ? 'Stop' : 'Start'}
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
    
    async toggleConfig(configId) {
        try {
            const config = this.configs.find(c => c.id === configId);
            if (!config) return;
            
            const newEnabledState = !config.enabled;
            
            const response = await fetch(`/api/job-scraper/configs/${configId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    enabled: newEnabledState
                })
            });
            
            if (response.ok) {
                // Update local config state
                config.enabled = newEnabledState;
                
                // Update button appearance immediately
                const button = document.querySelector(`[data-config-id="${configId}"]`);
                if (button) {
                    const icon = button.querySelector('i');
                    const text = button.childNodes[button.childNodes.length - 1];
                    
                    if (newEnabledState) {
                        button.className = 'btn-small config-toggle-btn btn-stop';
                        icon.className = 'fas fa-stop';
                        text.textContent = ' Stop';
                    } else {
                        button.className = 'btn-small config-toggle-btn btn-start';
                        icon.className = 'fas fa-play';
                        text.textContent = ' Start';
                    }
                }
                
                // Update config status display
                const statusEl = document.querySelector(`[data-config-id="${configId}"]`).closest('.config-item').querySelector('.config-status');
                if (statusEl) {
                    statusEl.className = `config-status ${newEnabledState ? 'enabled' : 'disabled'}`;
                    statusEl.textContent = newEnabledState ? 'Enabled' : 'Disabled';
                }
                
                this.showNotification(
                    `Configuration ${newEnabledState ? 'started' : 'stopped'} successfully`, 
                    'success'
                );
                
                // Refresh status and recent runs
                setTimeout(() => {
                    this.loadStatus();
                    this.loadRecentRuns();
                }, 1000);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to update configuration`);
            }
        } catch (error) {
            console.error('Failed to toggle config:', error);
            this.showNotification('Failed to toggle configuration: ' + error.message, 'error');
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
