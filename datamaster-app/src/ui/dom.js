// Helpers de DOM minimos (sem dependencias).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

const fmtBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export function money(v) {
  if (v == null || v === '' || Number(v) === 0) return '';
  const n = Math.round(Number(v));
  return n < 0 ? `(${fmtBR.format(Math.abs(n))})` : fmtBR.format(n);
}

export function toast(msg, kind = 'info') {
  const t = el('div', { class: `toast ${kind}`, text: msg });
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
