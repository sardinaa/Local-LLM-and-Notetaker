/**
 * Mobile Responsive JavaScript
 * Handles mobile-specific interactions and responsive behavior
 */

class MobileManager {
    constructor() {
        this.sidebar = document.getElementById('sidebar');
        this.mobileOverlay = document.getElementById('mobileOverlay');
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        this.mobileTabsToggle = document.getElementById('mobileTabsToggle');
        this.desktopSidebarToggle = document.getElementById('desktopSidebarToggle');
        this.isMobile = window.innerWidth <= 768;
        this.isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
        this.isDesktop = window.innerWidth > 1024;
        this.tabsCollapsed = false;
        this.sidebarCollapsed = false;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupMobileTabs();
        this.setupAdditionalEventListeners();
        this.handleResize();
        
        // Update on window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }
    
    setupEventListeners() {
        // Mobile menu button
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleSidebar();
            });
        }
        
        // Desktop sidebar toggle button
        if (this.desktopSidebarToggle) {
            this.desktopSidebarToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleDesktopSidebar();
            });
        }
        
        // Mobile overlay
        if (this.mobileOverlay) {
            this.mobileOverlay.addEventListener('click', () => {
                this.closeSidebar();
            });
        }
        
        // Mobile tabs toggle - delegate to toggle manager
        // Note: The toggle manager will handle this event listener
        
        // Close sidebar when clicking on content (mobile only)
        document.addEventListener('click', (e) => {
            if (this.isMobileDevice() && this.sidebar.classList.contains('mobile-open')) {
                if (!this.sidebar.contains(e.target) && !this.mobileMenuBtn.contains(e.target)) {
                    this.closeSidebar();
                }
            }
        });
    }
    
    setupMobileTabs() {
        // The mobile tab navigation now uses the dynamic tabs system
        // Toggle functionality is handled by the ToggleManager
    }
    
    // Legacy method - now delegates to toggle manager
    toggleMobileTabs() {
        if (window.toggleManager) {
            window.toggleManager.toggleMobileHeader();
        }
    }
    
    // Legacy methods - now handled by toggle manager
    createFloatingToggle() {
        // This functionality is now handled by ToggleManager
        console.warn('createFloatingToggle is deprecated. Use ToggleManager instead.');
    }

    removeFloatingToggle() {
        // This functionality is now handled by ToggleManager
        // Clean up any legacy floating toggles
        const existingToggle = document.getElementById('mobileFloatingToggle');
        if (existingToggle) {
            existingToggle.remove();
        }
    }
    
    loadCollapseState() {
        // Collapse state loading is now handled by ToggleManager
        // This method is kept for backwards compatibility
        console.warn('loadCollapseState is deprecated. ToggleManager handles state loading.');
    }
    
    setupAdditionalEventListeners() {
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.sidebar.classList.contains('mobile-open')) {
                this.closeSidebar();
            }
        });
        
        // Update when tab changes
        document.addEventListener('tabChanged', (e) => {
            // Close sidebar when tab changes on mobile
            if (this.isMobileDevice()) {
                this.closeSidebar();
            }
        });
        
        // Update when note/chat is selected
        document.addEventListener('nodeSelected', (e) => {
            if (this.isMobileDevice()) {
                // Close sidebar when item is selected
                this.closeSidebar();
            }
        });
    }
    
    handleResize() {
        const wasIsMobile = this.isMobile;
        const wasIsTablet = this.isTablet;
        const wasIsDesktop = this.isDesktop;
        
        this.isMobile = window.innerWidth <= 768;
        this.isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
        this.isDesktop = window.innerWidth > 1024;
        
        // If switching from mobile to desktop, ensure sidebar is reset
        if (wasIsMobile && !this.isMobile && !this.isTablet) {
            this.closeSidebar();
        }
        
        // If switching to mobile/tablet, ensure proper setup
        if ((!wasIsMobile && !wasIsTablet) && (this.isMobile || this.isTablet)) {
            this.closeSidebar();
        }
        
        // If switching to desktop, reset desktop sidebar state
        if (!wasIsDesktop && this.isDesktop) {
            this.sidebar.classList.remove('desktop-collapsed');
            this.sidebarCollapsed = false;
            if (this.desktopSidebarToggle) {
                const icon = this.desktopSidebarToggle.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-bars';
                }
            }
        }
        
        // Update body class for responsive styles
        this.updateBodyClasses();
        
        // Update toggle manager visibility
        if (window.toggleManager) {
            window.toggleManager.forceUpdate();
        }
    }
    
    updateBodyClasses() {
        document.body.classList.toggle('mobile-device', this.isMobile);
        document.body.classList.toggle('tablet-device', this.isTablet);
        document.body.classList.toggle('desktop-device', !this.isMobile && !this.isTablet);
    }
    
    isMobileDevice() {
        return this.isMobile || this.isTablet;
    }
    
    toggleSidebar() {
        if (this.sidebar.classList.contains('mobile-open')) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }
    
    openSidebar() {
        this.sidebar.classList.add('mobile-open');
        this.mobileOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
        
        // Update hamburger icon to X
        const icon = this.mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-times';
        }
    }
    
    closeSidebar() {
        this.sidebar.classList.remove('mobile-open');
        this.mobileOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
        
        // Update X icon back to hamburger
        const icon = this.mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-bars';
        }
    }
    
    // Desktop sidebar toggle functionality
    toggleDesktopSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        
        if (this.sidebarCollapsed) {
            this.sidebar.classList.add('desktop-collapsed');
            // Update toggle icon to show expand
            const icon = this.desktopSidebarToggle.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-chevron-right';
            }
        } else {
            this.sidebar.classList.remove('desktop-collapsed');
            // Update toggle icon to show collapse
            const icon = this.desktopSidebarToggle.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-bars';
            }
        }
    }
    
    // Trigger haptic feedback on supported devices
    triggerHapticFeedback(type = 'light') {
        if ('vibrate' in navigator) {
            switch (type) {
                case 'light':
                    navigator.vibrate(10);
                    break;
                case 'medium':
                    navigator.vibrate(20);
                    break;
                case 'heavy':
                    navigator.vibrate(50);
                    break;
                default:
                    navigator.vibrate(10);
            }
        }
    }
    
    // Method to handle chat input focus (prevents zoom on iOS)
    setupIOSInputFix() {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            // Ensure font-size is at least 16px to prevent zoom on iOS
            const computedStyle = window.getComputedStyle(input);
            const fontSize = parseFloat(computedStyle.fontSize);
            if (fontSize < 16) {
                input.style.fontSize = '16px';
            }
        });
    }
    
    // Method to handle touch events for better mobile experience
    setupTouchEnhancements() {
        // Add touch feedback to buttons
        const buttons = document.querySelectorAll('button, .input-btn, .tab-btn, .tree-item');
        buttons.forEach(button => {
            button.addEventListener('touchstart', function(e) {
                this.style.transform = 'scale(0.95)';
                this.style.opacity = '0.8';
                
                // Haptic feedback for supported devices
                if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
            }, { passive: true });
            
            button.addEventListener('touchend', function() {
                this.style.transform = '';
                this.style.opacity = '';
            }, { passive: true });
            
            button.addEventListener('touchcancel', function() {
                this.style.transform = '';
                this.style.opacity = '';
            }, { passive: true });
        });
        
        // Improve scrolling momentum on iOS
        const scrollableElements = document.querySelectorAll(
            '.tree-container, .chat-messages, #editorjs, .tabs-container'
        );
        scrollableElements.forEach(element => {
            element.style.webkitOverflowScrolling = 'touch';
            element.style.overscrollBehavior = 'contain';
        });
        
        // Add pull-to-refresh feel (visual only)
        this.setupPullToRefresh();
    }
    
    // Method to handle orientation changes
    handleOrientationChange() {
        // Close sidebar on orientation change to prevent layout issues
        if (this.isMobileDevice()) {
            this.closeSidebar();
        }
        
        // Update viewport height for iOS Safari
        this.updateViewportHeight();
    }
    
    updateViewportHeight() {
        // Fix for iOS Safari viewport height issues
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    // Method to show mobile-specific notifications
    showMobileNotification(message, type = 'info') {
        if (window.NotificationManager) {
            window.NotificationManager.show(message, type);
        }
    }
    
    // Method to optimize performance on mobile
    optimizeForMobile() {
        // Reduce animations on slower devices
        if (this.isMobile && this.isSlowDevice()) {
            document.body.classList.add('reduced-motion');
        }
    }
    
    isSlowDevice() {
        // Simple heuristic to detect slower devices
        return navigator.hardwareConcurrency <= 2 || 
               (navigator.connection && navigator.connection.effectiveType === 'slow-2g');
    }
    
    // Method to setup pull-to-refresh visual feedback
    setupPullToRefresh() {
        const scrollableElements = document.querySelectorAll('.tree-container, .chat-messages');
        
        scrollableElements.forEach(element => {
            let startY = 0;
            let currentY = 0;
            let pulling = false;
            
            element.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
                pulling = element.scrollTop === 0;
            }, { passive: true });
            
            element.addEventListener('touchmove', (e) => {
                if (!pulling) return;
                
                currentY = e.touches[0].clientY;
                const diff = currentY - startY;
                
                if (diff > 0 && diff < 100) {
                    element.style.transform = `translateY(${diff * 0.5}px)`;
                    element.style.opacity = Math.max(0.7, 1 - diff * 0.003);
                }
            }, { passive: true });
            
            element.addEventListener('touchend', () => {
                if (pulling) {
                    element.style.transform = '';
                    element.style.opacity = '';
                    element.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    
                    setTimeout(() => {
                        element.style.transition = '';
                    }, 300);
                }
                pulling = false;
            }, { passive: true });
        });
    }
    
    // Method to show loading state
    showLoading(element) {
        if (element) {
            element.classList.add('loading');
        }
    }
    
    hideLoading(element) {
        if (element) {
            element.classList.remove('loading');
        }
    }
}

// Initialize mobile manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mobileManager = new MobileManager();
    
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            window.mobileManager.handleOrientationChange();
        }, 100);
    });
    
    // Setup iOS-specific fixes
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        window.mobileManager.setupIOSInputFix();
        window.mobileManager.updateViewportHeight();
        
        window.addEventListener('resize', () => {
            window.mobileManager.updateViewportHeight();
        });
    }
    
    // Setup touch enhancements
    window.mobileManager.setupTouchEnhancements();
    
    // Optimize for mobile
    window.mobileManager.optimizeForMobile();
});

// Export for use in other modules
window.MobileManager = MobileManager;
