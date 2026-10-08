// Spend and budgets are accounting units, not money: two decimals, and no
// budget means no limit.
export const units = (v, digits = 2) => (v === null || v === undefined ? '∞' : Number(v).toFixed(digits));
export const percent = (spend, budget) => (!budget ? 0 : Math.min(100, Math.round(100 * (spend || 0) / budget)));
export const barColour = (p) => (p >= 100 ? 'dhbw' : p >= 80 ? 'orange' : 'teal');
