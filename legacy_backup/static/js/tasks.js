// Tasks functionality
class TaskManager {
    constructor() {
        this.tasks = [];
        this.initElements();
        this.initEventListeners();
        this.loadTasks();
        this.loadTaskStats();
    }

    initElements() {
        // Quick Add Elements
        this.quickTaskInput = document.getElementById('quickTaskInput');
        this.quickTaskPreview = document.getElementById('quickTaskPreview');
        this.quickTaskSubmit = document.getElementById('quickTaskSubmit');
        this.taskPreview = document.getElementById('taskPreview');
        this.previewText = document.getElementById('previewText');
        this.confidenceFill = document.getElementById('confidenceFill');
        this.confidenceValue = document.getElementById('confidenceValue');
        this.previewEdit = document.getElementById('previewEdit');
        this.previewSave = document.getElementById('previewSave');



        // Stats Elements
        this.taskStats = document.getElementById('taskStats');
        this.totalTasks = document.getElementById('totalTasks');
        this.pendingTasks = document.getElementById('pendingTasks');
        this.completedTasks = document.getElementById('completedTasks');
        this.overdueTasks = document.getElementById('overdueTasks');

        // List Elements
        this.taskList = document.getElementById('taskList');
        this.taskListEmpty = document.getElementById('taskListEmpty');
        this.taskListLoading = document.getElementById('taskListLoading');

        // Modal Elements
        this.taskDetailModal = document.getElementById('taskDetailModal');
        this.taskModalTitle = document.getElementById('taskModalTitle');
        this.taskModalClose = document.getElementById('taskModalClose');
        this.taskModalCancel = document.getElementById('taskModalCancel');
        this.taskModalDelete = document.getElementById('taskModalDelete');
        this.taskModalSave = document.getElementById('taskModalSave');

        // Form Elements
        this.taskForm = document.getElementById('taskForm');
        this.taskTitle = document.getElementById('taskTitle');
        this.taskDescription = document.getElementById('taskDescription');
        this.taskDueDate = document.getElementById('taskDueDate');
        this.taskDueTime = document.getElementById('taskDueTime');
        this.taskPriority = document.getElementById('taskPriority');
        this.taskStatus = document.getElementById('taskStatus');
        this.taskTagsContainer = document.getElementById('taskTagsContainer');
        this.taskTagInput = document.getElementById('taskTagInput');
        this.taskRepeat = document.getElementById('taskRepeat');

        this.currentTask = null;
        this.currentPreview = null;
    }

    // Date helpers to avoid timezone off-by-one issues
    // Parse task date strings safely: treat YYYY-MM-DD as local date at midnight
    parseTaskDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr.includes('T')) {
            // Has time component; interpret as local time
            return new Date(dateStr);
        }
        // Date-only string: construct as local date to avoid UTC shift
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return new Date(dateStr);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    // Format Date object for <input type="date"> in local time
    formatDateForInput(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Format Date object for <input type="time"> in local time (HH:MM)
    formatTimeForInput(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    initEventListeners() {
        // Quick Add Events
        if (this.quickTaskInput) {
            this.quickTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createQuickTask();
                }
            });
        }

        if (this.quickTaskPreview) {
            this.quickTaskPreview.addEventListener('click', () => {
                this.togglePreview();
            });
        }

        if (this.quickTaskSubmit) {
            this.quickTaskSubmit.addEventListener('click', () => {
                this.createQuickTask();
            });
        }

        if (this.previewEdit) {
            this.previewEdit.addEventListener('click', () => {
                this.editPreview();
            });
        }

        if (this.previewSave) {
            this.previewSave.addEventListener('click', () => {
                this.saveFromPreview();
            });
        }



        // Modal Events
        if (this.taskModalClose) {
            this.taskModalClose.addEventListener('click', () => {
                this.closeModal();
            });
        }

        if (this.taskModalCancel) {
            this.taskModalCancel.addEventListener('click', () => {
                this.closeModal();
            });
        }

        if (this.taskModalDelete) {
            this.taskModalDelete.addEventListener('click', () => {
                this.deleteTask();
            });
        }

        if (this.taskModalSave) {
            this.taskModalSave.addEventListener('click', () => {
                this.saveTask();
            });
        }

        // Tag input event
        if (this.taskTagInput) {
            this.taskTagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTag();
                }
            });
        }

        // Modal overlay click to close
        if (this.taskDetailModal) {
            this.taskDetailModal.querySelector('.task-modal-overlay').addEventListener('click', () => {
                this.closeModal();
            });
        }
    }

    // API Methods
    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(endpoint, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'API Error');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            this.showNotification('Error: ' + error.message, 'error');
            throw error;
        }
    }

    // Quick Task Creation
    async createQuickTask() {
        const text = this.quickTaskInput.value.trim();
        if (!text) return;

        try {
            this.showLoading(true);
            const result = await this.apiCall('/api/tasks/quick-create', 'POST', { text });
            
            this.showNotification('Tarea creada exitosamente', 'success');
            this.quickTaskInput.value = '';
            this.hidePreview();
            this.loadTasks();
            this.loadTaskStats();
        } catch (error) {
            console.error('Error creating quick task:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async togglePreview() {
        const text = this.quickTaskInput.value.trim();
        if (!text) {
            this.hidePreview();
            return;
        }

        if (this.taskPreview.classList.contains('is-hidden')) {
            try {
                const result = await this.apiCall('/api/tasks/parse-preview', 'POST', { text });
                this.currentPreview = result.data;
                this.showPreview(result.data);
            } catch (error) {
                console.error('Error generating preview:', error);
            }
        } else {
            this.hidePreview();
        }
    }

    showPreview(preview) {
        this.previewText.innerHTML = this.formatPreviewText(preview);
        
        const confidence = Math.round((preview.confidence || 0) * 100);
        this.confidenceFill.style.width = confidence + '%';
        this.confidenceValue.textContent = confidence + '%';
        
        this.taskPreview.classList.remove('is-hidden');
        this.quickTaskPreview.classList.add('active');
    }

    hidePreview() {
        this.taskPreview.classList.add('is-hidden');
        this.quickTaskPreview.classList.remove('active');
        this.currentPreview = null;
    }

    formatPreviewText(preview) {
        let html = `<strong>Título:</strong> ${preview.title || 'Sin título'}<br>`;
        
        if (preview.description) {
            html += `<strong>Descripción:</strong> ${preview.description}<br>`;
        }
        
        if (preview.due_date) {
            const d = this.parseTaskDate(preview.due_date);
            html += `<strong>Fecha:</strong> ${d ? d.toLocaleString('es-ES') : preview.due_date}<br>`;
        }
        
        if (preview.priority) {
            const priorityEmoji = {
                'urgente': '🔥',
                'alta': '🔴',
                'media': '🟡',
                'baja': '🟢'
            };
            html += `<strong>Prioridad:</strong> ${priorityEmoji[preview.priority] || ''} ${preview.priority}<br>`;
        }
        
        if (preview.tags && preview.tags.length > 0) {
            html += `<strong>Etiquetas:</strong> ${preview.tags.map(tag => `#${tag}`).join(', ')}<br>`;
        }
        
        if (preview.repeat_pattern) {
            html += `<strong>Repetición:</strong> ${preview.repeat_pattern}<br>`;
        }
        
        return html;
    }

    editPreview() {
        if (this.currentPreview) {
            this.openTaskModal(this.currentPreview);
        }
    }

    async saveFromPreview() {
        if (this.currentPreview) {
            try {
                this.showLoading(true);
                const result = await this.apiCall('/api/tasks', 'POST', this.currentPreview);
                
                this.showNotification('Tarea creada exitosamente', 'success');
                this.quickTaskInput.value = '';
                this.hidePreview();
                this.loadTasks();
                this.loadTaskStats();
            } catch (error) {
                console.error('Error saving task from preview:', error);
            } finally {
                this.showLoading(false);
            }
        }
    }

    // Task Management
    async loadTasks() {
        try {
            this.showLoading(true);
            const result = await this.apiCall('/api/tasks');
            this.tasks = result.tasks || [];  // Fixed: was result.data, should be result.tasks
            this.renderTasks();
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.tasks = [];
            this.renderTasks();
        } finally {
            this.showLoading(false);
        }
    }

    async loadTaskStats() {
        try {
            const result = await this.apiCall('/api/tasks/stats');
            this.updateStats(result.stats); // Changed from result.data to result.stats
        } catch (error) {
            console.error('Error loading task stats:', error);
        }
    }

    updateStats(stats) {
        if (!stats) return;
        
        // Calculate total from by_status
        const total = Object.values(stats.by_status || {}).reduce((sum, count) => sum + count, 0);
        
        if (this.totalTasks) this.totalTasks.textContent = total || 0;
        if (this.pendingTasks) this.pendingTasks.textContent = stats.by_status?.pending || 0;
        if (this.completedTasks) this.completedTasks.textContent = stats.by_status?.completed || 0;
        if (this.overdueTasks) this.overdueTasks.textContent = stats.overdue || 0;
    }



    renderTasks() {
        if (!this.taskList) return;

        if (this.tasks.length === 0) {
            this.taskList.style.display = 'none';
            this.taskListEmpty.classList.remove('is-hidden');
        } else {
            this.taskList.style.display = 'block';
            this.taskListEmpty.classList.add('is-hidden');
            
            this.taskList.innerHTML = this.tasks.map(task => this.renderTaskItem(task)).join('');
            
            // Add click events to task items
            this.taskList.querySelectorAll('.task-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.task-checkbox')) return;
                    const taskId = item.dataset.taskId;
                    const task = this.tasks.find(t => t.id === taskId);
                    if (task) {
                        this.openTaskModal(task);
                    }
                });
            });
            
            // Add checkbox events
            this.taskList.querySelectorAll('.task-checkbox').forEach(checkbox => {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const taskId = checkbox.dataset.taskId;
                    const newStatus = checkbox.checked ? 'completed' : 'pending';
                    this.updateTaskStatus(taskId, newStatus);
                });
            });
        }
    }



    renderTaskItem(task) {
        const isCompleted = task.status === 'completed';
        const isOverdue = task.due_date && this.parseTaskDate(task.due_date) < new Date() && !isCompleted;
        
        const priorityEmoji = {
            'urgente': '🔥',
            'alta': '🔴',
            'media': '🟡',
            'baja': '🟢'
        };
        
        const statusLabels = {
            'pending': 'Pendiente',
            'in_progress': 'En progreso',
            'completed': 'Completado',
            'cancelled': 'Cancelado'
        };
        
        const dueDate = task.due_date ? this.parseTaskDate(task.due_date) : null;
        const dueDateStr = dueDate ? dueDate.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : '';
        
        return `
            <div class="task-item ${isCompleted ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" data-task-id="${task.id}">
                <div class="task-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${isCompleted ? 'checked' : ''}>
                        <h4 class="task-title ${isCompleted ? 'completed' : ''}">${task.title}</h4>
                    </div>
                    ${task.priority ? `<span class="task-priority ${task.priority}">${priorityEmoji[task.priority] || ''} ${task.priority}</span>` : ''}
                </div>
                ${task.description ? `<div class="task-body"><p class="task-description">${task.description}</p></div>` : ''}
                ${task.tags && task.tags.length > 0 ? `
                    <div class="task-tags">
                        ${task.tags.map(tag => `<span class="task-tag">#${typeof tag === 'object' ? tag.name : tag}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="task-footer">
                    <div class="task-due-date ${isOverdue ? 'overdue' : ''}">
                        ${dueDate ? `<i class="fas fa-clock"></i> ${dueDateStr}` : ''}
                    </div>
                    <span class="task-status ${task.status}">${statusLabels[task.status] || task.status}</span>
                </div>
            </div>
        `;
    }

    // Task Modal
    openTaskModal(task = null) {
        this.currentTask = task;
        
        if (task) {
            this.taskModalTitle.textContent = 'Editar tarea';
            this.taskModalDelete.style.display = 'block';
            this.fillTaskForm(task);
        } else {
            this.taskModalTitle.textContent = 'Nueva tarea';
            this.taskModalDelete.style.display = 'none';
            this.clearTaskForm();
        }
        
        this.taskDetailModal.classList.remove('is-hidden');
    }

    closeModal() {
        this.taskDetailModal.classList.add('is-hidden');
        this.currentTask = null;
        this.clearTaskForm();
    }

    fillTaskForm(task) {
        this.taskTitle.value = task.title || '';
        this.taskDescription.value = task.description || '';
        
        if (task.due_date) {
            const original = task.due_date;
            const dueDate = this.parseTaskDate(original);
            this.taskDueDate.value = this.formatDateForInput(dueDate);
            // Only set time if original string had a time component
            if (typeof original === 'string' && original.includes('T')) {
                this.taskDueTime.value = this.formatTimeForInput(dueDate);
            } else {
                this.taskDueTime.value = '';
            }
        } else {
            this.taskDueDate.value = '';
            this.taskDueTime.value = '';
        }
        
        this.taskPriority.value = task.priority || '';
        this.taskStatus.value = task.status || 'pending';
        this.taskRepeat.value = task.repeat_pattern || '';
        
        // Handle tags
        this.clearTags();
        if (task.tags) {
            task.tags.forEach(tag => this.addTagToContainer(tag));
        }
    }

    clearTaskForm() {
        this.taskForm.reset();
        this.clearTags();
    }

    // Tag Management
    addTag() {
        const tagText = this.taskTagInput.value.trim();
        if (tagText) {
            this.addTagToContainer(tagText);
            this.taskTagInput.value = '';
        }
    }

    addTagToContainer(tagText) {
        const tagElement = document.createElement('div');
        tagElement.className = 'tag-item';
        tagElement.innerHTML = `
            <span>${tagText}</span>
            <button type="button" class="tag-remove" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        this.taskTagsContainer.appendChild(tagElement);
    }

    clearTags() {
        this.taskTagsContainer.innerHTML = '';
    }

    getTagsFromContainer() {
        return Array.from(this.taskTagsContainer.querySelectorAll('.tag-item span'))
            .map(span => span.textContent.trim())
            .filter(tag => tag);
    }

    // Task Operations
    async saveTask() {
        try {
            const taskData = {
                title: this.taskTitle.value.trim(),
                description: this.taskDescription.value.trim(),
                status: this.taskStatus.value,
                priority: this.taskPriority.value || null,
                repeat_pattern: this.taskRepeat.value || null,
                tags: this.getTagsFromContainer()
            };

            if (this.taskDueDate.value) {
                let dueDate = this.taskDueDate.value;
                if (this.taskDueTime.value) {
                    dueDate += 'T' + this.taskDueTime.value + ':00';
                } else {
                    dueDate += 'T09:00:00';
                }
                taskData.due_date = dueDate;
            }

            if (!taskData.title) {
                this.showNotification('El título es requerido', 'error');
                return;
            }

            this.showLoading(true);

            if (this.currentTask) {
                // Update existing task
                await this.apiCall(`/api/tasks/${this.currentTask.id}`, 'PUT', taskData);
                this.showNotification('Tarea actualizada exitosamente', 'success');
            } else {
                // Create new task
                await this.apiCall('/api/tasks', 'POST', taskData);
                this.showNotification('Tarea creada exitosamente', 'success');
            }

            this.closeModal();
            this.loadTasks();
            this.loadTaskStats();
        } catch (error) {
            console.error('Error saving task:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async deleteTask() {
        if (!this.currentTask) return;

        if (!confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
            return;
        }

        try {
            this.showLoading(true);
            await this.apiCall(`/api/tasks/${this.currentTask.id}`, 'DELETE');
            this.showNotification('Tarea eliminada exitosamente', 'success');
            this.closeModal();
            this.loadTasks();
            this.loadTaskStats();
        } catch (error) {
            console.error('Error deleting task:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async updateTaskStatus(taskId, status) {
        try {
            await this.apiCall(`/api/tasks/${taskId}`, 'PUT', { status });
            this.showNotification('Estado de tarea actualizado', 'success');
            this.loadTasks();
            this.loadTaskStats();
        } catch (error) {
            console.error('Error updating task status:', error);
        }
    }

    // Utility Methods

    showLoading(show) {
        if (!this.taskListLoading) return;
        if (show) {
            this.taskListLoading.classList.remove('is-hidden');
        } else {
            this.taskListLoading.classList.add('is-hidden');
        }
    }

    showNotification(message, type = 'info') {
        // Create a simple notification system
        const notification = document.createElement('div');
        notification.className = `task-notification task-notification-${type}`;
        notification.textContent = message;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1001;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize TaskManager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on a page with task elements
    if (document.getElementById('tasksSection')) {
        window.taskManager = new TaskManager();
    }
});

// Add notification animations to head
const taskNotificationStyles = document.createElement('style');
taskNotificationStyles.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(taskNotificationStyles);
