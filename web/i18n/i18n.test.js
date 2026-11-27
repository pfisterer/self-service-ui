import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import i18n from './index.js';

const en = i18n.getResourceBundle('en', 'translation');
const de = i18n.getResourceBundle('de', 'translation');

// Every key of the dotted paths in an object, so the two files can be compared
// as sets rather than by eye.
function keys(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => (
        v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    ));
}

// Placeholders are part of the contract: a translation that drops {{name}}
// renders a sentence with a hole in it, and nothing else would catch that.
function placeholders(value) {
    return [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
}

function at(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
}

describe('translations', () => {
    it('cover exactly the same keys in every language', () => {
        expect(keys(de).sort()).toEqual(keys(en).sort());
    });

    it('keep the placeholders of the original', () => {
        for (const key of keys(en)) {
            expect(placeholders(at(de, key)), key).toEqual(placeholders(at(en, key)));
        }
    });

    it('has no empty string', () => {
        for (const file of [en, de]) {
            for (const key of keys(file)) expect(String(at(file, key)).trim(), key).not.toBe('');
        }
    });

    // German is neutral and does not address the reader (README.md here): the texts of the new layout once said „du“ and „dein“ while everything around them did not. Placeholders are left out first, {{dir}} is no pronoun.
    it('does not address the reader with du in German', () => {
        const du = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|kannst|darfst|hast|bist|musst|willst|möchtest)\b/i;
        const found = keys(de).filter(key => du.test(String(at(de, key)).replace(/\{\{\w+\}\}/g, '')));
        expect(found).toEqual([]);
    });
});

// Every key a component asks for has to exist: a typo or a renamed key would
// otherwise render its own name into the page, which looks like working text
// until somebody reads it. Only literal calls are checked — the handful of
// computed keys (`projects.status.${status}.label`) are covered by the screens
// that use them.
const AREAS = 'projects|dyndns|tokens|home|nav|account|footer|helper|providers|swagger|app|language|dates';
const KEY_CALL = new RegExp(`(?<![\\w.$])(?:t|i18nKey=)\\(?\\s*["'\`]((?:${AREAS})(?:\\.[A-Za-z0-9_]+)+)["'\`]`, 'g');

function sourceFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
        return /\.jsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
    });
}

describe('translation keys used in the code', () => {
    it('all exist in the English resources', () => {
        const dictionary = new Set(keys(en));
        const missing = [];
        for (const file of sourceFiles('web')) {
            const source = readFileSync(file, 'utf8');
            for (const [, key] of source.matchAll(KEY_CALL)) {
                if (!dictionary.has(key) && !dictionary.has(`${key}_other`)) missing.push(`${file}: ${key}`);
            }
        }
        expect(missing).toEqual([]);
    });
});

// English labels of the navigation and the tabs are in title case (Chicago style): every word capitalised except articles, short prepositions and conjunctions inside the label; names such as vCPU or DNS keep their own spelling. Sentences elsewhere stay in sentence case, so only these labels are checked; nav.pendingDot and nav.v2.adminNothing are a screen-reader sentence and a hint, not labels.
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'as', 'at', 'by', 'from', 'in', 'into', 'of', 'on', 'per', 'to', 'via', 'with', 'without', 'outside', 'under', 'over']);

function notTitleCase(value) {
    const words = String(value).replace(/\{\{\w+\}\}/g, 'X').split(/\s+/).filter(Boolean);
    return words.filter((word, i) => word.split('-').some((part, j) => {
        const bare = part.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
        if (!/^\p{Ll}/u.test(bare) || /\p{Lu}|\d/u.test(bare)) return false;
        const inside = (i > 0 || j > 0) && i < words.length - 1;
        return !(inside && SMALL_WORDS.has(bare));
    }));
}

describe('English labels of navigation and tabs', () => {
    const NOT_LABELS = new Set(['nav.pendingDot', 'nav.v2.adminNothing']);
    const TABS = ['groups.tabs', 'dyndns.zoneDetail.tabs', 'projects.v2.tab', 'llm.fleet.page', 'gpu.projects.sub'];
    const TAB_KEYS = ['dyndns.policy.tabRules', 'dyndns.policy.tabDelegations', 'dyndns.policy.tabOrphaned', 'dyndns.policy.tabEvents', 'projects.budgetForm.tabAccess', 'projects.budgetForm.tabAutoApprove', 'projects.inspect.tabHistory', 'projects.consumption.tab', 'projects.attributes.tab', 'llm.vscode.tab'];

    it('are in title case', () => {
        const labels = [
            ...keys(en.nav, 'nav.').filter(key => !NOT_LABELS.has(key)),
            ...TABS.flatMap(prefix => keys(at(en, prefix), `${prefix}.`)),
            ...TAB_KEYS,
        ];
        expect(labels.length).toBeGreaterThan(40);
        const wrong = labels.map(key => [key, at(en, key)]).filter(([, value]) => typeof value !== 'string' || notTitleCase(value).length > 0);
        expect(wrong).toEqual([]);
    });

    it('recognise sentence case as wrong', () => {
        expect(notTitleCase('DNS and certificates')).toEqual(['certificates']);
        expect(notTitleCase('DNS and Certificates')).toEqual([]);
        expect(notTitleCase('Projects in This Budget and Below ({{count}})')).toEqual([]);
        expect(notTitleCase('Sign in')).toEqual(['in']);
    });
});
