// Sorting the fleet's machine table in the browser: the service lists the machines by tunnel address, which puts those waiting for approval (no address yet) first, so the table orders them itself, by name unless the viewer picked another column.

export const FLEET_SORT_KEYS = ['name', 'address', 'profile', 'model', 'scripts', 'state'];
export const DEFAULT_FLEET_SORT = { key: 'name', order: 'asc' };

// Natural order, case-insensitive: wimac2 before wimac10, dmmac17-2 before dmmac17-10.
const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const text = (a, b) => collator.compare(a, b);

// ipKey turns an IPv4 or IPv6 address into numbers that compare in address order, IPv4 before IPv6; anything else gives null.
export function ipKey(value) {
    const s = (value || '').trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return [4, ...s.split('.').map(Number)];
    if (!s.includes(':') || !/^[0-9a-fA-F:]+$/.test(s)) return null;
    const [head, tail, rest] = s.split('::');
    if (rest !== undefined) return null;
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
    if (groups.length !== 8 || groups.some(g => g === '' || g.length > 4)) return null;
    return [6, ...groups.map(g => parseInt(g, 16))];
}

function compareIp(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? -1) - (b[i] ?? -1);
        if (d) return d;
    }
    return 0;
}

// The address the table shows: none while the machine waits for approval or when it is reached directly instead of through the tunnel.
const shownAddress = (p) => (p.pending || p.transport === 'direct' ? '' : p.address || '');

// The model the table shows: what an externally managed machine runs, otherwise the assigned one.
const shownModel = (p) => (p.model_state === 'fremdverwaltet' ? (p.models ?? []).join(', ') : p.model || '');

// sortPeers returns the machines in the order of sort ({ key, order }); `label(key, peer)` gives the text a badge column shows (scripts, state), so those sort by what is read, not by the API's value. Empty values stay last in either direction; equal values fall back to the name, then the serial.
export function sortPeers(peers, sort, label = () => '') {
    const dir = sort.order === 'desc' ? -1 : 1;
    const byName = (a, b) => text(a.name || '', b.name || '') || text(a.serial || '', b.serial || '');
    const value = {
        name: p => p.name || '',
        profile: p => p.profile || '',
        model: shownModel,
        scripts: p => label('scripts', p),
        state: p => label('state', p),
    };
    const primary = (a, b) => {
        if (sort.key === 'address') {
            const x = shownAddress(a);
            const y = shownAddress(b);
            if (!x || !y) return (!x) - (!y);
            const ix = ipKey(x);
            const iy = ipKey(y);
            if (ix && iy) return dir * compareIp(ix, iy);
            if (ix || iy) return ix ? -1 : 1;
            return dir * text(x, y);
        }
        const get = value[sort.key] ?? value.name;
        const x = get(a);
        const y = get(b);
        if (!x || !y) return (!x) - (!y);
        return dir * text(x, y);
    };
    return [...peers].sort((a, b) => primary(a, b) || (sort.key === 'name' ? dir * byName(a, b) : byName(a, b)));
}
