/**
 * Modern Task Manager with Time Buckets and Integrated Right Panel
 */
class TaskManager {
    constructor() {
        this.tasks = [];
        this.selectedTask = null;
        this.bucketStates = {
            today: true,
            tomorrow: true,
            next7days: true,
            completed: false
        };
        // Date/time picker state
        this.dtState = {
            viewYear: null,
            viewMonth: null, // 0-11
            selectedDate: null, // 'YYYY-MM-DD'
            hour: 0,
            minute: 0,
            repeat: ''
        };
        
        this.initElements();
        this.initEventListeners();
        this.initEditorJS();
        this.loadTasks();
        this.restoreBucketStates();
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

        // Bucket Elements
        this.todayTasks = document.getElementById('todayTasks');
        this.tomorrowTasks = document.getElementById('tomorrowTasks');
        this.next7daysTasks = document.getElementById('next7daysTasks');
        this.completedTasks = document.getElementById('completedTasks');

        // Count Elements
        this.todayCount = document.getElementById('todayCount');
        this.tomorrowCount = document.getElementById('tomorrowCount');
        this.next7daysCount = document.getElementById('next7daysCount');
        this.completedCount = document.getElementById('completedCount');

        // Right Panel Elements
        this.taskDetailsPanel = document.getElementById('taskDetailsPanel');
        this.panelEmptyState = document.getElementById('panelEmptyState');
        this.taskCompleteToggle = document.getElementById('taskCompleteToggle');
        this.taskDateTimeDisplay = document.getElementById('taskDateTimeDisplay');
        this.taskTitleInput = document.getElementById('taskTitleInput');
        this.taskNotesEditor = document.getElementById('taskNotesEditor');
        this.taskTagsDisplay = document.getElementById('taskTagsDisplay');
        this.taskTagInput = document.getElementById('taskTagInput');
        this.prioritySelector = document.getElementById('prioritySelector');
        this.filesSection = document.getElementById('filesSection');
        this.filesCount = document.getElementById('filesCount');
        this.filesCountBtn = document.getElementById('filesCountBtn');
        this.filesQuickPreview = document.getElementById('filesQuickPreview');
        this.closePreviewBtn = document.getElementById('closePreviewBtn');
        this.quickPreviewList = document.getElementById('quickPreviewList');
        this.noAttachments = document.getElementById('noAttachments');
        this.addReferenceBtn = document.getElementById('addReferenceBtn');
        this.fileInput = document.getElementById('fileInput');
        
        // Reference selection modal elements
        this.referenceSelectionModal = document.getElementById('referenceSelectionModal');
        this.referenceSelectionModalClose = document.getElementById('referenceSelectionModalClose');
        this.uploadFilesBtn = document.getElementById('uploadFilesBtn');
        this.linkNotesBtn = document.getElementById('linkNotesBtn');
        this.referencesContainer = document.getElementById('referencesContainer');
        this.referencesCount = document.getElementById('referencesCount');
        this.totalReferencesText = document.getElementById('totalReferencesText');
        this.referenceModalCancel = document.getElementById('referenceModalCancel');
        
        // Note selection modal elements
        this.noteSelectionModal = document.getElementById('noteSelectionModal');
        this.noteSelectionModalClose = document.getElementById('noteSelectionModalClose');
        this.noteSearchInput = document.getElementById('noteSearchInput');
        this.notesList = document.getElementById('notesList');
        this.noteSelectionCancel = document.getElementById('noteSelectionCancel');
        this.noteSelectionConfirm = document.getElementById('noteSelectionConfirm');

        // Date Time Picker Elements (new toggle UI)
        this.dateTimePicker = document.getElementById('dateTimePicker');
        this.hourToggleBtn = document.getElementById('hourToggleBtn');
        this.repeatToggleBtn = document.getElementById('repeatToggleBtn');
        this.dtDatePanel = document.getElementById('dtDatePanel');
        this.dtTimePanel = document.getElementById('dtTimePanel');
        this.setTimeBtn = document.getElementById('setTimeBtn');
        this.calPrev = document.getElementById('calPrev');
        this.calNext = document.getElementById('calNext');
        this.calMonthLabel = document.getElementById('calMonthLabel');
        this.calendarGrid = document.getElementById('calendarGrid');
        this.repeatMenu = document.getElementById('repeatMenu');
        // Month/year picker elements
        this.monthYearPicker = document.getElementById('monthYearPicker');
        this.yearInput = document.getElementById('yearInput');
        this.yearUp = document.getElementById('yearUp');
        this.yearDown = document.getElementById('yearDown');
        this.monthsGrid = document.getElementById('monthsGrid');
        this.timeHour = document.getElementById('timeHour');
        this.timeMinute = document.getElementById('timeMinute');
        this.hourMinus = document.getElementById('hourMinus');
        this.hourPlus = document.getElementById('hourPlus');
        this.minuteMinus = document.getElementById('minuteMinus');
        this.minutePlus = document.getElementById('minutePlus');

        this.currentPreview = null;
        this.saveTimeout = null;
        this.selectedTaskIndex = -1;
        this.selectedNotes = new Set();
        this.allNotes = [];
        this.selectedNotes = new Set();
        this.allNotes = [];
    }

    // ===== Local date helpers to avoid timezone shifts =====
    localYMD(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
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

        // Bucket Toggle Events
        document.querySelectorAll('[data-toggle]').forEach(header => {
            header.addEventListener('click', (e) => {
                const bucket = e.currentTarget.dataset.toggle;
                this.toggleBucket(bucket);
            });
        });

        // Right Panel Events
        if (this.taskCompleteToggle) {
            this.taskCompleteToggle.addEventListener('change', () => {
                this.toggleTaskCompletion();
            });
        }

        if (this.taskDateTimeDisplay) {
            this.taskDateTimeDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDateTimePicker();
            });
        }

        // Date Time Picker Events
        const dateTimePicker = this.dateTimePicker;

        // Hour Toggle Button
        if (this.hourToggleBtn) {
            this.hourToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleHourPanel();
            });
        }

        // Repeat Toggle Button
        if (this.repeatToggleBtn) {
            this.repeatToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleRepeatPanel();
            });
        }

        // Set Time Button
        if (this.setTimeBtn) {
            this.setTimeBtn.addEventListener('click', () => {
                this.setTime();
            });
        }

        // Calendar navigation
        if (this.calPrev) this.calPrev.addEventListener('click', () => { this.shiftCalendar(-1); });
        if (this.calNext) this.calNext.addEventListener('click', () => { this.shiftCalendar(1); });

        // Repeat menu
        if (this.repeatMenu) {
            this.repeatMenu.querySelectorAll('.repeat-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    this.dtState.repeat = opt.dataset.repeat || '';
                    this.updateRepeatToggleButton();
                    this.repeatMenu.classList.add('is-hidden');
                    this.autoSaveDate();
                });
            });
        }

        // Time controls
        if (this.hourMinus) this.hourMinus.addEventListener('click', () => this.adjustHour(-1));
        if (this.hourPlus) this.hourPlus.addEventListener('click', () => this.adjustHour(1));
        if (this.minuteMinus) this.minuteMinus.addEventListener('click', () => this.adjustMinute(-5));
        if (this.minutePlus) this.minutePlus.addEventListener('click', () => this.adjustMinute(5));
        
        // Manual time input handlers
        if (this.timeHour) {
            this.timeHour.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 0 && value <= 23) {
                    this.dtState.hour = value;
                    this.updateHourToggleButton();
                }
            });
            this.timeHour.addEventListener('blur', (e) => {
                // Ensure proper formatting and valid range
                const value = parseInt(e.target.value, 10);
                const validValue = Math.max(0, Math.min(23, isNaN(value) ? 0 : value));
                this.dtState.hour = validValue;
                e.target.value = String(validValue).padStart(2, '0');
                this.updateHourToggleButton();
            });
        }
        
        if (this.timeMinute) {
            this.timeMinute.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 0 && value <= 59) {
                    this.dtState.minute = value;
                    this.updateHourToggleButton();
                }
            });
            this.timeMinute.addEventListener('blur', (e) => {
                // Ensure proper formatting and valid range
                const value = parseInt(e.target.value, 10);
                const validValue = Math.max(0, Math.min(59, isNaN(value) ? 0 : value));
                this.dtState.minute = validValue;
                e.target.value = String(validValue).padStart(2, '0');
                this.updateHourToggleButton();
            });
        }
        
        // Add keydown handlers for tab navigation
        if (this.timeHour) {
            this.timeHour.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.timeMinute) {
                        this.timeMinute.focus();
                        this.timeMinute.select();
                    }
                }
            });
        }
        
        if (this.timeMinute) {
            this.timeMinute.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    if (this.timeHour) {
                        this.timeHour.focus();
                        this.timeHour.select();
                    }
                }
            });
        }

        // Month/year label toggles picker
        if (this.calMonthLabel) {
            this.calMonthLabel.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.monthYearPicker) {
                    const willShow = this.monthYearPicker.classList.contains('is-hidden');
                    // Sync year input
                    if (this.yearInput) this.yearInput.value = String(this.dtState.viewYear || new Date().getFullYear());
                    // Highlight current month
                    if (this.monthsGrid) {
                        this.monthsGrid.querySelectorAll('button').forEach(btn => {
                            const m = Number(btn.dataset.month);
                            btn.classList.toggle('active', m === (this.dtState.viewMonth || 0));
                        });
                    }
                    this.monthYearPicker.classList.toggle('is-hidden', !willShow);
                }
            });
        }
        if (this.yearUp) this.yearUp.addEventListener('click', () => { this.setPickerYear((this.dtState.viewYear || new Date().getFullYear()) + 1); });
        if (this.yearDown) this.yearDown.addEventListener('click', () => { this.setPickerYear((this.dtState.viewYear || new Date().getFullYear()) - 1); });
        if (this.yearInput) this.yearInput.addEventListener('change', () => {
            const y = parseInt(this.yearInput.value, 10);
            if (!isNaN(y)) this.setPickerYear(y);
        });
        if (this.monthsGrid) {
            this.monthsGrid.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const m = Number(btn.dataset.month);
                    this.dtState.viewMonth = Math.max(0, Math.min(11, m));
                    this.monthYearPicker.classList.add('is-hidden');
                    this.renderCalendar();
                });
            });
        }

        // Close menus on outside click
        document.addEventListener('click', (e) => {
            if (dateTimePicker && !dateTimePicker.contains(e.target) && e.target !== this.taskDateTimeDisplay) {
                dateTimePicker.style.display = 'none';
                this.hideTimePanel();
                this.hideRepeatPanel();
            }
            if (this.repeatMenu && !this.repeatMenu.contains(e.target) && e.target !== this.repeatToggleBtn) {
                this.repeatMenu.classList.add('is-hidden');
            }
            if (this.monthYearPicker && !this.monthYearPicker.contains(e.target) && e.target !== this.calMonthLabel) {
                this.monthYearPicker.classList.add('is-hidden');
            }

        });

        if (this.taskTitleInput) {
            this.taskTitleInput.addEventListener('input', () => {
                this.scheduleAutoSave();
            });
            this.taskTitleInput.addEventListener('blur', () => {
                this.saveTaskChanges();
            });
        }

        if (this.taskTagInput) {
            this.taskTagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTag();
                }
            });
        }

        // Reference system event listeners
        if (this.addReferenceBtn) {
            this.addReferenceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showReferenceSelectionModal();
            });
        }

        // Quick preview event listeners
        if (this.filesCountBtn) {
            this.filesCountBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleQuickPreview();
            });
        }

        if (this.closePreviewBtn) {
            this.closePreviewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideQuickPreview();
            });
        }

        // Close quick preview when clicking outside
        document.addEventListener('click', (e) => {
            if (this.filesQuickPreview && 
                this.filesQuickPreview.style.display !== 'none' &&
                !this.filesSection.contains(e.target)) {
                this.hideQuickPreview();
            }
        });

        // Reference selection modal event listeners
        if (this.referenceSelectionModalClose) {
            this.referenceSelectionModalClose.addEventListener('click', () => {
                this.hideReferenceSelectionModal();
            });
        }

        if (this.referenceModalCancel) {
            this.referenceModalCancel.addEventListener('click', () => {
                this.hideReferenceSelectionModal();
            });
        }

        if (this.uploadFilesBtn) {
            this.uploadFilesBtn.addEventListener('click', () => {
                this.fileInput.click();
            });
        }

        if (this.linkNotesBtn) {
            this.linkNotesBtn.addEventListener('click', () => {
                this.showNoteSelectionModal();
            });
        }

        if (this.referenceSelectionModal) {
            this.referenceSelectionModal.addEventListener('click', (e) => {
                if (e.target === this.referenceSelectionModal) {
                    this.hideReferenceSelectionModal();
                }
            });
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', () => {
                this.handleFileUpload();
            });
        }

        // Note selection modal event listeners
        if (this.noteSelectionModalClose) {
            this.noteSelectionModalClose.addEventListener('click', () => {
                this.hideNoteSelectionModal();
            });
        }

        if (this.noteSelectionCancel) {
            this.noteSelectionCancel.addEventListener('click', () => {
                this.hideNoteSelectionModal();
            });
        }

        if (this.noteSelectionModal) {
            this.noteSelectionModal.addEventListener('click', (e) => {
                if (e.target === this.noteSelectionModal) {
                    this.hideNoteSelectionModal();
                }
            });
        }

        if (this.noteSelectionConfirm) {
            this.noteSelectionConfirm.addEventListener('click', () => {
                this.confirmNoteSelection();
            });
        }

        if (this.noteSearchInput) {
            this.noteSearchInput.addEventListener('input', () => {
                this.filterNotes();
            });
        }

        // Priority buttons
        if (this.prioritySelector) {
            this.prioritySelector.querySelectorAll('.priority-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setPriority(btn.dataset.priority || '');
                });
            });
        }

        // Keyboard Navigation
        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateTasks(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateTasks(1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.selectCurrentTask();
            }
        });

        // Priority Selector
        this.initPrioritySelector();
    }

    initPrioritySelector() {
        const priorities = [
            { value: '', label: 'Sin prioridad', class: '' },
            { value: 'baja', label: '🟢 Baja', class: 'baja' },
            { value: 'media', label: '🟡 Media', class: 'media' },
            { value: 'alta', label: '🔴 Alta', class: 'alta' },
            { value: 'urgente', label: '🔥 Urgente', class: 'urgente' }
        ];

        const button = this.prioritySelector.querySelector('.priority-btn');
        button.addEventListener('click', () => {
            this.showPriorityDropdown(priorities);
        });
    }

    showPriorityDropdown(priorities) {
        // Create dropdown if it doesn't exist
        let dropdown = this.prioritySelector.querySelector('.priority-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'priority-dropdown';
            dropdown.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--surface);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-5);
                box-shadow: var(--shadow-1);
                z-index: 1000;
                max-height: 200px;
                overflow-y: auto;
            `;
            this.prioritySelector.appendChild(dropdown);
        }

        dropdown.innerHTML = priorities.map(priority => `
            <div class="priority-option ${priority.class}" data-value="${priority.value}">
                ${priority.label}
            </div>
        `).join('');

        dropdown.style.display = 'block';

        // Add click events
        dropdown.querySelectorAll('.priority-option').forEach(option => {
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                this.setPriority(value);
                dropdown.style.display = 'none';
            });
        });

        // Close on outside click
        const closeDropdown = (e) => {
            if (!this.prioritySelector.contains(e.target)) {
                dropdown.style.display = 'none';
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 0);
    }

    async initEditorJS() {
        // Initialize EditorJS for task notes (simplified version)
        try {
            // Prevent duplicate initialization
            if (this.notesEditor) {
                await this.notesEditor.destroy();
                this.notesEditor = null;
            }
            
            if (typeof EditorJS !== 'undefined') {
                this.notesEditor = new EditorJS({
                    holder: 'taskNotesEditor',
                    tools: {
                        header: {
                            class: Header,
                            config: {
                                levels: [2, 3],
                                defaultLevel: 2
                            }
                        },
                        paragraph: {
                            class: Paragraph
                        },
                        checklist: {
                            class: Checklist
                        }
                    },
                    placeholder: 'Agregar notas...',
                    onChange: () => {
                        this.scheduleAutoSave();
                    }
                });
            }
        } catch (error) {
            console.warn('EditorJS not available, using fallback textarea:', error);
            // Fallback to simple textarea
            const editorContainer = document.getElementById('taskNotesEditor');
            if (editorContainer) {
                editorContainer.innerHTML = '<textarea class="fallback-textarea" placeholder="Agregar notas..."></textarea>';
            }
        }
    }

    // ===== API Methods =====
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

    // ===== Quick Task Creation =====
    async createQuickTask() {
        const text = this.quickTaskInput.value.trim();
        if (!text) return;

        try {
            const result = await this.apiCall('/api/tasks/quick-create', 'POST', { text });
            
            this.showNotification('Tarea creada exitosamente', 'success');
            this.quickTaskInput.value = '';
            this.hidePreview();
            this.loadTasks();
        } catch (error) {
            console.error('Error creating quick task:', error);
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
            html += `<strong>Fecha:</strong> ${new Date(preview.due_date).toLocaleString('es-ES')}<br>`;
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
        
        return html;
    }

    // ===== Task Loading and Rendering =====
    async loadTasks() {
        try {
            const result = await this.apiCall('/api/tasks');
            this.tasks = result.tasks || [];
            this.renderTaskBuckets();
            this.updateCounts();
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.tasks = [];
            this.renderTaskBuckets();
        }
    }

    async loadTaskStats() {
        try {
            const result = await this.apiCall('/api/tasks/stats');
            this.updateTaskStats(result);
        } catch (error) {
            console.error('Error loading task stats:', error);
            // Silently fail for stats as it's not critical
        }
    }

    updateTaskStats(stats) {
        // Update any stats display if needed
        // This can be expanded later to show statistics in the UI
        console.log('Task stats loaded:', stats);
    }

    renderTaskBuckets() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        const next7days = new Date(today);
        next7days.setDate(today.getDate() + 7);

        // Categorize tasks
        const buckets = {
            today: [],
            tomorrow: [],
            next7days: [],
            completed: []
        };

        this.tasks.forEach((task, index) => {
            task._index = index; // Store original index
            
            if (task.status === 'completed') {
                buckets.completed.push(task);
                return;
            }

            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                dueDate.setHours(0, 0, 0, 0);
                
                if (dueDate.getTime() === today.getTime()) {
                    buckets.today.push(task);
                } else if (dueDate.getTime() === tomorrow.getTime()) {
                    buckets.tomorrow.push(task);
                } else if (dueDate <= next7days) {
                    buckets.next7days.push(task);
                } else {
                    buckets.next7days.push(task); // Future tasks go to next7days
                }
            } else {
                buckets.today.push(task); // Tasks without date go to today
            }
        });

        // Render each bucket
        this.renderBucket('today', buckets.today);
        this.renderBucket('tomorrow', buckets.tomorrow);
        this.renderBucket('next7days', buckets.next7days);
        this.renderBucket('completed', buckets.completed);
    }

    renderBucket(bucketName, tasks) {
        const container = this[bucketName + 'Tasks'];
        if (!container) return;

        container.innerHTML = tasks.map(task => this.renderTaskRow(task)).join('');
        
        // Add click events to task rows
        container.querySelectorAll('.task-row').forEach((row, index) => {
            const task = tasks[index];
            
            row.addEventListener('click', (e) => {
                if (e.target.closest('.task-row-checkbox')) return;
                this.selectTask(task);
            });
            
            // Checkbox events
            const checkbox = row.querySelector('.task-row-checkbox input');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleTaskStatus(task, checkbox.checked);
                });
            }
        });
    }

    renderTaskRow(task) {
        const isCompleted = task.status === 'completed';
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const now = new Date();
        const isOverdue = dueDate && dueDate < now && !isCompleted;
        
        const timeStr = dueDate ? dueDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';

        // Create inline meta elements for checklist style
        const metaElements = [];
        if (timeStr) {
            metaElements.push(`<span class="task-row-time ${isOverdue ? 'overdue' : ''}">${timeStr}</span>`);
        }
        if (task.priority) {
            metaElements.push(`<span class="task-row-priority ${task.priority}">${task.priority}</span>`);
        }
        if (task.tags && task.tags.length > 0) {
            task.tags.slice(0, 3).forEach(tag => {
                const tagName = typeof tag === 'object' ? tag.name : tag;
                metaElements.push(`<span class="task-row-tag">${tagName}</span>`);
            });
            if (task.tags.length > 3) {
                metaElements.push(`<span class="task-row-tag">+${task.tags.length - 3}</span>`);
            }
        }
        
        const metaStr = metaElements.length > 0 ? metaElements.join('') : '';

        return `
            <div class="task-row ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="task-row-checkbox ${isCompleted ? 'checked' : ''}" 
                     onclick="event.stopPropagation(); window.taskManager.toggleTaskCompletion(${task.id})">
                    ${isCompleted ? '✓' : ''}
                </div>
                <div class="task-row-main">
                    <div class="task-row-content">
                        <span class="task-row-title ${isCompleted ? 'completed' : ''}">${task.title}</span>
                    </div>
                    ${metaElements.length > 0 ? `<div class="task-row-meta">${metaStr}</div>` : ''}
                </div>
            </div>
        `;
    }

    async toggleTaskCompletion(taskId) {
        try {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) return;

            const newStatus = task.status === 'completed' ? 'pending' : 'completed';
            
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...task,
                    status: newStatus
                })
            });

            if (response.ok) {
                task.status = newStatus;
                this.renderTasks();
                this.updateCounts();
            }
        } catch (error) {
            console.error('Error toggling task completion:', error);
        }
    }

    updateCounts() {
        const counts = {
            today: 0,
            tomorrow: 0,
            next7days: 0,
            completed: 0
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        const next7days = new Date(today);
        next7days.setDate(today.getDate() + 7);

        this.tasks.forEach(task => {
            if (task.status === 'completed') {
                counts.completed++;
                return;
            }

            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                dueDate.setHours(0, 0, 0, 0);
                
                if (dueDate.getTime() === today.getTime()) {
                    counts.today++;
                } else if (dueDate.getTime() === tomorrow.getTime()) {
                    counts.tomorrow++;
                } else if (dueDate <= next7days) {
                    counts.next7days++;
                } else {
                    counts.next7days++;
                }
            } else {
                counts.today++;
            }
        });

        this.todayCount.textContent = counts.today;
        this.tomorrowCount.textContent = counts.tomorrow;
        this.next7daysCount.textContent = counts.next7days;
        this.completedCount.textContent = counts.completed;
    }

    // ===== Task Selection and Right Panel =====
    selectTask(task) {
        this.selectedTask = task;
        
        // Update visual selection
        document.querySelectorAll('.task-row').forEach(row => {
            row.classList.remove('selected');
        });
        document.querySelector(`[data-task-id="${task.id}"]`)?.classList.add('selected');
        
        // Show right panel
        this.showTaskPanel(task);
    }

    showTaskPanel(task) {
        this.taskDetailsPanel.classList.remove('is-hidden');
        this.panelEmptyState.classList.add('is-hidden');
        
        // Update panel content
        this.taskCompleteToggle.checked = task.status === 'completed';
        this.updateDateTimeDisplay(task);
        this.taskTitleInput.value = task.title || '';
        
        // Update tags
        this.renderTags(task.tags || []);
        
        // Update priority
        this.updatePriorityDisplay(task.priority);
        
        // Load notes if EditorJS is available
        this.loadTaskNotes(task);
        
        // Update files/references display
        this.updateFilesDisplay(task.references || task.files || []);
    }

    async loadTaskNotes(task) {
        try {
            // Re-initialize EditorJS for this specific task to prevent duplication
            if (this.notesEditor) {
                await this.notesEditor.destroy();
                this.notesEditor = null;
            }
            
            // Clear the editor container
            const editorContainer = document.getElementById('taskNotesEditor');
            if (editorContainer) {
                editorContainer.innerHTML = '';
            }
            
            // Initialize fresh EditorJS instance
            if (typeof EditorJS !== 'undefined') {
                this.notesEditor = new EditorJS({
                    holder: 'taskNotesEditor',
                    data: task.notes || { blocks: [] },
                    tools: {
                        header: {
                            class: Header,
                            config: {
                                levels: [2, 3],
                                defaultLevel: 2
                            }
                        },
                        paragraph: {
                            class: Paragraph
                        },
                        checklist: {
                            class: Checklist
                        }
                    },
                    placeholder: 'Agregar notas...',
                    onChange: () => {
                        this.scheduleAutoSave();
                    }
                });
                
                await this.notesEditor.isReady;
            }
        } catch (error) {
            console.warn('EditorJS initialization failed, using fallback:', error);
            // Fallback to textarea with task notes
            const editorContainer = document.getElementById('taskNotesEditor');
            if (editorContainer) {
                const notesText = task.notes?.blocks?.[0]?.data?.text || '';
                editorContainer.innerHTML = `<textarea class="fallback-textarea" placeholder="Agregar notas...">${notesText}</textarea>`;
            }
        }
    }

    updateDateTimeDisplay(task) {
        const dateSpan = this.taskDateTimeDisplay.querySelector('.task-date');
        const timeSpan = this.taskDateTimeDisplay.querySelector('.task-time');
        
        if (task.due_date) {
            const dueDate = new Date(task.due_date);
            dateSpan.textContent = dueDate.toLocaleDateString('es-ES');
            timeSpan.textContent = dueDate.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            dateSpan.textContent = 'Sin fecha';
            timeSpan.textContent = '';
        }
    }

    renderTags(tags) {
        this.taskTagsDisplay.innerHTML = tags.map(tag => {
            const tagName = typeof tag === 'object' ? tag.name : tag;
            return `
                <div class="tag-pill">
                    <span>${tagName}</span>
                    <button class="tag-remove" data-tag="${tagName}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        // Add remove events
        this.taskTagsDisplay.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeTag(btn.dataset.tag);
            });
        });
    }

    updatePriorityDisplay(priority) {
        // Remove active class from all buttons
        this.prioritySelector.querySelectorAll('.priority-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to the selected priority button
        const activeBtn = this.prioritySelector.querySelector(`[data-priority="${priority || ''}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    updateFilesDisplay(references) {
        // Handle both old format (files only) and new format (files and notes)
        const files = references.files || [];
        const notes = references.notes || [];
        const legacyFiles = Array.isArray(references) ? references : [];
        
        // Use legacy format if new format is not available
        const allFiles = files.length > 0 ? files : legacyFiles;
        const totalCount = allFiles.length + notes.length;
        
        if (this.filesCount) {
            this.filesCount.textContent = totalCount.toString();
            this.filesCount.style.display = totalCount > 0 ? 'inline' : 'none';
        }
        
        // Enable/disable the files count button
        if (this.filesCountBtn) {
            this.filesCountBtn.disabled = totalCount === 0;
            this.filesCountBtn.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        // Store references for modal display
        if (this.selectedTask) {
            this.selectedTask.references = {
                files: allFiles,
                notes: notes
            };
        }
    }

    updateReferencesDisplay() {
        if (!this.selectedTask || !this.referencesContainer) return;
        
        const references = this.selectedTask.references || { files: [], notes: [] };
        const files = references.files || [];
        const notes = references.notes || [];
        const totalCount = files.length + notes.length;
        
        // Update count
        if (this.referencesCount) {
            this.referencesCount.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}`;
        }
        
        // Update footer text
        if (this.totalReferencesText) {
            this.totalReferencesText.textContent = totalCount > 0 ? 
                `${totalCount} reference${totalCount !== 1 ? 's' : ''} attached to this task` :
                'Select files and notes to reference in this task';
        }
        
        if (totalCount === 0) {
            this.referencesContainer.innerHTML = `
                <div class="references-empty-state">
                    <div class="references-empty-icon">
                        <i class="fas fa-paperclip"></i>
                    </div>
                    <div class="references-empty-text">No references attached</div>
                    <div class="references-empty-subtext">Upload files or link notes to get started</div>
                </div>
            `;
            return;
        }
        
        const fileItems = files.map(file => `
            <div class="reference-item">
                <div class="reference-item-left" onclick="window.taskManager.openReference('file', '${file.id}', '${file.name || file.filename}')" style="cursor: pointer;">
                    <i class="reference-item-icon file fas fa-file"></i>
                    <div class="reference-item-content">
                        <div class="reference-item-name" title="${file.name || file.filename}">${file.name || file.filename}</div>
                        <div class="reference-item-details">${file.size ? this.formatFileSize(file.size) : 'File'} • Click to open</div>
                    </div>
                </div>
                <span class="reference-item-type file">file</span>
                <button class="reference-remove" onclick="event.stopPropagation(); window.taskManager.removeReference('file', '${file.id}')" title="Remove file">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `);
        
        const noteItems = notes.map(note => `
            <div class="reference-item">
                <div class="reference-item-left" onclick="window.taskManager.openReference('note', '${note.id}', '${note.name}')" style="cursor: pointer;">
                    <i class="reference-item-icon note fas fa-file-alt"></i>
                    <div class="reference-item-content">
                        <div class="reference-item-name" title="${note.name}">${note.name}</div>
                        <div class="reference-item-details">${note.path || 'Note'} • Click to open</div>
                    </div>
                </div>
                <span class="reference-item-type note">note</span>
                <button class="reference-remove" onclick="event.stopPropagation(); window.taskManager.removeReference('note', '${note.id}')" title="Remove note">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `);
        
        this.referencesContainer.innerHTML = [...fileItems, ...noteItems].join('');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async removeReference(type, id) {
        if (!this.selectedTask) return;
        
        try {
            const endpoint = type === 'file' ? 
                `/api/tasks/${this.selectedTask.id}/files/${id}` :
                `/api/tasks/${this.selectedTask.id}/notes/${id}`;
            
            const response = await this.apiCall(endpoint, 'DELETE');
            
            if (response.success) {
                // Update local references
                if (type === 'file') {
                    // Handle both old and new format
                    if (Array.isArray(this.selectedTask.files)) {
                        this.selectedTask.files = this.selectedTask.files.filter(f => f.id !== id);
                    } else if (this.selectedTask.references && this.selectedTask.references.files) {
                        this.selectedTask.references.files = this.selectedTask.references.files.filter(f => f.id !== id);
                    }
                } else if (type === 'note') {
                    if (!this.selectedTask.references) {
                        this.selectedTask.references = { files: [], notes: [] };
                    }
                    this.selectedTask.references.notes = this.selectedTask.references.notes.filter(n => n.id !== id);
                }
                
                this.updateFilesDisplay(this.selectedTask.references || this.selectedTask.files || []);
                this.updateReferencesDisplay();
                this.showNotification(`${type === 'file' ? 'Archivo' : 'Nota'} eliminado`, 'success');
            }
        } catch (error) {
            console.error(`Error removing ${type}:`, error);
            this.showNotification(`Error al eliminar ${type === 'file' ? 'archivo' : 'nota'}`, 'error');
        }
    }

    async openReference(type, id, name) {
        try {
            // Close the quick preview when opening a reference
            this.hideQuickPreview();
            
            if (type === 'file') {
                // For files, trigger download
                const downloadUrl = `/api/files/${id}/download`;
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else if (type === 'note') {
                // For notes, open in an internal tab using the tab manager
                console.log('Opening note:', { id, name, tabManager: !!window.tabManager });
                
                if (window.tabManager && typeof window.tabManager.getOrCreateTabForContent === 'function') {
                    try {
                        window.tabManager.getOrCreateTabForContent('note', id, name);
                        
                        // Ensure tags are loaded for the note (backup in case tab manager doesn't handle it)
                        setTimeout(() => {
                            this.ensureNoteTagsLoaded(id, name);
                        }, 500);
                        
                        this.showNotification(`Abriendo nota "${name}"`, 'success');
                    } catch (error) {
                        console.error('Error with tab manager:', error);
                        this.fallbackOpenNote(id, name);
                    }
                } else {
                    this.fallbackOpenNote(id, name);
                }
            }
        } catch (error) {
            console.error(`Error opening ${type}:`, error);
            this.showNotification(`Error al abrir ${type === 'file' ? 'archivo' : 'nota'}`, 'error');
        }
    }

    fallbackOpenNote(nodeId, name) {
        // Fallback method to open note when tab manager is not available
        console.log('Using fallback note opening for:', { nodeId, name });
        
        try {
            // Try to use the direct loadNoteContent function
            if (window.loadNoteContent) {
                window.loadNoteContent(nodeId, name);
                
                // Ensure tags are loaded after content loads
                setTimeout(() => {
                    this.ensureNoteTagsLoaded(nodeId, name);
                }, 300);
                
                this.showNotification(`Cargando nota "${name}"`, 'success');
                
                // Try to switch to notes tab if available
                if (window.showSection) {
                    window.showSection('notes');
                }
            } else if (window.noteTreeView && window.noteTreeView.selectNode) {
                // Try to select the note in the tree view
                const nodeData = window.noteTreeView.selectNode(nodeId);
                if (nodeData) {
                    // Ensure tags are loaded when selecting from tree
                    setTimeout(() => {
                        this.ensureNoteTagsLoaded(nodeId, name);
                    }, 300);
                    
                    this.showNotification(`Seleccionando nota "${name}"`, 'success');
                } else {
                    this.showNotification('No se pudo encontrar la nota en el árbol', 'error');
                }
            } else {
                // Last resort: try to navigate using URL hash
                window.location.hash = `#note:${nodeId}`;
                this.showNotification(`Navegando a nota "${name}"`, 'success');
            }
        } catch (error) {
            console.error('Error in fallback note opening:', error);
            this.showNotification('Error al abrir la nota', 'error');
        }
    }

    ensureNoteTagsLoaded(nodeId, name) {
        try {
            // Load tags for the note if the tag system is available
            if (window.tagSystem && typeof window.tagSystem.loadForNote === 'function') {
                console.log('Loading tags for note:', nodeId);
                window.tagSystem.loadForNote(nodeId);
            }
            
            // Also ensure the note title is set correctly
            const noteTitle = document.querySelector('.note-title');
            if (noteTitle && name) {
                noteTitle.textContent = name;
            }
            
            // Update current note ID for saving if editor is available
            if (window.editorInstance && typeof window.editorInstance.setCurrentNote === 'function') {
                window.editorInstance.setCurrentNote(nodeId);
            }
            
        } catch (error) {
            console.error('Error ensuring note tags loaded:', error);
        }
    }

    toggleQuickPreview() {
        if (!this.filesQuickPreview) return;
        
        const isVisible = this.filesQuickPreview.style.display !== 'none';
        if (isVisible) {
            this.hideQuickPreview();
        } else {
            this.showQuickPreview();
        }
    }

    showQuickPreview() {
        if (!this.filesQuickPreview || !this.selectedTask) return;
        
        this.updateQuickPreviewContent();
        this.filesQuickPreview.style.display = 'block';
    }

    hideQuickPreview() {
        if (this.filesQuickPreview) {
            this.filesQuickPreview.style.display = 'none';
        }
    }

    updateQuickPreviewContent() {
        if (!this.selectedTask || !this.quickPreviewList || !this.noAttachments) return;
        
        const references = this.selectedTask.references || { files: [], notes: [] };
        const files = references.files || [];
        const notes = references.notes || [];
        const totalCount = files.length + notes.length;
        
        if (totalCount === 0) {
            this.noAttachments.style.display = 'block';
            this.quickPreviewList.style.display = 'none';
            return;
        }
        
        this.noAttachments.style.display = 'none';
        this.quickPreviewList.style.display = 'block';
        
        // Create file items
        const fileItems = files.map(file => `
            <button class="quick-preview-item" onclick="window.taskManager.openReference('file', '${file.id}', '${file.name || file.filename}')" title="Click to download">
                <i class="quick-preview-icon file fas fa-file"></i>
                <div class="quick-preview-item-content">
                    <div class="quick-preview-item-name">${file.name || file.filename}</div>
                    <div class="quick-preview-item-details">${this.formatFileSize(file.size || 0)}</div>
                </div>
                <span class="quick-preview-item-type file">file</span>
            </button>
        `);
        
        // Create note items
        const noteItems = notes.map(note => `
            <button class="quick-preview-item" onclick="window.taskManager.openReference('note', '${note.id}', '${note.name}')" title="Click to open note">
                <i class="quick-preview-icon note fas fa-file-alt"></i>
                <div class="quick-preview-item-content">
                    <div class="quick-preview-item-name">${note.name}</div>
                    <div class="quick-preview-item-details">${note.path || 'Note'}</div>
                </div>
                <span class="quick-preview-item-type note">note</span>
            </button>
        `);
        
        this.quickPreviewList.innerHTML = [...fileItems, ...noteItems].join('');
    }

    showReferenceSelectionModal() {
        if (this.referenceSelectionModal) {
            this.referenceSelectionModal.classList.remove('is-hidden');
            this.updateReferencesDisplay();
        }
    }

    hideReferenceSelectionModal() {
        if (this.referenceSelectionModal) {
            this.referenceSelectionModal.classList.add('is-hidden');
        }
    }



    async showNoteSelectionModal() {
        if (this.noteSelectionModal) {
            this.noteSelectionModal.classList.remove('is-hidden');
            this.selectedNotes = new Set();
            this.allNotes = [];
            
            // Load all notes
            await this.loadAllNotes();
            this.renderNotesList(this.allNotes);
            
            // Focus search input
            if (this.noteSearchInput) {
                this.noteSearchInput.value = '';
                this.noteSearchInput.focus();
            }
            
            this.updateNoteSelectionConfirmButton();
        }
    }

    hideNoteSelectionModal() {
        if (this.noteSelectionModal) {
            this.noteSelectionModal.classList.add('is-hidden');
            this.selectedNotes = new Set();
        }
    }

    async loadAllNotes() {
        try {
            // Load all notes from the API
            const result = await this.apiCall('/api/notes/list');
            this.allNotes = result.notes || [];
        } catch (error) {
            console.error('Error loading notes:', error);
            this.allNotes = [];
        }
    }

    renderNotesList(notes) {
        if (!this.notesList) return;
        
        if (notes.length === 0) {
            this.notesList.innerHTML = `
                <div class="notes-empty-state">
                    <div class="notes-empty-state-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="notes-empty-state-text">No notes found</div>
                </div>
            `;
            return;
        }
        
        this.notesList.innerHTML = notes.map(note => `
            <div class="note-list-item" data-note-id="${note.id}">
                <i class="note-list-item-icon fas fa-file-alt"></i>
                <div class="note-list-item-content">
                    <div class="note-list-item-name">${note.name}</div>
                    <div class="note-list-item-path">${note.path || 'Root'}</div>
                </div>
            </div>
        `).join('');
        
        // Add click events
        this.notesList.querySelectorAll('.note-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = item.dataset.noteId;
                this.toggleNoteSelection(noteId, item);
            });
        });
    }

    toggleNoteSelection(noteId, element) {
        if (this.selectedNotes.has(noteId)) {
            this.selectedNotes.delete(noteId);
            element.classList.remove('selected');
        } else {
            this.selectedNotes.add(noteId);
            element.classList.add('selected');
        }
        
        this.updateNoteSelectionConfirmButton();
    }

    updateNoteSelectionConfirmButton() {
        if (this.noteSelectionConfirm) {
            const count = this.selectedNotes.size;
            this.noteSelectionConfirm.disabled = count === 0;
            this.noteSelectionConfirm.textContent = count > 0 ? 
                `Link Selected Notes (${count})` : 'Link Selected Notes';
        }
    }

    filterNotes() {
        const query = this.noteSearchInput.value.toLowerCase().trim();
        
        if (query === '') {
            this.renderNotesList(this.allNotes);
        } else {
            const filtered = this.allNotes.filter(note => 
                note.name.toLowerCase().includes(query) ||
                (note.path && note.path.toLowerCase().includes(query))
            );
            this.renderNotesList(filtered);
        }
    }

    async confirmNoteSelection() {
        if (!this.selectedTask || this.selectedNotes.size === 0) return;
        
        try {
            const noteIds = Array.from(this.selectedNotes);
            const response = await this.apiCall(`/api/tasks/${this.selectedTask.id}/notes`, 'POST', {
                note_ids: noteIds
            });
            
            if (response.success) {
                // Update task references
                if (!this.selectedTask.references) {
                    this.selectedTask.references = { files: [], notes: [] };
                }
                
                // Add new notes to references
                const newNotes = this.allNotes.filter(note => noteIds.includes(note.id));
                const existingNoteIds = new Set(this.selectedTask.references.notes?.map(n => n.id) || []);
                const notesToAdd = newNotes.filter(note => !existingNoteIds.has(note.id));
                
                this.selectedTask.references.notes = [
                    ...(this.selectedTask.references.notes || []),
                    ...notesToAdd
                ];
                
                this.updateFilesDisplay(this.selectedTask.references);
                this.updateReferencesDisplay();
                this.hideNoteSelectionModal();
                this.showNotification(`${notesToAdd.length} nota(s) vinculada(s)`, 'success');
            }
        } catch (error) {
            console.error('Error linking notes:', error);
            this.showNotification('Error al vincular notas', 'error');
        }
    }

    // ===== Task Editing =====
    toggleTaskCompletion() {
        if (!this.selectedTask) return;
        
        const newStatus = this.taskCompleteToggle.checked ? 'completed' : 'pending';
        this.updateTaskField('status', newStatus);
    }

    async updateTaskField(field, value) {
        if (!this.selectedTask) return;
        
        try {
            const data = { [field]: value };
            await this.apiCall(`/api/tasks/${this.selectedTask.id}`, 'PUT', data);
            
            // Update local task
            this.selectedTask[field] = value;
            
            // Refresh display
            this.loadTasks();
            this.showNotification('Tarea actualizada', 'success');
        } catch (error) {
            console.error('Error updating task:', error);
        }
    }

    scheduleAutoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            this.saveTaskChanges();
        }, 2000);
    }

    async saveTaskChanges() {
        if (!this.selectedTask) return;
        
        try {
            const data = {
                title: this.taskTitleInput.value
            };
            
            // Get notes from EditorJS if available
            if (this.notesEditor) {
                const notesData = await this.notesEditor.save();
                data.notes = notesData;
            }
            
            await this.apiCall(`/api/tasks/${this.selectedTask.id}`, 'PUT', data);
            
            // Update local task
            Object.assign(this.selectedTask, data);
            
            // Refresh display
            this.renderTaskBuckets();
        } catch (error) {
            console.error('Error saving task changes:', error);
        }
    }

    setPriority(priority) {
        if (!this.selectedTask) return;
        
        // Update button active states
        this.prioritySelector.querySelectorAll('.priority-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.priority === priority);
        });
        
        this.updateTaskField('priority', priority);
        this.updatePriorityDisplay(priority);
    }

    addTag() {
        const tagText = this.taskTagInput.value.trim();
        if (!tagText || !this.selectedTask) return;
        
        const currentTags = this.selectedTask.tags || [];
        const tagNames = currentTags.map(tag => typeof tag === 'object' ? tag.name : tag);
        
        if (!tagNames.includes(tagText)) {
            const newTags = [...currentTags, tagText];
            this.updateTaskField('tags', newTags);
            this.renderTags(newTags);
        }
        
        this.taskTagInput.value = '';
    }

    removeTag(tagName) {
        if (!this.selectedTask) return;
        
        const currentTags = this.selectedTask.tags || [];
        const newTags = currentTags.filter(tag => 
            (typeof tag === 'object' ? tag.name : tag) !== tagName
        );
        
        this.updateTaskField('tags', newTags);
        this.renderTags(newTags);
    }



    // ===== Bucket Management =====
    toggleBucket(bucketName) {
        const header = document.querySelector(`[data-toggle="${bucketName}"]`);
        const content = document.getElementById(`${bucketName}Tasks`);
        const arrow = header.querySelector('.bucket-arrow');
        
        const isCollapsed = header.dataset.collapsed === 'true';
        
        if (isCollapsed) {
            header.dataset.collapsed = 'false';
            content.classList.remove('is-hidden');
            arrow.style.transform = 'rotate(0deg)';
            this.bucketStates[bucketName] = true;
        } else {
            header.dataset.collapsed = 'true';
            content.classList.add('is-hidden');
            arrow.style.transform = 'rotate(-90deg)';
            this.bucketStates[bucketName] = false;
        }
        
        this.saveBucketStates();
    }

    saveBucketStates() {
        localStorage.setItem('taskBucketStates', JSON.stringify(this.bucketStates));
    }

    restoreBucketStates() {
        try {
            const saved = localStorage.getItem('taskBucketStates');
            if (saved) {
                this.bucketStates = { ...this.bucketStates, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to restore bucket states');
        }
        
        // Apply states
        Object.entries(this.bucketStates).forEach(([bucketName, isOpen]) => {
            const header = document.querySelector(`[data-toggle="${bucketName}"]`);
            const content = document.getElementById(`${bucketName}Tasks`);
            const arrow = header?.querySelector('.bucket-arrow');
            
            if (header && content && arrow) {
                if (isOpen) {
                    header.dataset.collapsed = 'false';
                    content.classList.remove('is-hidden');
                    arrow.style.transform = 'rotate(0deg)';
                } else {
                    header.dataset.collapsed = 'true';
                    content.classList.add('is-hidden');
                    arrow.style.transform = 'rotate(-90deg)';
                }
            }
        });
    }

    // ===== Keyboard Navigation =====
    navigateTasks(direction) {
        const visibleTasks = this.getVisibleTasks();
        if (visibleTasks.length === 0) return;
        
        this.selectedTaskIndex = Math.max(0, Math.min(
            visibleTasks.length - 1,
            this.selectedTaskIndex + direction
        ));
        
        this.highlightTaskAtIndex(this.selectedTaskIndex, visibleTasks);
    }

    selectCurrentTask() {
        const visibleTasks = this.getVisibleTasks();
        if (this.selectedTaskIndex >= 0 && this.selectedTaskIndex < visibleTasks.length) {
            const task = visibleTasks[this.selectedTaskIndex];
            this.selectTask(task);
        }
    }

    getVisibleTasks() {
        const visibleTasks = [];
        
        // Collect tasks from visible buckets
        Object.entries(this.bucketStates).forEach(([bucketName, isOpen]) => {
            if (isOpen) {
                const container = this[bucketName + 'Tasks'];
                const rows = container?.querySelectorAll('.task-row') || [];
                rows.forEach(row => {
                    const taskId = row.dataset.taskId;
                    const task = this.tasks.find(t => t.id === taskId);
                    if (task) visibleTasks.push(task);
                });
            }
        });
        
        return visibleTasks;
    }

    highlightTaskAtIndex(index, visibleTasks) {
        // Remove all highlights
        document.querySelectorAll('.task-row').forEach(row => {
            row.classList.remove('keyboard-highlight');
        });
        
        // Add highlight to current
        if (index >= 0 && index < visibleTasks.length) {
            const task = visibleTasks[index];
            const row = document.querySelector(`[data-task-id="${task.id}"]`);
            if (row) {
                row.classList.add('keyboard-highlight');
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    // ===== Utility Methods =====
    async toggleTaskStatus(task, isCompleted) {
        const newStatus = isCompleted ? 'completed' : 'pending';
        await this.updateTaskField('status', newStatus);
    }

    toggleDateTimePicker() {
        if (!this.dateTimePicker) return;
        const isVisible = this.dateTimePicker.style.display !== 'none';
        if (isVisible) {
            this.dateTimePicker.style.display = 'none';
            return;
        }

        // Initialize state from selected task or defaults
        const now = new Date();
        if (this.selectedTask && this.selectedTask.due_date) {
            const d = new Date(this.selectedTask.due_date);
            this.dtState.viewYear = d.getFullYear();
            this.dtState.viewMonth = d.getMonth();
            // Use local date string to avoid off-by-one
            this.dtState.selectedDate = this.localYMD(d);
            this.dtState.hour = d.getHours();
            this.dtState.minute = d.getMinutes();
        } else {
            this.dtState.viewYear = now.getFullYear();
            this.dtState.viewMonth = now.getMonth();
        this.dtState.selectedDate = null;
        this.dtState.hour = 0;
        this.dtState.minute = 0;
        }
        this.dtState.repeat = (this.selectedTask && (this.selectedTask.repeat_pattern || this.selectedTask.repeat)) || '';

        // Render UI
        this.renderCalendar();
        this.updateTimeDisplay();
        this.updateHourToggleButton();
        this.updateRepeatToggleButton();
        this.hideTimePanel();
        this.hideRepeatPanel();

        // Show picker
        this.dateTimePicker.style.display = 'block';
    }

    clearTaskDate() {
        this.dtState.selectedDate = null;
        this.dtState.hour = 0;
        this.dtState.minute = 0;
        this.autoSaveDate();
    }

    async saveTaskDate() {
        if (!this.selectedTask) return;
        let dueDateStr = null;
        if (this.dtState.selectedDate) {
            const hh = String(this.dtState.hour ?? 0).padStart(2, '0');
            const mm = String(this.dtState.minute ?? 0).padStart(2, '0');
            // Persist as local datetime string without timezone
            dueDateStr = `${this.dtState.selectedDate}T${hh}:${mm}:00`;
        }
        try {
            await this.updateTaskField('due_date', dueDateStr);
            if (typeof this.dtState.repeat === 'string') {
                await this.updateTaskField('repeat_pattern', this.dtState.repeat || null);
            }
            this.selectedTask.due_date = dueDateStr;
            this.selectedTask.repeat_pattern = this.dtState.repeat || null;
            this.updateDateTimeDisplay(this.selectedTask);
            // Keep picker open after saving
            this.renderTaskBuckets();
        } catch (error) {
            console.error('Error saving task date:', error);
        }
    }

    setPickerYear(y) {
        this.dtState.viewYear = y;
        if (this.yearInput) this.yearInput.value = String(y);
        this.renderCalendar();
    }

    autoSaveDate() {
        clearTimeout(this.dateSaveTimeout);
        this.dateSaveTimeout = setTimeout(() => this.saveTaskDate(), 300);
    }

    // ===== Date/Time helper methods =====
    monthNameEs(m) {
        const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return names[m] || '';
    }

    renderCalendar() {
        if (!this.calendarGrid || this.dtState.viewYear === null || this.dtState.viewMonth === null) return;
        const y = this.dtState.viewYear;
        const m = this.dtState.viewMonth; // 0-11
        // Label
        if (this.calMonthLabel) this.calMonthLabel.textContent = `${this.monthNameEs(m)} ${y}`;

        // Compute first day and days in month
        const first = new Date(y, m, 1);
        const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const prevMonthDays = new Date(y, m, 0).getDate();

        const cells = [];
        // Leading days
        for (let i = 0; i < startWeekday; i++) {
            const dayNum = prevMonthDays - startWeekday + 1 + i;
            const d = new Date(y, m - 1, dayNum);
            cells.push({ date: d, outside: true });
        }
        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ date: new Date(y, m, d), outside: false });
        }
        // Trailing to fill multiple of 7
        while (cells.length % 7 !== 0) {
            const last = cells[cells.length - 1].date;
            const next = new Date(last);
            next.setDate(last.getDate() + 1);
            cells.push({ date: next, outside: true });
        }

        // Render
        this.calendarGrid.innerHTML = '';
        const today = new Date(); today.setHours(0,0,0,0);
        const selected = this.dtState.selectedDate;
        const frag = document.createDocumentFragment();
        cells.forEach(cell => {
            const el = document.createElement('div');
            el.className = 'cal-day';
            if (cell.outside) el.classList.add('is-outside');
            const d0 = new Date(cell.date); d0.setHours(0,0,0,0);
            if (d0.getTime() === today.getTime()) el.classList.add('is-today');
            const ymd = this.localYMD(cell.date);
            if (selected && ymd === selected) el.classList.add('is-selected');
            el.textContent = String(cell.date.getDate());
            el.dataset.date = ymd;
            el.addEventListener('click', () => { this.selectDate(ymd); });
            frag.appendChild(el);
        });
        this.calendarGrid.appendChild(frag);
    }

    shiftCalendar(deltaMonths) {
        let y = this.dtState.viewYear;
        let m = this.dtState.viewMonth + deltaMonths;
        while (m < 0) { m += 12; y -= 1; }
        while (m > 11) { m -= 12; y += 1; }
        this.dtState.viewYear = y;
        this.dtState.viewMonth = m;
        this.renderCalendar();
    }

    selectDate(ymd) {
        this.dtState.selectedDate = ymd;
        this.renderCalendar();
        this.autoSaveDate();
    }

    setHour(h) {
        this.dtState.hour = Math.max(0, Math.min(23, h|0));
        this.updateTimeDisplay();
        this.autoSaveDate();
    }

    adjustHour(delta) {
        const h = (this.dtState.hour + delta + 24) % 24;
        this.dtState.hour = h;
        this.updateTimeDisplay();
        this.updateHourToggleButton();
    }

    adjustMinute(delta) {
        let m = (this.dtState.minute + delta);
        while (m < 0) { m += 60; this.adjustHour(-1); }
        while (m >= 60) { m -= 60; this.adjustHour(1); }
        this.dtState.minute = m;
        this.updateTimeDisplay();
        this.updateHourToggleButton();
    }

    updateTimeDisplay() {
        if (this.timeHour) this.timeHour.value = String(this.dtState.hour ?? 0).padStart(2, '0');
        if (this.timeMinute) this.timeMinute.value = String(this.dtState.minute ?? 0).padStart(2, '0');
    }

    // Hour Toggle Methods
    toggleHourPanel() {
        if (!this.hourToggleBtn || !this.dtTimePanel) return;
        
        const hasValue = this.hasTimeValue();
        
        if (hasValue) {
            // Clear time
            this.clearTime();
        } else {
            // Show/hide time panel
            const isVisible = !this.dtTimePanel.classList.contains('is-hidden');
            if (isVisible) {
                this.hideTimePanel();
            } else {
                this.showTimePanel();
            }
        }
    }

    showTimePanel() {
        if (this.dtTimePanel) {
            this.dtTimePanel.classList.remove('is-hidden');
        }
        this.hideRepeatPanel();
    }

    hideTimePanel() {
        if (this.dtTimePanel) {
            this.dtTimePanel.classList.add('is-hidden');
        }
    }

    setTime() {
        this.autoSaveDate();
        this.hideTimePanel();
        this.updateHourToggleButton();
    }

    clearTime() {
        this.dtState.hour = 0;
        this.dtState.minute = 0;
        this.updateTimeDisplay();
        this.updateHourToggleButton();
        this.autoSaveDate();
    }

    hasTimeValue() {
        return this.dtState.hour > 0 || this.dtState.minute > 0;
    }

    updateHourToggleButton() {
        if (!this.hourToggleBtn) return;
        
        const textSpan = this.hourToggleBtn.querySelector('.toggle-text');
        let iconSpan = this.hourToggleBtn.querySelector('.toggle-icon') || this.hourToggleBtn.querySelector('.clear-icon');
        
        // If neither icon exists, create one
        if (!iconSpan) {
            iconSpan = document.createElement('span');
            iconSpan.className = 'toggle-icon';
            this.hourToggleBtn.appendChild(iconSpan);
        }
        
        const hasValue = this.hasTimeValue();
        
        if (hasValue) {
            // Show time and clear icon
            const timeStr = `${String(this.dtState.hour).padStart(2, '0')}:${String(this.dtState.minute).padStart(2, '0')}`;
            if (textSpan) textSpan.textContent = timeStr;
            iconSpan.innerHTML = '×';
            iconSpan.className = 'clear-icon';
            this.hourToggleBtn.classList.add('has-value');
        } else {
            // Show default state
            if (textSpan) textSpan.textContent = 'Hour';
            iconSpan.innerHTML = '▼';
            iconSpan.className = 'toggle-icon';
            this.hourToggleBtn.classList.remove('has-value');
        }
    }

    // Repeat Toggle Methods
    toggleRepeatPanel() {
        if (!this.repeatToggleBtn || !this.repeatMenu) return;
        
        const hasValue = this.dtState.repeat && this.dtState.repeat !== '';
        
        if (hasValue) {
            // Clear repeat
            this.clearRepeat();
        } else {
            // Show/hide repeat panel
            const isVisible = !this.repeatMenu.classList.contains('is-hidden');
            if (isVisible) {
                this.hideRepeatPanel();
            } else {
                this.showRepeatPanel();
            }
        }
    }

    showRepeatPanel() {
        if (this.repeatMenu) {
            this.repeatMenu.classList.remove('is-hidden');
        }
        this.hideTimePanel();
    }

    hideRepeatPanel() {
        if (this.repeatMenu) {
            this.repeatMenu.classList.add('is-hidden');
        }
    }

    clearRepeat() {
        this.dtState.repeat = '';
        this.updateRepeatToggleButton();
        this.autoSaveDate();
    }

    updateRepeatToggleButton() {
        if (!this.repeatToggleBtn) return;
        
        const textSpan = this.repeatToggleBtn.querySelector('.toggle-text');
        let iconSpan = this.repeatToggleBtn.querySelector('.toggle-icon') || this.repeatToggleBtn.querySelector('.clear-icon');
        
        // If neither icon exists, create one
        if (!iconSpan) {
            iconSpan = document.createElement('span');
            iconSpan.className = 'toggle-icon';
            this.repeatToggleBtn.appendChild(iconSpan);
        }
        
        const hasValue = this.dtState.repeat && this.dtState.repeat !== '';
        
        if (hasValue) {
            // Show repeat value and clear icon
            const repeatLabels = {
                'daily': 'Daily',
                'weekday': 'Weekdays',
                'weekly': 'Weekly',
                'monthly': 'Monthly',
                'yearly': 'Yearly'
            };
            if (textSpan) textSpan.textContent = repeatLabels[this.dtState.repeat] || this.dtState.repeat;
            iconSpan.innerHTML = '×';
            iconSpan.className = 'clear-icon';
            this.repeatToggleBtn.classList.add('has-value');
        } else {
            // Show default state
            if (textSpan) textSpan.textContent = 'Repeat';
            iconSpan.innerHTML = '▼';
            iconSpan.className = 'toggle-icon';
            this.repeatToggleBtn.classList.remove('has-value');
        }
    }

    showDateTimePicker() {
        this.toggleDateTimePicker();
    }

    async handleFileUpload() {
        const files = this.fileInput.files;
        if (!files.length || !this.selectedTask) return;
        
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        formData.append('task_id', this.selectedTask.id);
        
        try {
            this.showNotification('Subiendo archivos...', 'info');
            
            const response = await fetch('/api/tasks/files', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update task references
                if (!this.selectedTask.references) {
                    this.selectedTask.references = { files: [], notes: [] };
                }
                this.selectedTask.references.files = result.files || [];
                this.updateFilesDisplay(this.selectedTask.references);
                this.updateReferencesDisplay();
                
                // Clear file input
                this.fileInput.value = '';
                
                this.showNotification('Archivos subidos correctamente', 'success');
            } else {
                throw new Error('Error al subir archivos');
            }
        } catch (error) {
            console.error('File upload error:', error);
            this.showNotification('Error al subir archivos', 'error');
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

// Initialization is handled centrally in static/js/app.js to avoid duplicates

// Add keyboard highlight styles and notification animations
const taskManagerStyles = document.createElement('style');
taskManagerStyles.textContent = `
    .task-row.keyboard-highlight {
        background: rgba(52, 152, 219, 0.15);
        border-left: 3px solid var(--primary-color);
    }
    
    .priority-dropdown .priority-option {
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
        border-bottom: 1px solid var(--border-color);
        transition: background-color 0.2s;
    }
    
    .priority-dropdown .priority-option:hover {
        background: var(--surface-2);
    }
    
    .priority-dropdown .priority-option:last-child {
        border-bottom: none;
    }
    
    .priority-dropdown .priority-option.urgente {
        background: #ffe6e6;
        color: #e74c3c;
    }
    
    .priority-dropdown .priority-option.alta {
        background: #fff2e6;
        color: #e67e22;
    }
    
    .priority-dropdown .priority-option.media {
        background: #fffacd;
        color: #f39c12;
    }
    
    .priority-dropdown .priority-option.baja {
        background: #e6ffe6;
        color: #27ae60;
    }
    
    .fallback-textarea {
        width: 100%;
        height: 120px;
        border: none;
        background: transparent;
        color: var(--text-color);
        font-size: 14px;
        resize: vertical;
        padding: 8px;
    }
    
    .fallback-textarea:focus {
        outline: none;
    }
    
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
document.head.appendChild(taskManagerStyles);
