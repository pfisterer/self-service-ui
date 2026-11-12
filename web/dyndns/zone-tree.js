// The zone tree on the zones page: the zones under headings, each heading the part of the names the person does not own, below it a tree of the zones by their own hierarchy.
//
// Heading of a root zone: the zone it was given out of, the API's `zone_soa` (the governing rule's SOA: users.dhbw.site for a personal zone, dhbw.cloud for services.dhbw.cloud); without one (an older API, a zone no rule governs) the name without its first label. A subzone stands under its root zone's heading, so a zone and its subzones stay together; own, shared and not created zones are not separated.
//
// A zone's parent is the API's `parent` where that zone is listed, else the closest listed zone whose name the zone's name ends in (a policy zone below another, such as x.lehre.example below lehre.example), never labels alone; a zone not created yet takes no zone below it. Headings stand in the order their first zone appears in the API (normally the person's own personal zone first); below, the person's own zone first (the first root zone in use the API lists, as defaultZone), then zones in use by label, then the ones not created yet by label.
//
// A row is { id, name, label, zone, children, heading }: name is the full zone name, label the part below the heading (a root) or below the parent zone (a subzone). Ids are prefixed ("zone:…", headings "heading:…") so the expansion stored per browser cannot mix a heading up with a zone.

export const zoneRowId = (name) => `zone:${name}`;
export const headingId = (soa) => `heading:${soa}`;

const trim = (name) => (name ?? '').replace(/\.+$/, '');

// zoneHeading: the heading a root zone stands under — its zone_soa where that lies above the name, else the name without its first label (a name of one label is its own heading).
export function zoneHeading(zone) {
    const name = trim(zone.name);
    const soa = trim(zone.zone_soa);
    if (soa && name.endsWith(`.${soa}`)) return soa;
    const i = name.indexOf('.');
    return i < 0 ? name : name.slice(i + 1);
}

const byLabel = (a, b) => (b.zone.exists ? 1 : 0) - (a.zone.exists ? 1 : 0) || a.label.localeCompare(b.label);

export function zoneTree(zones) {
    const byName = new Map();
    for (const z of zones) if (!byName.has(trim(z.name))) byName.set(trim(z.name), z);

    const parentOf = (name, z) => {
        const ok = (p) => p !== name && byName.has(p) && byName.get(p).exists;
        if (z.parent && ok(trim(z.parent))) return trim(z.parent);
        const labels = name.split('.');
        for (let i = 1; i < labels.length; i++) {
            const above = labels.slice(i).join('.');
            if (ok(above)) return above;
        }
        return null;
    };

    const rows = new Map();
    for (const [name, zone] of byName) rows.set(name, { id: zoneRowId(name), name, label: name, zone, children: [], heading: null });
    const parentRow = new Map();
    const roots = [];
    for (const [name, zone] of byName) {
        const row = rows.get(name);
        const parent = parentOf(name, zone);
        if (parent) {
            row.label = name.slice(0, -(parent.length + 1));
            rows.get(parent).children.push(row);
            parentRow.set(row.id, rows.get(parent));
        } else {
            roots.push(row);
        }
    }
    for (const row of rows.values()) row.children.sort(byLabel);

    // Headings in the order of their first root in the API's list; a root's label is its name below the heading.
    const headings = new Map();
    const byId = new Map();
    const walk = (row, heading) => {
        row.heading = heading.soa;
        byId.set(row.id, row);
        heading.count++;
        row.children.forEach(c => walk(c, heading));
    };
    for (const root of roots) {
        const soa = zoneHeading(root.zone);
        if (!headings.has(soa)) headings.set(soa, { key: soa, id: headingId(soa), soa, count: 0, roots: [] });
        const heading = headings.get(soa);
        if (root.name !== soa) root.label = root.name.slice(0, -(soa.length + 1));
        heading.roots.push(root);
        walk(root, heading);
    }
    const sections = [...headings.values()];
    const own = defaultZone(zones);
    const ownFirst = (a, b) => (b.zone === own ? 1 : 0) - (a.zone === own ? 1 : 0) || byLabel(a, b);
    for (const s of sections) s.roots.sort(ownFirst);

    return {
        sections,
        roots: sections.flatMap(s => s.roots),
        children: (row) => row.children,
        // The rows above a zone's row, nearest first, and its heading, so a link to it can open the way down.
        ancestors: (zoneName) => {
            const row = byId.get(zoneRowId(trim(zoneName)));
            if (!row) return [];
            const out = [];
            for (let p = parentRow.get(row.id); p; p = parentRow.get(p.id)) out.push(p.id);
            out.push(headingId(row.heading));
            return out;
        },
        row: (id) => byId.get(id) ?? null,
        // Every id that opens and closes: the headings and the zones with subzones (for expand all and collapse all).
        branches: [...sections.map(s => s.id), ...[...byId.values()].filter(r => r.children.length > 0).map(r => r.id)],
        parent: (row) => parentRow.get(row.id) ?? null,
    };
}

const sameOwners = (a = [], b = []) => a.length === b.length && a.every(o => b.includes(o));

// sharedOwners: the owners a row shows as shared (a small sign with their count), or null: a root zone with more than one owner, a subzone only where its owners differ from its parent's (else the sign on the root says it already).
export function sharedOwners(row, parent) {
    const owners = row.zone.owners ?? [];
    if (owners.length < 2) return null;
    if (parent && sameOwners(owners, parent.zone.owners)) return null;
    return owners;
}

// zoneMatches: whether a row matches the filter text, by its full name.
export function zoneMatches(row, query) {
    return row.name.toLowerCase().includes(query.trim().toLowerCase());
}

// defaultZone is the zone the page opens on without one in the URL: the first base zone already in use (normally the person's own; a person with one zone gets that one), else the first one listed.
export function defaultZone(zones) {
    return zones.find(z => !z.parent && z.exists) ?? zones[0] ?? null;
}
