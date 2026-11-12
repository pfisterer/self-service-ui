// formatBytes is a size for people (B, KB, MB, GB, TB, binary steps): one decimal below 10, none above; whole bytes below a KB.
export function formatBytes(n) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n || 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
