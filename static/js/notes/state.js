// Notes state module
// Responsibilities: holds selected node, active note, editor state, dirty flag.

export const NotesState = {
  tree: [],
  selectedNodeId: null,
  note: null,
  isDirty: false,
  editorMode: 'markdown', // 'markdown' | 'preview'
};
