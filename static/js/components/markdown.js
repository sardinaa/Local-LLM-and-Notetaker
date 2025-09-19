// Minimal Markdown -> EditorJS converter
// Supports: #..###### headers, paragraphs, unordered/ordered lists, code fences, blockquotes.
// Exposes window.mdToEditorJS(markdown) -> { blocks: [...] }

(function(){
  // Preserve LaTeX segments so Markdown processing doesn't mangle them
  function protectMathSegments(src) {
    const placeholders = [];
    let out = '';
    let i = 0;
    let inInlineCode = false;
    let inFence = false;
    while (i < src.length) {
      if (!inInlineCode && src.startsWith('```', i)) {
        inFence = !inFence;
        out += src.slice(i, i + 3);
        i += 3; continue;
      }
      if (!inFence && src[i] === '`') {
        inInlineCode = !inInlineCode;
        out += src[i++];
        continue;
      }
      if (!inFence && !inInlineCode) {
        // $$...$$
        if (src.startsWith('$$', i)) {
          const end = src.indexOf('$$', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key; i = end + 2; continue;
          }
        }
        // \[ ... \]
        if (src.startsWith('\\[', i)) {
          const end = src.indexOf('\\]', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key; i = end + 2; continue;
          }
        }
        // \( ... \)
        if (src.startsWith('\\(', i)) {
          const end = src.indexOf('\\)', i + 2);
          if (end !== -1) {
            const seg = src.slice(i, end + 2);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key; i = end + 2; continue;
          }
        }
        // $...$
        if (src[i] === '$' && src[i+1] !== '$') {
          let j = i + 1;
          while (j < src.length) {
            if (src[j] === '$' && src[j-1] !== '\\') break;
            j++;
          }
          if (j < src.length && src[j] === '$') {
            const seg = src.slice(i, j + 1);
            const key = `{{MATH${placeholders.length}}}`;
            placeholders.push(seg);
            out += key; i = j + 1; continue;
          }
        }
      }
      out += src[i++];
    }
    return { text: out, placeholders };
  }

  function restoreMathSegments(str, placeholders) {
    let out = str;
    if (placeholders && placeholders.length) {
      placeholders.forEach((seg, idx) => {
        const key = `{{MATH${idx}}}`;
        out = out.split(key).join(seg);
      });
    }
    return out;
  }
  // Convert HTML (from a Markdown renderer) to EditorJS blocks
  function htmlToBlocks(html) {
    const blocks = [];
    if (!html || typeof html !== 'string') return blocks;
    const root = document.createElement('div');
    root.innerHTML = html;

    function textOrHTML(n) {
      return (n && n.innerHTML != null) ? n.innerHTML.trim() : '';
    }

    function extractListItems(listEl) {
      const items = [];
      const isOrdered = listEl.tagName.toLowerCase() === 'ol';
      const lis = Array.from(listEl.children).filter(ch => ch.tagName && ch.tagName.toLowerCase() === 'li');
      for (const li of lis) {
        const clone = li.cloneNode(true);
        Array.from(clone.querySelectorAll('ul,ol')).forEach(n => n.remove());
        let base = clone.innerHTML.trim();

        const nestedLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
        const nestedLines = [];
        for (const nested of nestedLists) {
          const isNestedOrdered = nested.tagName.toLowerCase() === 'ol';
          const childLis = Array.from(nested.children).filter(ch => ch.tagName && ch.tagName.toLowerCase() === 'li');
          let idx = 1;
          for (const childLi of childLis) {
            const childClone = childLi.cloneNode(true);
            Array.from(childClone.querySelectorAll('ul,ol')).forEach(n => n.remove());
            const childText = childClone.innerHTML.trim();
            const bullet = isNestedOrdered ? (idx + '. ') : '• ';
            nestedLines.push(bullet + childText);
            idx++;
          }
        }
        if (nestedLines.length) base = base + '<br/>' + nestedLines.join('<br/>' );
        items.push(base);
      }
      return { style: isOrdered ? 'ordered' : 'unordered', items };
    }

    const nodes = Array.from(root.childNodes);
    for (const node of nodes) {
      if (node.nodeType === 3) {
        const t = (node.textContent || '').trim();
        if (t) blocks.push({ type: 'paragraph', data: { text: t } });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag.slice(1), 10) || 1;
        blocks.push({ type: 'header', data: { text: textOrHTML(node), level } });
      } else if (tag === 'p') {
        const htmlText = textOrHTML(node);
        if (htmlText) blocks.push({ type: 'paragraph', data: { text: htmlText } });
      } else if (tag === 'pre') {
        const code = node.querySelector('code');
        const codeText = code ? code.textContent : node.textContent;
        blocks.push({ type: 'code', data: { code: codeText || '' } });
      } else if (tag === 'ul' || tag === 'ol') {
        const list = extractListItems(node);
        blocks.push({ type: 'list', data: list });
      } else if (tag === 'blockquote') {
        const q = textOrHTML(node);
        blocks.push({ type: 'quote', data: { text: q, caption: '' } });
      } else if (tag === 'hr') {
        blocks.push({ type: 'delimiter', data: {} });
      } else if (tag === 'table') {
        const rows = [];
        let header = [];
        const trEls = node.querySelectorAll('tr');
        trEls.forEach(tr => {
          const ths = Array.from(tr.querySelectorAll('th'));
          const tds = Array.from(tr.querySelectorAll('td'));
          if (ths.length) {
            header = ths.map(th => th.innerHTML.trim());
          } else if (tds.length) {
            rows.push(tds.map(td => td.innerHTML.trim()));
          }
        });
        const content = [];
        if (header.length) content.push(header);
        rows.forEach(r => content.push(r));
        blocks.push({ type: 'table', data: { withHeadings: header.length > 0, content } });
      } else {
        const htmlText = textOrHTML(node);
        if (htmlText) blocks.push({ type: 'paragraph', data: { text: htmlText } });
      }
    }
    return blocks;
  }

  function inlineFormat(text) {
    if (!text) return text;
    let t = String(text);
    // Inline code first
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold (strong)
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/__([^_]+)__/g, '<b>$1</b>');
    // Italic (em)
    t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    t = t.replace(/(?<!_)_([^_]+)_(?!_)/g, '<i>$1</i>');
    return t;
  }
  function tokenize(md) {
    const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
    const tokens = [];
    let i = 0;
    let inCode = false;
    let codeLang = '';
    let codeLines = [];
    let listBuffer = null; // { type: 'ul'|'ol', items: [] }

    function flushParagraph(par) {
      if (!par || par.length === 0) return;
      let out = '';
      for (let i = 0; i < par.length; i++) {
        const seg = par[i] || {};
        const t = (seg.text || '').trim();
        if (!t) continue;
        out += (i === 0 ? '' : (seg.br ? '<br/>' : ' ')) + t;
      }
      const text = (out || '').trim();
      if (text) tokens.push({ type: 'paragraph', text });
    }

    function flushList() {
      if (listBuffer) {
        tokens.push({ type: listBuffer.type === 'ol' ? 'ol' : 'ul', items: listBuffer.items.slice() });
        listBuffer = null;
      }
    }

    let para = [];
    function isTableSep(s) {
      return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s || '');
    }
    function isTableRow(s) {
      return /^\s*\|.*\|\s*$/.test(s || '');
    }

    function parseTable(start) {
      const rows = [];
      let idx = start;
      // First line header, second line separator
      const headerLine = lines[idx];
      const sepLine = lines[idx+1];
      if (!isTableRow(headerLine) || !isTableSep(sepLine)) return null;
      const header = headerLine.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
      idx += 2;
      while (idx < lines.length && isTableRow(lines[idx])) {
        const row = lines[idx].trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        rows.push(row);
        idx++;
      }
      return { next: idx, header, rows };
    }

    while (i < lines.length) {
      const line = lines[i];

      // Code fence handling
      const fence = line.match(/^```(.*)$/);
      if (fence) {
        if (!inCode) {
          // entering code
          if (para.length) { flushParagraph(para); para = []; }
          flushList();
          inCode = true; codeLang = (fence[1] || '').trim(); codeLines = [];
          i++; continue;
        } else {
          // leaving code
          tokens.push({ type: 'code', lang: codeLang, code: codeLines.join('\n') });
          inCode = false; codeLang = ''; codeLines = [];
          i++; continue;
        }
      }
      if (inCode) { codeLines.push(line); i++; continue; }

      // Blank line breaks paragraphs/lists
      if (/^\s*$/.test(line)) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        i++; continue;
      }

      // Bold-only line treated as a header (level 3)
      const boldOnly = line && line.trim().match(/^\*\*(.+)\*\*$|^__(.+)__$/);
      if (boldOnly) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        const text = line.trim().replace(/^\*\*\s*|\s*\*\*$/g, '').replace(/^__\s*|\s*__$/g, '');
        tokens.push({ type: 'header', level: 3, text });
        i++; continue;
      }

      // Headers
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        tokens.push({ type: 'header', level: h[1].length, text: h[2].trim() });
        i++; continue;
      }

      // Standalone title heuristic: a short, plain line followed by a blank line
      const nextLine = (i+1 < lines.length) ? lines[i+1] : '';
      const plain = (line || '').trim();
      if (
        plain && (/^\s*$/.test(nextLine || '')) &&
        !/^(#{1,6})\s+/.test(plain) && // not an ATX header
        !/^>\s?/.test(plain) &&        // not a quote
        !/^\s*[-*+]\s+/.test(plain) && !/^\s*\d+\.\s+/.test(plain) && // not a list
        !/^```/.test(plain) &&
        plain.length <= 80 && !/[.!?:]$/.test(plain)
      ) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        tokens.push({ type: 'header', level: 3, text: plain });
        i += 2; // skip the following blank line
        continue;
      }

      // Blockquote
      const bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        tokens.push({ type: 'quote', text: bq[1] });
        i++; continue;
      }

      // Table (GFM-style)
      if (isTableRow(line) && i+1 < lines.length && isTableSep(lines[i+1])) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        const tbl = parseTable(i);
        if (tbl) {
          tokens.push({ type: 'table', header: tbl.header, rows: tbl.rows });
          i = tbl.next;
          continue;
        }
      }

      // Ordered list (supports 1. and 1) styles)
      const ol = line.match(/^\s*\d+[\.)]\s+(.*)$/);
      if (ol) {
        if (para.length) { flushParagraph(para); para = []; }
        if (!listBuffer || listBuffer.type !== 'ol') {
          flushList(); listBuffer = { type: 'ol', items: [] };
        }
        listBuffer.items.push(ol[1]);
        i++; continue;
      }

      // Unordered list (supports -, *, +, •)
      const ul = line.match(/^\s*[\-\*\+•]\s+(.*)$/);
      if (ul) {
        if (para.length) { flushParagraph(para); para = []; }
        if (!listBuffer || listBuffer.type !== 'ul') {
          flushList(); listBuffer = { type: 'ul', items: [] };
        }
        listBuffer.items.push(ul[1]);
        i++; continue;
      }

      // Indented continuation of a list item (append to last)
      if (listBuffer && /^\s{2,}\S/.test(line || '')) {
        if (listBuffer.items.length > 0) {
          const last = listBuffer.items[listBuffer.items.length - 1] || '';
          const cont = (line || '').trim();
          listBuffer.items[listBuffer.items.length - 1] = (last ? (last + ' ' + cont) : cont);
          i++; continue;
        }
      }

      // Otherwise, part of a paragraph
      const hasHardBreak = /[ \t]{2,}$/.test(line || '');
      const cleaned = (line || '').replace(/[ \t]+$/g, '');
      para.push({ text: cleaned, br: hasHardBreak });
      i++;
    }

    // flush tail
    if (para.length) flushParagraph(para);
    flushList();
    if (inCode) {
      tokens.push({ type: 'code', lang: codeLang, code: codeLines.join('\n') });
    }
    return tokens;
  }

  function toEditorJSBlocks(tokens) {
    const blocks = [];
    for (const t of tokens) {
      if (t.type === 'header') {
        blocks.push({ type: 'header', data: { text: inlineFormat(t.text), level: Math.min(Math.max(t.level,1),6) } });
      } else if (t.type === 'paragraph') {
        blocks.push({ type: 'paragraph', data: { text: inlineFormat(t.text) } });
      } else if (t.type === 'ul') {
        blocks.push({ type: 'list', data: { style: 'unordered', items: (t.items || []).map(inlineFormat) } });
      } else if (t.type === 'ol') {
        blocks.push({ type: 'list', data: { style: 'ordered', items: (t.items || []).map(inlineFormat) } });
      } else if (t.type === 'code') {
        blocks.push({ type: 'code', data: { code: t.code } });
      } else if (t.type === 'quote') {
        blocks.push({ type: 'quote', data: { text: inlineFormat(t.text), caption: '' } });
      } else if (t.type === 'table') {
        const content = [];
        if (t.header && t.header.length) content.push(t.header.map(inlineFormat));
        for (const r of (t.rows || [])) content.push(r.map(inlineFormat));
        blocks.push({ type: 'table', data: { withHeadings: !!(t.header && t.header.length), content } });
      }
    }
    return blocks;
  }

  function mdToEditorJS(md) {
    try {
      if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
        try { window.marked.setOptions && window.marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false }); } catch {}
        const raw = String(md || '');
        const { text: mdSafe, placeholders } = protectMathSegments(raw);
        const html = restoreMathSegments(window.marked.parse(mdSafe), placeholders);
        const blocks = htmlToBlocks(html);
        return { blocks };
      }
    } catch (e) {
      try { console.warn('marked-based MD conversion failed, using fallback:', e); } catch {}
    }
    const raw = String(md || '');
    const protectedRes = protectMathSegments(raw);
    const tokens = tokenize(protectedRes.text);
    const blocks = toEditorJSBlocks(tokens);
    // Restore any placeholders in block contents after formatting
    const restoreIn = (s) => restoreMathSegments(s, protectedRes.placeholders);
    blocks.forEach(b => {
      if (b && b.data) {
        if (typeof b.data.text === 'string') b.data.text = restoreIn(b.data.text);
        if (Array.isArray(b.data.items)) b.data.items = b.data.items.map(restoreIn);
        if (Array.isArray(b.data.content)) b.data.content = b.data.content.map(row => row.map(restoreIn));
      }
    });
    return { blocks };
  }

  window.mdToEditorJS = mdToEditorJS;
})();
