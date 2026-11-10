// Helper mínimo para armar DOM sin innerHTML (el texto de los CSV entra siempre como texto).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function extLink(href, ...children) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}
