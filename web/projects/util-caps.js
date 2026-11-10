// Caps of a budget (caps in os-mgt): upper bounds a budget sets for everything below it, declared by each provider in its catalogue (caps in /v1/config, each { id, name, provider, group?, unit?, message?, min, max, unbounded?, choices?, grant?, together? }). Not quantities: never summed, the strictest value along the chain applies, a budget may only tighten what the budgets above allow (inherited_caps). Values are integers and the smaller one is always the stricter; with unbounded, 0 is allowed and means "no bound", the loosest; with choices, the value is the index into choices, ordered strictest first. A grant cap is off where it is missing (instead of "no restriction from here"): the root switches it on, a budget below only where the budgets above have it, and a budget that inherits its limit passes on those above. Caps sharing a together tag are all set or none.

export const isSet = (v) => v !== null && v !== undefined && v !== '';

// capById is the catalogue as a lookup.
export function capById(catalog) {
    return Object.fromEntries((catalog || []).map(c => [c.id, c]));
}

// normalizeCaps is a map of caps with only the set values, as numbers: the shape the API takes.
export function normalizeCaps(caps) {
    const out = {};
    for (const [id, v] of Object.entries(caps || {})) {
        if (isSet(v)) out[id] = Number(v);
    }
    return out;
}

// boundsNothing: the value above leaves everything open (not set, or 0 under unbounded).
function boundsNothing(cap, above) {
    return !isSet(above) || (!!cap?.unbounded && Number(above) === 0);
}

// isLooser: v allows more than above. 0 under unbounded is the loosest; an inherited 0 there bounds nothing.
export function isLooser(cap, v, above) {
    if (!isSet(v) || boundsNothing(cap, above)) return false;
    if (cap?.unbounded && Number(v) === 0) return true;
    return Number(v) > Number(above);
}

// stricterCap is the stricter of two values of a cap, undefined when neither is set.
export function stricterCap(cap, a, b) {
    if (!isSet(a)) return isSet(b) ? Number(b) : undefined;
    if (!isSet(b)) return Number(a);
    return isLooser(cap, a, b) ? Number(b) : Number(a);
}

// effectiveCaps is what applies below a node, from its own caps and the inherited ones as the API sends them: the stricter of both; for a grant cap off where the node has none of its own (except where it inherits its limit, then the inherited value), and at the root its own.
export function effectiveCaps(node, catalog) {
    if (!node) return {};
    const own = normalizeCaps(node.caps);
    const above = normalizeCaps(node.inherited_caps);
    const out = {};
    for (const cap of catalog || []) {
        let v;
        if (cap.grant) {
            if (node.inherits_limit) v = above[cap.id];
            else if (!isSet(own[cap.id])) v = undefined;
            else if (!node.parent_id) v = own[cap.id];
            else v = isSet(above[cap.id]) ? stricterCap(cap, own[cap.id], above[cap.id]) : undefined;
        } else {
            v = stricterCap(cap, own[cap.id], above[cap.id]);
        }
        if (isSet(v)) out[cap.id] = v;
    }
    return out;
}

// groupSlug is a group's name as part of a translation key: "Release times CPU" → "release-times-cpu".
export function groupSlug(group) {
    return String(group || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// capGroups splits the catalogue into its groups, in the order of first appearance, and each group into blocks: one per cap, or one for all caps sharing a together tag (at the place of the first of them). [{ group, blocks: [{ together, caps }] }]
export function capGroups(catalog) {
    const groups = [];
    const byGroup = new Map();
    const byTag = new Map();
    for (const cap of catalog || []) {
        const name = cap.group || '';
        let g = byGroup.get(name);
        if (!g) {
            g = { group: name, blocks: [] };
            byGroup.set(name, g);
            groups.push(g);
        }
        if (cap.together) {
            const key = `${name}\u0000${cap.together}`;
            const block = byTag.get(key);
            if (block) {
                block.caps.push(cap);
                continue;
            }
            const created = { together: cap.together, caps: [cap] };
            byTag.set(key, created);
            g.blocks.push(created);
            continue;
        }
        g.blocks.push({ together: '', caps: [cap] });
    }
    return groups;
}

// isGrantBlock: a block switched on and off as a whole (its caps are grant caps).
export function isGrantBlock(block) {
    return block.caps.every(c => c.grant);
}

// grantAvailable: whether the block can be switched on at a budget: at the root always, below it where the budgets above have all of its caps.
export function grantAvailable(block, inherited, isRoot) {
    return isRoot || block.caps.every(c => isSet(inherited?.[c.id]));
}

// capRangeOk: v is a value the cap allows at all (within min..max, 0 where unbounded, a valid index of choices).
export function capRangeOk(cap, v) {
    const n = Number(v);
    if (!Number.isInteger(n)) return false;
    if (cap.choices?.length) return n >= 0 && n < cap.choices.length;
    if (cap.unbounded && n === 0) return true;
    return n >= cap.min && n <= cap.max;
}

// grantStart is what switching a grant block on sets: per cap the stricter of the provider's default (defaults, by id) and what is allowed above; without either the inherited value or the cap's minimum.
export function grantStart(block, inherited, defaults) {
    return Object.fromEntries(block.caps.map(cap => {
        const above = inherited?.[cap.id];
        const standard = defaults?.[cap.id];
        let v = stricterCap(cap, standard, above);
        if (!isSet(v)) v = cap.choices?.length ? 0 : cap.min;
        return [cap.id, v];
    }));
}

// capErrors checks a budget's own caps like the server does, keyed by form path (caps.<id>). catalog: the caps the form shows; inherited: what the budgets above allow; isRoot: the budget has nothing above; inheritsLimit: it passes on the grant caps above and has none of its own (they are not checked).
export function capErrors(t, catalog, value, inherited, { isRoot = false, inheritsLimit = false } = {}) {
    const errors = {};
    const own = value || {};
    for (const cap of catalog || []) {
        if (cap.grant && inheritsLimit) continue;
        const v = own[cap.id];
        if (!isSet(v)) continue;
        const key = `caps.${cap.id}`;
        const above = inherited?.[cap.id];
        if (!capRangeOk(cap, v)) {
            errors[key] = cap.unbounded
                ? t('projects.caps.errRangeUnbounded', { min: cap.min, max: cap.max })
                : t('projects.caps.errRange', { min: cap.min, max: cap.max });
        } else if (cap.grant && !isRoot && !isSet(above)) {
            errors[key] = t('projects.caps.errNoneAbove');
        } else if (isLooser(cap, v, above)) {
            errors[key] = t('projects.caps.errAbove', { value: formatCapValue(t, cap, above) });
        }
    }
    // Caps that belong together: all set or none; the missing ones are marked.
    const tags = new Map();
    for (const cap of catalog || []) {
        if (!cap.together || (cap.grant && inheritsLimit)) continue;
        tags.set(cap.together, [...(tags.get(cap.together) || []), cap]);
    }
    for (const caps of tags.values()) {
        const set = caps.filter(c => isSet(own[c.id]));
        if (set.length === 0 || set.length === caps.length) continue;
        for (const cap of caps) {
            if (!isSet(own[cap.id])) errors[`caps.${cap.id}`] = t('projects.caps.errTogether');
        }
    }
    return errors;
}

// capsForCreate is the caps of a new budget as the API takes them: the set values of the caps the form shows (ids), without the grant caps where the budget inherits its limit. Undefined when there are none.
export function capsForCreate(value, catalog, { inheritsLimit = false } = {}) {
    const out = {};
    const own = normalizeCaps(value);
    for (const cap of catalog || []) {
        if (cap.grant && inheritsLimit) continue;
        if (isSet(own[cap.id])) out[cap.id] = own[cap.id];
    }
    return Object.keys(out).length ? out : undefined;
}

// capsPatch is the change of a budget's own caps as the update takes it: only the changed ids, a number to set one, null to remove one. Grant caps are left out where the budget inherits its limit (the server drops its own then). Undefined when nothing changed.
export function capsPatch(value, previous, catalog, { inheritsLimit = false } = {}) {
    const next = normalizeCaps(value);
    const prev = normalizeCaps(previous);
    const grant = new Set((catalog || []).filter(c => c.grant).map(c => c.id));
    const patch = {};
    for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
        if (inheritsLimit && grant.has(id)) continue;
        const a = prev[id] ?? null;
        const b = next[id] ?? null;
        if (a !== b) patch[id] = b;
    }
    return Object.keys(patch).length ? patch : undefined;
}

// capName is a cap's name: the translation where the UI has one, else the catalogue's.
export function capName(t, cap) {
    return t(`projects.caps.${cap.id}.name`, { defaultValue: cap.name || cap.id });
}

// capUnit is a cap's unit: the translation where the UI has one, else the catalogue's.
export function capUnit(t, cap) {
    if (!cap.unit) return '';
    return t(`projects.caps.${cap.id}.unit`, { defaultValue: cap.unit });
}

// capHint is a cap's explanation: the translation where the UI has one, else the catalogue's message (may be empty).
export function capHint(t, cap) {
    return t(`projects.caps.${cap.id}.hint`, { defaultValue: cap.message || '' });
}

// choiceLabel is the label of the choice at index i.
export function choiceLabel(t, cap, i) {
    const choice = cap.choices?.[i];
    if (choice === undefined) return String(i);
    return t(`projects.caps.${cap.id}.choices.${choice}`, { defaultValue: choice });
}

// groupTitle is a group's heading: the translation where the UI has one, else the catalogue's name.
export function groupTitle(t, group) {
    if (!group) return t('projects.caps.otherGroup');
    return t(`projects.caps.group.${groupSlug(group)}.title`, { defaultValue: group });
}

// groupHint is a group's explanation, empty where the UI has none.
export function groupHint(t, group) {
    if (!group) return '';
    return t(`projects.caps.group.${groupSlug(group)}.hint`, { defaultValue: '' });
}

// formatCapValue is a set value in words: the choice, "no upper bound" for 0 under unbounded, or the number with its unit. Not set: "not set", for a grant cap "off".
export function formatCapValue(t, cap, v) {
    if (!isSet(v)) return cap?.grant ? t('projects.caps.off') : t('projects.caps.notSet');
    if (!cap) return String(v);
    if (cap.choices?.length) return choiceLabel(t, cap, Number(v));
    if (cap.unbounded && Number(v) === 0) return t('projects.caps.unbounded');
    const unit = capUnit(t, cap);
    return unit ? `${v} ${unit}` : String(v);
}

// capsSummary is a set of caps in one line ("Jobs per person 2 · Longest run 4 h"), "off" where none of them is set.
export function capsSummary(t, caps, values) {
    if (!caps.some(c => isSet(values?.[c.id]))) return t('projects.caps.off');
    return caps.map(c => `${capName(t, c)} ${formatCapValue(t, c, values?.[c.id])}`).join(' · ');
}

// capHistory is the change of the caps in a history entry, one line per id that changed: [{ id, label, from, to }] in catalogue order, unknown ids (gone from the catalogue) by their id after them.
export function capHistory(t, catalog, from, to) {
    const ids = new Set([...Object.keys(from || {}), ...Object.keys(to || {})]);
    if (ids.size === 0) return [];
    const known = (catalog || []).filter(c => ids.has(c.id));
    const unknown = [...ids].filter(id => !known.some(c => c.id === id)).sort();
    const line = (cap, id) => {
        const name = cap ? capName(t, cap) : id;
        return {
            id,
            label: cap?.group ? `${groupTitle(t, cap.group)} · ${name}` : name,
            from: formatCapValue(t, cap, from?.[id]),
            to: formatCapValue(t, cap, to?.[id]),
        };
    };
    return [...known.map(c => line(c, c.id)), ...unknown.map(id => line(null, id))];
}
