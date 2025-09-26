// File Viewer state helpers
export function createInitialState() {
  return {
    isVisible: false,
    currentFile: null,
    selectedDocumentInModal: null,
    isLoadingDocument: false,
    isDragging: false,
    startX: 0,
    startWidth: 0,
    notesEditorInstance: null,
    currentNoteId: null,
    currentNoteName: 'Untitled Note',
    currentNoteTags: '',
    currentNoteCreatedAt: null,
    pendingNoteData: null,
    tempNoteContent: null,
    hasUnsavedChanges: false,
    tempNoteSessionKey: null,
    originalControlsHTML: null,
    originalFileTypeLabel: null,
    originalFileTypeIcon: null,
    currentPdfUrl: null,
    currentView: 'preview',
    _modalTags: [],
    _modalTagColor: 'default',
    _mathTypesetTimer: null,
  };
}

export function applyState(target, state) {
  Object.assign(target, state);
}
