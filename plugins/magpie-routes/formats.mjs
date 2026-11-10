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
