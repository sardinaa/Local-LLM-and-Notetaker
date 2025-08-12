/**
 * Web Search Manager
 * Handles both automatic and manual web search functionality
 */
class WebSearchManager {
    constructor() {
        this.searchHistory = [];
        this.maxHistorySize = 10;
        this.forceWebSearch = false; // Manual override for next query
        this.loadSearchHistory();
        
        // Add web search toggle to plus menu
        this.addWebSearchToggle();
    }

    addWebSearchToggle() {
        // Prefer the plus-menu content; fallback to left container
        const plusMenuContent = document.querySelector('.chat-plus-menu .chat-plus-menu-content');
        const leftButtonsContainer = plusMenuContent || document.querySelector('.input-buttons-left');
        
        if (!leftButtonsContainer || document.getElementById('webSearchToggleBtn')) {
            return; // Already added or container not found
        }

        // Create web search toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'webSearchToggleBtn';
        toggleBtn.className = 'input-btn web-search-toggle';
        toggleBtn.innerHTML = '<i class="fas fa-globe"></i>';
        toggleBtn.title = 'Force web search for next query';
        toggleBtn.onclick = () => this.toggleForceWebSearch();
        
        // Add into submenu
        leftButtonsContainer.appendChild(toggleBtn);
    }

    toggleForceWebSearch() {
        this.forceWebSearch = !this.forceWebSearch;
        const toggleBtn = document.getElementById('webSearchToggleBtn');
        
        if (this.forceWebSearch) {
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<i class="fas fa-globe"></i>';
            toggleBtn.title = 'Web search ENABLED for next query (click to disable)';
            toggleBtn.style.background = 'var(--accent-color, #007acc)';
            toggleBtn.style.color = 'white';
            
            // Auto-disable after 30 seconds if not used
            setTimeout(() => {
                if (this.forceWebSearch) {
                    this.toggleForceWebSearch();
                }
            }, 30000);
            
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = '<i class="fas fa-globe"></i>';
            toggleBtn.title = 'Force web search for next query';
            toggleBtn.style.background = '';
            toggleBtn.style.color = '';
        }
        
        // Close the plus menu
        const chatPlusMenu = document.getElementById('chatPlusMenu');
        if (chatPlusMenu) {
            chatPlusMenu.classList.remove('open');
        }
    }

    addToSearchHistory(query) {
        // Remove if already exists
        this.searchHistory = this.searchHistory.filter(q => q !== query);
        
        // Add to beginning
        this.searchHistory.unshift(query);
        
        // Limit size
        if (this.searchHistory.length > this.maxHistorySize) {
            this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
        }
        
        // Save to localStorage
        try {
            localStorage.setItem('webSearchHistory', JSON.stringify(this.searchHistory));
        } catch (e) {
            console.warn('Could not save search history to localStorage:', e);
        }
    }

    loadSearchHistory() {
        try {
            const saved = localStorage.getItem('webSearchHistory');
            if (saved) {
                this.searchHistory = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load search history from localStorage:', e);
            this.searchHistory = [];
        }
    }

    // Method to check if web search should be forced for the next query
    shouldForceWebSearch() {
        return this.forceWebSearch;
    }

    // Method to reset the force web search flag (called after use)
    resetForceWebSearch() {
        if (this.forceWebSearch) {
            this.forceWebSearch = false;
            const toggleBtn = document.getElementById('webSearchToggleBtn');
            if (toggleBtn) {
                toggleBtn.classList.remove('active');
                toggleBtn.innerHTML = '<i class="fas fa-globe"></i>';
                toggleBtn.title = 'Force web search for next query';
                toggleBtn.style.background = '';
                toggleBtn.style.color = '';
            }
        }
    }

    init() {
        // Load search history
        this.loadSearchHistory();

        // Listen for web search completion to reset force flag
        window.addEventListener('webSearchCompleted', () => {
            this.resetForceWebSearch();
        });
    }
}

// Initialize web search manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.webSearchManager = new WebSearchManager();
    window.webSearchManager.init();
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
    // Already handled by DOMContentLoaded
} else {
    window.webSearchManager = new WebSearchManager();
    window.webSearchManager.init();
}

// Helper functions for integration with chat system
window.completeWebSearch = function() {
    const event = new CustomEvent('webSearchCompleted');
    window.dispatchEvent(event);
};

// Export the shouldForceWebSearch function for use by chat system
window.shouldForceWebSearch = function() {
    return window.webSearchManager ? window.webSearchManager.shouldForceWebSearch() : false;
};
