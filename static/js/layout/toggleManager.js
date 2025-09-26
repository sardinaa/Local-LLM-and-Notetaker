/**
 * Toggle Manager - Unified system for handling mobile and desktop toggle functionality
 * Manages visibility of .mobile-header and .tabs-container elements
 */

class ToggleManager {
    constructor() {
        // Use only the Gaussian toggle for all functionality
        this.gaussianToggle = document.getElementById('tabs-collapse-toggle');
        this.mobileHeader = document.querySelector('.mobile-header');
        
        // Target the correct container for desktop - the .dynamic-tabs element
        this.desktopTabsContainer = document.querySelector('.dynamic-tabs');
        
        // Clean up any old toggle buttons
        this.cleanupOldToggles();
        
        // Debug: Log what we found
        console.log('ToggleManager container search results:', {
            '.dynamic-tabs': !!this.desktopTabsContainer,
            'selected container': this.desktopTabsContainer ? this.desktopTabsContainer.className : 'none'
        });
        
        // Debug: Check computed styles
        if (this.desktopTabsContainer) {
            const computedStyle = window.getComputedStyle(this.desktopTabsContainer);
            console.log('Initial dynamic-tabs computed display:', computedStyle.display);
            console.log('Initial dynamic-tabs inline style:', this.desktopTabsContainer.style.display);
        }
        
        this.isMobileHeaderCollapsed = false;
        this.isDesktopTabsCollapsed = false;
        
        this.init();
    }
    
    cleanupOldToggles() {
        // Remove all old toggle buttons - we only want the Gaussian toggle
        const oldToggles = [
            'mobileHeaderToggle',
            'desktopTabsToggle', 
            'mobileTabsToggle',
            'desktopFloatingToggle',
            'mobileFloatingToggle',
            'desktop-floating-toggle'
        ];
        
        oldToggles.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                console.log(`Removing old toggle: ${id}`);
                element.remove();
            }
        });
        
        // Also remove by class name
        const floatingToggles = document.querySelectorAll('.desktop-floating-toggle, .mobile-floating-toggle, .mobile-tabs-toggle, .desktop-sidebar-toggle');
        floatingToggles.forEach(toggle => {
            console.log('Removing old toggle by class:', toggle.className);
            toggle.remove();
        });
    }
    
    init() {
        this.setupEventListeners();
        this.loadCollapseStates();
        this.enforceViewportConstraints(); // Force correct initial state
        this.updateToggleVisibility();
        
        // Update on window resize with debouncing
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                console.log('Window resized, enforcing viewport constraints');
                this.enforceViewportConstraints();
                this.updateToggleVisibility();
            }, 100); // Debounce resize events
        });
    }
    
    enforceViewportConstraints() {
        const isMobile = this.isMobileView();
        
        if (isMobile) {
            // On mobile/tablet: Force hide desktop tabs container
            if (this.desktopTabsContainer) {
                this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
                document.body.classList.remove('desktop-tabs-collapsed');
                console.log('Enforced mobile view: desktop tabs hidden');
            }
            // Reset desktop collapse state for mobile
            this.isDesktopTabsCollapsed = false;
        } else {
            // On desktop: Restore proper desktop tabs state
            if (this.desktopTabsContainer && !this.isDesktopTabsCollapsed) {
                this.desktopTabsContainer.style.setProperty('display', 'block', 'important');
                console.log('Enforced desktop view: desktop tabs shown');
            }
        }
    }
    
    setupEventListeners() {
        // Listen only for the Gaussian toggle - handles both mobile and desktop
        document.addEventListener('click', (e) => {
            // Check if the clicked element or its parent is the Gaussian toggle
            let targetElement = e.target;
            if (targetElement.closest('#tabs-collapse-toggle')) {
                e.preventDefault();
                console.log('Gaussian toggle clicked, view type:', this.isMobileView() ? 'mobile' : 'desktop');
                if (this.isMobileView()) {
                    this.toggleMobileHeader();
                } else {
                    this.toggleDesktopTabs();
                }
            }
        });
    }
    
    toggleMobileHeader() {
        this.isMobileHeaderCollapsed = !this.isMobileHeaderCollapsed;
        
        if (this.mobileHeader) {
            if (this.isMobileHeaderCollapsed) {
                // Hide the mobile header
                this.mobileHeader.style.display = 'none';
                document.body.classList.add('mobile-header-collapsed');
            } else {
                // Show the mobile header
                this.mobileHeader.style.display = 'flex';
                document.body.classList.remove('mobile-header-collapsed');
            }
        }
        
        // Update the Gaussian toggle appearance
        if (window.tabManager && window.tabManager.updateCollapseToggleState) {
            // Set the corresponding state in TabManager and update toggle
            window.tabManager.tabsCollapsed = this.isMobileHeaderCollapsed;
            window.tabManager.updateCollapseToggleState();
        }
        
        // Save state
        localStorage.setItem('mobileHeaderCollapsed', this.isMobileHeaderCollapsed);
        
        // Trigger haptic feedback if available
        this.triggerHapticFeedback();
    }
    
    toggleDesktopTabs() {
        console.log('toggleDesktopTabs called, current state:', this.isDesktopTabsCollapsed);
        console.log('Desktop tabs container (.dynamic-tabs) found:', !!this.desktopTabsContainer);
        console.log('Container element:', this.desktopTabsContainer);
        console.log('Container current display:', this.desktopTabsContainer ? this.desktopTabsContainer.style.display : 'none');
        console.log('Current view is mobile:', this.isMobileView());
        
        // Prevent desktop tabs toggle on mobile/tablet devices
        if (this.isMobileView()) {
            console.warn('toggleDesktopTabs called on mobile/tablet device - ignoring');
            return;
        }
        
        this.isDesktopTabsCollapsed = !this.isDesktopTabsCollapsed;
        
        if (this.desktopTabsContainer) {
            if (this.isDesktopTabsCollapsed) {
                // Hide the .dynamic-tabs container with !important
                this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
                document.body.classList.add('desktop-tabs-collapsed');
                console.log('Desktop tabs (.dynamic-tabs) hidden with !important');
            } else {
                // Show the .dynamic-tabs container
                this.desktopTabsContainer.style.setProperty('display', 'block', 'important');
                document.body.classList.remove('desktop-tabs-collapsed');
                console.log('Desktop tabs (.dynamic-tabs) shown');
            }
        } else {
            console.error('Desktop tabs container (.dynamic-tabs) not found');
        }
        
        // Update the Gaussian toggle appearance
        if (window.tabManager && window.tabManager.updateCollapseToggleState) {
            // Set the corresponding state in TabManager and update toggle
            window.tabManager.tabsCollapsed = this.isDesktopTabsCollapsed;
            window.tabManager.updateCollapseToggleState();
        }
        
        // Save state
        localStorage.setItem('desktopTabsCollapsed', this.isDesktopTabsCollapsed);
        
        // Trigger haptic feedback if available
        this.triggerHapticFeedback();
    }
    
    showMobileHeaderToggle() {
        // No longer needed - Gaussian toggle handles all cases
    }
    
    hideMobileHeaderToggle() {
        // No longer needed - Gaussian toggle handles all cases
    }
    
    showDesktopTabsToggle() {
        // No longer needed - Gaussian toggle handles all cases
    }
    
    hideDesktopTabsToggle() {
        // No longer needed - Gaussian toggle handles all cases
    }
    
    updateToggleVisibility() {
        const isMobile = this.isMobileView();
        
        // Force hide dynamic-tabs on mobile/tablet devices regardless of toggle state
        if (isMobile && this.desktopTabsContainer) {
            this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
            console.log('Forcing dynamic-tabs hidden on mobile/tablet view');
        } else if (!isMobile && this.desktopTabsContainer && !this.isDesktopTabsCollapsed) {
            // Only show dynamic-tabs on desktop when not collapsed
            this.desktopTabsContainer.style.setProperty('display', 'block', 'important');
            console.log('Showing dynamic-tabs on desktop view');
        }
        
        // The Gaussian toggle handles all show/hide functionality now
        // No need to manage separate toggle buttons
    }
    
    loadCollapseStates() {
        // Load mobile header collapse state
        const mobileHeaderState = localStorage.getItem('mobileHeaderCollapsed');
        if (mobileHeaderState === 'true') {
            this.isMobileHeaderCollapsed = true;
            if (this.mobileHeader) {
                this.mobileHeader.style.display = 'none';
                document.body.classList.add('mobile-header-collapsed');
            }
        }
        
        // Load desktop tabs collapse state - but only apply on desktop view
        const desktopTabsState = localStorage.getItem('desktopTabsCollapsed');
        if (desktopTabsState === 'true' && !this.isMobileView()) {
            this.isDesktopTabsCollapsed = true;
            
            if (this.desktopTabsContainer) {
                this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
                document.body.classList.add('desktop-tabs-collapsed');
            }
        } else if (this.isMobileView()) {
            // Force hide desktop tabs container on mobile/tablet regardless of saved state
            this.isDesktopTabsCollapsed = false; // Reset state for mobile
            if (this.desktopTabsContainer) {
                this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
                document.body.classList.remove('desktop-tabs-collapsed');
                console.log('Forced desktop tabs hidden due to mobile view');
            }
        }
    }
    
    isMobileView() {
        // Consider tablet (768-1024px) as mobile for toggle functionality
        return window.innerWidth <= 1024;
    }
    
    triggerHapticFeedback() {
        // Trigger haptic feedback on supported devices
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }
    
    // Public method to force update (useful for other components)
    forceUpdate() {
        this.updateToggleVisibility();
    }
    
    // Method to programmatically collapse/expand
    setMobileHeaderCollapsed(collapsed) {
        if (this.isMobileHeaderCollapsed !== collapsed) {
            this.toggleMobileHeader();
        }
    }
    
    setDesktopTabsCollapsed(collapsed) {
        if (this.isDesktopTabsCollapsed !== collapsed) {
            this.toggleDesktopTabs();
        }
    }
    
    // Getters for current state
    get mobileHeaderCollapsed() {
        return this.isMobileHeaderCollapsed;
    }
    
    get desktopTabsCollapsed() {
        return this.isDesktopTabsCollapsed;
    }
    
    // Debug method to check element visibility
    debugDesktopTabs() {
        if (this.desktopTabsContainer) {
            const computedStyle = window.getComputedStyle(this.desktopTabsContainer);
            console.log('Desktop tabs debug info:', {
                element: this.desktopTabsContainer,
                inlineDisplay: this.desktopTabsContainer.style.display,
                computedDisplay: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                height: computedStyle.height,
                width: computedStyle.width,
                isVisible: this.desktopTabsContainer.offsetParent !== null
            });
        }
    }
}

// Initialize the toggle manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.toggleManager = new ToggleManager();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToggleManager;
}
