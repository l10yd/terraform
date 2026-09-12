export interface ElOptions {
  cls?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean>;
  style?: Partial<CSSStyleDeclaration>;
  parent?: HTMLElement;
  onClick?: (e: MouseEvent) => void;
  title?: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, opts: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (opts.cls) n.className = opts.cls;
  if (opts.text !== undefined) n.textContent = opts.text;
  if (opts.html !== undefined) n.innerHTML = opts.html;
  if (opts.style) Object.assign(n.style, opts.style);
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (typeof v === 'boolean') { if (v) n.setAttribute(k, ''); else n.removeAttribute(k); }
      else n.setAttribute(k, String(v));
    }
  }
  if (opts.onClick) n.addEventListener('click', opts.onClick as EventListener);
  if (opts.title) n.setAttribute('aria-label', opts.title);
  if (opts.parent) opts.parent.appendChild(n);
  return n;
}

// ---------------------------------------------------------------------------
// floating tooltips (single reused node)
// ---------------------------------------------------------------------------
let tipNode: HTMLDivElement | null = null;
const tipHandlers = new WeakMap<HTMLElement, () => void>();

export function attachTip(node: HTMLElement, getText: () => string): void {
  const handler = () => {
    const html = getText();
    if (!html) return;
    if (!tipNode) {
      tipNode = el('div', { cls: 'tip-pop' }) as HTMLDivElement;
      document.body.appendChild(tipNode);
    }
    tipNode.innerHTML = html;
    tipNode.style.display = 'block';
    const r = node.getBoundingClientRect();
    let x = r.left + r.width / 2 - tipNode.offsetWidth / 2;
    let y = r.top - tipNode.offsetHeight - 8;
    if (y < 4) y = r.bottom + 8;
    x = Math.max(6, Math.min(window.innerWidth - tipNode.offsetWidth - 6, x));
    tipNode.style.left = `${x}px`;
    tipNode.style.top = `${y}px`;
  };
  const old = tipHandlers.get(node);
  if (old) node.removeEventListener('mouseenter', old);
  tipHandlers.set(node, handler);
  node.addEventListener('mouseenter', handler);
  node.addEventListener('mouseleave', () => {
    if (tipNode) tipNode.style.display = 'none';
  });
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}
