// Magpie 9c39edb9 display formatting (MIT); see SOURCE-NOTICE.md.
export const hitPct = (h, d = 0) => {
  let s = (100 * h).toFixed(d);
  while (d < 2 && h > 0 && h < 1 && (+s >= 100 || +s <= 0)) s = (100 * h).toFixed(++d);
  return (h < 1 && +s >= 100 ? "99.99" : h > 0 && +s <= 0 ? "0.01" : s) + "%";
};
export const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
// The gateway trace quotes USD; GUI currency preferences are not available here.
export function fmtCost({cost, unpriced}) {
  if (typeof cost !== "number" || (!cost && unpriced)) return "";
  return "$" + (cost >= 100 ? cost.toFixed(0) : cost >= 1 ? cost.toFixed(2) : cost.toFixed(3)) + (unpriced ? "+" : "");
}
// Magpie fmtN with its default K / M / B units (its 万 / 亿 setting is off by default).
export const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e7 ? Math.round(n / 1e6) + 'M' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e5 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
