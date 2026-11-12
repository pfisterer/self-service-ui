// The zone tree on the zones page: the zones in three sections, each a tree by the zones' own hierarchy.
//
// Sections, decided from the zone list of the API:
// - own: zones in use (exists) that the person manages alone,
// - shared: zones in use with co-owners (more than one owner),
// - available: zones the rules allow but that are not the person's yet (exists false: not created, to join, or taken).
// A subzone sits in the section of its root zone (the topmost zone above it in use), so a zone and its subzones stay together; zones not in use form their own trees in "available".
//
// Within a section a zone's parent is the API's `parent` where that zone is in the same section, else the closest zone of the section whose name the zone's name ends in (a policy zone below another, such as x.lehre.example below lehre.example). Roots stand in the order the API lists them (normally the person's own first), subzones by their label.
//
// A row is { id, name, label, zone, children, section }: name is the full zone name, label the part before the parent's name (the full name for a root). Ids are prefixed ("zone:…", sections "section:…") so the expansion stored per browser cannot mix a section up with a zone.

export const SECTIONS = ['own', 'shared', 'available'];

export const zoneRowId = (name) => `zone:${name}`;
export const sectionId = (key) => `section:${key}`;

const trim = (name) => name.replace(/\.+$/, '');

// nameParts splits a name for a two-line row: the first label, and the rest with its leading dot (dennis-pfisterer-at-dhbw-de | .users.dhbw.site); a name of one label has no rest.
export function nameParts(name) {
    const i = name.indexOf('.');
    return i < 0 ? [name, ''] : [name.slice(0, i), name.slice(i)];
}

// Builds the hierarchy of one group of zones (in use, or not), returning the root rows in list order.
function forest(zones) {
    const byName = new Map(zones.map(z => [trim(z.name), z]));
    const parentOf = (z) => {
        const name = trim(z.name);
        if (z.parent && byName.has(trim(z.parent)) && trim(z.parent) !== name) return trim(z.parent);
        const labels = name.split('.');
        for (let i = 1; i < labels.length; i++) {
            const above = labels.slice(i).join('.');
            if (byName.has(above)) return above;
        }
        return null;
    };
    const rows = new Map();
    for (const [name, zone] of byName) rows.set(name, { id: zoneRowId(name), name, label: name, zone, children: [], section: null });
    const roots = [];
    for (const [name, zone] of byName) {
        const row = rows.get(name);
        const parent = parentOf(zone);
        if (parent) {
            row.label = name.slice(0, -(parent.length + 1));
            rows.get(parent).children.push(row);
        } else {
            roots.push(row);
        }
    }
    for (const row of rows.values()) row.children.sort((a, b) => a.label.localeCompare(b.label));
    return roots;
}

export function zoneTree(zones) {
    const seen = new Set();
    const unique = zones.filter(z => !seen.has(z.name) && seen.add(z.name));
    const roots = [...forest(unique.filter(z => z.exists)), ...forest(unique.filter(z => !z.exists))];

    const byId = new Map();
    const parentOf = new Map();
    const bySection = Object.fromEntries(SECTIONS.map(k => [k, { roots: [], count: 0 }]));
    const walk = (row, parent, section) => {
        row.section = section;
        byId.set(row.id, row);
        if (parent) parentOf.set(row.id, parent.id);
        bySection[section].count++;
        row.children.forEach(c => walk(c, row, section));
    };
    for (const root of roots) {
        const z = root.zone;
        const section = !z.exists ? 'available' : (z.owners?.length > 1 ? 'shared' : 'own');
        bySection[section].roots.push(root);
        walk(root, null, section);
    }
    // Only sections with zones; with a single one the page shows its zones without a header.
    const sections = SECTIONS.filter(k => bySection[k].roots.length > 0).map(k => ({ key: k, id: sectionId(k), ...bySection[k] }));

    return {
        sections,
        roots: sections.flatMap(s => s.roots),
        children: (row) => row.children,
        // The rows above a zone's row, nearest first, and the section's header where there are headers, so a link to it can open the way down.
        ancestors: (zoneName) => {
            const row = byId.get(zoneRowId(zoneName));
            if (!row) return [];
            const out = [];
            for (let id = parentOf.get(row.id); id; id = parentOf.get(id)) out.push(id);
            if (sections.length > 1) out.push(sectionId(row.section));
            return out;
        },
        row: (id) => byId.get(id) ?? null,
    };
}

// zoneMatches: whether a row matches the filter text, by its full name.
export function zoneMatches(row, query) {
    return row.name.toLowerCase().includes(query.trim().toLowerCase());
}

// defaultZone is the zone the page opens on without one in the URL: the first base zone already in use (normally the person's own; a person with one zone gets that one), else the first one listed.
export function defaultZone(zones) {
    return zones.find(z => !z.parent && z.exists) ?? zones[0] ?? null;
}
