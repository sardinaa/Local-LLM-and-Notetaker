const VIEW_KEY = 'task.view';
const BUCKET_KEY = 'taskBucketStates';

export function loadViewSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    return {
      groupBy: v.groupBy || 'date',
      sortBy: v.sortBy || 'date',
      sortOrder: v.sortOrder || 'asc',
    };
  } catch {
    return { groupBy: 'date', sortBy: 'date', sortOrder: 'asc' };
  }
}

export function saveViewSettings(viewSettings) {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewSettings)); } catch {}
}

export function saveBucketStates(bucketStates) {
  try { localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketStates)); } catch {}
}

export function loadBucketStates() {
  try {
    const saved = localStorage.getItem(BUCKET_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

