// The zone tree on the zones page is built from the names alone, label by label from the right, like a trie (dennis-pfisterer-at-dhbw-de.users.dhbw.site: site › dhbw › users › dennis-pfisterer-at-dhbw-de), so that every row only needs the labels that are new below the row above it and long base zones no longer stand in full in the narrow column. The API's `parent` is not needed for this: the closest zone above a zone is also the closest zone its name ends in.
//
// Which trie nodes become rows (deterministic, from the names only):
// - The top level are the registered domains, taken as the last two labels (dhbw.site, dhbw.cloud; no public suffix list, the platform's domains have plain two-label suffixes; a name of one or two labels is its own top). Such a domain is a row when it is a zone itself or holds at least two zones; a domain with a single zone below it does not branch, and that zone stands at the top with its full name (x.y.example.org as one row, not four).
// - Below the top, a node is a row when it is a zone or when it branches (two or more children). A node that is neither is merged into its only child, whose label then carries both parts with a dot (lehre.dhbw.cloud with only wi24a below: one row wi24a.lehre).
// - Rows that are not zones are group rows: they only hold the zones below them.
// Order: top-level rows as the API lists their first zone (normally the person's own first), rows below by label.
//
// A row is { id, name, label, zone, children }: name is the full domain, label the part new below the row above, zone the API's zone or null for a group. Ids are prefixed ("zone:…", "group:…") so the expansion stored per browser cannot mix a group up with a zone of the same name.

const labelsOf = (name) => name.replace(/\.+$/, '').split('.').filter(Boolean);

export const zoneRowId = (name) => `zone:${name}`;
const groupRowId = (name) => `group:${name}`;

export function zoneTree(zones) {
    const byName = new Map();
    for (const z of zones) if (!byName.has(z.name)) byName.set(z.name, z);

    // The trie: one node per name that is a zone or lies above one, keyed by its full name.
    const nodes = new Map();
    const node = (name) => {
        if (!nodes.has(name)) nodes.set(name, { name, kids: new Set(), zones: 0 });
        return nodes.get(name);
    };
    const tops = [];
    for (const z of byName.values()) {
        const labels = labelsOf(z.name);
        if (labels.length === 0) continue;
        const top = labels.slice(-2).join('.');
        if (!tops.includes(top)) tops.push(top);
        node(top).zones++;
        for (let i = labels.length - 3; i >= 0; i--) {
            const name = labels.slice(i).join('.');
            node(labels.slice(i + 1).join('.')).kids.add(name);
            node(name).zones++;
        }
    }

    const isRow = (n, atTop) => byName.has(n.name) || (atTop ? n.zones >= 2 : n.kids.size >= 2);
    // The row for a node: follows a chain of nodes that are no row down to the first that is.
    const rowFrom = (name, above, atTop) => {
        let n = nodes.get(name);
        while (!isRow(n, atTop)) {
            n = nodes.get([...n.kids][0]);
            atTop = false;
        }
        const zone = byName.get(n.name) ?? null;
        const row = {
            id: zone ? zoneRowId(n.name) : groupRowId(n.name),
            name: n.name,
            label: above ? n.name.slice(0, -(above.length + 1)) : n.name,
            zone,
            children: [],
        };
        row.children = [...n.kids].map(k => rowFrom(k, n.name, false)).sort((a, b) => a.label.localeCompare(b.label));
        return row;
    };
    const roots = tops.map(top => rowFrom(top, null, true));

    const parentOf = new Map();
    const byId = new Map();
    const walk = (row, parent) => {
        byId.set(row.id, row);
        if (parent) parentOf.set(row.id, parent.id);
        row.children.forEach(c => walk(c, row));
    };
    roots.forEach(r => walk(r, null));

    return {
        roots,
        children: (row) => row.children,
        // The rows above a zone's row, nearest first, group rows included, so a link to it can open the way down.
        ancestors: (zoneName) => {
            const out = [];
            for (let id = parentOf.get(zoneRowId(zoneName)); id; id = parentOf.get(id)) out.push(id);
            return out;
        },
        row: (id) => byId.get(id) ?? null,
    };
}

// zoneMatches: whether a row matches the filter text — zones by their full name; a group row is shown only as the way down to a zone that matches.
export function zoneMatches(row, query) {
    return !!row.zone && row.name.toLowerCase().includes(query.trim().toLowerCase());
}

// defaultZone is the zone the page opens on without one in the URL: the first base zone already in use (normally the person's own), else the first one listed.
export function defaultZone(zones) {
    return zones.find(z => !z.parent && z.exists) ?? zones[0] ?? null;
}
