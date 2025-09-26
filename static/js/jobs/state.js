// Lightweight state container for Jobs
export const JobsState = {
  items: [],
  loading: false,
  viewMode: 'compact', // 'compact' | 'detailed'
  editMode: false,
  selection: new Set(),
  filters: {},
  tags: new Map(),
};
