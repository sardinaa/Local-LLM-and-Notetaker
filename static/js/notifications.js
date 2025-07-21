/**
 * Notification Utilities
 * Provides consistent notification methods for file operations
 */

// Global notification utility functions
window.NotificationUtils = {
    
    // Show a progress notification for file operations
    showProgress: function(message, icon = 'spinner') {
        if (window.modalManager && window.modalManager.showToast) {
            return window.modalManager.showToast({
                message: message,
                type: 'progress',
                icon: icon,
                duration: 2000
            });
        }
    },
    
    // Show a success notification
    showSuccess: function(message, icon = 'check-circle') {
        if (window.modalManager && window.modalManager.showToast) {
            return window.modalManager.showToast({
                message: message,
                type: 'success',
                icon: icon,
                duration: 2000
            });
        }
    },
    
    // Show an error notification
    showError: function(message, icon = 'exclamation-circle') {
        if (window.modalManager && window.modalManager.showToast) {
            return window.modalManager.showToast({
                message: message,
                type: 'error',
                icon: icon,
                duration: 3000
            });
        }
    },
    
    // Show an info notification
    showInfo: function(message, icon = 'info-circle') {
        if (window.modalManager && window.modalManager.showToast) {
            return window.modalManager.showToast({
                message: message,
                type: 'info',
                icon: icon,
                duration: 2500
            });
        }
    },
    
    // Show a warning notification
    showWarning: function(message, icon = 'exclamation-triangle') {
        if (window.modalManager && window.modalManager.showToast) {
            return window.modalManager.showToast({
                message: message,
                type: 'warning',
                icon: icon,
                duration: 3000
            });
        }
    }
};

// Convenient shortcut functions
window.showProgress = window.NotificationUtils.showProgress;
window.showSuccess = window.NotificationUtils.showSuccess;
window.showError = window.NotificationUtils.showError;
window.showInfo = window.NotificationUtils.showInfo;
window.showWarning = window.NotificationUtils.showWarning;

console.log('Notification utilities loaded');
