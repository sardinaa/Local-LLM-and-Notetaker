(function (global) {
  const COLOR_PALETTE = ['#8EC5FC', '#FF85A1', '#FDA085', '#A3BFFA', '#B794F4', '#4FD1C5', '#F472B6', '#F6AD55'];
  const DEFAULT_FOLDER_ICON_COLOR = '#1f2937';
  const MAX_NOTES = 24;
  const MAX_PREVIEW_BLOCKS = 8;
  const MAX_PREVIEW_TOTAL_CHARACTERS = 360;
  const MAX_LIST_ITEMS = 4;
  const MAX_CHECKLIST_ITEMS = 4;
  const MAX_CODE_LINES = 4;
  const MAX_CODE_LINE_LENGTH = 80;
  const DEFAULT_PREVIEW_HEIGHT = 620;
  const DEFAULT_PREVIEW_WIDTH = 780;
  const MIN_PREVIEW_SCALE = 0.25;
  const PREVIEW_SIDE_MARGIN = 2;
  const MAX_TABLE_ROWS = 4;
  const MAX_TABLE_COLUMNS = 6;
  const MAX_EMBED_TEXT_LENGTH = 80;
  const MAX_TOGGLE_CONTENT_CHARACTERS = 160;
  const IMAGE_BLOCK_COST = 24;
  const MOVE_TO_ROOT_VALUE = '__home_dashboard_move_root__';

  const state = {
    sectionEl: null,
    rootEl: null,
    headerEl: null,
    editorEl: null,
    folderContainer: null,
    noteContainer: null,
    sortButtons: [],
    newFolderButton: null,
    newNoteButton: null,
    breadcrumbContainer: null,
    backButton: null,
    searchInput: null,
    searchClearButton: null,
    editToggle: null,
    searchQuery: '',
  editToolbar: null,
  selectAllButton: null,
  selectionCountEl: null,
  deleteButton: null,
  moveButton: null,
  isEditMode: false,
  selectedItems: new Map(),
  visibleItemIds: [],
  visibleItemMeta: new Map(),
  draggedItem: null,
    sortMode: 'recent',
    treeView: null,
    homeNoteId: null,
    currentNoteId: null,
    currentFolderId: null,
    nodeIndex: new Map(),
    parentIndex: new Map()
  };

  function getOptionsMenuApi() {
    if (global && global.OptionsMenu && typeof global.OptionsMenu.create === 'function') {
      return global.OptionsMenu;
    }
    if (typeof globalThis !== 'undefined' && globalThis.OptionsMenu && typeof globalThis.OptionsMenu.create === 'function') {
      return globalThis.OptionsMenu;
    }
    return null;
  }

  function init(config = {}) {
    state.sectionEl = config.sectionEl || null;
    state.rootEl = config.rootEl || null;
    state.headerEl = config.headerEl || null;
    state.editorEl = config.editorEl || null;
    state.folderContainer = config.folderContainer || null;
    state.noteContainer = config.noteContainer || null;
    state.sortButtons = Array.from(config.sortButtons || []);
    state.newFolderButton = config.newFolderButton || null;
    state.newNoteButton = config.newNoteButton || null;
    state.breadcrumbContainer = config.breadcrumbContainer || null;
    state.backButton = config.backButton || null;
    state.searchInput = config.searchInput || null;
    state.searchClearButton = config.searchClearButton || null;
    state.editToggle = config.editToggle || null;
    state.editToolbar = config.editToolbar || null;
    state.selectAllButton = config.selectAllButton || null;
    state.selectionCountEl = config.selectionCountEl || null;
    state.moveButton = config.moveButton || null;
    state.deleteButton = config.deleteButton || null;

    if (state.searchInput) {
      state.searchInput.addEventListener('input', handleSearchInputChange);
      state.searchInput.addEventListener('keydown', handleSearchKeydown);
    }

    if (state.searchClearButton) {
      state.searchClearButton.addEventListener('click', clearSearchQuery);
    }

    if (state.editToggle) {
      state.editToggle.addEventListener('click', handleEditToggleClick);
    }

    if (state.selectAllButton) {
      state.selectAllButton.addEventListener('click', handleSelectAllClick);
    }

    if (state.deleteButton) {
      state.deleteButton.addEventListener('click', handleDeleteSelectedClick);
    }

    if (state.moveButton) {
      state.moveButton.addEventListener('click', handleMoveSelectedClick);
    }

    updateSearchUI();
    updateEditModeUI();

    state.sortButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.sort || 'recent';
        if (mode !== state.sortMode) {
          setSortMode(mode);
        }
      });
    });

    if (state.backButton) {
      state.backButton.addEventListener('click', () => {
        navigateUp();
      });
    }

    if (state.sortButtons.some((btn) => btn.classList.contains('active'))) {
      const activeButton = state.sortButtons.find((btn) => btn.classList.contains('active'));
      if (activeButton && activeButton.dataset.sort) {
        state.sortMode = activeButton.dataset.sort;
      }
    }

    if (state.newFolderButton) {
      state.newFolderButton.addEventListener('click', handleNewFolderClick);
    }

    if (state.newNoteButton) {
      state.newNoteButton.addEventListener('click', handleNewNoteClick);
    }
  }

  function setTreeView(treeView) {
    state.treeView = treeView || null;
    updateEditModeUI();
    rebuildIndex();
    normalizeCurrentFolder();
    if (isVisible()) {
      render();
    }
  }

  function setHomeNoteId(noteId) {
    state.homeNoteId = noteId ? String(noteId) : null;
    if (state.currentNoteId && state.homeNoteId && state.currentNoteId === state.homeNoteId) {
      state.currentFolderId = null;
      ensureVisible();
      render();
    }
  }

  function handleNoteSelection(noteId) {
    state.currentNoteId = noteId ? String(noteId) : null;
    if (state.homeNoteId && state.currentNoteId === state.homeNoteId) {
      state.currentFolderId = null;
      ensureVisible();
      render();
    } else {
      hide();
    }
  }

  function showDashboard() {
    state.currentNoteId = state.homeNoteId ? String(state.homeNoteId) : null;
    ensureVisible();
    if (isVisible()) {
      render();
    }
  }

  function refresh() {
    if (!state.treeView) return;
    updateEditModeUI();
    rebuildIndex();
    normalizeCurrentFolder();
    if (isVisible()) {
      render();
    }
  }

  function setSortMode(mode) {
    state.sortMode = mode;
    state.sortButtons.forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.sort || 'recent') === state.sortMode);
    });
    render();
  }

  function handleNewFolderClick() {
    if (state.currentFolderId) {
      syncTreeSelectionToFolder(state.currentFolderId);
    }
    const trigger = global.document.getElementById('createFolder');
    if (trigger) trigger.click();
  }

  function handleNewNoteClick() {
    const trigger = global.document.getElementById('createNote');
    if (state.currentFolderId) {
      syncTreeSelectionToFolder(state.currentFolderId);
    }
    if (trigger) trigger.click();
  }

  function ensureVisible() {
    if (!state.rootEl) return;
    state.rootEl.setAttribute('aria-hidden', 'false');
    if (global.ui && typeof global.ui.show === 'function') {
      global.ui.show(state.rootEl);
      if (state.headerEl) global.ui.hide(state.headerEl);
      if (state.editorEl) global.ui.hide(state.editorEl);
    } else {
      state.rootEl.classList.remove('is-hidden');
      state.rootEl.style.removeProperty('display');
      if (state.headerEl) state.headerEl.classList.add('is-hidden');
      if (state.editorEl) state.editorEl.classList.add('is-hidden');
    }
    if (state.sectionEl) {
      state.sectionEl.classList.add('file-manager-visible');
    }
  }

  function hide() {
    if (!state.rootEl) return;
    state.rootEl.setAttribute('aria-hidden', 'true');
    if (global.ui && typeof global.ui.hide === 'function') {
      global.ui.hide(state.rootEl);
      if (state.headerEl) global.ui.show(state.headerEl);
      if (state.editorEl) global.ui.show(state.editorEl);
    } else {
      state.rootEl.classList.add('is-hidden');
      state.headerEl?.classList.remove('is-hidden');
      state.editorEl?.classList.remove('is-hidden');
    }
    if (state.sectionEl) {
      state.sectionEl.classList.remove('file-manager-visible');
    }
    if (state.isEditMode) {
      state.isEditMode = false;
      state.selectedItems.clear();
      updateEditModeUI();
    }
  }

  function handleSearchInputChange(event) {
    state.searchQuery = event?.target?.value || '';
    if (state.isEditMode && state.selectedItems.size) {
      state.selectedItems.clear();
    }
    updateSearchUI();
    render();
  }

  function handleSearchKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (state.searchQuery) {
        clearSearchQuery();
      } else if (state.searchInput) {
        state.searchInput.blur();
      }
    }
  }

  function clearSearchQuery() {
    state.searchQuery = '';
    if (state.searchInput) {
      state.searchInput.value = '';
    }
    updateSearchUI();
    render();
  }

  function updateSearchUI() {
    const hasQuery = Boolean(state.searchQuery && state.searchQuery.trim().length);
    if (state.searchClearButton) {
      if (hasQuery) {
        state.searchClearButton.classList.add('is-visible');
      } else {
        state.searchClearButton.classList.remove('is-visible');
      }
    }
  }

  function handleEditToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    toggleFileManagerEditMode();
  }

  function updateEditModeUI() {
    if (state.editToggle) {
      state.editToggle.classList.toggle('active', state.isEditMode);
      state.editToggle.setAttribute('aria-pressed', state.isEditMode ? 'true' : 'false');
    }
    if (state.editToolbar) {
      state.editToolbar.classList.toggle('is-collapsed', !state.isEditMode);
    }
    updateSelectionSummary();
  }

  function toggleFileManagerEditMode(forceState) {
    const nextState = typeof forceState === 'boolean' ? forceState : !state.isEditMode;
    if (state.isEditMode === nextState) {
      updateEditModeUI();
      return;
    }
    state.isEditMode = nextState;
    if (!state.isEditMode) {
      state.selectedItems.clear();
    }
    updateEditModeUI();
    render();
  }

  function handleSelectAllClick(event) {
    event.preventDefault();
    if (!state.isEditMode) return;
    const visibleIds = state.visibleItemIds || [];
    if (!visibleIds.length) return;
    const allSelected = visibleIds.every((id) => state.selectedItems.has(id));
    if (allSelected) {
      visibleIds.forEach((id) => {
        state.selectedItems.delete(id);
      });
    } else {
      visibleIds.forEach((id) => {
        const meta = state.visibleItemMeta?.get(id);
        if (meta) {
          state.selectedItems.set(id, meta.type);
        }
      });
    }
    updateSelectionSummary();
    render();
  }

  async function handleDeleteSelectedClick(event) {
    event.preventDefault();
    if (!state.isEditMode || !state.selectedItems.size || !state.treeView) {
      return;
    }

    const count = state.selectedItems.size;
    let confirmed = true;
    const itemWord = count === 1 ? 'item' : 'items';
    if (state.treeView.modalManager && typeof state.treeView.modalManager.showConfirmationDialog === 'function') {
      confirmed = await state.treeView.modalManager.showConfirmationDialog({
        title: `Delete ${count} ${itemWord}`,
        message: `Are you sure you want to delete the selected ${itemWord}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        isDelete: true
      });
    } else {
      confirmed = global.confirm ? global.confirm(`Delete ${count} ${itemWord}? This cannot be undone.`) : false;
    }

    if (!confirmed) {
      return;
    }

    const ids = Array.from(state.selectedItems.keys());
    for (const id of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const deleted = await state.treeView.deleteNodeFromBackend(id);
        if (deleted && typeof state.treeView.removeNodeFromTree === 'function') {
          state.treeView.removeNodeFromTree(id);
        }
      } catch (error) {
        console.warn('[homeDashboard] Failed to delete node', id, error);
      }
    }

    if (typeof state.treeView.render === 'function') {
      state.treeView.render();
    }

    state.selectedItems.clear();
    render();
  }

  async function handleMoveSelectedClick(event) {
    event.preventDefault();
    if (!state.isEditMode || !state.selectedItems.size || !state.treeView) {
      return;
    }

    const selectedIds = Array.from(state.selectedItems.keys());
    const destinations = computeMoveDestinations(selectedIds);
    if (!destinations.length) {
      showNotification('No available folders to move the selected items.', 'warning');
      return;
    }

    const target = await showMoveSelectionDialog(destinations);
    if (typeof target === 'undefined') {
      return;
    }

    await moveSelectedItemsToTarget(selectedIds, target);
  }

  function updateSelectionSummary() {
    if (!state.selectionCountEl) return;
    const count = state.selectedItems.size;
    state.selectionCountEl.textContent = `${count} selected`;

    const visibleIds = state.visibleItemIds || [];
    const hasVisible = visibleIds.length > 0;
    const allSelected = hasVisible && visibleIds.every((id) => state.selectedItems.has(id));
    const hasDestinations = count > 0 && computeMoveDestinations(Array.from(state.selectedItems.keys())).length > 0;

    if (state.selectAllButton) {
      state.selectAllButton.innerHTML = allSelected
        ? '<i class="fas fa-check-square"></i><span>Unselect All</span>'
        : '<i class="fas fa-square"></i><span>Select All</span>';
      state.selectAllButton.disabled = !hasVisible;
      state.selectAllButton.classList.toggle('is-disabled', !hasVisible);
    }

    if (state.moveButton) {
      const disableMove = count === 0 || !hasDestinations;
      state.moveButton.disabled = disableMove;
      state.moveButton.classList.toggle('is-disabled', disableMove);
    }

    if (state.deleteButton) {
      state.deleteButton.disabled = count === 0;
      state.deleteButton.classList.toggle('is-disabled', count === 0);
    }
  }

  function toggleItemSelection(id, type, forceSelected) {
    if (!state.isEditMode || !id) return;
    const shouldSelect = typeof forceSelected === 'boolean' ? forceSelected : !state.selectedItems.has(id);
    if (shouldSelect) {
      state.selectedItems.set(id, type);
    } else {
      state.selectedItems.delete(id);
    }
    updateSelectionSummary();
    render();
  }

  function handleItemDragStart(event, id, type) {
    if (!id || !type) return;
    state.draggedItem = { id: String(id), type };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
      try {
        event.dataTransfer.setData('application/json', JSON.stringify({ id, type }));
      } catch (error) {
        // Ignore DataTransfer JSON issues in older browsers
      }
    }
    event.currentTarget?.classList.add('is-dragging');
  }

  function handleItemDragEnd(event) {
    clearActiveDropTargets();
    state.draggedItem = null;
    event.currentTarget?.classList.remove('is-dragging');
  }

  function handleFolderDragOver(event, folderId, element) {
    if (!state.draggedItem) return;
    if (!canDropDraggedItemOnFolder(folderId)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    element?.classList.add('is-drop-target');
  }

  function handleFolderDragLeave(event, element) {
    event.preventDefault();
    element?.classList.remove('is-drop-target');
  }

  function handleFolderDrop(event, folderId, element) {
    if (!state.draggedItem) return;
    if (!canDropDraggedItemOnFolder(folderId)) {
      element?.classList.remove('is-drop-target');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const { id } = state.draggedItem;
    element?.classList.remove('is-drop-target');
    moveItemToFolder(id, folderId);
  }

  function handleBreadcrumbDragOver(event, folderId, element) {
    if (!state.draggedItem) return;
    if (!canDropDraggedItemOnFolder(folderId)) return;
    event.preventDefault();
    element?.classList.add('is-drop-target');
  }

  function handleBreadcrumbDrop(event, folderId, element) {
    if (!state.draggedItem) return;
    if (!canDropDraggedItemOnFolder(folderId)) {
      element?.classList.remove('is-drop-target');
      return;
    }
    event.preventDefault();
    const { id } = state.draggedItem;
    element?.classList.remove('is-drop-target');
    moveItemToFolder(id, folderId);
  }

  function handleBreadcrumbDragLeave(event, element) {
    event.preventDefault();
    element?.classList.remove('is-drop-target');
  }

  function setupBreadcrumbDropTarget(element, folderId) {
    if (!element) return;
    element.addEventListener('dragover', (event) => handleBreadcrumbDragOver(event, folderId, element));
    element.addEventListener('dragleave', (event) => handleBreadcrumbDragLeave(event, element));
    element.addEventListener('drop', (event) => handleBreadcrumbDrop(event, folderId, element));
  }

  function computeMoveDestinations(selectedIds) {
    if (!state.treeView || !selectedIds || !selectedIds.length) {
      return [];
    }

    rebuildIndex();

    const normalizedSelected = selectedIds.map((id) => String(id));
    const destinations = [];

    const rootEligible = normalizedSelected.some((id) => {
      const parentId = state.parentIndex.get(id) || null;
      return parentId !== null;
    });

    if (rootEligible) {
      destinations.push({ id: null, label: 'Home' });
    }

    const visited = new Set();
    const walk = (nodes) => {
      (nodes || []).forEach((node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type !== 'folder') {
          if (Array.isArray(node.children) && node.children.length) {
            walk(node.children);
          }
          return;
        }
        const id = node.id !== undefined && node.id !== null ? String(node.id) : null;
        if (!id || visited.has(id)) {
          if (Array.isArray(node.children) && node.children.length) {
            walk(node.children);
          }
          return;
        }
        visited.add(id);
        const canAccept = normalizedSelected.some((itemId) => canMoveItemToTarget(itemId, id));
        if (canAccept) {
          const pathSegments = getNodePath(id);
          const label = pathSegments.length
            ? `${pathSegments.join(' / ')} / ${node.name || 'Folder'}`
            : node.name || 'Folder';
          destinations.push({ id, label });
        }
        if (Array.isArray(node.children) && node.children.length) {
          walk(node.children);
        }
      });
    };

    walk(state.treeView.nodes || []);
    return destinations;
  }

  function canMoveItemToTarget(itemId, targetId) {
    const normalizedItemId = itemId !== null && itemId !== undefined ? String(itemId) : null;
    const normalizedTargetId = targetId !== null && targetId !== undefined ? String(targetId) : null;
    if (!normalizedItemId || !state.nodeIndex.has(normalizedItemId)) {
      return false;
    }
    if (normalizedTargetId && !state.nodeIndex.has(normalizedTargetId)) {
      return false;
    }
    if (normalizedTargetId && normalizedTargetId === normalizedItemId) {
      return false;
    }
    const parentId = state.parentIndex.get(normalizedItemId) || null;
    if (parentId === normalizedTargetId) {
      return false;
    }
    const itemType = state.selectedItems.get(normalizedItemId) || state.visibleItemMeta.get(normalizedItemId)?.type;
    if (itemType === 'folder' && normalizedTargetId && isAncestor(normalizedItemId, normalizedTargetId)) {
      return false;
    }
    return true;
  }

  async function moveSelectedItemsToTarget(selectedIds, rawTargetId) {
    const normalizedTargetId = rawTargetId === null ? null : (rawTargetId !== undefined ? String(rawTargetId) : null);
    const targetNode = normalizedTargetId ? state.nodeIndex.get(normalizedTargetId) : null;

    const validIds = selectedIds.filter((id) => canMoveItemToTarget(id, normalizedTargetId));
    if (!validIds.length) {
      showNotification('The selected items are already in that location.', 'info');
      return;
    }

    const operations = [];
    for (const id of validIds) {
      const node = state.nodeIndex.get(id);
      if (!node) {
        continue;
      }
      const rawItemId = node.id;
      const rawTarget = targetNode ? targetNode.id : null;
      const parentId = state.parentIndex.get(id) || null;
      const normalizedParentId = parentId !== null && parentId !== undefined ? String(parentId) : null;
      if (normalizedParentId === normalizedTargetId) {
        continue;
      }
      const result = state.treeView.moveNode(rawItemId, rawTarget);
      if (result && typeof result.then === 'function') {
        operations.push(result);
      }
    }

    if (operations.length) {
      try {
        await Promise.allSettled(operations);
      } catch (error) {
        console.warn('[homeDashboard] Failed to move some items', error);
      }
    }

    state.selectedItems.clear();
    refresh();
    showNotification('Items moved successfully.', 'success');
  }

  function getModalManager() {
    if (state.treeView && state.treeView.modalManager) {
      return state.treeView.modalManager;
    }
    if (global.modalManager) {
      return global.modalManager;
    }
    if (global.ModalManager) {
      try {
        global.modalManager = new global.ModalManager();
        return global.modalManager;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function showNotification(message, type = 'info') {
    if (state.treeView && typeof state.treeView.showNotification === 'function') {
      state.treeView.showNotification({ message, type, duration: 2500 });
      return;
    }
    const modal = getModalManager();
    if (modal && typeof modal.showToast === 'function') {
      modal.showToast({ message, type, duration: 2500 });
    }
  }

  function showMoveSelectionDialog(destinations) {
    const modal = getModalManager();
    if (!modal || typeof modal.showDialog !== 'function') {
      const fallback = global.prompt('Enter destination folder ID (leave empty for Home):');
      if (fallback === null) {
        return Promise.resolve(undefined);
      }
      const trimmed = fallback.trim();
      return Promise.resolve(trimmed ? trimmed : null);
    }

    const modalApi = global.FolderMoveModal || (typeof window !== 'undefined' ? window.FolderMoveModal : null);
    if (!modalApi || typeof modalApi.show !== 'function') {
      const fallback = global.prompt('Enter destination folder ID (leave empty for Home):');
      if (fallback === null) {
        return Promise.resolve(undefined);
      }
      const trimmed = fallback.trim();
      return Promise.resolve(trimmed ? trimmed : null);
    }

    const formatted = destinations.map((dest) => {
      const id = dest.id === null || dest.id === undefined ? null : String(dest.id);
      const rawLabel = dest.label !== undefined && dest.label !== null ? String(dest.label) : '';
      const labelSegments = rawLabel ? rawLabel.split(' / ') : [];
      const name = dest.name !== undefined && dest.name !== null
        ? String(dest.name)
        : (labelSegments.length ? labelSegments[labelSegments.length - 1] : (id === null ? 'Home' : 'Folder'));
      const depth = id === null ? 0 : (labelSegments.length ? labelSegments.length - 1 : dest.depth || 0);
      const searchText = dest.searchText !== undefined && dest.searchText !== null
        ? String(dest.searchText)
        : (rawLabel || name);
      return {
        id,
        name,
        depth,
        searchText,
        icon: id === null ? 'fa-home' : 'fa-folder'
      };
    });

    return modalApi.show({
      modalManager: modal,
      title: 'Move selected items',
      labelText: 'Move selected items to',
      destinations: formatted,
      rootValue: MOVE_TO_ROOT_VALUE,
      confirmLabel: 'Move',
      cancelLabel: 'Cancel',
      searchPlaceholder: 'Search folders',
      emptyStateText: 'No folders match your search.',
      getIconColor: (id) => {
        if (!id || !state.treeView) {
          return '';
        }
        const folderNode = state.treeView.findNodeById(state.treeView.nodes, id);
        if (folderNode && folderNode.customization && folderNode.customization.iconColor) {
          return folderNode.customization.iconColor;
        }
        return '';
      }
    });
  }

  function canDropDraggedItemOnFolder(folderId) {
    if (!state.draggedItem) return false;
    const itemId = state.draggedItem.id;
    const targetId = folderId ? String(folderId) : null;
    if (!targetId && !folderId) {
      // Root drop always allowed unless already at root
      const parentId = state.parentIndex.get(itemId) || null;
      return parentId !== null;
    }

    const targetNode = state.nodeIndex.get(targetId);
    if (!targetNode || targetNode.type !== 'folder') {
      return false;
    }
    if (itemId === targetId) {
      return false;
    }
    const parentId = state.parentIndex.get(itemId) || null;
    if (parentId === targetId) {
      return false;
    }
    if (state.draggedItem.type === 'folder' && isAncestor(itemId, targetId)) {
      return false;
    }
    return true;
  }

  function isAncestor(ancestorId, descendantId) {
    let cursor = descendantId;
    while (cursor) {
      if (cursor === ancestorId) {
        return true;
      }
      cursor = state.parentIndex.get(cursor) || null;
    }
    return false;
  }

  function moveItemToFolder(itemId, folderId) {
    if (!state.treeView || typeof state.treeView.moveNode !== 'function') {
      return;
    }
    const itemNode = state.nodeIndex.get(itemId);
    const targetNode = folderId ? state.nodeIndex.get(folderId) : null;
    const rawItemId = itemNode ? itemNode.id : itemId;
    const rawTargetId = targetNode ? targetNode.id : null;
    const currentParent = state.parentIndex.get(itemId) || null;
    const normalizedTarget = folderId ? String(folderId) : null;
    if (currentParent === normalizedTarget) {
      return;
    }

    clearActiveDropTargets();
    state.draggedItem = null;

    const moveResult = state.treeView.moveNode(rawItemId, rawTargetId);
    if (moveResult && typeof moveResult.then === 'function') {
      moveResult.finally(() => {
        refresh();
      });
    } else {
      refresh();
    }
  }

  function clearActiveDropTargets() {
    state.folderContainer?.querySelectorAll('.folder-card.is-drop-target').forEach((el) => {
      el.classList.remove('is-drop-target');
    });
    state.folderContainer?.querySelectorAll('.folder-card.is-dragging').forEach((el) => {
      el.classList.remove('is-dragging');
    });
    state.breadcrumbContainer?.querySelectorAll('.file-manager-breadcrumb-item.is-drop-target').forEach((el) => {
      el.classList.remove('is-drop-target');
    });
    state.noteContainer?.querySelectorAll('.note-card.is-dragging').forEach((el) => {
      el.classList.remove('is-dragging');
    });
  }

  function render() {
    if (!state.folderContainer || !state.noteContainer || !state.treeView) return;
    const menuApi = getOptionsMenuApi();
    if (menuApi && typeof menuApi.closeActive === 'function') {
      menuApi.closeActive();
    }
    rebuildIndex();
    normalizeCurrentFolder();
    const data = collectTreeData();
    const hasQuery = Boolean(normalizeSearchTerm(state.searchQuery));

    if (state.selectedItems.size) {
      for (const id of Array.from(state.selectedItems.keys())) {
        if (!state.nodeIndex.has(id)) {
          state.selectedItems.delete(id);
        }
      }
    }

    renderBreadcrumb(data.path);

    const visibleFolderIds = data.folders.map((entry) => (entry?.node?.id !== undefined && entry?.node?.id !== null ? String(entry.node.id) : null)).filter(Boolean);
    const noteEntries = data.notes.slice(0, MAX_NOTES);
    const visibleNoteIds = noteEntries.map((entry) => (entry?.node?.id !== undefined && entry?.node?.id !== null ? String(entry.node.id) : null)).filter(Boolean);
    state.visibleItemIds = [...visibleFolderIds, ...visibleNoteIds];
    state.visibleItemMeta = new Map();
    visibleFolderIds.forEach((id) => state.visibleItemMeta.set(id, { type: 'folder' }));
    visibleNoteIds.forEach((id) => state.visibleItemMeta.set(id, { type: 'note' }));

    state.folderContainer.innerHTML = data.folders.length
      ? data.folders.map(renderFolderCard).join('')
      : `<div class="file-manager-empty">${hasQuery ? 'No folders match your search.' : 'No folders in this location.'}</div>`;

    state.noteContainer.innerHTML = noteEntries.length
      ? noteEntries.map(renderNoteCard).join('')
      : `<div class="file-manager-empty">${hasQuery ? 'No notes match your search.' : 'No notes in this location.'}</div>`;

    attachCardHandlers();
    attachCardOptionsMenus();
    updatePreviewDimensions();
    updateSearchUI();
    updateEditModeUI();
  }

  function collectTreeData() {
    const folders = [];
    const notes = [];
    const query = normalizeSearchTerm(state.searchQuery);

    const children = query
      ? getDescendantNodes(state.currentFolderId)
      : getCurrentChildren();
    (children || []).forEach((node) => {
      if (!node || !node.type) return;
      const id = node.id !== undefined && node.id !== null ? String(node.id) : null;
      if (!id) return;
      const nodePath = getNodePath(id);
      if (query && !matchesSearch(node, nodePath, query)) {
        return;
      }
      if (node.type === 'folder') {
        folders.push({ node, path: nodePath });
      } else if (node.type === 'note') {
        notes.push({ node, path: nodePath });
      }
    });

    notes.sort((a, b) => {
      if (state.sortMode === 'name') {
        return (a.node.name || '').localeCompare(b.node.name || '');
      }
      const aDate = new Date(a.node.updated_at || a.node.created_at || 0).getTime();
      const bDate = new Date(b.node.updated_at || b.node.created_at || 0).getTime();
      return bDate - aDate;
    });

    return {
      folders,
      notes,
      path: buildBreadcrumbPath()
    };
  }

  function attachCardHandlers() {
    if (!state.treeView) return;

    state.folderContainer.querySelectorAll('.folder-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.options-button') || event.target.closest('.options-submenu')) {
          return;
        }
        const folderId = card.getAttribute('data-folder-id');
        const id = folderId ? String(folderId) : null;
        if (!id) return;
        if (state.isEditMode) {
          toggleItemSelection(id, 'folder');
        } else {
          navigateToFolder(id);
        }
      });

      const checkbox = card.querySelector('.card-select-input');
      if (checkbox) {
        checkbox.addEventListener('click', (event) => {
          event.stopPropagation();
          event.preventDefault();
          const folderId = card.getAttribute('data-folder-id');
          if (!folderId) return;
          toggleItemSelection(String(folderId), 'folder', event.target.checked);
        });
      }

      const folderId = card.getAttribute('data-folder-id');
      if (folderId) {
        card.addEventListener('dragstart', (event) => handleItemDragStart(event, folderId, 'folder'));
        card.addEventListener('dragend', handleItemDragEnd);
        card.addEventListener('dragover', (event) => handleFolderDragOver(event, folderId, card));
        card.addEventListener('dragleave', (event) => handleFolderDragLeave(event, card));
        card.addEventListener('drop', (event) => handleFolderDrop(event, folderId, card));
      }
    });

    state.noteContainer.querySelectorAll('.note-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.options-button') || event.target.closest('.options-submenu')) {
          return;
        }
        const noteId = card.getAttribute('data-note-id');
        const noteTitle = card.getAttribute('data-note-title');
        if (!noteId) return;
        const id = String(noteId);
        if (state.isEditMode) {
          toggleItemSelection(id, 'note');
        } else if (typeof global.openNoteInCurrentView === 'function') {
          global.openNoteInCurrentView(id, noteTitle || 'Note', { source: 'file-manager' });
        }
      });

      const checkbox = card.querySelector('.card-select-input');
      if (checkbox) {
        checkbox.addEventListener('click', (event) => {
          event.stopPropagation();
          event.preventDefault();
          const noteId = card.getAttribute('data-note-id');
          if (!noteId) return;
          toggleItemSelection(String(noteId), 'note', event.target.checked);
        });
      }

      const noteId = card.getAttribute('data-note-id');
      if (noteId) {
        card.addEventListener('dragstart', (event) => handleItemDragStart(event, noteId, 'note'));
        card.addEventListener('dragend', handleItemDragEnd);
      }
    });
  }

  function attachCardOptionsMenus() {
    const menuApi = getOptionsMenuApi();
    if (!menuApi || state.isEditMode || !state.treeView || typeof state.treeView.handleNodeAction !== 'function') {
      return;
    }

    const attachMenu = (card, rawId) => {
      if (!card || !rawId) {
        return;
      }
      const id = String(rawId);
      if (!state.nodeIndex.has(id)) {
        return;
      }
      const anchor = card.querySelector('[data-options-anchor]') || card;
      if (anchor.dataset.optionsMenuAttached === '1') {
        return;
      }
      anchor.dataset.optionsMenuAttached = '1';

      const buildItems = () => {
        const resolveNode = () => state.nodeIndex.get(id);
        const node = resolveNode();
        if (!node) {
          return [];
        }

        const items = [];

        const pushAction = (action, label, icon) => {
          items.push({
            action,
            label,
            icon,
            onSelect: async () => {
              const current = resolveNode();
              if (!current) {
                return;
              }
              await state.treeView.handleNodeAction(current, action);
              refresh();
            }
          });
        };

        pushAction('rename', 'Rename', 'fas fa-pen');

        if (node.type === 'folder') {
          pushAction('iconcolor', 'Icon Color', 'fas fa-palette');
          pushAction('move', 'Move Folder', 'fas fa-folder-open');
        } else if (node.type === 'note') {
          pushAction('move', 'Move Note', 'fas fa-folder-open');
          pushAction('duplicate', 'Duplicate Note', 'fas fa-clone');
          pushAction('savetemplate', 'Save as Template', 'fas fa-bookmark');
        }

        pushAction('delete', 'Delete', 'fas fa-trash-alt');
        return items;
      };

      menuApi.create({
        container: anchor,
        items: buildItems,
        buttonClass: 'options-button',
        buttonContent: '&bull;&bull;&bull;',
        menuClass: 'options-submenu options-submenu--card',
        appendTo: anchor.ownerDocument && anchor.ownerDocument.body
      });
    };

    state.folderContainer.querySelectorAll('.folder-card').forEach((card) => {
      const folderId = card.getAttribute('data-folder-id');
      attachMenu(card, folderId);
    });

    state.noteContainer.querySelectorAll('.note-card').forEach((card) => {
      const noteId = card.getAttribute('data-note-id');
      attachMenu(card, noteId);
    });
  }

  function updatePreviewDimensions() {
    if (!state.noteContainer) return;
    const cards = state.noteContainer.querySelectorAll('.note-card-preview');
    cards.forEach((card) => {
      const canvas = card.querySelector('.note-card-preview-canvas');
      const inner = card.querySelector('.note-card-preview-canvas-inner');
      if (!canvas || !inner) {
        card.style.removeProperty('--note-preview-height');
        return;
      }

      card.style.removeProperty('--note-preview-height');
      card.style.removeProperty('--note-preview-width');
      inner.style.removeProperty('minHeight');
      inner.style.removeProperty('minWidth');
      inner.style.removeProperty('width');
  canvas.style.removeProperty('height');
  canvas.style.removeProperty('minHeight');
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('minWidth');

      const measuredHeight = Math.max(DEFAULT_PREVIEW_HEIGHT, inner.scrollHeight || 0);
      const measuredWidth = Math.max(DEFAULT_PREVIEW_WIDTH, inner.scrollWidth || 0);
      const computedStyle = global.getComputedStyle(card);
      let baseScale = parseFloat(card.dataset.previewBaseScale || '') || parseFloat(computedStyle.getPropertyValue('--note-preview-scale')) || 0.3;
      if (!card.dataset.previewBaseScale) {
        card.dataset.previewBaseScale = String(baseScale);
      }

      const parentCard = card.closest('.note-card');
      const parentRect = parentCard ? parentCard.getBoundingClientRect() : card.getBoundingClientRect();
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const availableWidth = parentRect ? Math.max(0, parentRect.width - paddingLeft - paddingRight) : 0;
      const marginTotal = availableWidth > 0 ? Math.min(availableWidth, PREVIEW_SIDE_MARGIN * 2) : 0;
      const widthAllowance = availableWidth > marginTotal ? availableWidth - marginTotal : availableWidth;

      const targetHeight = DEFAULT_PREVIEW_HEIGHT * baseScale;
      let targetWidth = DEFAULT_PREVIEW_WIDTH * baseScale;
      if (availableWidth > 0) {
        const constrainedWidth = widthAllowance > 0 ? widthAllowance : availableWidth;
        targetWidth = Math.min(targetWidth, Math.max(0, constrainedWidth));
      }
      if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
        targetWidth = DEFAULT_PREVIEW_WIDTH * MIN_PREVIEW_SCALE;
      }

      const scaleByHeight = measuredHeight > 0 ? targetHeight / measuredHeight : baseScale;
      const scaleByWidth = measuredWidth > 0 ? targetWidth / measuredWidth : baseScale;
      const effectiveScale = Math.max(MIN_PREVIEW_SCALE, Math.min(baseScale, scaleByHeight, scaleByWidth));

  const previewHeightValue = targetHeight / effectiveScale;
  const previewWidthValue = targetWidth / effectiveScale;

      card.style.setProperty('--note-preview-scale', `${effectiveScale}`);
      card.style.setProperty('--note-preview-height', `${previewHeightValue}px`);
      card.style.setProperty('--note-preview-width', `${previewWidthValue}px`);

  inner.style.minHeight = `${previewHeightValue}px`;
  inner.style.width = `${previewWidthValue}px`;
  inner.style.minWidth = `${previewWidthValue}px`;

      const mediaElements = inner.querySelectorAll('img, iframe, video');
      mediaElements.forEach((media) => {
        if (media.dataset.previewResizeBound) return;
        media.dataset.previewResizeBound = '1';
        const handler = () => {
          global.requestAnimationFrame(() => updatePreviewDimensions());
        };
        media.addEventListener('load', handler, { once: false });
        if (media.tagName === 'VIDEO') {
          media.addEventListener('loadedmetadata', handler, { once: false });
        }
      });
    });
  }

  function getCurrentChildren() {
    if (!state.treeView) return [];
    if (!state.currentFolderId) {
      return Array.isArray(state.treeView.nodes) ? state.treeView.nodes : [];
    }
    const folder = state.nodeIndex.get(state.currentFolderId);
    if (folder && Array.isArray(folder.children)) {
      return folder.children;
    }
    return [];
  }

  function getDescendantNodes(folderId) {
    if (!state.treeView) return [];
    const results = [];
    const queue = [];

    if (folderId) {
      const folder = state.nodeIndex.get(folderId);
      if (folder && Array.isArray(folder.children)) {
        queue.push(...folder.children);
      }
    } else if (Array.isArray(state.treeView.nodes)) {
      queue.push(...state.treeView.nodes);
    }

    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') {
        continue;
      }
      results.push(node);
      if (Array.isArray(node.children) && node.children.length) {
        queue.push(...node.children);
      }
    }

    return results;
  }

  function navigateToFolder(folderId) {
    const targetId = folderId ? String(folderId) : null;
    state.currentFolderId = targetId;
    if (targetId) {
      syncTreeSelectionToFolder(targetId);
    }
    if (state.isEditMode && state.selectedItems.size) {
      state.selectedItems.clear();
    }
    render();
  }

  function navigateUp() {
    if (!state.currentFolderId) return;
    const parentId = state.parentIndex.get(state.currentFolderId) || null;
    navigateToFolder(parentId);
  }

  function renderBreadcrumb(path) {
    if (!state.breadcrumbContainer) return;
    const crumbs = (path && path.length) ? path : [{ id: null, name: 'Home' }];
    const markup = crumbs.map((crumb, index) => {
      const label = escapeHtml(crumb.name || 'Home');
      if (index === crumbs.length - 1) {
        return `<span class="file-manager-breadcrumb-item is-current">${label}</span>`;
      }
      const value = crumb.id ? escapeHtml(crumb.id) : '';
      return `<span class="file-manager-breadcrumb-item"><button type="button" data-folder-id="${value}">${label}</button></span>`;
    }).join('');

    state.breadcrumbContainer.innerHTML = markup;
    state.breadcrumbContainer.querySelectorAll('button[data-folder-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const folderId = btn.getAttribute('data-folder-id');
        navigateToFolder(folderId || null);
      });
    });

    const crumbElements = Array.from(state.breadcrumbContainer.children || []);
    crumbElements.forEach((element, index) => {
      if (!element) return;
      const crumb = crumbs[index];
      if (!crumb) return;
      const targetId = crumb.id ? String(crumb.id) : null;
      setupBreadcrumbDropTarget(element, targetId);
    });

    if (state.backButton) {
      state.backButton.disabled = !state.currentFolderId;
    }
  }

  function rebuildIndex() {
    state.nodeIndex.clear();
    state.parentIndex.clear();

    const walk = (nodes, parentId = null) => {
      (nodes || []).forEach((node) => {
        if (!node || typeof node !== 'object') return;
        const id = node.id !== undefined && node.id !== null ? String(node.id) : null;
        if (id) {
          state.nodeIndex.set(id, node);
          state.parentIndex.set(id, parentId);
        }
        if (Array.isArray(node.children) && node.children.length) {
          walk(node.children, id || parentId);
        }
      });
    };

    if (state.treeView && Array.isArray(state.treeView.nodes)) {
      walk(state.treeView.nodes, null);
    }
  }

  function normalizeCurrentFolder() {
    if (!state.currentFolderId) return;
    if (!state.nodeIndex.has(state.currentFolderId)) {
      state.currentFolderId = null;
    }
  }

  function getNodePath(nodeId) {
    if (!nodeId) return [];
    const names = [];
    let cursor = state.parentIndex.get(nodeId) || null;
    while (cursor) {
      const node = state.nodeIndex.get(cursor);
      if (!node) break;
      names.unshift(node.name || '');
      cursor = state.parentIndex.get(cursor) || null;
    }
    return names.filter(Boolean);
  }

  function buildBreadcrumbPath() {
    const base = [{ id: null, name: 'Home' }];
    if (!state.currentFolderId) {
      return base;
    }
    const stack = [];
    let cursor = state.currentFolderId;
    while (cursor) {
      const node = state.nodeIndex.get(cursor);
      if (!node) break;
      stack.unshift({ id: cursor, name: node.name || 'Folder' });
      cursor = state.parentIndex.get(cursor) || null;
    }
    return base.concat(stack);
  }

  function isVisible() {
    if (!state.rootEl) return false;
    if (state.rootEl.classList.contains('is-hidden')) return false;
    if (state.rootEl.getAttribute('aria-hidden') === 'true') return false;
    return true;
  }

  function syncTreeSelectionToFolder(folderId) {
    if (!state.treeView || typeof state.treeView.findNodeById !== 'function' || typeof state.treeView.selectNode !== 'function') return;
    const node = state.treeView.findNodeById(state.treeView.nodes, folderId);
    if (!node) return;
    try {
      node.collapsed = false;
      if (typeof state.treeView.render === 'function') {
        state.treeView.render();
      }
      state.treeView.selectNode(folderId);
      const treeItem = global.document.getElementById(`tree-item-${folderId}`);
      treeItem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.warn('[homeDashboard] Failed to sync folder selection', error);
    }
  }

  function renderFolderCard(entry) {
    const { node, path } = entry;
    const id = node?.id !== undefined && node?.id !== null ? String(node.id) : '';
    const color = pickColor(node);
    const gradientStart = adjustColor(color, 14);
    const gradientEnd = adjustColor(color, -8);
    const counts = summarizeFolder(node);
    const parentPath = path.length ? escapeHtml(path.join(' / ')) : 'Root';
    const details = [];
    if (counts.notes) details.push(`${counts.notes} note${counts.notes === 1 ? '' : 's'}`);
    if (counts.folders) details.push(`${counts.folders} folder${counts.folders === 1 ? '' : 's'}`);
    const detailString = details.length ? details.join(' • ') : 'Empty';
    const updated = formatDate(node.updated_at || node.created_at || '');
    const isSelected = id && state.selectedItems.has(id);
    const classes = ['folder-card'];
    if (state.isEditMode) classes.push('is-selectable');
    if (isSelected) classes.push('is-selected');
    const selectionControl = (state.isEditMode && id)
      ? renderSelectionControl(id, 'folder', isSelected)
      : '';

    return `
      <div class="${classes.join(' ')}" data-folder-id="${escapeHtml(node.id)}" data-selectable-type="folder" data-draggable-type="folder" draggable="true">
        ${selectionControl}
        <div class="card-options-anchor" data-options-anchor></div>
        <div class="folder-card-cover" style="background: linear-gradient(135deg, ${gradientStart}, ${gradientEnd});">
          <i class="fas fa-folder-open"></i>
        </div>
        <div class="folder-card-body">
          <div class="folder-card-name">${escapeHtml(node.name || 'Folder')}</div>
          <div class="folder-card-meta">${escapeHtml(detailString)}</div>
          <div class="folder-card-path">${parentPath}</div>
          <div class="folder-card-footer">
            <span>${counts.total} item${counts.total === 1 ? '' : 's'}</span>
            <span>${updated}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderNoteCard(entry) {
    const { node, path } = entry;
    const id = node?.id !== undefined && node?.id !== null ? String(node.id) : '';
    const headerColor = getNoteHeaderColor(node);
    const headerTextColor = getNoteHeaderTextColor(node, headerColor);
    const previewSource = node.preview || extractPreview(node);
    const fallbackPlain = previewSource || getNotePlainText(node) || '';
    const previewHtml = buildPreviewHtml(node, fallbackPlain);
    const previewText = truncate(fallbackPlain || node.name || 'Empty note', 32);
    const previewMarkup = previewHtml
      ? `<div class="note-card-preview-canvas"><div class="note-card-preview-canvas-inner">${previewHtml}</div></div>`
      : `<span class="note-card-preview-text note-card-preview-empty">${escapeHtml(previewText)}</span>`;
    const previewClass = previewHtml ? 'note-card-preview note-card-preview--rich' : 'note-card-preview';
    const parentPath = path.length ? escapeHtml(path.join(' / ')) : 'Root';
    const size = formatFileSize(estimateSize(node));
    const updated = formatDate(node.updated_at || node.created_at || '');
    const titleIcon = getNodeIcon(node) || '📄';
    const titleMarkup = titleIcon
      ? `<span class="note-card-name-icon">${escapeHtml(titleIcon)}</span><span class="note-card-name-text">${escapeHtml(node.name || 'Untitled note')}</span>`
      : escapeHtml(node.name || 'Untitled note');
    const isSelected = id && state.selectedItems.has(id);
    const classes = ['note-card'];
    if (state.isEditMode) classes.push('is-selectable');
    if (isSelected) classes.push('is-selected');
    const selectionControl = (state.isEditMode && id)
      ? renderSelectionControl(id, 'note', isSelected)
      : '';

    return `
      <div class="${classes.join(' ')}" data-note-id="${escapeHtml(node.id)}" data-note-title="${escapeHtml(node.name || 'Note')}" data-selectable-type="note" data-draggable-type="note" draggable="true">
        ${selectionControl}
        <div class="card-options-anchor" data-options-anchor></div>
        <div class="${previewClass}" style="background: ${escapeHtml(headerColor)}; color: ${escapeHtml(headerTextColor)};">
          ${previewMarkup}
        </div>
        <div class="note-card-body">
          <div class="note-card-name">${titleMarkup}</div>
          <div class="note-card-path">${parentPath}</div>
          <div class="note-card-footer">
            <span>${size}</span>
            <span>${updated}</span>
          </div>
        </div>
      </div>
    `;
  }

  function normalizeSearchTerm(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  }

  function matchesSearch(node, pathSegments, query) {
    if (!query) return true;
    if (contains(query, node?.name)) return true;
    if (contains(query, node?.description)) return true;
    if (contains(query, node?.summary)) return true;
    if (contains(query, node?.preview)) return true;
    if (contains(query, node?.plain_text)) return true;
    if (contains(query, node?.plainText)) return true;
    if (Array.isArray(pathSegments) && pathSegments.some((segment) => contains(query, segment))) {
      return true;
    }
    return false;
  }

  function contains(query, value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    return value.toLowerCase().includes(query);
  }

  function buildPreviewHtml(node, fallbackText = '') {
    const blocks = getNoteBlocks(node);
    const sourceBlocks = Array.isArray(blocks) ? blocks.slice() : [];

    if (!sourceBlocks.length && fallbackText) {
      sourceBlocks.push({ type: 'paragraph', data: { text: fallbackText } });
    }

    const fragments = [];
    let remaining = MAX_PREVIEW_TOTAL_CHARACTERS;

    for (const block of sourceBlocks) {
      if (!block || fragments.length >= MAX_PREVIEW_BLOCKS || remaining <= 0) {
        break;
      }

      const result = renderPreviewBlock(block, remaining);
      if (!result || !result.html) {
        continue;
      }

      fragments.push(result.html);
      remaining -= result.consumed;
    }

    if (!fragments.length) {
      return '';
    }

    const header = renderPreviewHeader(node);
    return `
      <div class="note-card-preview-page">
        ${header}
        <div class="note-card-preview-content">
          ${fragments.join('')}
        </div>
      </div>
    `;
  }

  function renderSelectionControl(id, type, isSelected) {
    const safeId = escapeHtml(id);
    const safeType = escapeHtml(type);
    const checked = isSelected ? ' checked' : '';
    const label = type === 'folder' ? 'Select folder' : 'Select note';
    return `
      <label class="card-select-control" data-select-type="${safeType}" aria-label="${escapeHtml(label)}">
        <input type="checkbox" class="card-select-input" data-select-id="${safeId}" data-select-type="${safeType}"${checked} />
        <span class="card-select-visual"></span>
      </label>
    `;
  }

  function renderNestedBlocks(blocks, available) {
    if (!Array.isArray(blocks) || !blocks.length || available <= 0) {
      return { html: '', consumed: 0 };
    }

    const fragments = [];
    let consumed = 0;

    for (const nested of blocks) {
      const remaining = available - consumed;
      if (remaining <= 0) {
        break;
      }
      const result = renderPreviewBlock(nested, remaining);
      if (!result || !result.html) {
        continue;
      }
      fragments.push(result.html);
      consumed += result.consumed || 0;
    }

    return {
      html: fragments.join(''),
      consumed
    };
  }

  function getImageUrl(data) {
    if (!data || typeof data !== 'object') {
      return '';
    }
    const candidates = [data.url, data.imageUrl, data.file && data.file.url, data.file && data.file.path];
    for (const candidate of candidates) {
      const sanitized = safeUrl(candidate);
      if (sanitized) {
        return sanitized;
      }
    }
    return '';
  }

  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return '';
    }
    const trimmed = value.trim();
    if (/^(data|blob):/i.test(trimmed)) {
      return trimmed;
    }
    try {
      const base = (global && global.location && global.location.origin) ? global.location.origin : 'http://localhost';
      const parsed = new URL(trimmed, base);
      if (!/^(https?):$/i.test(parsed.protocol)) {
        return '';
      }
      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function extractHostname(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, '');
    } catch (error) {
      return '';
    }
  }

  function renderPreviewBlock(block, available) {
    if (!block || typeof block !== 'object') {
      return { html: '', consumed: 0 };
    }

    const type = block.type;
    const data = block.data || {};

    if (type === 'delimiter') {
      const delimiterHtml = `
        <div class="ce-delimiter cdx-block">
          <div class="ce-delimiter__line"></div>
        </div>
      `;
      return {
        html: wrapEditorBlock(delimiterHtml, 'delimiter'),
        consumed: Math.min(available, 1)
      };
    }

    if (type === 'header') {
      const level = Math.min(Math.max(Number(data.level) || 2, 1), 6);
      const usage = truncateForRemaining(clean(data.text), available);
      if (!usage.text) {
        return { html: '', consumed: 0 };
      }
      const headerHtml = `<div class="ce-header ce-header--h${level} cdx-block">${escapeHtml(usage.text)}</div>`;
      return {
        html: wrapEditorBlock(headerHtml, `header-h${level}`),
        consumed: usage.consumed
      };
    }

    if (type === 'paragraph') {
      const usage = truncateForRemaining(clean(data.text), available);
      if (!usage.text) {
        return { html: '', consumed: 0 };
      }
      const paragraphHtml = `<div class="ce-paragraph cdx-block">${escapeHtml(usage.text)}</div>`;
      return {
        html: wrapEditorBlock(paragraphHtml, 'paragraph'),
        consumed: usage.consumed
      };
    }

    if (type === 'table' && Array.isArray(data.content)) {
      const rows = data.content.filter((row) => Array.isArray(row)).slice(0, MAX_TABLE_ROWS);
      if (!rows.length) {
        return { html: '', consumed: 0 };
      }
      let consumed = 0;
      const markup = rows.map((row, rowIndex) => {
        const cells = row.slice(0, MAX_TABLE_COLUMNS).map((cell) => {
          const remaining = Math.max(available - consumed, 0);
          if (remaining <= 0) {
            return '';
          }
          const usage = truncateForRemaining(clean(cell), remaining);
          consumed += usage.consumed;
          const cellTag = data.withHeadings && rowIndex === 0 ? 'th' : 'td';
          const cellText = usage.text ? escapeHtml(usage.text) : '&#160;';
          return `<${cellTag}>${cellText}</${cellTag}>`;
        }).filter(Boolean);
        if (!cells.length) {
          return '';
        }
        return `<tr>${cells.join('')}</tr>`;
      }).filter(Boolean);

      if (!markup.length) {
        return { html: '', consumed: 0 };
      }

      const tableHtml = `
        <div class="tc-table cdx-block">
          <table class="tc-table__table">
            <tbody>${markup.join('')}</tbody>
          </table>
        </div>
      `;

      return {
        html: wrapEditorBlock(tableHtml, 'table'),
        consumed: Math.min(Math.max(consumed, rows.length), available)
      };
    }

    if (type === 'quote') {
      const usage = truncateForRemaining(clean(data.text), available);
      if (!usage.text) {
        return { html: '', consumed: 0 };
      }
      const captionRemaining = Math.max(available - usage.consumed, 0);
      const captionUsage = captionRemaining > 0 ? truncateForRemaining(clean(data.caption), captionRemaining) : { text: '', consumed: 0 };
      const quoteHtml = `
        <div class="cdx-quote cdx-block">
          <div class="cdx-quote__text">${escapeHtml(usage.text)}</div>
          ${captionUsage.text ? `<div class="cdx-quote__caption">${escapeHtml(captionUsage.text)}</div>` : ''}
        </div>
      `;
      return {
        html: wrapEditorBlock(quoteHtml, 'quote'),
        consumed: Math.min(available, usage.consumed + captionUsage.consumed)
      };
    }

    if (type === 'list' && Array.isArray(data.items)) {
      const items = [];
      let consumed = 0;
      for (const item of data.items) {
        if (items.length >= MAX_LIST_ITEMS || consumed >= available) {
          break;
        }
        const usage = truncateForRemaining(clean(item), available - consumed);
        if (!usage.text) {
          continue;
        }
        items.push(`<li class="cdx-list__item">${escapeHtml(usage.text)}</li>`);
        consumed += usage.consumed;
      }
      if (!items.length) {
        return { html: '', consumed: 0 };
      }
      const listTag = data.style === 'ordered' ? 'ol' : 'ul';
      const styleClass = data.style === 'ordered' ? 'ordered' : 'unordered';
      const listHtml = `
        <div class="cdx-block cdx-list">
          <${listTag} class="cdx-list cdx-list--${styleClass}">
            ${items.join('')}
          </${listTag}>
        </div>
      `;
      return {
        html: wrapEditorBlock(listHtml, 'list'),
        consumed
      };
    }

    if (type === 'checklist' && Array.isArray(data.items)) {
      const items = [];
      let consumed = 0;
      for (const item of data.items) {
        if (items.length >= MAX_CHECKLIST_ITEMS || consumed >= available) {
          break;
        }
        if (!item || typeof item !== 'object') {
          continue;
        }
        const usage = truncateForRemaining(clean(item.text), available - consumed);
        if (!usage.text) {
          continue;
        }
        const itemClass = item.checked ? 'cdx-checklist__item cdx-checklist__item--checked' : 'cdx-checklist__item';
        items.push(`
          <div class="${itemClass}">
            <span class="cdx-checklist__item-checkbox">${item.checked ? '&#10003;' : ''}</span>
            <span class="cdx-checklist__item-text">${escapeHtml(usage.text)}</span>
          </div>
        `);
        consumed += usage.consumed;
      }
      if (!items.length) {
        return { html: '', consumed: 0 };
      }
      const checklistHtml = `
        <div class="cdx-checklist cdx-block">
          ${items.join('')}
        </div>
      `;
      return {
        html: wrapEditorBlock(checklistHtml, 'checklist'),
        consumed
      };
    }

    if (type === 'code' && typeof data.code === 'string') {
      const lines = data.code.split(/\r?\n/).filter(Boolean);
      if (!lines.length) {
        return { html: '', consumed: 0 };
      }
      const limitedLines = lines.slice(0, MAX_CODE_LINES).map((line, index) => {
        const truncatedLine = line.length > MAX_CODE_LINE_LENGTH ? `${line.slice(0, MAX_CODE_LINE_LENGTH - 1)}…` : line;
        return index === MAX_CODE_LINES - 1 && lines.length > MAX_CODE_LINES ? `${truncatedLine}…` : truncatedLine;
      });
      const joined = limitedLines.join('\n');
      const codeHtml = `
        <div class="cdx-code cdx-block">
          <pre class="cdx-code__textarea">${escapeHtml(joined)}</pre>
        </div>
      `;
      return {
        html: wrapEditorBlock(codeHtml, 'code'),
        consumed: Math.min(joined.length, available)
      };
    }

    if (type === 'image') {
      const imageUrl = getImageUrl(data);
      const hasImage = Boolean(imageUrl);
      const captionPlain = clean(data.caption);
      const captionUsage = captionPlain ? truncateForRemaining(captionPlain, Math.min(available, MAX_EMBED_TEXT_LENGTH)) : { text: '', consumed: 0 };
      const modifiers = [
        data.withBackground ? ' simple-image__picture--with-background' : '',
        data.withBorder ? ' simple-image__picture--with-border' : '',
        data.stretched ? ' simple-image__picture--stretched' : ''
      ].join('');
      const allowedAlignments = ['left', 'center', 'right'];
      const alignment = allowedAlignments.includes(data.captionAlignment) ? data.captionAlignment : (allowedAlignments.includes(data.captionAlign) ? data.captionAlign : 'center');
      const mediaHtml = hasImage
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(captionPlain || 'Note image')}" loading="lazy" class="simple-image__picture${modifiers}" />`
        : `<div class="simple-image__placeholder${modifiers}">
             <span class="simple-image__placeholder-icon">📷</span>
             <span class="simple-image__placeholder-text">Image block</span>
           </div>`;
      const imageHtml = `
        <div class="simple-image">
          ${mediaHtml}
          ${captionUsage.text ? `<div class="simple-image__caption simple-image__caption--${alignment}">${escapeHtml(captionUsage.text)}</div>` : ''}
        </div>
      `;
      return {
        html: wrapEditorBlock(imageHtml, 'image'),
        consumed: Math.min(available, IMAGE_BLOCK_COST + captionUsage.consumed)
      };
    }

    if (type === 'embed') {
      const service = typeof data.service === 'string' ? data.service.trim() : '';
      const sourceUrl = safeUrl(data.source || data.embed || data.url || '');
      const host = extractHostname(sourceUrl);
      const label = service || host || 'Embedded content';
      const iconChar = label ? label.charAt(0).toUpperCase() : '';
      const captionPlain = clean(data.caption);
      const captionUsage = captionPlain ? truncateForRemaining(captionPlain, Math.min(available, MAX_EMBED_TEXT_LENGTH)) : { text: '', consumed: 0 };
      const embedHtml = `
        <div class="embed-preview">
          <div class="embed-preview__media">
            <span class="embed-preview__icon">${escapeHtml(iconChar || '↗')}</span>
          </div>
          <div class="embed-preview__meta">
            <span class="embed-preview__service">${escapeHtml(label)}</span>
            ${host ? `<span class="embed-preview__url">${escapeHtml(host)}</span>` : ''}
          </div>
          ${captionUsage.text ? `<div class="embed-preview__caption">${escapeHtml(captionUsage.text)}</div>` : ''}
        </div>
      `;
      return {
        html: wrapEditorBlock(embedHtml, 'embed'),
        consumed: Math.min(available, Math.max(captionUsage.consumed, 12))
      };
    }

    if (type === 'columns' && Array.isArray(data.columns)) {
      const columns = data.columns.slice(0, 3);
      if (!columns.length) {
        return { html: '', consumed: 0 };
      }
      let consumed = 0;
      const markup = columns.map((column) => {
        const nestedBlocks = Array.isArray(column && column.blocks) ? column.blocks : [];
        const remaining = Math.max(available - consumed, 0);
        const nested = renderNestedBlocks(nestedBlocks, remaining > 0 ? remaining : Math.min(available, MAX_PREVIEW_TOTAL_CHARACTERS));
        consumed += nested.consumed;
        const columnContent = nested.html || '<div class="note-card-preview-placeholder">&#160;</div>';
        return `<div class="editorjs-columns-column">${columnContent}</div>`;
      }).join('');

      const columnsHtml = `
        <div class="editorjs-columns">
          <div class="editorjs-columns-wrapper">
            ${markup}
          </div>
        </div>
      `;

      return {
        html: wrapEditorBlock(columnsHtml, 'columns'),
        consumed: Math.min(available, Math.max(consumed, columns.length * 2))
      };
    }

    if ((type === 'toggle' || type === 'spoiler') && (data.title || data.content)) {
      const title = escapeHtml(data.title || 'Details');
      const contentPlain = clean(data.content);
      const contentUsage = contentPlain ? truncateForRemaining(contentPlain, Math.min(available, MAX_TOGGLE_CONTENT_CHARACTERS)) : { text: '', consumed: 0 };
      const body = contentUsage.text
        ? `<div class="toggle-block__content"><p>${escapeHtml(contentUsage.text)}</p></div>`
        : '<div class="toggle-block__content"></div>';
      const toggleHtml = `
        <div class="toggle-block toggle-block--open">
          <div class="toggle-block__header">
            <span class="toggle-block__icon">▸</span>
            <span class="toggle-block__title">${title}</span>
          </div>
          ${body}
        </div>
      `;
      return {
        html: wrapEditorBlock(toggleHtml, 'toggle'),
        consumed: Math.min(available, contentUsage.consumed + title.length)
      };
    }

    if (type === 'raw' && typeof data.html === 'string') {
      const usage = truncateForRemaining(clean(data.html), available);
      if (!usage.text) {
        return { html: '', consumed: 0 };
      }
      const rawHtml = `
        <div class="cdx-block cdx-raw-html">
          <div class="cdx-raw-html__content">${escapeHtml(usage.text)}</div>
        </div>
      `;
      return {
        html: wrapEditorBlock(rawHtml, 'raw'),
        consumed: usage.consumed
      };
    }

    return { html: '', consumed: 0 };
  }

  function wrapEditorBlock(innerHtml, type) {
    return `
      <div class="ce-block note-card-preview-block note-card-preview-block--${type}">
        <div class="ce-block__content">
          ${innerHtml}
        </div>
      </div>
    `;
  }

  function renderPreviewHeader(node) {
    if (!node) {
      return '';
    }
    const title = escapeHtml(node.name || 'Untitled note');
    const icon = getNodeIcon(node) || '📄';
    const headerColor = escapeHtml(getNoteHeaderColor(node));
    const titleColor = escapeHtml(getNoteHeaderTextColor(node, headerColor));
    const styleAttr = ` style="background: ${headerColor}; color: ${titleColor};"`;
    const iconMarkup = `<span class="note-card-preview-icon">${escapeHtml(icon)}</span>`;
    return `
      <div class="note-card-preview-header"${styleAttr}>
        <div class="note-card-preview-title-row">
          ${iconMarkup}
          <h2 class="note-card-preview-title">${title}</h2>
        </div>
      </div>
    `;
  }

  function getNodeIcon(node) {
    if (!node) return '';
    if (node.customIcon) return String(node.customIcon);
    if (node.customization && node.customization.customIcon) {
      return String(node.customization.customIcon);
    }
    return '';
  }

  function getNoteHeaderColor(node) {
    if (node && node.customization && node.customization.backgroundColor) {
      return node.customization.backgroundColor;
    }
    return 'var(--note-header-bg)';
  }

  function getNoteHeaderTextColor(node, backgroundColor) {
    if (typeof backgroundColor === 'string' && !backgroundColor.startsWith('var(')) {
      return pickTextColor(backgroundColor);
    }
    return 'var(--text-color)';
  }

  function truncateForRemaining(text, remaining) {
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value || remaining <= 0) {
      return { text: '', consumed: 0 };
    }

    if (value.length <= remaining) {
      return { text: value, consumed: value.length };
    }

    if (remaining <= 1) {
      return { text: `${value.slice(0, 1)}…`, consumed: 1 };
    }

    const trimmed = value.slice(0, remaining - 1).replace(/\s+$/g, '');
    return { text: `${trimmed}…`, consumed: remaining };
  }

  function parseNoteContent(node) {
    if (!node || !node.content) return null;
    let content = node.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch (error) {
        console.warn('[homeDashboard] Failed to parse note content for preview', error);
        return null;
      }
    }

    if (content && typeof content === 'object' && !Array.isArray(content) && content.content && typeof content.content === 'object') {
      content = content.content;
    }

    return content && typeof content === 'object' ? content : null;
  }

  function getNoteBlocks(node) {
    const content = parseNoteContent(node);
    if (!content) return [];

    if (Array.isArray(content.blocks)) {
      return content.blocks.filter((block) => block && typeof block === 'object');
    }

    if (Array.isArray(content?.data?.blocks)) {
      return content.data.blocks.filter((block) => block && typeof block === 'object');
    }

    return [];
  }

  function getNotePlainText(node) {
    const content = parseNoteContent(node);
    if (content && typeof content.text === 'string') {
      return content.text;
    }
    return '';
  }

  function summarizeFolder(node) {
    const summary = { folders: 0, notes: 0 };
    const stack = [...(node.children || [])];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      if (current.type === 'folder') {
        summary.folders += 1;
        if (Array.isArray(current.children)) {
          stack.push(...current.children);
        }
      } else if (current.type === 'note') {
        summary.notes += 1;
      }
    }
    summary.total = summary.folders + summary.notes;
    return summary;
  }

  function extractPreview(node) {
    const blocks = getNoteBlocks(node);

    for (const block of blocks) {
      if (!block || !block.type) continue;
      const blockData = block.data || {};

      if (block.type === 'paragraph' || block.type === 'header' || block.type === 'quote') {
        const text = clean(blockData.text);
        if (text) return text;
      }

      if (block.type === 'list' && Array.isArray(blockData.items)) {
        const listText = blockData.items.map((item) => clean(item)).join(' ');
        if (listText.trim()) return listText.trim();
      }

      if (block.type === 'checklist' && Array.isArray(blockData.items)) {
        const checklist = blockData.items.map((item) => clean(item && item.text)).join(' ');
        if (checklist.trim()) return checklist.trim();
      }
    }

    const fallback = clean(getNotePlainText(node));
    if (fallback) return fallback;

    return '';
  }

  function clean(value) {
    if (!value) return '';
    return String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(value, maxLength) {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
  }

  function estimateSize(node) {
    try {
      return JSON.stringify(node.content || {}).length;
    } catch (error) {
      console.warn('[homeDashboard] Failed to estimate note size', error);
      return 0;
    }
  }

  function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const rounded = unitIndex === 0 ? Math.round(size) : Math.round(size * 10) / 10;
    return `Size: ${rounded}${units[unitIndex]}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pickColor(node) {
    const customization = node && node.customization;
    if (customization) {
      if (customization.iconColor) {
        return customization.iconColor;
      }
      if (customization.backgroundColor) {
        return customization.backgroundColor;
      }
    }
    return DEFAULT_FOLDER_ICON_COLOR;
  }

  function pickTextColor(color) {
    const parsed = parseColor(color);
    if (!parsed) return '#1F2933';
    const luminance = (0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b) / 255;
    return luminance > 0.6 ? '#1F2933' : '#FFFFFF';
  }

  function adjustColor(color, amount) {
    const parsed = parseColor(color);
    if (!parsed) return color;
    const factor = amount / 100;

    const adjustChannel = (channel) => {
      if (factor >= 0) {
        return Math.min(255, Math.round(channel + (255 - channel) * factor));
      }
      return Math.max(0, Math.round(channel * (1 + factor)));
    };

    const r = adjustChannel(parsed.r);
    const g = adjustChannel(parsed.g);
    const b = adjustChannel(parsed.b);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function parseColor(color) {
    if (!color) return null;
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16)
        };
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      }
    } else if (color.startsWith('rgb')) {
      const parts = color.replace(/rgba?\(|\)/g, '').split(',').map((part) => parseInt(part.trim(), 10));
      if (parts.length >= 3 && parts.every((component) => !Number.isNaN(component))) {
        return { r: parts[0], g: parts[1], b: parts[2] };
      }
    }
    return null;
  }

  function toHex(value) {
    const hex = value.toString(16).toUpperCase();
    return hex.length === 1 ? `0${hex}` : hex;
  }

  function hash(value) {
    const str = String(value || '');
    let hashValue = 0;
    for (let i = 0; i < str.length; i += 1) {
      hashValue = ((hashValue << 5) - hashValue) + str.charCodeAt(i); // eslint-disable-line no-bitwise
      hashValue |= 0; // eslint-disable-line no-bitwise
    }
    return hashValue;
  }

  global.homeNoteDashboard = {
    init,
    setTreeView,
    setHomeNoteId,
    handleNoteSelection,
    refresh,
    showDashboard,
    isVisible
  };
})(window);
