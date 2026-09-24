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
