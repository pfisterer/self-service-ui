// Shared DNS name / label validation used by the DNS policy editor (policy.jsx)
// and the subzone modal (zones.jsx). Keep the label rules in one place.

const LABEL_RE = /^[A-Za-z0-9-]+$/;
const LABEL_RE_LOWER = /^[a-z0-9-]+$/;

function isAlphaNum(ch) { return /[A-Za-z0-9]/.test(ch); }

// A single RFC-1035 label: 1–63 chars, alphanumeric + hyphen, not starting or
// ending with a hyphen. `lowercase` rejects uppercase (for user-created zones).
export function isValidLabel(label, { lowercase = false } = {}) {
    if (label.length < 1 || label.length > 63) return false;
    if (!(lowercase ? LABEL_RE_LOWER : LABEL_RE).test(label)) return false;
    return isAlphaNum(label[0]) && isAlphaNum(label[label.length - 1]);
}

// A standard DNS name (>=2 labels, <=253 chars).
export function isValidDnsName(value) {
    if (!value || !value.trim()) return false;
    const trimmed = value.trim();
    if (trimmed.length > 253) return false;
    const parts = trimmed.split('.');
    return parts.length >= 2 && parts.every(l => isValidLabel(l));
}

// A zone pattern that may contain '%u' inside labels (e.g. student-%u.users.example.com).
export function isValidZonePattern(value) {
    if (!value) return false;
    const s = value.replaceAll('%u', 'A').trim();
    if (s.length === 0 || s.length > 253) return false;
    const parts = s.split('.');
    return parts.length >= 2 && parts.every(l => isValidLabel(l));
}

// An email or wildcard-email pattern, or a comma-separated list of them
// (*@domain.com, user@domain.com, *user@domain.com).
export function isValidUserFilter(value) {
    if (!value) return false;
    const emailRegex = /^(\*[a-zA-Z0-9._-]*|[a-zA-Z0-9._-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const parts = value.split(',').map(p => p.trim()).filter(p => p !== '');
    return parts.length > 0 && parts.every(p => emailRegex.test(p));
}

// Validate a subzone label (one or more lowercase labels) to be created under
// `parent`. Returns a specific, user-facing error message, or null when valid.
export function subzoneLabelError(label, parent) {
    const s = (label || '').trim().replace(/\.+$/, '');
    if (!s) return 'Enter a subzone name.';
    for (const l of s.split('.')) {
        if (l.length > 63) return 'Each label may be at most 63 characters.';
        if (!LABEL_RE_LOWER.test(l)) return 'Only lowercase letters, digits and hyphens are allowed.';
        if (l.startsWith('-') || l.endsWith('-')) return 'A label must not start or end with a hyphen.';
    }
    if (`${s}.${parent}`.replace(/\.$/, '').length > 253) return 'The full name is too long (max 253 characters).';
    return null;
}
