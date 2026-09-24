// Shared DNS validation. The primitives (IP, FQDN, email) come from the
// `validator` library; only the DNS-policy-specific rules that no general
// library covers (%u zone patterns, wildcard-email filters, lowercase subzone
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

// A zone pattern that may contain '%u' inside labels (e.g. student-%u.users.example.com).
export function isValidZonePattern(value) {
    if (!value) return false;
    return isFQDN(value.replaceAll('%u', 'a').trim());
}

// An email or wildcard-email pattern, or a comma-separated list of them
// (*@domain.com, user@domain.com, *user@domain.com).
export function isValidUserFilter(value) {
    if (!value) return false;
    const parts = value.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length === 0) return false;
    return parts.every(p => {
        if (isEmail(p)) return true;
        const at = p.lastIndexOf('@'); // wildcard local part: *[...]@fqdn
        return at > 0 && p.slice(0, at).startsWith('*') && isFQDN(p.slice(at + 1));
    });
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
        if (l.length > 63) return t('helper.dnsValidation.labelTooLong');
        if (!LABEL_RE_LOWER.test(l)) return t('helper.dnsValidation.lowercaseOnly');
        if (l.startsWith('-') || l.endsWith('-')) return t('helper.dnsValidation.hyphenEdge');
    }
    if (`${s}.${parent}`.replace(/\.$/, '').length > 253) return t('helper.dnsValidation.nameTooLong');
    return null;
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
