// Gather and return key task-related DOM elements.
export function collectTaskEls(root = document) {
  const byId = (id) => root.getElementById(id);
  return {
    // Counts
    todayCount: byId('todayCount'),
    tomorrowCount: byId('tomorrowCount'),
    next7daysCount: byId('next7daysCount'),
    completedCount: byId('completedCount'),

    // Filter Menu
    taskFilterBtn: byId('taskFilterBtn'),
    taskFilterMenu: byId('taskFilterMenu'),
    groupByOptions: byId('groupByOptions'),
    sortByOptions: byId('sortByOptions'),
    sortOrderToggle: byId('sortOrderToggle'),

    // Right panel date/time display
    taskDateTimeDisplay: byId('taskDateTimeDisplay'),

    // Quick add + preview (used in both legacy and modern UIs)
    quickTaskInput: byId('quickTaskInput'),
    quickTaskPreview: byId('quickTaskPreview'),
    quickTaskSubmit: byId('quickTaskSubmit'),
    taskPreview: byId('taskPreview'),
    previewText: byId('previewText'),
    confidenceFill: byId('confidenceFill'),
    confidenceValue: byId('confidenceValue'),

    // Preview actions
    previewEdit: byId('previewEdit'),
    previewSave: byId('previewSave'),

    // Buckets containers
    dynamicTaskList: byId('dynamicTaskList'),
    dateBucketsContainer: byId('dateBucketsContainer'),
    todayTasks: byId('todayTasks'),
    tomorrowTasks: byId('tomorrowTasks'),
    next7daysTasks: byId('next7daysTasks'),
    completedTasksContainer: (function() {
      // Avoid duplicate id collision; prefer bucket container within tasks section
      const tasksSection = root.getElementById('tasksSection');
      return tasksSection ? tasksSection.querySelector('.completed-bucket .bucket-content#completedTasks') : byId('completedTasks');
    })(),

    // Right panel elements
    taskPanelOverlay: byId('taskPanelOverlay'),
    taskPanelClose: byId('taskPanelClose'),
    taskRightPanel: root.querySelector('.task-right-panel'),
    taskDetailsPanel: byId('taskDetailsPanel'),
    panelEmptyState: byId('panelEmptyState'),
    taskCompleteToggle: byId('taskCompleteToggle'),
    prioritySelector: byId('prioritySelector'),
    taskTitleInput: byId('taskTitleInput'),
    // Tag selector
    taskTagPill: byId('taskTagPill'),
    taskTagSelector: byId('taskTagSelector'),
    recentTagsEl: byId('recentTags'),
    tagSearchInput: byId('tagSearchInput'),
    tagSuggestionsEl: byId('tagSuggestions'),
    quickInboxBtn: byId('quickInboxBtn'),
    filesSection: byId('filesSection'),
    filesCount: byId('filesCount'),
    filesCountBtn: byId('filesCountBtn'),
    filesQuickPreview: byId('filesQuickPreview'),
    closePreviewBtn: byId('closePreviewBtn'),
    quickPreviewList: byId('quickPreviewList'),
    noAttachments: byId('noAttachments'),
    addReferenceBtn: byId('addReferenceBtn'),
    fileInput: byId('fileInput'),

    // Reference selection modal
    referenceSelectionModal: byId('referenceSelectionModal'),
    referenceSelectionModalClose: byId('referenceSelectionModalClose'),
    uploadFilesBtn: byId('uploadFilesBtn'),
    linkNotesBtn: byId('linkNotesBtn'),
    referencesContainer: byId('referencesContainer'),
    referencesCount: byId('referencesCount'),

    // Note selection modal inside references
    noteSelectionModal: byId('noteSelectionModal'),
    noteSelectionModalClose: byId('noteSelectionModalClose'),
    noteSearchInput: byId('noteSearchInput'),
    noteSelectionConfirm: byId('noteSelectionConfirm'),

    // Date-time picker
    dateTimePicker: byId('dateTimePicker'),
    dtTimePanel: byId('dtTimePanel'),
    hourToggleBtn: byId('hourToggleBtn'),
    repeatToggleBtn: byId('repeatToggleBtn'),
    repeatMenu: byId('repeatMenu'),
    setTimeBtn: byId('setTimeBtn'),
    hourMinus: byId('hourMinus'),
    hourPlus: byId('hourPlus'),
    minuteMinus: byId('minuteMinus'),
    minutePlus: byId('minutePlus'),
    timeHour: byId('timeHour'),
    timeMinute: byId('timeMinute'),
    // Calendar elements
    calPrev: byId('calPrev'),
    calNext: byId('calNext'),
    calMonthLabel: byId('calMonthLabel'),
    calendarGrid: byId('calendarGrid'),
    monthYearPicker: byId('monthYearPicker'),
    monthsGrid: byId('monthsGrid'),
    yearInput: byId('yearInput'),
    yearUp: byId('yearUp'),
    yearDown: byId('yearDown'),
  };
}
