// One place decides how a date reads.
//
// Pinned, and not left to the browser, because "the browser decides" turns out
// to mean something nobody would choose.
//
// toLocaleDateString() with no locale does NOT follow navigator.language, and it
// has no way to reach the date format the operating system is set to. It uses
// the ICU default locale, which Chrome derives from its own APPLICATION language
// at startup. Measured on a German developer machine (2026-08-25):
//
//     navigator.language                              'de'
//     Intl.DateTimeFormat().resolvedOptions().locale  'en-GB'
//     new Date().toLocaleDateString()                 '25/08/2026'
//
// The same Mac shows 19.08.26 in its own settings. So the rendered format
// matched neither the system, nor the language the browser reports as the user's
// first choice — and 25/08/2026 is the ambiguous spelling, read as 8 May by
// anyone who takes slashes as month-first.
//
// Firefox withholds the OS regional setting deliberately, as an anti-
// fingerprinting measure, so this is not a gap that will close.
//
// That leaves three options: this one, passing navigator.language explicitly
// (honest, but gives slashes again to anyone whose first content language is
// English), or a stored per-user preference — which is what Jira and Oracle
// ended up with, and which is worth building only once people actually differ.
// The platform runs in one country; de-DE is the notation its readers parse
// without thinking.
//
// Since the UI speaks two languages (see i18n/index.js), the reader's choice
// decides: German writes 25.08.2026, English writes 25 Aug 2026 rather than a
// slashed form, because 25/08/2026 is read as 8 May by half its readers.
//
// Two things this module fixes that were never a locale question: a missing or
// unparseable value rendered as "Invalid Date" in eight places and as an em dash
// in one, and seconds appeared in some timestamps and not others.
const LOCALES = { de: 'de-DE', en: 'en-GB' };

// Padded numbers where they are unambiguous, a named month where they are not.
const DATE_FORMATS = {
    de: { day: '2-digit', month: '2-digit', year: 'numeric' },
    en: { day: '2-digit', month: 'short', year: 'numeric' },
};

// The current language, set by i18n/index.js on startup and on every change.
// A module-level value rather than a parameter: these formatters are called
// from plain functions outside React, where no hook can reach.
let language = 'en';

export function setDateLocale(next) {
    language = DATE_FORMATS[next] ? next : 'en';
}

// Padded, so a column of dates lines up and 25.08.2026 reads as deliberate
// rather than as 25.8.2026 next to 3.11.2026. The year stays four digits: these
// are expiry dates, and a truncated year is a bad place to save two characters.

// Seconds are left out on purpose: they are noise in a list, and nothing the UI
// shows is that precise.
const TIME = { hour: '2-digit', minute: '2-digit' };

// EMPTY is what every formatter answers for a missing value, so a blank cell is
// visibly blank instead of "Invalid Date".
const EMPTY = '—';

function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// formatDate renders a day: 25.08.2026 / 25 Aug 2026
export function formatDate(value) {
    const d = toDate(value);
    return d ? d.toLocaleDateString(LOCALES[language], DATE_FORMATS[language]) : EMPTY;
}

// formatDateTime adds hours and minutes: 25.08.2026 19:36
export function formatDateTime(value) {
    const d = toDate(value);
    if (!d) return EMPTY;
    return `${formatDate(value)} ${d.toLocaleTimeString(LOCALES[language], TIME)}`;
}
