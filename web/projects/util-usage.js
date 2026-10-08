// Pure helpers for the consumption views: periods, grouping and the CSV export.
// No React here, so they are tested on their own (util-usage.test.js).

// The periods offered, as days back from yesterday; 'lifetime' reaches back to
// the project's creation, capped at what the API accepts.
export const PERIODS = ['30', '90', '365', 'lifetime'];
const MAX_DAYS = 3 * 366;

const isoDay = (d) => d.toISOString().slice(0, 10);

// periodRange turns a period key into the API's from/to, both days included.
// Today is not collected yet, so every period ends yesterday.
export function periodRange(key, now = new Date(), createdAt = null) {
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    let days = Number(key);
    if (key === 'lifetime') {
        const start = createdAt ? new Date(createdAt) : null;
        days = start && !Number.isNaN(start.getTime())
            ? Math.floor((to - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000) + 1
            : MAX_DAYS;
    }
    days = Math.min(Math.max(days || 30, 1), MAX_DAYS);
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    return { from: isoDay(from), to: isoDay(to) };
}

// ratio is used ÷ reserved as a whole percentage, or null where nothing was
// reserved — "0 %" and "nothing to compare with" are different statements.
export const percent = (r) => (r === null || r === undefined ? null : Math.round(r * 100));

// averageStorage is the mean of the daily storage samples in GB.
export const averageStorage = (t) => (t?.sampled_days ? t.storage_gb_days / t.sampled_days : null);

// averageIPv4 is the mean number of public IPv4 addresses held per counted day.
export const averageIPv4 = (t) => (t?.ipv4_sampled_days ? t.public_ipv4_days / t.ipv4_sampled_days : null);

// idleProject says whether a project ran nothing in a period of at least 30
// days while it still holds resources — the cue to ask whether it is needed.
export function idleProject(report, node) {
    if (!report || node?.status !== 'approved') return false;
    if ((report.days?.length ?? 0) < 30) return false;
    return (report.server_hours ?? 0) === 0;
}

// The grouping levels of the root admins' evaluation. A budget path runs from
// the project's own budget up to the root; levels count down from the root, so
// level 1 is a budget directly below it (a location), level 2 the next one.
export const GROUPINGS = ['project', 'budget', 'level1', 'level2'];

function groupKey(p, by) {
    if (by === 'project') return { id: p.node_id, name: p.project_name || p.node_id };
    const path = p.budget_path || [];
    if (by === 'budget') {
        const b = path[0];
        return b ? { id: b.id, name: b.name || b.id } : { id: '', name: '' };
    }
    const level = by === 'level1' ? 1 : 2;
    // path[length-1] is the root; level n is n steps below it. A project whose
    // path is shorter is grouped under the deepest budget it has.
    const idx = Math.max(path.length - 1 - level, 0);
    const b = path[idx];
    return b ? { id: b.id, name: b.name || b.id } : { id: '', name: '' };
}

const SUMMED = ['server_hours', 'vcpu_hours', 'ram_gb_hours', 'storage_gb_days', 'sampled_days',
    'public_ipv4_days', 'ipv4_sampled_days',
    'reserved_core_hours', 'reserved_ram_gb_hours', 'reserved_storage_gb_days'];

// groupProjects sums the report's projects by the chosen level, biggest vCPU
// consumers first. Utilisation is recomputed from the sums — averaging the
// projects' ratios would weigh a 1-core project like a 64-core one.
export function groupProjects(projects, by) {
    const groups = new Map();
    for (const p of projects || []) {
        const { id, name } = groupKey(p, by);
        let g = groups.get(id);
        if (!g) {
            g = { id, name, projects: 0, value_eur: null };
            for (const k of SUMMED) g[k] = 0;
            groups.set(id, g);
        }
        g.projects += 1;
        for (const k of SUMMED) g[k] += p[k] || 0;
        if (p.value_eur !== null && p.value_eur !== undefined) g.value_eur = (g.value_eur || 0) + p.value_eur;
    }
    const ratio = (u, r) => (r > 0 ? u / r : null);
    return [...groups.values()]
        .map(g => ({
            ...g,
            utilization: {
                cores: ratio(g.vcpu_hours, g.reserved_core_hours),
                ram: ratio(g.ram_gb_hours, g.reserved_ram_gb_hours),
                storage: ratio(g.storage_gb_days, g.reserved_storage_gb_days),
            },
        }))
        .sort((a, b) => b.vcpu_hours - a.vcpu_hours || a.name.localeCompare(b.name));
}

// groupingExamples names up to `max` groups a level produces in this report —
// what "level 1" means depends on how the tree is built, so the choice shows
// it instead of guessing a word like "location" for it.
export function groupingExamples(projects, by, max = 2) {
    return groupProjects(projects, by).map(g => g.name).filter(Boolean)
        .sort((a, b) => a.localeCompare(b)).slice(0, max);
}

// toCSV writes rows as CSV with a header; fields are quoted where they need it.
// Numbers keep a dot as decimal separator, which every spreadsheet can import.
export function toCSV(columns, rows) {
    const cell = (v) => {
        if (v === null || v === undefined) return '';
        const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map(c => cell(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map(c => cell(c.value(r))).join(','));
    return lines.join('\n') + '\n';
}
