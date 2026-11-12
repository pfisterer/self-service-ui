// zoneTree arranges the zone list as the tree on the zones page: base zones (no parent) at the top in the order the API lists them, each zone's subzones below it by name, at any depth. The API names as parent the closest zone a subzone sits under, which may itself be a subzone (staging.llm.services.dhbw.cloud under llm.services.dhbw.cloud under services.dhbw.cloud). A subzone whose parent is not in the list, or that only a cycle would reach, stands at the top instead of disappearing.
export function zoneTree(zones) {
    const names = new Set(zones.map(z => z.name));
    const byParent = {};
    for (const z of zones) {
        if (z.parent && z.parent !== z.name && names.has(z.parent)) (byParent[z.parent] ??= []).push(z);
    }
    for (const list of Object.values(byParent)) list.sort((a, b) => a.name.localeCompare(b.name));
    const children = (z) => byParent[z.name] ?? [];
    const roots = zones.filter(z => !z.parent || z.parent === z.name || !names.has(z.parent));
    const reached = new Set();
    const walk = (z) => {
        if (reached.has(z.name)) return;
        reached.add(z.name);
        children(z).forEach(walk);
    };
    roots.forEach(walk);
    for (const z of zones) {
        if (!reached.has(z.name)) {
            roots.push(z);
            walk(z);
        }
    }
    return { roots, children };
}

// zoneLabel is a zone's name in the tree: a subzone without its parent's part (llm under services.dhbw.cloud), a base zone in full.
export function zoneLabel(zone) {
    const p = zone.parent;
    return p && zone.name !== p && zone.name.endsWith(`.${p}`) ? zone.name.slice(0, -(p.length + 1)) : zone.name;
}

// zoneAncestors lists the zones above one, nearest first, so the tree can open the way down to it.
export function zoneAncestors(zones, name) {
    const byName = new Map(zones.map(z => [z.name, z]));
    const out = [];
    let p = byName.get(name)?.parent;
    while (p && byName.has(p) && !out.includes(p) && p !== name) {
        out.push(p);
        p = byName.get(p).parent;
    }
    return out;
}

// defaultZone is the zone the page opens on without one in the URL: the first base zone already in use (normally the person's own), else the first one listed.
export function defaultZone(zones) {
    return zones.find(z => !z.parent && z.exists) ?? zones[0] ?? null;
}
