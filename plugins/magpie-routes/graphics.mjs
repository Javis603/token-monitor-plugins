const NS = 'http://www.w3.org/2000/svg';
export function el(tag, name, text) { const node = document.createElement(tag); if (name) node.className = name; if (text !== undefined) node.textContent = text; return node; }
export function svg(tag, attrs = {}) { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; }
// Magpie's own marks (internal/gui/assets/app.js icon()). Colour SVGs and the
// raster set are images; every other slug is a mono mask tinted by the text
// colour. Agent ids alias onto those slugs; a trace icon wins when present.
const aliases = { magpie: 'magpie', t3: 't3code', t3code: 't3code', 't3-code': 't3code', codex: 'codex-color', openai: 'openai', claude: 'claudecode-color', 'claude-code': 'claudecode-color' };
const pngIcons = new Set(['crush', 'zcode', 'alma', 'hanako', 'cindy', 'lody', 'typesafe', 'atomcode', 'snow', 'mlx-serve', 'mothx', 'zoo-code', 'rtk']);
export function brand(ctx, id, icon) {
  const name = (icon && !String(icon).startsWith('file:')) ? icon : aliases[id] || id || aliases.magpie;
  const node = el('span', 'rr-brand'); node.setAttribute('aria-hidden', 'true'); node.dataset.brand = name;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) { node.textContent = String(id || '?').slice(0, 2).toUpperCase(); node.classList.add('rr-brand-fallback'); return node; }
  const raster = pngIcons.has(name), color = name.endsWith('-color');
  if (raster || color) { const image = el('img'); image.alt = ''; image.src = ctx.asset(`assets/${name}.${raster ? 'png' : 'svg'}`); node.append(image); }
  else { node.style.maskImage = node.style.webkitMaskImage = `url("${ctx.asset(`assets/${name}.svg`)}")`; node.classList.add('rr-mask'); }
  return node;
}
export function button(label, path, action) {
  const node = el('button', 'rr-action'); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label);
  const icon = svg('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' }); icon.append(svg('path', { d: path })); node.append(icon); node.addEventListener('click', action); return node;
}
export const paths = { eye: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6M7 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0', mask: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6M7 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0M3 3l14 14', latest: 'M4 4v12M8 5l7 5-7 5z', back: 'M12 5l-5 5 5 5', next: 'M8 5l5 5-5 5', refresh: 'M17 5v5h-5M17 10a7 7 0 1 0-2 5M17 5l-2-2' };
