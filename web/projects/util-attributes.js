// Pure helpers for the attributes editor (modal-attributes.jsx): the API's
// { group: { key: value } } to and from the editor's rows, and the checks the
// server makes too, so a mistake shows before the request.

// The server's rule for group and key names.
export const ATTRIBUTE_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;

// fromAttributes turns the API's object into editor groups, sorted by name.
export function fromAttributes(attrs) {
    return Object.keys(attrs || {}).sort().map(name => ({
        name,
        rows: Object.keys(attrs[name] || {}).sort().map(key => ({ key, value: attrs[name][key] })),
    }));
}

// toAttributes is the reverse. Rows without key and value are dropped; a group
// left without rows is sent empty, which stops its inheritance.
export function toAttributes(groups) {
    const out = {};
    for (const g of groups) {
        const values = {};
        for (const r of g.rows) {
            const key = r.key.trim();
            if (key === '' && r.value.trim() === '') continue;
            values[key] = r.value.trim();
        }
        out[g.name.trim()] = values;
    }
    return out;
}

// attributesError names the first problem, as { code, name }, or null.
export function attributesError(groups) {
    const seen = new Set();
    for (const g of groups) {
        const name = g.name.trim();
        if (!ATTRIBUTE_NAME.test(name)) return { code: 'name', name: name || '…' };
        if (seen.has(name)) return { code: 'duplicateGroup', name };
        seen.add(name);
        const keys = new Set();
        for (const r of g.rows) {
            const key = r.key.trim();
            if (key === '' && r.value.trim() === '') continue;
            if (!ATTRIBUTE_NAME.test(key)) return { code: 'name', name: key || '…' };
            if (keys.has(key)) return { code: 'duplicateKey', name: key };
            keys.add(key);
        }
    }
    return null;
}
