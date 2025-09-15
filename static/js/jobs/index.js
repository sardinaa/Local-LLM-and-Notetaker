import { initJobs } from './controller.js';

// Feature flag to avoid double-binding while migrating
function shouldInit() {
  return typeof window !== 'undefined' && window.__USE_JOBS_MODULES__ === true;
}

// Auto-bootstrap only when flag is on
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { if (shouldInit()) initJobs(); });
} else if (shouldInit()) {
  initJobs();
}
