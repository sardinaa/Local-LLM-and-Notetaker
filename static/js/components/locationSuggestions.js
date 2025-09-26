/**
 * Location Suggestions Module
 * Provides autocomplete suggestions for location input fields
 */

class LocationSuggestions {
    constructor() {
        this.suggestionsCache = new Set();
        this.currentSuggestions = [];
        this.activeSuggestionBox = null;
        this.activeInput = null;
        
        // Initialize with valid JobSpy countries only
        this.initializeCommonLocations();
        
        // Don't load existing locations since they may include invalid cities
        // this.loadExistingLocations();
    }
    
    initializeCommonLocations() {
        // Valid JobSpy countries (from error message) - exact format as supported by JobSpy
        const validJobSpyCountries = [
            'argentina', 'australia', 'austria', 'bahrain', 'bangladesh', 'belgium', 
            'bulgaria', 'brazil', 'canada', 'chile', 'china', 'colombia', 'costa rica', 
            'croatia', 'cyprus', 'czech republic', 'czechia', 'denmark', 'ecuador', 
            'egypt', 'estonia', 'finland', 'france', 'germany', 'greece', 'hong kong', 
            'hungary', 'india', 'indonesia', 'ireland', 'israel', 'italy', 'japan', 
            'kuwait', 'latvia', 'lithuania', 'luxembourg', 'malaysia', 'malta', 'mexico', 
            'morocco', 'netherlands', 'new zealand', 'nigeria', 'norway', 'oman', 
            'pakistan', 'panama', 'peru', 'philippines', 'poland', 'portugal', 'qatar', 
            'romania', 'saudi arabia', 'singapore', 'slovakia', 'slovenia', 'south africa', 
            'south korea', 'spain', 'sweden', 'switzerland', 'taiwan', 'thailand', 
            'türkiye', 'turkey', 'ukraine', 'united arab emirates', 'uk', 'united kingdom', 
            'usa', 'us', 'united states', 'uruguay', 'venezuela', 'vietnam', 'usa/ca', 'worldwide'
        ];

        // Format countries for display (capitalize first letter of each word)
        const formattedLocations = validJobSpyCountries.map(country => {
            return country.split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        });

        // Add only the formatted locations to suggestions (no duplicates)
        formattedLocations.forEach(location => this.suggestionsCache.add(location));
        
        // Store valid countries for validation (keep lowercase for validation logic)
        this.validJobSpyCountries = validJobSpyCountries;
    }
    
    async loadExistingLocations() {
        // Disabled: Don't load existing locations since they may include cities
        // that are not supported by JobSpy. Only use the predefined valid countries.
        console.log('Loading existing locations is disabled to ensure JobSpy compatibility');
        return;
    }
    
    async loadLocationsFromJobs() {
        // Disabled: Don't load existing locations since they may include cities
        // that are not supported by JobSpy. Only use the predefined valid countries.
        console.log('Loading locations from jobs is disabled to ensure JobSpy compatibility');
        return;
    }
    
    attachToInput(inputElement, options = {}) {
        if (!inputElement) return;
        
        const defaultOptions = {
            maxSuggestions: 8,
            minChars: 1,
            caseSensitive: false,
            placeholder: 'Type to search locations...'
        };
        
        const config = { ...defaultOptions, ...options };
        
        // Store reference for cleanup
        inputElement._locationSuggestions = this;
        
        // Add event listeners
        inputElement.addEventListener('input', (e) => this.handleInput(e, config));
        inputElement.addEventListener('keydown', (e) => this.handleKeydown(e));
        inputElement.addEventListener('blur', (e) => this.handleBlur(e));
        inputElement.addEventListener('focus', (e) => this.handleFocus(e, config));
        
        // Add CSS class for styling
        inputElement.classList.add('location-input-with-suggestions');
    }
    
    handleInput(event, config) {
        const input = event.target;
        const value = input.value.trim();
        
        this.activeInput = input;
        
        if (value.length < config.minChars) {
            this.hideSuggestions();
            return;
        }
        
        const suggestions = this.getSuggestions(value, config);
        this.showSuggestions(input, suggestions);
    }
    
    handleKeydown(event) {
        if (!this.activeSuggestionBox) return;
        
        const suggestions = this.activeSuggestionBox.querySelectorAll('.location-suggestion-item');
        const currentActive = this.activeSuggestionBox.querySelector('.location-suggestion-item.active');
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!currentActive && suggestions.length > 0) {
                    suggestions[0].classList.add('active');
                } else if (currentActive) {
                    const nextItem = currentActive.nextElementSibling;
                    if (nextItem) {
                        currentActive.classList.remove('active');
                        nextItem.classList.add('active');
                    }
                }
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                if (currentActive) {
                    const prevItem = currentActive.previousElementSibling;
                    if (prevItem) {
                        currentActive.classList.remove('active');
                        prevItem.classList.add('active');
                    }
                }
                break;
                
            case 'Enter':
                if (currentActive) {
                    event.preventDefault();
                    this.selectSuggestion(currentActive.textContent);
                }
                break;
                
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }
    
    handleBlur(event) {
        // Delay hiding to allow clicking on suggestions
        setTimeout(() => {
            if (this.activeSuggestionBox && !this.activeSuggestionBox.contains(document.activeElement)) {
                this.hideSuggestions();
            }
        }, 150);
    }
    
    handleFocus(event, config) {
        const input = event.target;
        const value = input.value.trim();
        
        this.activeInput = input;
        
        if (value.length >= config.minChars) {
            const suggestions = this.getSuggestions(value, config);
            this.showSuggestions(input, suggestions);
        }
    }
    
    getSuggestions(query, config) {
        const searchTerm = config.caseSensitive ? query : query.toLowerCase();
        const suggestions = [];
        
        for (const location of this.suggestionsCache) {
            const locationText = config.caseSensitive ? location : location.toLowerCase();
            
            if (locationText.includes(searchTerm)) {
                suggestions.push(location);
                
                if (suggestions.length >= config.maxSuggestions) {
                    break;
                }
            }
        }
        
        // Sort suggestions: exact matches first, then starts with, then contains
        // Prioritize countries/regions over cities for broader searches
        suggestions.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Exact match
            if (aLower === queryLower) return -1;
            if (bLower === queryLower) return 1;
            
            // Prioritize general geographic areas (countries, continents) over specific cities
            const isAGeneral = this.isGeneralLocation(a);
            const isBGeneral = this.isGeneralLocation(b);
            
            if (isAGeneral && !isBGeneral) return -1;
            if (isBGeneral && !isAGeneral) return 1;
            
            // Starts with
            if (aLower.startsWith(queryLower) && !bLower.startsWith(queryLower)) return -1;
            if (bLower.startsWith(queryLower) && !aLower.startsWith(queryLower)) return 1;
            
            // Alphabetical for same priority
            return a.localeCompare(b);
        });
        
        return suggestions;
    }
    
    // Helper method to identify general geographic locations
    isGeneralLocation(location) {
        const locationLower = location.toLowerCase();
        
        // Check if it's a valid JobSpy country (these are all considered general locations)
        return this.validJobSpyCountries.some(country => 
            locationLower === country || locationLower.includes(country)
        );
    }
    
    // Validate if a location is supported by JobSpy
    isValidJobSpyLocation(location) {
        if (!location || typeof location !== 'string') return false;
        
        const locationLower = location.toLowerCase().trim();
        
        // Check if it's exactly one of the valid countries
        if (this.validJobSpyCountries.includes(locationLower)) {
            return true;
        }
        
        // Check if location contains a valid country
        return this.validJobSpyCountries.some(country => 
            locationLower.includes(country) || 
            locationLower.endsWith(`, ${country}`) ||
            locationLower.startsWith(`${country},`)
        );
    }
    
    // Get validation message for invalid locations
    getLocationValidationMessage(location) {
        if (this.isValidJobSpyLocation(location)) {
            return null;
        }
        
        return `"${location}" is not supported by JobSpy. Please use one of the suggested countries.`;
    }
    
    showSuggestions(input, suggestions) {
        this.hideSuggestions();
        
        if (suggestions.length === 0) return;
        
        const suggestionBox = document.createElement('div');
        suggestionBox.className = 'location-suggestions-box';
        
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'location-suggestion-item';
            item.textContent = suggestion;
            
            item.addEventListener('click', () => {
                this.selectSuggestion(suggestion);
            });
            
            item.addEventListener('mouseenter', () => {
                suggestionBox.querySelectorAll('.location-suggestion-item').forEach(i => {
                    i.classList.remove('active');
                });
                item.classList.add('active');
            });
            
            suggestionBox.appendChild(item);
        });
        
        // Position the suggestion box
        const rect = input.getBoundingClientRect();
        suggestionBox.style.position = 'fixed';
        suggestionBox.style.top = `${rect.bottom + window.scrollY}px`;
        suggestionBox.style.left = `${rect.left + window.scrollX}px`;
        suggestionBox.style.width = `${rect.width}px`;
        suggestionBox.style.zIndex = '9999';
        
        document.body.appendChild(suggestionBox);
        this.activeSuggestionBox = suggestionBox;
    }
    
    selectSuggestion(suggestion) {
        // Hide suggestions immediately to prevent any visual lag
        this.hideSuggestions();
        
        if (this.activeInput) {
            // For suggestions from our cache, skip validation since they're already valid
            // Only validate if this is a manually typed input that somehow got here
            const isFromSuggestionCache = this.suggestionsCache.has(suggestion);
            
            if (!isFromSuggestionCache && !this.isValidJobSpyLocation(suggestion)) {
                const message = this.getLocationValidationMessage(suggestion);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(message, 'warning');
                } else {
                    alert(message);
                }
                return;
            }
            
            // Temporarily disable input event handling to prevent suggestions from reappearing
            const originalInput = this.activeInput;
            this.activeInput = null;
            
            originalInput.value = suggestion;
            
            // Re-enable input handling after a short delay
            setTimeout(() => {
                this.activeInput = originalInput;
            }, 100);
            
            // Trigger change event for any listeners (but not input event to avoid re-showing suggestions)
            originalInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // For pill-based inputs (like the job scraper modal)
            if (typeof window.jobScraperManager !== 'undefined') {
                if (originalInput.id === 'manualSearchLocation') {
                    // Add as pill for manual search
                    window.jobScraperManager.addLocationPill(suggestion);
                    originalInput.value = '';
                } else if (originalInput.id === 'scraperLocation') {
                    // Add as pill for scraper configuration
                    window.jobScraperManager.addScraperLocationPill(suggestion);
                    originalInput.value = '';
                }
            }
        }
    }
    
    hideSuggestions() {
        if (this.activeSuggestionBox) {
            this.activeSuggestionBox.remove();
            this.activeSuggestionBox = null;
        }
    }
    
    addLocation(location) {
        // Disabled: Don't allow adding external locations to prevent cities
        // from being added to suggestions that are not supported by JobSpy
        console.log(`Adding external location "${location}" is disabled to ensure JobSpy compatibility`);
        return;
    }
    
    destroy() {
        this.hideSuggestions();
        this.activeInput = null;
    }
}

// CSS for location suggestions
const suggestionCSS = `
.location-suggestions-box {
    background: white;
    border: 1px solid var(--border-color, #e1e5e9);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 300px;
    overflow-y: auto;
    font-size: 0.9rem;
}

.location-suggestion-item {
    padding: 0.75rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color, #f5f5f5);
    transition: background-color 0.2s ease;
}

.location-suggestion-item:last-child {
    border-bottom: none;
}

.location-suggestion-item:hover,
.location-suggestion-item.active {
    background-color: var(--primary-color, #007bff);
    color: white;
}

.location-input-with-suggestions {
    position: relative;
}

/* Override any conflicting styles */
.location-suggestions-box * {
    box-sizing: border-box;
}
`;

// Inject CSS
if (!document.getElementById('location-suggestions-css')) {
    const style = document.createElement('style');
    style.id = 'location-suggestions-css';
    style.textContent = suggestionCSS;
    document.head.appendChild(style);
}

// Global instance
window.locationSuggestions = new LocationSuggestions();

// Auto-attach to common location inputs when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Dashboard location input
    const dashboardLocation = document.getElementById('jobsLocation');
    if (dashboardLocation) {
        window.locationSuggestions.attachToInput(dashboardLocation);
    }
    
    // Manual search location input
    const manualSearchLocation = document.getElementById('manualSearchLocation');
    if (manualSearchLocation) {
        window.locationSuggestions.attachToInput(manualSearchLocation, {
            maxSuggestions: 6
        });
    }
    
    // Job scraper configuration location input (new)
    const scraperLocation = document.getElementById('scraperLocation');
    if (scraperLocation) {
        window.locationSuggestions.attachToInput(scraperLocation, {
            maxSuggestions: 8
        });
    }
    
    // Legacy job scraper configuration textarea (for backward compatibility)
    const scraperLocations = document.getElementById('scraperLocations');
    if (scraperLocations) {
        window.locationSuggestions.attachToInput(scraperLocations, {
            maxSuggestions: 10
        });
    }
});

// Export for use in other modules
window.LocationSuggestions = LocationSuggestions;
