// Minimal Markdown -> EditorJS converter
// Supports: #..###### headers, paragraphs, unordered/ordered lists, code fences, blockquotes.
// Exposes window.mdToEditorJS(markdown) -> { blocks: [...] }

(function(){
  function tokenize(md) {
    const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
    const tokens = [];
    let i = 0;
    let inCode = false;
    let codeLang = '';
    let codeLines = [];
    let listBuffer = null; // { type: 'ul'|'ol', items: [] }

    function flushParagraph(par) {
      const text = par.join(' ').trim();
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

      // Headers
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        if (para.length) { flushParagraph(para); para = []; }
        flushList();
        tokens.push({ type: 'header', level: h[1].length, text: h[2].trim() });
        i++; continue;
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

      // Ordered list
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        if (para.length) { flushParagraph(para); para = []; }
        if (!listBuffer || listBuffer.type !== 'ol') {
          flushList(); listBuffer = { type: 'ol', items: [] };
        }
        listBuffer.items.push(ol[1]);
        i++; continue;
      }

      // Unordered list
      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) {
        if (para.length) { flushParagraph(para); para = []; }
        if (!listBuffer || listBuffer.type !== 'ul') {
          flushList(); listBuffer = { type: 'ul', items: [] };
        }
        listBuffer.items.push(ul[1]);
        i++; continue;
      }

      // Otherwise, part of a paragraph
      para.push(line.trim());
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
        blocks.push({ type: 'header', data: { text: t.text, level: Math.min(Math.max(t.level,1),6) } });
      } else if (t.type === 'paragraph') {
        blocks.push({ type: 'paragraph', data: { text: t.text } });
      } else if (t.type === 'ul') {
        blocks.push({ type: 'list', data: { style: 'unordered', items: t.items } });
      } else if (t.type === 'ol') {
        blocks.push({ type: 'list', data: { style: 'ordered', items: t.items } });
      } else if (t.type === 'code') {
        blocks.push({ type: 'code', data: { code: t.code } });
      } else if (t.type === 'quote') {
        blocks.push({ type: 'quote', data: { text: t.text, caption: '' } });
      } else if (t.type === 'table') {
        const content = [];
        if (t.header && t.header.length) content.push(t.header);
        for (const r of (t.rows || [])) content.push(r);
        blocks.push({ type: 'table', data: { withHeadings: !!(t.header && t.header.length), content } });
      }
    }
    return blocks;
  }

  function mdToEditorJS(md) {
    const tokens = tokenize(md || '');
    const blocks = toEditorJSBlocks(tokens);
    return { blocks };
  }

  window.mdToEditorJS = mdToEditorJS;
})();
