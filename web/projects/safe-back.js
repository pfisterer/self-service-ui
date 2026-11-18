// The hosts allowed to send people to the start page with a return address (?back=), from the runtime config (BACK_HOSTS, comma-separated host names, exact match, optionally host:port). This page itself is always allowed.
export function configuredBackHosts() {
    const raw = (typeof window !== 'undefined' && window.appconfig?.backHosts) || '';
    return parseBackHosts(raw);
}

// parseBackHosts turns "a.example, b.example" (or an array) into lower-case host names; empty entries are dropped.
export function parseBackHosts(raw) {
    const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
    return list.map(h => String(h).trim().toLowerCase()).filter(Boolean);
}

// safeBack keeps a return address only when it leads back to this page's own origin or, over https, to one of the allowed hosts, so the page cannot be used to send people anywhere else. Exact host match: no subdomains, no look-alikes; addresses with user info (https://allowed@evil.example) are refused outright.
export function safeBack(raw, { origin = window.location.origin, hosts = configuredBackHosts() } = {}) {
    if (!raw) return null;
    let u;
    try {
        u = new URL(raw, origin);
    } catch {
        return null;
    }
    if (u.username || u.password) return null;
    if (u.origin === origin) return u.href;
    if (u.protocol !== 'https:') return null;
    return hosts.includes(u.host.toLowerCase()) ? u.href : null;
}
