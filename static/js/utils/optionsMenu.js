(function initOptionsMenu(global) {
  if (!global) {
    return;
  }

  if (global.OptionsMenu && typeof global.OptionsMenu.create === 'function') {
    return;
  }

  const state = {
    active: null,
    docClick: null,
    docKeydown: null,
  };

  function getDocument(container) {
    if (!container) {
      return global.document || null;
    }
    return container.ownerDocument || global.document || null;
  }

  function applyStyles(node, styles) {
    if (!node || !styles) {
      return;
    }
    Object.keys(styles).forEach((key) => {
      if (styles[key] !== undefined && styles[key] !== null) {
        node.style[key] = styles[key];
      }
    });
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (typeof value === 'function') {
      try {
        const result = value();
        return Array.isArray(result) ? result.slice() : [];
      } catch (error) {
        console.error('[OptionsMenu] Failed to build items', error);
        return [];
      }
    }
    return [];
  }

  function ensureDocumentHandlers(doc) {
    if (!doc || state.docClick || state.docKeydown) {
      return;
    }
    state.docClick = (event) => {
      const instance = state.active;
      if (!instance) {
        return;
      }
      const { button, menu } = instance;
      if (!menu || !button) {
        instance.close();
        return;
      }
      if (menu.contains(event.target) || button.contains(event.target)) {
        return;
      }
      instance.close();
    };
    state.docKeydown = (event) => {
      if (event.key === 'Escape' && state.active) {
        state.active.close();
      }
    };
    doc.addEventListener('click', state.docClick);
    doc.addEventListener('keydown', state.docKeydown);
  }

  function setActive(instance) {
    if (state.active && state.active !== instance) {
      state.active.close();
    }
    state.active = instance;
  }

  function buildItems(config, instance) {
    const items = toArray(config.items);
    const doc = instance.button ? instance.button.ownerDocument : getDocument(instance.container);
    instance.menu.innerHTML = '';
    let hasAction = false;

    items.forEach((item) => {
      if (!item || item.hidden || item.visible === false) {
        return;
      }
      if (item.type === 'separator') {
        const separator = doc.createElement('div');
        separator.className = 'submenu-separator';
        instance.menu.appendChild(separator);
        return;
      }
      const element = doc.createElement('div');
      element.className = 'submenu-item';
      element.setAttribute('role', 'menuitem');
      element.tabIndex = -1;

      if (item.className) {
        item.className.split(' ').forEach((cls) => {
          if (cls) {
            element.classList.add(cls);
          }
        });
      }
      if (item.action) {
        element.dataset.action = item.action;
      }

      const content = doc.createElement('span');
      content.className = 'submenu-item-label';
      content.textContent = item.label !== undefined ? String(item.label) : '';

      if (item.icon) {
        const iconWrapper = doc.createElement('span');
        iconWrapper.className = 'submenu-item-icon';
        const iconEl = doc.createElement('i');
        item.icon.split(' ').forEach((cls) => {
          if (cls) {
            iconEl.classList.add(cls);
          }
        });
        iconWrapper.appendChild(iconEl);
        element.appendChild(iconWrapper);
      }

      element.appendChild(content);

      const disabled = !!item.disabled;
      if (disabled) {
        element.classList.add('is-disabled');
        element.setAttribute('aria-disabled', 'true');
      } else {
        const activate = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const closeOnSelect = item.closeOnSelect !== false;
          if (closeOnSelect) {
            instance.close();
          }
          if (typeof item.onSelect === 'function') {
            try {
              Promise.resolve(item.onSelect({ event, instance, item })).catch((error) => {
                console.error('[OptionsMenu] Menu action failed', error);
              });
            } catch (error) {
              console.error('[OptionsMenu] Menu action failed', error);
            }
          }
          if (typeof config.onSelect === 'function') {
            try {
              config.onSelect(item.action || null, item, event);
            } catch (error) {
              console.error('[OptionsMenu] onSelect failed', error);
            }
          }
        };
        element.addEventListener('click', activate);
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            activate(event);
          }
        });
        hasAction = true;
      }
      instance.menu.appendChild(element);
    });

    if (!instance.menu.childElementCount && config.emptyLabel) {
      const empty = doc.createElement('div');
      empty.className = 'submenu-empty';
      empty.textContent = String(config.emptyLabel);
      instance.menu.appendChild(empty);
    }

    return hasAction;
  }

  function create(config = {}) {
    const container = config.container;
    if (!container) {
      return null;
    }
    const doc = getDocument(container);
    if (!doc) {
      return null;
    }

    ensureDocumentHandlers(doc);

    const button = config.button || doc.createElement(config.buttonTag || 'span');
    if (!config.button) {
      container.appendChild(button);
    }
    const menu = doc.createElement('div');
    let menuParent = container;
    if (config.appendTo) {
      if (typeof config.appendTo === 'function') {
        try {
          const resolved = config.appendTo({ container, button, doc });
          if (resolved && typeof resolved.appendChild === 'function') {
            menuParent = resolved;
          }
        } catch (error) {
          console.error('[OptionsMenu] appendTo resolver failed', error);
        }
      } else if (typeof config.appendTo.appendChild === 'function') {
        menuParent = config.appendTo;
      }
    }
    menuParent.appendChild(menu);

    if (config.enforceRelative !== false && menuParent === container) {
      const view = doc.defaultView || global;
      if (view && typeof view.getComputedStyle === 'function') {
        const computed = view.getComputedStyle(container);
        if (computed && computed.position === 'static') {
          container.style.position = 'relative';
        }
      } else if (!container.style.position) {
        container.style.position = 'relative';
      }
    }

    const instance = {
      container,
      config,
      button,
  menu,
  menuParent,
      isOpen: false,
      cleanup: [],
      open(event) {
        if (this.isOpen) {
          return;
        }
        const hasItems = buildItems(this.config, this);
        if (!hasItems && !this.menu.childElementCount) {
          return;
        }
        setActive(this);
        if (typeof this.config.onBeforeOpen === 'function') {
          try {
            this.config.onBeforeOpen({ event, instance: this });
          } catch (error) {
            console.error('[OptionsMenu] onBeforeOpen failed', error);
          }
        }
        this.menu.style.display = 'block';
        
  // Position menu using fixed positioning relative to button
  const buttonRect = this.button.getBoundingClientRect();
  const view = this.button.ownerDocument?.defaultView || global;
  const viewportHeight = view ? view.innerHeight : window.innerHeight;
  const viewportWidth = view ? view.innerWidth : window.innerWidth;
  const menuHeight = this.menu.offsetHeight;
  const menuWidth = this.menu.offsetWidth;
        
        // Calculate position - default to below and aligned to right
        let top = buttonRect.bottom + 6;
        let left = buttonRect.right - menuWidth;
        
        // If menu would go off bottom of viewport, show above button
        if (viewportHeight && top + menuHeight > viewportHeight) {
          top = buttonRect.top - menuHeight - 6;
        }
        
        // If menu would go off left of viewport, align to left edge of button
        if (left < 0) {
          left = buttonRect.left;
        }
        
        // If menu would still go off right, align to right edge of viewport
        if (viewportWidth && left + menuWidth > viewportWidth) {
          left = viewportWidth - menuWidth - 10;
        }

        if (top < 6) {
          top = 6;
        }
        if (left < 6) {
          left = 6;
        }

        this.menu.style.right = 'auto';
        this.menu.style.bottom = 'auto';
        
        this.menu.style.top = `${top}px`;
        this.menu.style.left = `${left}px`;
        
        this.button.setAttribute('aria-expanded', 'true');
        this.isOpen = true;
        if (this.config.hideButton && typeof this.showButton === 'function') {
          this.showButton();
        }
      },
      close() {
        if (!this.isOpen) {
          if (state.active === this) {
            state.active = null;
          }
          return;
        }
        this.menu.style.display = 'none';
        this.button.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
        if (state.active === this) {
          state.active = null;
        }
        if (typeof this.config.onAfterClose === 'function') {
          try {
            this.config.onAfterClose({ instance: this });
          } catch (error) {
            console.error('[OptionsMenu] onAfterClose failed', error);
          }
        }
        if (this.config.hideButton && typeof this.hideButton === 'function') {
          this.hideButton();
        }
      },
      destroy() {
        this.close();
        this.cleanup.forEach((fn) => {
          try {
            fn();
          } catch (error) {
            console.error('[OptionsMenu] Cleanup failed', error);
          }
        });
        this.cleanup = [];
        if (this.menu && this.menu.parentNode) {
          this.menu.parentNode.removeChild(this.menu);
        }
        if (!this.config.button && this.button && this.button.parentNode === this.container) {
          this.container.removeChild(this.button);
        }
      },
    };

    const defaultButtonClass = 'options-button';
    if (config.buttonClass) {
      config.buttonClass.split(' ').forEach((cls) => {
        if (cls) {
          button.classList.add(cls);
        }
      });
    } else if (!button.classList.contains(defaultButtonClass)) {
      button.classList.add(defaultButtonClass);
    }

    if (config.buttonContent !== undefined) {
      button.innerHTML = config.buttonContent;
    } else if (!config.button && button.innerHTML.trim() === '') {
      button.innerHTML = '&bull;&bull;&bull;';
    }

    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');

    menu.className = config.menuClass || 'options-submenu';
    menu.style.display = 'none';
    applyStyles(button, config.buttonStyles);
    applyStyles(menu, config.menuStyles);

    const showDisplay = config.buttonShowDisplay || 'inline-block';

    if (config.hideButton) {
      const hoverTarget = config.hoverTarget || container;
      const show = () => {
        button.style.display = showDisplay;
      };
      const hide = () => {
        if (!instance.isOpen) {
          button.style.display = 'none';
        }
      };
      hide();
      hoverTarget.addEventListener('mouseenter', show);
      hoverTarget.addEventListener('mouseleave', hide);
      instance.showButton = show;
      instance.hideButton = hide;
      instance.cleanup.push(() => {
        hoverTarget.removeEventListener('mouseenter', show);
        hoverTarget.removeEventListener('mouseleave', hide);
      });
    }

    if (config.onCreate instanceof Function) {
      try {
        config.onCreate({ instance });
      } catch (error) {
        console.error('[OptionsMenu] onCreate failed', error);
      }
    }

    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (instance.isOpen) {
        instance.close();
      } else {
        instance.open(event);
      }
    };

    const handleKeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleClick(event);
      }
    };

    button.addEventListener('click', handleClick);
    button.addEventListener('keydown', handleKeydown);

    instance.cleanup.push(() => {
      button.removeEventListener('click', handleClick);
      button.removeEventListener('keydown', handleKeydown);
    });

    return instance;
  }

  global.OptionsMenu = {
    create,
    closeActive() {
      if (state.active) {
        state.active.close();
      }
    },
    getActive() {
      return state.active;
    },
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
