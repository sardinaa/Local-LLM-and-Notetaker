/**
 * Web Search Manager
 * Handles both automatic and manual web search functionality
 */
export default class WebSearchManager {
    constructor() {
        this.searchHistory = [];
        this.maxHistorySize = 10;
        this.forceWebSearch = false; // Manual override for next query
        this._initialized = false;
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
        toggleBtn.className = 'input-btn web-search-toggle chat-plus-menu-btn';
        toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
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
            toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
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
            toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
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
                toggleBtn.innerHTML = '<i class="fas fa-globe"></i><span class="btn-text">Web Search</span>';
                toggleBtn.title = 'Force web search for next query';
                toggleBtn.style.background = '';
                toggleBtn.style.color = '';
            }
        }
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;
        this.addWebSearchToggle();
        // Load search history
        this.loadSearchHistory();

        // Listen for web search completion to reset force flag
        window.addEventListener('webSearchCompleted', () => {
            this.resetForceWebSearch();
        });
    }
}

let instance = null;
let initPromise = null;

function ensureInstance() {
    if (!instance) {
        instance = new WebSearchManager();
        try { window.webSearchManager = instance; } catch {}
    }
    return instance;
}

export function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
        const start = () => {
            const manager = ensureInstance();
            manager.init();
            resolve(manager);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    });
    return initPromise;
}

export function getManager() {
    return instance;
}

export function completeWebSearch() {
    const event = new CustomEvent('webSearchCompleted');
    window.dispatchEvent(event);
}

export function shouldForceWebSearch() {
    const manager = instance;
    return manager ? manager.shouldForceWebSearch() : false;
}

try {
    window.completeWebSearch = completeWebSearch;
    window.shouldForceWebSearch = () => shouldForceWebSearch();
} catch {}
