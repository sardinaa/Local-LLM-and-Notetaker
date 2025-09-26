import TagsManager, { init as initTagsManager, getManager } from './manager.js';
import { tagSystem } from './inline.js';

function bootstrap() {
  if (window.__USE_TAGS_MODULES__ === false) return;
  initTagsManager().catch((error) => console.error('[tags] initialization failed', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

export { TagsManager, tagSystem, initTagsManager as init, getManager };
