/**
 * Settings Modal Integration
 * Bridges settings modal with existing agents and tags managers
 */

// Wait for agents manager to be available
function waitForAgentsManager() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.AgentsManager || window.agentsManager) {
        resolve(window.AgentsManager || window.agentsManager);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// Wait for tags manager to be available
function waitForTagsManager() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.TagsManager || window.tagsManager) {
        resolve(window.TagsManager || window.tagsManager);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

// Initialize settings modal integrations
document.addEventListener('DOMContentLoaded', () => {
  // Listen for settings modal opening
  document.addEventListener('settingsModalOpened', async (e) => {
    const { tab } = e.detail || { tab: 'user-options' };
    
    if (tab === 'agents') {
      await initializeAgentsTab();
    } else if (tab === 'tags') {
      await initializeTagsTab();
    }
  });
});

async function initializeAgentsTab() {
  try {
    const agentsManager = await waitForAgentsManager();
    
    // Hook up create agent button
    const createBtn = document.getElementById('createAgentBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        // Trigger existing agent creation flow
        if (typeof agentsManager.createAgent === 'function') {
          agentsManager.createAgent();
        } else if (typeof window.openAgentCreationModal === 'function') {
          window.openAgentCreationModal();
        } else {
          console.warn('Agent creation function not found');
        }
      });
    }
  } catch (error) {
    console.error('Failed to initialize agents tab:', error);
  }
}

async function initializeTagsTab() {
  try {
    const tagsManager = await waitForTagsManager();
    
    // Hook up tag management buttons
    const refreshBtn = document.getElementById('refreshTagsBtn');
    const exportBtn = document.getElementById('exportTagsBtn');
    const importBtn = document.getElementById('importTagsBtn');
    
    if (refreshBtn && tagsManager.refreshTags) {
      refreshBtn.addEventListener('click', () => {
        tagsManager.refreshTags();
        // Reload tags in modal
        if (window.settingsModal) {
          window.settingsModal.loadTags();
        }
      });
    }
    
    if (exportBtn && tagsManager.exportTags) {
      exportBtn.addEventListener('click', () => {
        tagsManager.exportTags();
      });
    }
    
    if (importBtn && tagsManager.importTags) {
      importBtn.addEventListener('click', () => {
        tagsManager.importTags();
      });
    }
  } catch (error) {
    console.error('Failed to initialize tags tab:', error);
  }
}

// Export for use in other modules
window.settingsModalIntegration = {
  initializeAgentsTab,
  initializeTagsTab
};
