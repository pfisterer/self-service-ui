import { describe, it, expect } from 'vitest';
import {
    isValidLabel,
    isValidDnsName,
    isValidZonePattern,
    isValidUserFilter,
    subzoneLabelError,
    recordNameError,
    recordValueError,
} from './dns-validation.js';

describe('isValidLabel', () => {
    it('accepts a plain label', () => {
        expect(isValidLabel('www')).toBe(true);
        expect(isValidLabel('a')).toBe(true);
        expect(isValidLabel('a-b-1')).toBe(true);
    });

    it('rejects a label that starts or ends with a hyphen', () => {
        expect(isValidLabel('-www')).toBe(false);
        expect(isValidLabel('www-')).toBe(false);
    });

    it('enforces the 1–63 character bound', () => {
        expect(isValidLabel('')).toBe(false);
        expect(isValidLabel('a'.repeat(63))).toBe(true);
        expect(isValidLabel('a'.repeat(64))).toBe(false);
    });

    it('rejects uppercase only when lowercase is demanded', () => {
        expect(isValidLabel('WWW')).toBe(true);
        expect(isValidLabel('WWW', { lowercase: true })).toBe(false);
    });

    it('rejects characters outside letters, digits and hyphen', () => {
        expect(isValidLabel('a_b')).toBe(false);
        expect(isValidLabel('a.b')).toBe(false);
    });
});

describe('isValidDnsName', () => {
    it('accepts an FQDN and trims around it', () => {
        expect(isValidDnsName('www.example.com')).toBe(true);
        expect(isValidDnsName('  www.example.com  ')).toBe(true);
    });

    it('rejects a bare hostname and empty input', () => {
        expect(isValidDnsName('localhost')).toBe(false);
        expect(isValidDnsName('')).toBe(false);
        expect(isValidDnsName(undefined)).toBe(false);
    });
});

describe('isValidZonePattern', () => {
    // %u is substituted per user, so it has to pass validation as if it were an
    // ordinary label character — that substitution is the whole point.
    it('accepts %u inside a label', () => {
        expect(isValidZonePattern('student-%u.users.example.com')).toBe(true);
        expect(isValidZonePattern('%u.users.example.com')).toBe(true);
    });

    it('still rejects what is not a name once %u is filled in', () => {
        expect(isValidZonePattern('%u')).toBe(false);
        expect(isValidZonePattern('')).toBe(false);
    });
});

describe('isValidUserFilter', () => {
    it('accepts a plain address and a wildcard local part', () => {
        expect(isValidUserFilter('user@example.com')).toBe(true);
        expect(isValidUserFilter('*@student.example.com')).toBe(true);
        expect(isValidUserFilter('*user@example.com')).toBe(true);
    });

    it('accepts a comma-separated list and ignores the spacing', () => {
        expect(isValidUserFilter('a@example.com, *@student.example.com')).toBe(true);
    });

    it('rejects the list when a single entry is invalid', () => {
        expect(isValidUserFilter('a@example.com, not-an-address')).toBe(false);
    });

    it('rejects a wildcard in the domain, which is not what this filter matches', () => {
        expect(isValidUserFilter('user@*.example.com')).toBe(false);
    });

    it('rejects empty input', () => {
        expect(isValidUserFilter('')).toBe(false);
        expect(isValidUserFilter(',')).toBe(false);
    });
});

describe('subzoneLabelError', () => {
    const parent = 'users.example.com';

    it('returns null for a valid single or multi label', () => {
        expect(subzoneLabelError('dev', parent)).toBeNull();
        expect(subzoneLabelError('a.b', parent)).toBeNull();
        expect(subzoneLabelError('dev.', parent)).toBeNull(); // trailing dot is tolerated
    });

    it('names the specific problem rather than failing generically', () => {
        expect(subzoneLabelError('', parent)).toBe('Enter a subzone name.');
        expect(subzoneLabelError('DEV', parent)).toBe('Only lowercase letters, digits and hyphens are allowed.');
        expect(subzoneLabelError('-dev', parent)).toBe('A label must not start or end with a hyphen.');
        expect(subzoneLabelError('a'.repeat(64), parent)).toBe('Each label may be at most 63 characters.');
    });

    it('rejects a full name longer than 253 characters', () => {
        const long = Array.from({ length: 5 }, () => 'a'.repeat(50)).join('.'); // 254 chars
        expect(subzoneLabelError(long, parent)).toBe('The full name is too long (max 253 characters).');
    });
});

describe('recordNameError', () => {
    it('treats the apex spellings as valid', () => {
        expect(recordNameError('')).toBeNull();
        expect(recordNameError('@')).toBeNull();
        expect(recordNameError('\\@')).toBeNull();
    });

    it('accepts underscores, which service records need', () => {
        expect(recordNameError('_dmarc')).toBeNull();
        expect(recordNameError('_acme-challenge.www')).toBeNull();
    });

    it('accepts a wildcard only as the leftmost label', () => {
        expect(recordNameError('*')).toBeNull();
        expect(recordNameError('*.www')).toBeNull();
        expect(recordNameError('www.*')).toBe('Only letters, digits, hyphen and underscore are allowed.');
    });

    it('rejects a label that starts or ends with a hyphen', () => {
        expect(recordNameError('-www')).toBe('A label must not start or end with a hyphen.');
    });

    it('rejects an empty label produced by a double dot', () => {
        expect(recordNameError('a..b')).toBe('Each label must be 1–63 characters.');
    });
});

describe('recordValueError', () => {
    it('requires a value', () => {
        expect(recordValueError('A', '')).toBe('Value is required.');
        expect(recordValueError('A', '   ')).toBe('Value is required.');
    });

    it('checks A against IPv4 and AAAA against IPv6', () => {
        expect(recordValueError('A', '192.0.2.1')).toBeNull();
        expect(recordValueError('A', '2001:db8::1')).toBe('Enter a valid IPv4 address (e.g. 192.0.2.1).');
        expect(recordValueError('AAAA', '2001:db8::1')).toBeNull();
        expect(recordValueError('AAAA', '192.0.2.1')).toBe('Enter a valid IPv6 address (e.g. 2001:db8::1).');
    });

    it('is case-insensitive about the type', () => {
        expect(recordValueError('a', '192.0.2.1')).toBeNull();
    });

    // Everything else is left to the server: the UI has no business deciding
    // what a valid TXT or SRV body looks like.
    it('passes types it does not check', () => {
        expect(recordValueError('TXT', 'anything at all')).toBeNull();
        expect(recordValueError('', 'anything at all')).toBeNull();
    });
});
