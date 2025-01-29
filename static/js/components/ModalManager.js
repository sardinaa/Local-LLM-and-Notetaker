export class ModalManager {
    constructor() {
      this.modalBackdrop = document.getElementById('modalBackdrop');
    }
  
    showModal(modalId, context = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with ID "${modalId}" not found.`);
            return;
        }

        // If context includes a message or input field value, update it dynamically
        if (context.message) {
            const messageElement = modal.querySelector('.modal-message');
            if (messageElement) messageElement.textContent = context.message;
        }

        if (context.inputValue) {
            const inputElement = modal.querySelector('.modal-input');
            if (inputElement) inputElement.value = context.inputValue;
        }

        modal.style.display = 'block';
        this.modalBackdrop.style.display = 'block';

        // Attach confirm handler dynamically if provided
        if (context.confirmHandler) {
            const confirmButton = modal.querySelector('.modal-btn.confirm');
            if (confirmButton) {
                const newButton = confirmButton.cloneNode(true);
                newButton.addEventListener('click', context.confirmHandler);
                confirmButton.parentNode.replaceChild(newButton, confirmButton);
            }
        }
    }
  
    closeModals() {
      document.querySelectorAll('.custom-modal').forEach((modal) => {
        modal.style.display = 'none';
      });
      this.modalBackdrop.style.display = 'none';
    }

    showBackgroundOptions() {
        const colorPicker = document.getElementById('colorPicker');
        const saveBackgroundBtn = document.getElementById('save-background-btn');
    
        if (!colorPicker) {
            console.error('colorPicker is null');
            return;
        }
        if (!saveBackgroundBtn) {
            console.error('saveBackgroundBtn is null');
            return;
        }
    
        colorPicker.addEventListener('change', (event) => {
            document.style.backgroundColor = event.target.value;
        });
    
        saveBackgroundBtn.addEventListener('click', () => {
            console.log('Background color saved:', colorPicker.value);
            this.closeModals();
        });
    }    
  }
  