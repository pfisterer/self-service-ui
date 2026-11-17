// Shared DNS validation. The primitives (IP, FQDN, email) come from the
// `validator` library; only the DNS-policy-specific rules that no general
// library covers (%u/%l zone patterns, user filters with patterns and group tokens, lowercase subzone
// labels) are kept as thin wrappers around it.

import isIP from 'validator/lib/isIP.js';
import isFQDN from 'validator/lib/isFQDN.js';
import isEmail from 'validator/lib/isEmail.js';

const LABEL_RE = /^[A-Za-z0-9-]+$/;
const LABEL_RE_LOWER = /^[a-z0-9-]+$/;
const isAlphaNum = (ch) => /[A-Za-z0-9]/.test(ch);

// A single RFC-1035 label: 1–63 chars, alphanumeric + hyphen, not starting or
// ending with a hyphen. `lowercase` rejects uppercase (for user-created zones).
// (No general library validates a single label, so this stays custom.)
export function isValidLabel(label, { lowercase = false } = {}) {
    if (label.length < 1 || label.length > 63) return false;
    if (!(lowercase ? LABEL_RE_LOWER : LABEL_RE).test(label)) return false;
    return isAlphaNum(label[0]) && isAlphaNum(label[label.length - 1]);
}

// A standard DNS name (FQDN with a TLD), e.g. www.example.com.
export function isValidDnsName(value) {
    return isFQDN((value || '').trim());
}

// A zone pattern that may contain the placeholders '%u' (the whole e-mail address) and '%l' (its local part) inside labels (e.g. student-%u.users.example.com, %l-stma.users.dhbw.site).
export function isValidZonePattern(value) {
    if (!value) return false;
    return isFQDN(value.replaceAll('%u', 'a').replaceAll('%l', 'a').trim());
}

// The role provider's token shapes (role-provider-service: group ids and relation names), compared case-insensitively like the server does.
const GROUP_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const RELATION_RE = /^[a-z][a-z0-9_-]*$/;

// splitUserFilter: the non-empty, trimmed entries of a comma-separated user filter.
export function splitUserFilter(value) {
    return (value || '').split(',').map(p => p.trim()).filter(p => p !== '');
}

// appendToUserFilter adds an entry to a filter unless it is already there (case-insensitive), keeping what was typed.
export function appendToUserFilter(filter, entry) {
    const e = (entry || '').trim();
    const parts = splitUserFilter(filter);
    if (!e || parts.some(p => p.toLowerCase() === e.toLowerCase())) return parts.join(', ');
    return [...parts, e].join(', ');
}

// isValidUserFilterEntry: an e-mail address, a pattern with a leading * (*@domain.com, *user@domain.com), or a role-provider token user:<email>, group:<id>, group:<id>#<relation>. The server accepts the same forms.
export function isValidUserFilterEntry(entry) {
    const p = (entry || '').trim();
    const lower = p.toLowerCase();
    if (lower.startsWith('user:')) return isEmail(p.slice(5)) && !p.includes('*');
    if (lower.startsWith('group:')) {
        const [id, relation, ...rest] = lower.slice(6).split('#');
        if (rest.length > 0 || !GROUP_ID_RE.test(id)) return false;
        return relation === undefined || RELATION_RE.test(relation);
    }
    if (isEmail(p)) return true;
    const at = p.lastIndexOf('@'); // wildcard local part: *[...]@fqdn
    return at > 0 && p.slice(0, at).startsWith('*') && isFQDN(p.slice(at + 1));
}

// USER_FILTER_MAX is the length of the server's column.
export const USER_FILTER_MAX = 255;

// A comma-separated list of user filter entries (see isValidUserFilterEntry), at most USER_FILTER_MAX characters.
export function isValidUserFilter(value) {
    if (!value || value.length > USER_FILTER_MAX) return false;
    const parts = splitUserFilter(value);
    return parts.length > 0 && parts.every(isValidUserFilterEntry);
}

// zoneWithinAnySuffix reports whether `zone` equals one of the given zones or
// lies below one — the client-side twin of the server's zoneInScope check that
// gates delegated rule management. Pure containment only: what an empty
// suffix list means (no restriction vs. no access) is the caller's decision.
export function zoneWithinAnySuffix(zone, suffixes) {
    const norm = (v) => (v || '').trim().toLowerCase().replace(/\.+$/, '');
    const z = norm(zone);
    if (!z) return false;
    return (suffixes || []).some(s => {
        const sf = norm(s);
        return sf !== '' && (z === sf || z.endsWith('.' + sf));
    });
}

// Validate a subzone label (one or more lowercase labels) to be created under
// `parent`. Returns a specific, user-facing error message, or null when valid.
// Takes `t` because the message is shown to a person: this module has no React
// around it, so the caller hands its own translator in.
export function subzoneLabelError(label, parent, t) {
    const s = (label || '').trim().replace(/\.+$/, '');
    if (!s) return t('helper.dnsValidation.subzoneRequired');
    for (const l of s.split('.')) {
        if (l.length > 63) return t('helper.dnsValidation.labelTooLong', { length: l.length });
        if (!LABEL_RE_LOWER.test(l)) return t('helper.dnsValidation.lowercaseOnly');
        if (l.startsWith('-') || l.endsWith('-')) return t('helper.dnsValidation.hyphenEdge');
    }
    const full = `${s}.${parent}`.replace(/\.$/, '');
    if (full.length > 253) return t('helper.dnsValidation.nameTooLong', { length: full.length });
    return null;
}

// X.509 limits a certificate's commonName to 64 characters (RFC 5280, ub-common-name). Let's Encrypt then issues without a commonName, but HARICA, the CA behind certificates.dhbw.cloud, refuses at finalize when no requested name fits into the commonName (17.11.2026: 63 characters issued, 68 refused without a reason). A wildcard certificate for `*.<zone>` therefore needs `*.` + zone ≤ 64; the zone itself works in DNS, so this is a warning, not an error.
export const WILDCARD_CN_MAX = 64;

// wildcardCnRemaining is how many characters are left for `*.<label>.<parent>` within WILDCARD_CN_MAX; negative when the subzone is too long for a wildcard commonName. With an empty label it is the room the label has (its separating dot counted). The fixed parent (e.g. `<user>.users.dhbw.site`) differs per person, which is why the form shows this number live.
export function wildcardCnRemaining(label, parent) {
    const s = (label || '').trim().replace(/\.+$/, '');
    const p = (parent || '').trim().replace(/\.+$/, '');
    return WILDCARD_CN_MAX - ('*.'.length + s.length + 1 + p.length);
}

// Client-side validation of a record's NAME (the relative name entered in the
// "Name" column / field, e.g. `www`, `_dmarc`, `*`, or `@` for the zone apex).
// Empty or '@' means the apex and is valid. Otherwise every dot-separated label
// must be a DNS label: letters/digits/hyphen/underscore, 1–63 chars, not starting
// or ending with a hyphen; a single leftmost '*' (wildcard) label is allowed.
// Returns a user-facing error message, or null when valid.
export function recordNameError(name, t) {
    const s = (name || '').trim().replace(/\.+$/, '');
    if (s === '' || s === '@' || s === '\\@') return null; // zone apex
    const labels = s.split('.');
    for (let i = 0; i < labels.length; i++) {
        const l = labels[i];
        if (l === '*' && i === 0) continue; // wildcard, leftmost label only
        if (l.length < 1 || l.length > 63) return t('helper.dnsValidation.labelLength');
        if (!/^[A-Za-z0-9_-]+$/.test(l)) return t('helper.dnsValidation.nameCharacters');
        if (l.startsWith('-') || l.endsWith('-')) return t('helper.dnsValidation.hyphenEdge');
    }
    return null;
}

// Client-side validation of a record's value for its type (A -> IPv4, AAAA -> IPv6).
// Returns a user-facing error message, or null when valid / unchecked.
export function recordValueError(type, value, t) {
    const v = (value || '').trim();
    if (!v) return t('helper.dnsValidation.valueRequired');
    switch ((type || '').toUpperCase()) {
        case 'A': return isIP(v, 4) ? null : t('helper.dnsValidation.ipv4');
        case 'AAAA': return isIP(v, 6) ? null : t('helper.dnsValidation.ipv6');
        default: return null;
    }
}
