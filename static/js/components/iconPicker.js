/**
 * Icon Picker Component
 * iOS-style emoji icon picker with categories + recents (anchored to a button)
 * 
 * Usage:
 * attachIconPicker(inputElement, {
 *   anchorEl: buttonElement,  // Optional: element to anchor the picker to
 *   onSelect: (emoji) => {    // Optional: callback when emoji is selected
 *     console.log('Selected:', emoji);
 *   }
 * });
 * 
 * Then access picker methods via:
 * inputElement._iconPicker.show();
 * inputElement._iconPicker.hide();
 * inputElement._iconPicker.isOpen();
 */
(function() {
  'use strict';

  // iOS-style emoji icon picker with categories + recents (anchored to a button)
  function attachIconPicker(inputEl, opts = {}) {
    if (!inputEl || inputEl.dataset.iconPicker) return;
    inputEl.dataset.iconPicker = '1';
    const anchorEl = opts.anchorEl || inputEl;

    const pop = document.createElement('div');
    pop.className = 'icon-picker-popover';
    pop.setAttribute('role', 'listbox');
    pop.style.display = 'none';
    // Header with tabs (iOS-style)
    const header = document.createElement('div');
    header.className = 'icon-picker-header';
    const tabs = document.createElement('div');
    tabs.className = 'icon-tabs';
    header.appendChild(tabs);
    pop.appendChild(header);

    // Content grid
    const grid = document.createElement('div');
    grid.className = 'icon-grid';
    pop.appendChild(grid);
    document.body.appendChild(pop);

    // Categories
    const CATS = [
      { key: 'recent', label: '★', title: 'Recent' },
      { key: 'smileys', label: '😀', title: 'Smileys' },
      { key: 'people', label: '🧑', title: 'People' },
      { key: 'animals', label: '🐻', title: 'Animals' },
      { key: 'food', label: '🍔', title: 'Food' },
      { key: 'activities', label: '⚽', title: 'Activities' },
      { key: 'travel', label: '🚗', title: 'Travel' },
      { key: 'objects', label: '💡', title: 'Objects' },
      { key: 'symbols', label: '❤️', title: 'Symbols' },
      { key: 'flags', label: '🏳️', title: 'Flags' }
    ];

    const DATA = {
      smileys: '😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🙂‍↕️ 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤠 🤡 👻 💩 👽 🤖'.split(' '),
      people: '👋 🤚 ✋ 🖐 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🦵 🦶 👣 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁 👅 👄 🧑 🧒 👦 👧 👨 👩 🧔 👱‍♂️ 👱‍♀️ 🤵 👰 🤰 🤱 👨‍👩‍👧 👨‍👩‍👦'.split(' '),
      animals: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦂 🕷️ 🐢 🐍 🦎 🐙 🦑 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🦧 🦍 🐘 🐫 🐪 🐐 🐏 🐑 🐎 🐄 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🌾 🌺 🌸 🌼 🌻 🌷 🌹 🍄'.split(' '),
      food: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🥕 🧄 🧅 🥔 🍞 🥐 🥖 🥨 🥯 🥞 🧇 🧀 🍗 🍖 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍱 🍤 🍚 🍙 🍘 🥮 🥟 🥠 🥡 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥤 ☕ 🍵 🍺 🍻 🍷 🍸 🍹 🥃 🧋 🧉'.split(' '),
      activities: '⚽ 🏀 🏈 🏐 🏉 🎾 🥏 🎱 🏓 🏸 🥅 🏒 🏑 🥍 🥌 ⛳ 🏹 🎣 🛷 ⛸️ 🥊 🥋 🎽 🛹 🛼 🥇 🥈 🥉 🏆 🎖 🎗 🎫 🎟 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🧩 ♟️ 🎯 🎳 🎮 🕹️'.split(' '),
      travel: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 ✈️ 🛩️ 🛫 🛬 🪂 🚀 🛸 🚁 🚂 🚆 🚇 🚊 🚝 🚞 🚋 🚈 🚉 ⛵ 🚤 🛥️ 🛳️ ⛴️ ⚓ 🗽 🗼 🗿 🗺️ 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🛣️ 🛤️ 🏗️ 🏭 🏢 🏬 🏛️ 🕌 🛕 ⛪ 🕍 🏯 🏰 🏠 🏡 🏙️ 🌃 🌆 🌇'.split(' '),
      objects: '💡 🔦 🔌 🔋 🧯 🧲 🧪 ⚗️ 🧫 🧬 🔭 🔬 🔧 🔨 🛠️ ⚙️ 🧱 🧲 🪛 🔩 💎 💍 📿 🔗 🧷 🧵 🪡 🧶 🧥 👚 👕 👖 🧦 🧤 🧣 👗 👔 👟 👞 🥾 👜 👝 🎒 👓 🕶️ 🧳 ⌚ 📱 💻 🖥️ 🖨️ ⌨️ 🖱️ 💽 💾 💿 📷 🎥 📹 🔍 🔎 🕯️ 🛏️ 🛋️ 🚪 🪑 🪟 🧴 🧻 🪠 🧹 🧺 🧼 🧽 🪥'.split(' '),
      symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ ☸️ ✡️ 🔯 ☯️ ☦️ ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ 🔼 🔽 ⏫ ⏬ ➕ ➖ ➗ ❌ ✅ ✔️ ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↖️ ↙️ ↔️ ↩️ ↪️ ⤴️ ⤵️'.split(' '),
      flags: '🏳️ 🏴 🏁 🚩 🇺🇳 🇪🇺 🇺🇸 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇨🇦 🇲🇽 🇧🇷 🇦🇷 🇨🇴 🇨🇱 🇯🇵 🇨🇳 🇰🇷 🇮🇳 🇦🇺 🇳🇿 🇿🇦 🇳🇬 🇪🇬 🇸🇦 🇹🇷 🇺🇦 🇷🇺'.split(' ')
    };

    function loadRecents() {
      try { return JSON.parse(localStorage.getItem('icon_picker_recents') || '[]'); } catch { return []; }
    }
    function saveRecents(arr) {
      try { localStorage.setItem('icon_picker_recents', JSON.stringify(arr.slice(0, 24))); } catch {}
    }

    let currentCat = 'recent';
    let recents = loadRecents();

    let suppressClose = false;

    function renderTabs() {
      tabs.innerHTML = '';
      CATS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-tab' + (currentCat === c.key ? ' active' : '');
        b.title = c.title;
        b.textContent = c.label;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          currentCat = c.key;
          // Keep the menu open; just refresh contents and tabs
          suppressClose = true;
          // Defer re-render to next frame to avoid DOM removal affecting outside-click detector
          requestAnimationFrame(() => { renderTabs(); renderGrid(); });
        });
        tabs.appendChild(b);
      });
    }

    function addRecent(emo) {
      recents = [emo, ...recents.filter(x => x !== emo)];
      saveRecents(recents);
    }

    function selectEmoji(e) {
      inputEl.value = e;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof opts.onSelect === 'function') {
        try { opts.onSelect(e); } catch {}
      }
      addRecent(e);
      if (currentCat === 'recent') renderGrid();
      hide();
      // No focusing of hidden input; keep UX on header
    }

    function renderGrid() {
      grid.innerHTML = '';
      // Add a Default icon tile (Font Awesome tag) at the start
      const defBtn = document.createElement('button');
      defBtn.type = 'button';
      defBtn.className = 'icon-btn default';
      defBtn.innerHTML = '<i class="fas fa-tag"></i>';
      defBtn.setAttribute('aria-label', 'Use default icon');
      defBtn.title = 'Default';
      defBtn.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        try { if (typeof opts.onSelect === 'function') opts.onSelect(null); } catch {}
        hide();
      });
      grid.appendChild(defBtn);
      let list = [];
      if (currentCat === 'recent') {
        list = recents;
      } else {
        list = DATA[currentCat] || [];
      }
      list.forEach(e => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn';
        btn.textContent = e;
        btn.setAttribute('aria-label', `Use ${e} as icon`);
        btn.addEventListener('click', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          selectEmoji(e);
        });
        grid.appendChild(btn);
      });
      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'icon-empty';
        empty.textContent = 'No matches';
        grid.appendChild(empty);
      }
    }

    function position() {
      try {
        const r = anchorEl.getBoundingClientRect();
        const top = Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 8);
        let left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
        pop.style.top = `${Math.max(8, top)}px`;
        pop.style.left = `${left}px`;
      } catch {}
    }
    function show() { pop.style.display = 'block'; renderTabs(); renderGrid(); position(); }
    function hide() { pop.style.display = 'none'; }
    function isOpen() { return pop.style.display !== 'none'; }

    // Events
    document.addEventListener('click', (e) => {
      if (suppressClose) { suppressClose = false; return; }
      const clickInsideAnchor = (anchorEl && typeof anchorEl.contains === 'function') ? anchorEl.contains(e.target) : false;
      if (!pop.contains(e.target) && !clickInsideAnchor) hide();
    });
    window.addEventListener('resize', () => { if (isOpen()) position(); });
    window.addEventListener('scroll', () => { if (isOpen()) position(); }, true);

    // Expose programmatic controls for external triggers (e.g., header pencil)
    inputEl._iconPicker = { show, hide, isOpen, popEl: pop, anchorEl };
  }

  // Expose the function globally for use by other modules
  window.attachIconPicker = attachIconPicker;
})();
