// Shared render helpers for markdown, code, and math

function anchorHeadingsAndFences(text) {
  if (!text) return text;
  let t = String(text);
  t = t.replace(/([^\n])\s+(#{1,6}\s)/g, (m, pre, hashes) => pre + '\n' + hashes);
  t = t.replace(/([^\n])\s*```/g, (m, pre) => pre + '\n```');
  return t;
}

export function normalizeMathDelimiters(src) {
  if (!src) return src;
  let text = String(src);
  text = text.replace(/(^|\n)([ \t]*)\[\s*\n([\s\S]*?)\n[ \t]*\]([^\n]*)/g, (m, pre, indent, body, trailing) => {
    const lines = body.split(/\n/);
    let minIndent = null;
    for (const ln of lines) {
      if (!ln.trim()) continue;
      const match = ln.match(/^[ \t]*/);
      const ind = match ? match[0].length : 0;
      minIndent = (minIndent === null) ? ind : Math.min(minIndent, ind);
    }
    let cleaned = body;
    if (minIndent && minIndent > 0) {
      const re = new RegExp(`^[ \\t]{0,${minIndent}}`, 'gm');
      cleaned = body.replace(re, '');
    }
    const rest = trailing && trailing.trim() ? `\n${trailing.trim()}` : '';
    return `${pre}$$\n${cleaned}\n$${'$'}${rest}`; // escape $$ end in template
  });
  const fixArtifacts = (s) => s
    .replace(/\^\s*\{\s*,\s*([A-Za-z0-9])/g, '^{$1}')
    .replace(/_\s*\{\s*,\s*([A-Za-z0-9])/g, '_{$1}')
    .replace(/,\s*([A-Za-z])/g, ' $1')
    .replace(/\\forall\s*,/g, '\\forall ')
    .replace(/,\s*(\\lVert|\\rVert)/g, ' $1');
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => `$$${fixArtifacts(inner)}$$`);
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => `\\[${fixArtifacts(inner)}\\]`);
  text = text.replace(/\\left\s*\\\(/g, '\\left(')
             .replace(/\\right\s*\\\)/g, '\\right)')
             .replace(/\\left\s*\\\[/g, '\\left[')
             .replace(/\\right\s*\\\]/g, '\\right]')
             .replace(/\\left\s*\\\{/g, '\\left{')
             .replace(/\\right\s*\\\}/g, '\\right}');
  return text;
}

export function protectMathSegments(src) {
  const placeholders = [];
  let out = '';
  let i = 0;
  let inInlineCode = false;
  let inFence = false;
  while (i < src.length) {
    if (!inInlineCode && src.startsWith('```', i)) {
      inFence = !inFence;
      out += src.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (!inFence && src[i] === '`') {
      inInlineCode = !inInlineCode;
      out += src[i++];
      continue;
    }
    if (!inFence && !inInlineCode) {
      if (src.startsWith('$$', i)) {
        const end = src.indexOf('$$', i + 2);
        if (end !== -1) {
          const seg = src.slice(i, end + 2);
          const key = `{{MATH${placeholders.length}}}`;
          placeholders.push(seg);
          out += key;
          i = end + 2;
          continue;
        }
      }
      if (src.startsWith('\\[', i)) {
        const end = src.indexOf('\\]', i + 2);
        if (end !== -1) {
          const seg = src.slice(i, end + 2);
          const key = `{{MATH${placeholders.length}}}`;
          placeholders.push(seg);
          out += key;
          i = end + 2;
          continue;
        }
      }
      if (src.startsWith('\\(', i)) {
        const end = src.indexOf('\\)', i + 2);
        if (end !== -1) {
          const seg = src.slice(i, end + 2);
          const key = `{{MATH${placeholders.length}}}`;
          placeholders.push(seg);
          out += key;
          i = end + 2;
          continue;
        }
      }
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
          out += key;
          i = j + 1;
          continue;
        }
      }
    }
    out += src[i++];
  }
  return { text: out, placeholders };
}

export function restoreMathSegments(html, placeholders) {
  let out = html;
  if (placeholders && placeholders.length) {
    placeholders.forEach((seg, idx) => {
      const key = `{{MATH${idx}}}`;
      out = out.split(key).join(seg);
    });
  }
  return out;
}

export function coercePlainMathToLatex(src) {
  try {
    if (!src) return src;
    let out = String(src);
    out = out.replace(/\bEq(?:uation)?\.?\s*\[([\s\S]*?)\](?:\s*\(\d+\))?/g, (m, inner) => {
      let s = inner;
      const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
      for (const k in sym) { s = s.split(k).join(sym[k]); }
      const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
      for (const k in greek) { s = s.split(k).join(greek[k]); }
      s = s.replace(/−/g, '-');
      s = s.replace(/p\s*θ/g, 'p_{\\theta}');
      return `$$${s}$$`;
    });
    out = out.replace(/\bEq(?:uation)?\.?\s*\(\d+\)\s*:\s*([^\n]+)/g, (m, rhs) => {
      let s = rhs;
      const sym = { '∑':'\\sum', '≥':'\\ge', '≤':'\\le', '∫':'\\int', '∏':'\\prod', '∞':'\\infty' };
      for (const k in sym) { s = s.split(k).join(sym[k]); }
      const greek = { 'θ':'\\theta', 'μ':'\\mu', 'π':'\\pi', 'σ':'\\sigma', 'φ':'\\phi', 'λ':'\\lambda', 'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ω':'\\omega' };
      for (const k in greek) { s = s.split(k).join(greek[k]); }
      s = s.replace(/−/g, '-');
      s = s.replace(/p\s*θ/g, 'p_{\\theta}');
      return `$$${s}$$`;
    });
    return out;
  } catch { return src; }
}

export function renderMarkdownSafe(src) {
  try {
    if (!window.marked) return String(src || '');
    const bulletSafe = String(src || '').replace(/(^|\n)\*\s/g, '$1- ');
    const mathCoerced = coercePlainMathToLatex(bulletSafe);
    const anchored = anchorHeadingsAndFences(mathCoerced);
    const normalized = normalizeMathDelimiters(anchored);
    const { text: mdSafe, placeholders } = protectMathSegments(normalized);
    const html = window.marked.parse(mdSafe);
    return restoreMathSegments(html, placeholders);
  } catch (e) {
    return String(src || '');
  }
}

export function addCopyButtonsToCodeBlocks(container) {
  if (!container) return;
  const codeBlocks = container.querySelectorAll('pre code');
  codeBlocks.forEach(codeBlock => {
    const preElement = codeBlock.parentElement;
    if (!preElement) return;
    if (preElement.querySelector('.code-copy-btn')) return;
    const copyButton = document.createElement('button');
    copyButton.className = 'code-copy-btn';
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.title = 'Copy to clipboard';
    preElement.appendChild(copyButton);
    copyButton.addEventListener('click', () => {
      const codeText = codeBlock.textContent;
      navigator.clipboard.writeText(codeText)
        .then(() => {
          copyButton.innerHTML = '<i class="fas fa-check"></i>';
          setTimeout(() => { copyButton.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
        })
        .catch(() => {
          copyButton.innerHTML = '<i class="fas fa-times"></i>';
          setTimeout(() => { copyButton.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
        });
    });
  });
}

export function queueMathTypeset(el) {
  try {
    if (!el) return;
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    } else {
      if (!window._pendingMathEls) window._pendingMathEls = [];
      window._pendingMathEls.push(el);
    }
  } catch {}
}

export function finalizeBotMessage(el, text) {
  if (!el) return;
  const html = renderMarkdownSafe(text);
  el.innerHTML = html;
  try {
    if (window.hljs) el.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch {} });
  } catch {}
  try { addCopyButtonsToCodeBlocks(el); } catch {}
  try { queueMathTypeset(el); } catch {}
}

// Attach to window for legacy consumers
try {
  window.renderMarkdownSafe = renderMarkdownSafe;
  window.finalizeBotMessage = finalizeBotMessage;
  window.addCopyButtonsToCodeBlocks = addCopyButtonsToCodeBlocks;
  window.queueMathTypeset = queueMathTypeset;
} catch {}

