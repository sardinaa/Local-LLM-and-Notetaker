/**
 * Toggle Manager - Unified system for handling mobile and desktop toggle functionality
 * Manages visibility of .mobile-header and .tabs-container elements
 */

class ToggleManager {
    constructor() {
        this.mobileHeaderToggle = document.getElementById('mobileHeaderToggle');
        this.desktopTabsToggle = document.getElementById('desktopTabsToggle');
        this.mobileTabsToggle = document.getElementById('mobileTabsToggle');
        this.mobileHeader = document.querySelector('.mobile-header');
        
        // Target the correct container for desktop - the .dynamic-tabs element
        this.desktopTabsContainer = document.querySelector('.dynamic-tabs');
        
        // Clean up any duplicate or legacy toggle buttons
        this.cleanupDuplicateToggles();
        
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
    
    cleanupDuplicateToggles() {
        // Remove any legacy floating toggles created by other systems
        const legacyToggles = [
            'desktopFloatingToggle',
            'mobileFloatingToggle',
            'desktop-floating-toggle'
        ];
        
        legacyToggles.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                console.log(`Removing duplicate toggle: ${id}`);
                element.remove();
            }
        });
        
        // Also remove by class name
        const floatingToggles = document.querySelectorAll('.desktop-floating-toggle, .mobile-floating-toggle');
        floatingToggles.forEach(toggle => {
            if (toggle.id !== 'mobileHeaderToggle' && toggle.id !== 'desktopTabsToggle') {
                console.log('Removing duplicate toggle by class:', toggle.className);
                toggle.remove();
            }
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
        // Mobile header toggle (floating button when mobile header is hidden)
        if (this.mobileHeaderToggle) {
            this.mobileHeaderToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMobileHeader();
            });
        }
        
        // Desktop tabs toggle (floating button when desktop tabs are hidden)
        if (this.desktopTabsToggle) {
            this.desktopTabsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleDesktopTabs();
            });
        }
        
        // Mobile tabs toggle button (inside mobile header)
        if (this.mobileTabsToggle) {
            this.mobileTabsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMobileHeader();
            });
        }
        
        // Listen for any dynamically created collapse toggles - improved event delegation
        document.addEventListener('click', (e) => {
            // Check if the clicked element or its parent is a tabsCollapseToggle
            let targetElement = e.target;
            if (targetElement.closest('#tabsCollapseToggle')) {
                e.preventDefault();
                console.log('Collapse toggle detected, view type:', this.isMobileView() ? 'mobile' : 'desktop');
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
                
                // Show the floating toggle button
                this.showMobileHeaderToggle();
            } else {
                // Show the mobile header
                this.mobileHeader.style.display = 'flex';
                document.body.classList.remove('mobile-header-collapsed');
                
                // Hide the floating toggle button
                this.hideMobileHeaderToggle();
            }
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
                
                // Show the floating toggle button
                this.showDesktopTabsToggle();
                console.log('Desktop tabs (.dynamic-tabs) hidden with !important');
                console.log('After hide - display style:', this.desktopTabsContainer.style.display);
            } else {
                // Show the .dynamic-tabs container
                this.desktopTabsContainer.style.setProperty('display', 'block', 'important');
                document.body.classList.remove('desktop-tabs-collapsed');
                
                // Hide the floating toggle button
                this.hideDesktopTabsToggle();
                console.log('Desktop tabs (.dynamic-tabs) shown');
                console.log('After show - display style:', this.desktopTabsContainer.style.display);
            }
        } else {
            console.error('Desktop tabs container (.dynamic-tabs) not found');
        }
        
        // Save state
        localStorage.setItem('desktopTabsCollapsed', this.isDesktopTabsCollapsed);
        
        // Trigger haptic feedback if available
        this.triggerHapticFeedback();
    }
    
    showMobileHeaderToggle() {
        if (this.mobileHeaderToggle && this.isMobileView()) {
            // Apply light design system styling matching mobile-tabs-toggle exactly
            this.mobileHeaderToggle.style.cssText = `
                display: flex !important;
                position: fixed !important;
                top: 10px !important;
                right: 10px !important;
                z-index: 9999 !important;
                width: 36px !important;
                height: 36px !important;
                padding: 8px !important;
                border: none !important;
                border-radius: 6px !important;
                background: rgba(0, 0, 0, 0.05) !important;
                color: #6c757d !important;
                cursor: pointer !important;
                font-size: 1.1rem !important;
                transition: all 0.3s ease !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1) !important;
                backdrop-filter: blur(10px) !important;
            `;
            
            // Add hover effect to match mobile-tabs-toggle
            this.mobileHeaderToggle.onmouseenter = () => {
                this.mobileHeaderToggle.style.background = 'rgba(0, 0, 0, 0.1) !important';
                this.mobileHeaderToggle.style.transform = 'scale(1.1) !important';
            };
            
            this.mobileHeaderToggle.onmouseleave = () => {
                this.mobileHeaderToggle.style.background = 'rgba(0, 0, 0, 0.05) !important';
                this.mobileHeaderToggle.style.transform = 'scale(1) !important';
            };
        }
    }
    
    hideMobileHeaderToggle() {
        if (this.mobileHeaderToggle) {
            this.mobileHeaderToggle.style.display = 'none';
        }
    }
    
    showDesktopTabsToggle() {
        if (this.desktopTabsToggle && !this.isMobileView()) {
            // Apply light design system styling matching mobile-tabs-toggle pattern
            this.desktopTabsToggle.style.cssText = `
                display: flex !important;
                position: fixed !important;
                top: 10px !important;
                right: 10px !important;
                left: auto !important;
                z-index: 9999 !important;
                width: 36px !important;
                height: 36px !important;
                padding: 8px !important;
                border: none !important;
                border-radius: 6px !important;
                background: rgba(0, 0, 0, 0.05) !important;
                color: #6c757d !important;
                cursor: pointer !important;
                font-size: 1.1rem !important;
                transition: all 0.3s ease !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1) !important;
                backdrop-filter: blur(10px) !important;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
            `;
            
            // Add hover effect matching mobile-tabs-toggle exactly
            this.desktopTabsToggle.onmouseenter = () => {
                this.desktopTabsToggle.style.background = 'rgba(0, 0, 0, 0.1) !important';
                this.desktopTabsToggle.style.transform = 'scale(1.1) !important';
            };
            
            this.desktopTabsToggle.onmouseleave = () => {
                this.desktopTabsToggle.style.background = 'rgba(0, 0, 0, 0.05) !important';
                this.desktopTabsToggle.style.transform = 'scale(1) !important';
            };
            
            console.log('Desktop toggle button shown with mobile-tabs-toggle matching style');
        }
    }
    
    hideDesktopTabsToggle() {
        if (this.desktopTabsToggle) {
            this.desktopTabsToggle.style.display = 'none';
        }
    }
    
    updateToggleVisibility() {
        const isMobile = this.isMobileView();
        
        // Force hide dynamic-tabs on mobile/tablet devices regardless of toggle state
        if (isMobile && this.desktopTabsContainer) {
            this.desktopTabsContainer.style.setProperty('display', 'none', 'important');
            console.log('Forcing dynamic-tabs hidden on mobile/tablet view');
        }
        
        if (isMobile) {
            // On mobile, manage mobile header toggle
            if (this.isMobileHeaderCollapsed) {
                this.showMobileHeaderToggle();
            } else {
                this.hideMobileHeaderToggle();
            }
            // Always hide desktop toggle on mobile
            this.hideDesktopTabsToggle();
        } else {
            // On desktop, manage desktop tabs toggle
            if (this.isDesktopTabsCollapsed) {
                this.showDesktopTabsToggle();
            } else {
                this.hideDesktopTabsToggle();
                // Only show dynamic-tabs on desktop when not collapsed
                if (this.desktopTabsContainer) {
                    this.desktopTabsContainer.style.setProperty('display', 'block', 'important');
                    console.log('Showing dynamic-tabs on desktop view');
                }
            }
            // Always hide mobile toggle on desktop
            this.hideMobileHeaderToggle();
        }
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
