// Notes entry - feature flag and safe init
import { initNotes } from './controller.js';

(function bootstrap() {
  if (!window.__USE_NOTES_MODULES__) return;
  // Defer to next tick to ensure DOM is ready if loaded at <head>
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotes);
  } else {
    initNotes();
  }
})();
