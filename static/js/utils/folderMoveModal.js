(function initFolderMoveModal(global) {
  if (!global) {
    return;
  }

  if (global.FolderMoveModal && typeof global.FolderMoveModal.show === 'function') {
    return;
  }

  const INDENT = '&nbsp;&nbsp;&nbsp;&nbsp;';
  const DEFAULT_EMPTY = 'No folders match your search.';
  const DEFAULT_PLACEHOLDER = 'Search folders';

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseDepth(entry) {
    if (typeof entry.depth === 'number' && Number.isFinite(entry.depth)) {
      return entry.depth < 0 ? 0 : entry.depth;
    }
    if (entry.id === null || entry.id === undefined) {
      return 0;
    }
    if (typeof entry.label === 'string' && entry.label.length) {
      const parts = entry.label.split(' / ');
      if (parts.length <= 1) {
        return 0;
      }
      parts.pop();
      return parts.length;
    }
    if (typeof entry.path === 'string' && entry.path.length) {
      const segments = entry.path.split('/').filter((part) => part && part.trim().length);
      if (!segments.length) {
        return 0;
      }
      return Math.max(0, segments.length - 1);
    }
    return 0;
  }

  function normalizeDestinations(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map((entry) => {
      const id = entry.id === null || entry.id === undefined ? null : String(entry.id);
      const depth = parseDepth(entry);
      const name = entry.name !== undefined && entry.name !== null
        ? String(entry.name)
        : (entry.label ? String(entry.label).split(' / ').pop() : 'Folder');
      const searchText = entry.searchText !== undefined && entry.searchText !== null
        ? String(entry.searchText)
        : (entry.label ? String(entry.label) : name);
      const icon = entry.icon || (id === null ? 'fa-home' : 'fa-folder');
      const color = entry.color || '';
      return {
        id,
        depth: depth < 0 ? 0 : depth,
        name,
        searchText,
        icon,
        color,
        raw: entry,
        children: [],
      };
    });
  }

  function buildHierarchy(items) {
    const nodes = items.map((item) => ({ ...item, children: [] }));
    const hierarchy = [];

    nodes.forEach((node, index) => {
      if (node.depth <= 0) {
        hierarchy.push(node);
        return;
      }
      for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = nodes[i];
        if (candidate.depth === node.depth - 1) {
          candidate.children.push(node);
          return;
        }
      }
      hierarchy.push(node);
    });

    return hierarchy;
  }

  function generateOptionHTML(node, context) {
    const isRoot = node.id === null;
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const encodedValue = isRoot ? '' : encodeURIComponent(String(node.id));
    const color = node.color || (typeof context.getIconColor === 'function' ? context.getIconColor(node.id, node.raw) : '');
    const colorStyle = color ? ` style="color: ${color};"` : '';

    let html = `
      <button type="button"
        class="file-manager-move-option${isRoot ? ' is-root' : ''}${hasChildren ? ' has-children' : ''}"
        data-id="${isRoot ? context.rootValueSafe : escapeHtml(String(node.id))}"
        data-value="${escapeHtml(encodedValue)}"
        data-depth="${node.depth}"
        data-search="${escapeHtml(node.searchText.toLowerCase())}"
        data-is-root="${isRoot ? 'true' : 'false'}"
        role="option"
        aria-selected="false">
        <div class="file-manager-move-option-content">
          <span class="file-manager-move-option-name">
            ${INDENT.repeat(node.depth)}<i class="fas ${node.icon}"${colorStyle}></i> ${escapeHtml(node.name)}${hasChildren ? ' <i class="fas fa-chevron-right folder-toggle"></i>' : ''}
          </span>
        </div>
      </button>
    `;

    if (hasChildren) {
      node.children.forEach((child) => {
        html += generateOptionHTML(child, context);
      });
    }

    return html;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function showFolderMoveModal(options = {}) {
    return new Promise((resolve) => {
      const {
        modalManager,
        title = 'Move items',
        labelText = 'Move items to',
        destinations = [],
        rootValue = '__ROOT__',
        confirmLabel = 'Move',
        cancelLabel = 'Cancel',
        searchPlaceholder = DEFAULT_PLACEHOLDER,
        emptyStateText = DEFAULT_EMPTY,
        getIconColor = null,
        onSubmit = null,
        onCancel = null,
        initialSelectionId,
      } = options;

      if (!modalManager || typeof modalManager.showDialog !== 'function') {
        resolve(undefined);
        return;
      }

      const hierarchy = buildHierarchy(normalizeDestinations(destinations));
      const context = {
        rootValueSafe: escapeHtml(rootValue),
        getIconColor,
      };

      const optionMarkup = hierarchy.map((node) => generateOptionHTML(node, context)).join('');
      const dialogHtml = `
        <div class="file-manager-move-dialog" data-role="move-dialog">
          <div class="file-manager-move-header">
            <label for="moveDestinationSearch">${escapeHtml(labelText)}</label>
            <div class="file-manager-move-search">
              <i class="fas fa-search"></i>
              <input type="search" id="moveDestinationSearch" placeholder="${escapeHtml(searchPlaceholder)}" autocomplete="off" />
            </div>
          </div>
          <div class="file-manager-move-list" id="moveDestinationList" role="listbox" aria-label="${escapeHtml(labelText)}">
            ${optionMarkup}
          </div>
          <div class="file-manager-move-empty" id="moveDestinationEmpty" hidden>${escapeHtml(emptyStateText)}</div>
        </div>
      `;

      const overlay = modalManager.modalOverlay;
      const cleanup = () => {
        if (overlay) {
          overlay.onclick = null;
        }
      };

      let finished = false;
      const finish = (value) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        modalManager.closeModal();
        resolve(value);
      };

      const cancel = () => {
        if (typeof onCancel === 'function') {
          try {
            onCancel();
          } catch (error) {
            console.error('[FolderMoveModal] onCancel failed', error);
          }
        }
        finish(undefined);
      };

      modalManager.showDialog(escapeHtml(title), dialogHtml, [
        {
          label: cancelLabel,
          close: false,
          action: () => {
            cancel();
          },
        },
        {
          label: confirmLabel,
          primary: true,
          close: false,
          action: () => {},
        },
      ]);

      const dialogEl = overlay ? overlay.querySelector('.file-manager-move-dialog') : null;
      const searchInput = overlay ? overlay.querySelector('#moveDestinationSearch') : null;
      const listEl = overlay ? overlay.querySelector('#moveDestinationList') : null;
      const emptyEl = overlay ? overlay.querySelector('#moveDestinationEmpty') : null;
      const optionEls = Array.from(listEl ? listEl.querySelectorAll('.file-manager-move-option') : []);
      const cancelBtn = overlay ? overlay.querySelector('.simple-dialog-btn[data-i="0"]') : null;
      const confirmBtn = overlay ? overlay.querySelector('.simple-dialog-btn[data-i="1"]') : null;

      let selectedButton = null;
      let confirmBusy = false;

      const safeFocus = (element) => {
        if (!element || typeof element.focus !== 'function') {
          return;
        }
        try {
          element.focus({ preventScroll: true });
        } catch (error) {
          element.focus();
        }
      };

      const getSelectedValue = () => {
        if (!selectedButton) {
          return undefined;
        }
        if (selectedButton.dataset.isRoot === 'true') {
          return null;
        }
        const encoded = selectedButton.dataset.value || '';
        return safeDecode(encoded);
      };

      const updateConfirmState = () => {
        if (!confirmBtn) {
          return;
        }
        const hasSelection = typeof getSelectedValue() !== 'undefined';
        const shouldDisable = confirmBusy || !hasSelection;
        confirmBtn.disabled = shouldDisable;
        confirmBtn.classList.toggle('is-disabled', shouldDisable);
      };

      const setConfirmBusy = (busy) => {
        confirmBusy = !!busy;
        updateConfirmState();
      };

      const indicateError = () => {
        if (!dialogEl) {
          return;
        }
        dialogEl.classList.add('is-invalid');
        setTimeout(() => dialogEl.classList.remove('is-invalid'), 260);
        if (searchInput) {
          safeFocus(searchInput);
        }
      };

      const setSelection = (button, focus = false) => {
        if (!button || button.classList.contains('is-hidden')) {
          return;
        }
        if (selectedButton === button) {
          if (focus) {
            safeFocus(button);
          }
          return;
        }
        if (selectedButton) {
          selectedButton.classList.remove('is-selected');
          selectedButton.setAttribute('aria-selected', 'false');
        }
        selectedButton = button;
        selectedButton.classList.add('is-selected');
        selectedButton.setAttribute('aria-selected', 'true');
        if (dialogEl) {
          dialogEl.classList.remove('is-invalid');
        }
        updateConfirmState();
        if (focus) {
          safeFocus(selectedButton);
        }
      };

      const toggleFolder = (button) => {
        if (!button.classList.contains('has-children')) {
          return;
        }
        const depth = parseInt(button.dataset.depth || '0', 10);
        const isExpanded = button.classList.contains('is-expanded');
        const chevron = button.querySelector('.folder-toggle');

        if (isExpanded) {
          button.classList.remove('is-expanded');
          if (chevron) {
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-right');
          }
          let foundSelf = false;
          optionEls.forEach((btn) => {
            if (btn === button) {
              foundSelf = true;
              return;
            }
            if (!foundSelf) {
              return;
            }
            const btnDepth = parseInt(btn.dataset.depth || '0', 10);
            if (btnDepth > depth) {
              btn.classList.add('is-collapsed');
              btn.classList.remove('is-expanded');
              const childChevron = btn.querySelector('.folder-toggle');
              if (childChevron) {
                childChevron.classList.remove('fa-chevron-down');
                childChevron.classList.add('fa-chevron-right');
              }
            } else {
              foundSelf = false;
            }
          });
        } else {
          button.classList.add('is-expanded');
          if (chevron) {
            chevron.classList.remove('fa-chevron-right');
            chevron.classList.add('fa-chevron-down');
          }
          let foundSelf = false;
          optionEls.forEach((btn) => {
            if (btn === button) {
              foundSelf = true;
              return;
            }
            if (!foundSelf) {
              return;
            }
            const btnDepth = parseInt(btn.dataset.depth || '0', 10);
            if (btnDepth === depth + 1) {
              btn.classList.remove('is-collapsed');
            } else if (btnDepth <= depth) {
              foundSelf = false;
            }
          });
        }
      };

      const getVisibleOptions = () => optionEls.filter((btn) => !btn.classList.contains('is-hidden') && !btn.classList.contains('is-collapsed'));

      const filterOptions = (term) => {
        const normalized = term.trim().toLowerCase();
        let visibleCount = 0;

        if (!normalized) {
          optionEls.forEach((btn) => {
            btn.classList.remove('is-hidden');
            const depth = parseInt(btn.dataset.depth || '0', 10);
            if (depth > 0) {
              btn.classList.add('is-collapsed');
            } else {
              btn.classList.remove('is-collapsed');
            }
            btn.classList.remove('is-expanded');
            const chevron = btn.querySelector('.folder-toggle');
            if (chevron) {
              chevron.classList.remove('fa-chevron-down');
              chevron.classList.add('fa-chevron-right');
            }
            btn.setAttribute('aria-hidden', 'false');
            btn.tabIndex = 0;
          });
          visibleCount = optionEls.filter((btn) => parseInt(btn.dataset.depth || '0', 10) === 0).length;
        } else {
          optionEls.forEach((btn) => {
            const haystack = (btn.dataset.search || '').toLowerCase();
            const matches = haystack.includes(normalized);
            btn.classList.toggle('is-hidden', !matches);
            btn.classList.remove('is-collapsed');
            btn.setAttribute('aria-hidden', matches ? 'false' : 'true');
            btn.tabIndex = matches ? 0 : -1;
            if (matches) {
              visibleCount += 1;
            }
          });
        }

        const selectionVisible = selectedButton && !selectedButton.classList.contains('is-hidden') && !selectedButton.classList.contains('is-collapsed');
        if (!selectionVisible && selectedButton) {
          selectedButton.classList.remove('is-selected');
          selectedButton.setAttribute('aria-selected', 'false');
          selectedButton = null;
          updateConfirmState();
        }

        if (emptyEl) {
          if (visibleCount) {
            emptyEl.setAttribute('hidden', '');
          } else {
            emptyEl.removeAttribute('hidden');
          }
        }
      };

      const focusRelative = (current, delta) => {
        const visible = getVisibleOptions();
        if (!visible.length) {
          return;
        }
        let index = visible.indexOf(current);
        if (index === -1) {
          index = delta > 0 ? 0 : visible.length - 1;
        } else {
          index = Math.max(0, Math.min(visible.length - 1, index + delta));
        }
        const next = visible[index];
        if (next) {
          setSelection(next, true);
        }
      };

      const handleConfirm = async () => {
        if (confirmBusy) {
          return;
        }
        const value = getSelectedValue();
        if (typeof value === 'undefined') {
          indicateError();
          return;
        }
        if (typeof onSubmit === 'function') {
          setConfirmBusy(true);
          try {
            const result = await onSubmit(value);
            if (result === false) {
              setConfirmBusy(false);
              return;
            }
          } catch (error) {
            console.error('[FolderMoveModal] onSubmit failed', error);
            setConfirmBusy(false);
            return;
          }
        }
        finish(value);
      };

      const commitSelection = () => {
        if (typeof getSelectedValue() === 'undefined') {
          indicateError();
          return;
        }
        handleConfirm();
      };

      if (cancelBtn) {
        cancelBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            cancel();
          }
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', (event) => {
          event.preventDefault();
          handleConfirm();
        });
      }

      optionEls.forEach((btn) => {
        const depth = parseInt(btn.dataset.depth || '0', 10);
        if (depth > 0) {
          btn.classList.add('is-collapsed');
        }
        btn.addEventListener('click', (event) => {
          if (event.target && event.target.classList.contains('folder-toggle')) {
            toggleFolder(btn);
            event.stopPropagation();
            return;
          }
          setSelection(btn, true);
        });
        btn.addEventListener('dblclick', () => {
          setSelection(btn, true);
          if (typeof getSelectedValue() !== 'undefined') {
            handleConfirm();
          }
        });
        btn.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusRelative(btn, 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusRelative(btn, -1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            const visible = getVisibleOptions();
            if (visible.length) {
              setSelection(visible[0], true);
            }
          } else if (event.key === 'End') {
            event.preventDefault();
            const visible = getVisibleOptions();
            if (visible.length) {
              setSelection(visible[visible.length - 1], true);
            }
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelection(btn, true);
            if (typeof getSelectedValue() !== 'undefined') {
              handleConfirm();
            }
          }
        });
      });

      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          filterOptions(event.target.value || '');
        });
        searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const visible = getVisibleOptions();
            if (visible.length) {
              setSelection(visible[0], true);
            }
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const visible = getVisibleOptions();
            if (visible.length) {
              setSelection(visible[visible.length - 1], true);
            }
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (typeof getSelectedValue() !== 'undefined') {
              handleConfirm();
            } else {
              indicateError();
            }
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            if (searchInput.value) {
              searchInput.value = '';
              filterOptions('');
            }
          }
        });
        requestAnimationFrame(() => {
          safeFocus(searchInput);
          try {
            searchInput.select();
          } catch (error) {
            /* ignore */
          }
        });
      }

      const initialSelectionKey = (() => {
        if (typeof initialSelectionId === 'undefined') {
          return null;
        }
        if (initialSelectionId === null) {
          return context.rootValueSafe;
        }
        return escapeHtml(String(initialSelectionId));
      })();

      if (initialSelectionKey) {
        const initialButton = optionEls.find((btn) => btn.getAttribute('data-id') === initialSelectionKey);
        if (initialButton) {
          setSelection(initialButton, false);
        }
      }

      filterOptions('');
      updateConfirmState();

      if (overlay) {
        overlay.onclick = (event) => {
          if (event.target === overlay) {
            cancel();
          }
        };
      }
    });
  }

  global.FolderMoveModal = { show: showFolderMoveModal };
})(typeof window !== 'undefined' ? window : globalThis);
