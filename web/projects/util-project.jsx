import { useState } from 'react';
import { formatError } from '/helper/api-error.js';
import { actingAsAtLoad } from '/providers/acting-as.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// Sentinel value matching backend common.UnlimitedQuota: -1 means no cap on a resource.
export const UNLIMITED_QUOTA = -1;

// Well-known node IDs bootstrapped by the backend.
export const ROOT_NODE_ID = 'root';
export const UNASSIGNED_NODE_ID = 'unassigned';

// ── Node helpers ────────────────────────────────────────────────────────────

export function isBudget(node) { return node?.kind === 'budget'; }
export function isProject(node) { return node?.kind === 'project'; }

// Strips the "user:" prefix from an owner token; returns '' when unset.
export function ownerEmail(node) {
    const token = node?.owner || '';
    return token.startsWith('user:') ? token.slice(5) : token;
}

// openstackSide is a project's OpenStack side — its project there and what the
// reconciler measured; an empty object while there is none.
export const openstackSide = (node) => node?.bindings?.openstack ?? {};

// measuredUse is what a project uses across all its providers, by resource id;
// null while nothing was measured. A missing id means "not measured", not zero.
export function measuredUse(node) {
    const measured = Object.values(node?.bindings ?? {}).map(b => b.in_use).filter(Boolean);
    return measured.length ? Object.assign({}, ...measured) : null;
}

// Human-readable title of a node: budgets have names, projects usually only a purpose.
export function nodeTitle(node) {
    if (!node) return '';
    if (node.status === 'imported') {
        const os = openstackSide(node);
        return os.external_name || os.external_id || node.name || node.id;
    }
    return node.name || node.reason || node.id;
}

// ── Colour language ─────────────────────────────────────────────────────────
// Colour carries exactly one meaning here: the state of a thing. It never marks
// what KIND of thing something is — a person, a group, a number and a date all
// look the same, and the label beside them says which is which. Five roles, and
// nothing outside this list:
export const COLOR = {
    // Who and what: people, groups, tokens, plain values. Neutral on purpose —
    // three differently coloured badges in a row read as three severities.
    identity: 'gray',
    // Needs a human: waiting for a decision, a change proposed, a dead end.
    attention: 'orange',
    // Granted, active, will be added.
    positive: 'green',
    // Rejected, over the limit, destroys something.
    negative: 'red',
    // Exists in OpenStack but outside the managed lifecycle (imported/adopt).
    outside: 'violet',
    // Explanation, not state: info alerts and the neutral fill of a usage bar.
    info: 'blue',
};

// ── Status vocabulary ───────────────────────────────────────────────────────
// One place defines how every status looks and reads across the whole UI.

// Every status also carries the sentence that explains it. A badge is a label,
// not an explanation, and the words we chose ("Released", "Imported") are ours
// rather than everyday language — so each one has to say what it means for the
// person reading it: what happened, what it costs, what they can do next.
// The words themselves live in the translations under projects.status.<status>;
// only the colours are decided here.
const STATUS_META = {
    pending: { color: COLOR.attention, variant: 'outline' },
    approved: { color: COLOR.positive, variant: 'filled' },
    change_pending: { color: COLOR.attention, variant: 'outline' },
    rejected: { color: COLOR.negative, variant: 'filled' },
    // Deleted in the portal ("released"): it ended at once and is deleted for
    // good after the grace period. Still listed until then, which is what
    // people ask about.
    released: { color: COLOR.identity, variant: 'light' },
    // Released and shut down: nobody logs in, servers shelved, volumes kept
    // until the deletion for good.
    archived: { color: COLOR.identity, variant: 'outline' },
    imported: { color: COLOR.outside, variant: 'light' },
    // An allocation that no longer pays: given back, withdrawn or cut after it expired. The project goes on with its others.
    ended: { color: COLOR.identity, variant: 'outline' },
};

// ── Retirement: released → archived → deleted ───────────────────────────────

// isRetired: given up, but its OpenStack project may still exist.
export function isRetired(node) {
    return node?.status === 'released' || node?.status === 'archived';
}

// deletionRequested: its deletion for good is under way — someone asked for
// it, or its grace period is over and the reconciler has started emptying its
// OpenStack project (it reports how far it got, see PurgeProgress).
export function deletionRequested(node) {
    return (node?.flags || []).includes('delete_requested') || (isRetired(node) && !!openstackSide(node).purge);
}

// pollWhileDeleting is a react-query refetchInterval for a page of nodes: while
// one of them is being deleted, the page is fetched again every 10 s, so its
// progress moves and the project disappears once it is gone instead of
// standing at the step it was at when the page loaded.
export const DELETING_POLL_MS = 10000;
export function pollWhileDeleting(query) {
    // A budget's table lists allocations: whether the project is being deleted is the project's.
    return (query?.state?.data?.items ?? []).some(n => deletionRequested(n) || deletionRequested(n?.project)) ? DELETING_POLL_MS : false;
}

// deletesOnRequest: the deployment deletes a released project when asked.
export function deletesOnRequest(retirement) {
    const mode = retirement?.delete;
    return !!mode && mode !== 'never';
}

// lastEventAt is when the given history event last happened, or null.
export function lastEventAt(node, event) {
    const entry = [...(node?.history || [])].reverse().find(h => h.event === event);
    return entry?.timestamp ?? null;
}

// scheduledDeletion is the day a retired project is deleted by itself — only
// under after-grace: release day plus the grace days, as the reconciler tags it.
export function scheduledDeletion(node, retirement) {
    if (retirement?.delete !== 'after-grace' || !isRetired(node)) return null;
    const released = lastEventAt(node, 'released');
    if (!released) return null;
    const d = new Date(released);
    d.setUTCDate(d.getUTCDate() + (retirement.deleteGraceDays || 30));
    return d.toISOString();
}

// labDeletion is the day a project's Lab/AI part — workspaces, homes, shared
// folder — is deleted by itself: the day after its end (termination date) or
// its release day, whichever comes first, plus the grace days, as
// openstack-management-api's AI service sync counts them — for a released
// project the same day its OpenStack project is due. null without Lab/AI
// resources, without an end, or with the deletion switched off
// (aiaasDeleteGraceDays 0).
export function labDeletion(node, resources, retirement) {
    const grace = retirement?.aiaasDeleteGraceDays || 0;
    if (!grace || !isLab(projectKinds(node, resources))) return null;
    const days = [];
    if (node.termination_date) {
        const after = new Date(`${node.termination_date.slice(0, 10)}T00:00:00Z`);
        after.setUTCDate(after.getUTCDate() + 1);
        days.push(after.toISOString().slice(0, 10));
    }
    const released = isRetired(node) ? lastEventAt(node, 'released') : null;
    if (released) days.push(released.slice(0, 10));
    if (!days.length) return null;
    const d = new Date(`${days.sort()[0]}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + grace);
    return d.toISOString();
}

// finalDeletion is the day a retired project is deleted for good by itself,
// wherever it lives: its OpenStack project (scheduledDeletion) or its Lab/AI
// part (labDeletion), the later of the two. null for one that is not retired
// or not deleted by itself.
export function finalDeletion(node, resources, retirement) {
    if (!isRetired(node)) return null;
    const days = [scheduledDeletion(node, retirement), labDeletion(node, resources, retirement)].filter(Boolean);
    return days.length ? days.sort().at(-1) : null;
}

// A leaf that is approved but has no OpenStack project yet. The reconciler runs
// on an interval, so "granted" and "usable" are minutes apart — and calling that
// window "Active" sends people looking for a project that is not there.
// Only meaningful while provisioning actually runs; with the reconciler off,
// nothing ever gets an ID and every project would be stuck on "Setting up".
const PROVISIONING_META = { color: COLOR.attention, variant: 'filled' };

// openstackProjectUrl is where a project opens in the OpenStack dashboard, or
// null when there is nowhere to go: no dashboard configured, no OpenStack
// project yet, or one that is on its way out. Horizon's project switch keeps
// its target through the login, so the link works signed out as well.
export function openstackProjectUrl(dashboardUrl, node) {
    const osID = openstackSide(node).external_id;
    if (!dashboardUrl || !osID) return null;
    if (node.status !== 'approved' && node.status !== 'change_pending') return null;
    return `${dashboardUrl.replace(/\/+$/, '')}/auth/switch/${encodeURIComponent(osID)}/?next=/project/`;
}

// isProvisioning: approved, and a provider's side it is owed is not there yet —
// the provider it waits for ('openstack', 'aiaas'), or false. OpenStack is owed
// when the project holds an OpenStack resource and the reconciler runs
// (provisioningEnabled); another provider of `providers` when the project holds
// one of its resources. Without the catalogue (resources) every approved
// project is owed an OpenStack project, as before there were other providers.
export function isProvisioning(node, provisioningEnabled, resources = null, providers = []) {
    if (node?.kind !== 'project' || node?.status !== 'approved') return false;
    if (provisioningEnabled && !openstackSide(node).external_id
        && (!resources || holdsResourceOf(node, resources, 'openstack'))) return 'openstack';
    if (!resources) return false;
    return (providers || []).find(p => !node.bindings?.[p]?.external_id && holdsResourceOf(node, resources, p, true)) ?? false;
}

// holdsResourceOf: the project holds more than zero of a resource of provider
// (a resource without a provider belongs to every provider).
export function holdsResourceOf(node, resources, provider, ownOnly = false) {
    const limit = effectiveLimit(node, node?.limit) || {};
    return resources.some(r => ((!ownOnly && !r.provider) || r.provider === provider)
        && ((limit[r.id] ?? 0) > 0 || limit[r.id] === UNLIMITED_QUOTA));
}

// The kinds of project the UI tells apart, one per area of the catalogue (the
// `area` of every resource): cloud (OpenStack, virtual machines), workspaces and
// LLM (both carried out by the AI service). The tree knows no kinds — a project
// is of every kind it holds resources of, so one may be several.
export const PROJECT_KINDS = ['cloud', 'workspaces', 'llm'];
// The kinds the AI service carries out.
export const LAB_KINDS = ['workspaces', 'llm'];

// kindOfResource: a resource's area; OpenStack's resources are cloud.
export const kindOfResource = (r) => r?.area || (!r?.provider || r.provider === 'openstack' ? 'cloud' : '');

// isLab: whether kinds include one of the AI service.
export const isLab = (kinds) => (kinds || []).some(k => LAB_KINDS.includes(k));

// catalogKinds: the kinds the catalogue offers anything of, in PROJECT_KINDS
// order. One kind means there is nothing to tell apart.
export function catalogKinds(resources) {
    return PROJECT_KINDS.filter(k => (resources || []).some(r => kindOfResource(r) === k));
}

// projectKinds: the kinds a project is — what it holds or asks for: its limit,
// and what its live allocations hold or ask for in a waiting change (a project
// still waiting as a whole holds nothing yet). Empty for a project holding nothing.
export function projectKinds(node, resources) {
    const limits = [node?.limit, node?.pending?.limit, projectAsked(node)].filter(Boolean);
    return PROJECT_KINDS.filter(k => limits.some(limit => (resources || []).some(r => kindOfResource(r) === k
        && ((limit[r.id] ?? 0) > 0 || limit[r.id] === UNLIMITED_QUOTA))));
}

// resourcesOfKinds: the resources of these kinds; one without an area belongs
// to every kind. No kinds — no filter.
export function resourcesOfKinds(resources, kinds) {
    if (!kinds?.length) return resources || [];
    return (resources || []).filter(r => !kindOfResource(r) || kinds.includes(kindOfResource(r)));
}

// budgetKinds: the kinds a budget offers resources of.
export function budgetKinds(budget, resources) {
    const offered = visibleResources(resources, budget);
    return PROJECT_KINDS.filter(k => offered.some(r => kindOfResource(r) === k));
}

// Returns Mantine badge color + variant for a node status.
export function statusStyle(status, provisioning = false) {
    if (provisioning) return PROVISIONING_META;
    return STATUS_META[status] ?? { color: 'gray', variant: 'outline' };
}

// Returns the human-readable label for a status string. Takes `t` rather than
// reaching for the i18n instance: this module is imported by plain functions as
// well as components, and a parameter keeps both honest.
export function statusLabel(t, status, provisioning = false, deletionAt = null) {
    if (provisioning) return t('projects.status.provisioning.label');
    if (deletionAt && (status === 'released' || status === 'archived')) return t('projects.status.deletingOn', { date: formatDate(deletionAt) });
    return STATUS_META[status] ? t(`projects.status.${status}.label`) : status;
}

// Returns the sentence explaining a status, or '' for one we have no words for
// — callers render no tooltip rather than an empty one.
export function statusDescription(t, status, provisioning = false) {
    if (provisioning === 'aiaas') return t('projects.status.provisioning.descriptionAiaas');
    if (provisioning) return t('projects.status.provisioning.description');
    return STATUS_META[status] ? t(`projects.status.${status}.description`) : '';
}

// Returns true for reconciler-imported OpenStack projects that are not yet
// part of the managed lifecycle (read-only until adopted).
export function isImported(node) {
    return node?.status === 'imported';
}

// ── Resource kinds ──────────────────────────────────────────────────────────

// An availability is a resource you either have or do not: a network, an image,
// a GPU flavour. It travels in the same quota map as everything else, as 0 or 1,
// so nothing about the VALUE says which kind it is — only the definition does.
export function isAvailability(resource) {
    return resource?.kind === 'bool';
}

// visibleResources narrows the catalogue to what is in scope at one node.
//
// The server decides this and sends it as `available_resources`: everything at
// the root, and below that only what was actually delegated. Without the filter
// a budget granted two of forty GPU flavours would show all forty.
//
// A node WITHOUT the field falls back to the whole catalogue. That is the older
// server, and showing too much is recoverable; showing nothing would make a
// budget look like it had no resources at all.
export function visibleResources(resources, node) {
    const all = resources || [];
    const scope = node?.available_resources;
    if (!Array.isArray(scope)) return all;
    const inScope = new Set(scope);
    return all.filter(r => inScope.has(r.id));
}

// windowName names a window: "30 Tage" for 30d.
export function windowName(t, window) {
    return t(`projects.resources.window.${window}`, { defaultValue: window });
}

// ── Resource names, hints and units ─────────────────────────────────────────
//
// The catalogue arrives in English (OpenStack's defaults, the deployment's providerResources, the GPU classes the AI service's provider builds). Like the caps (util-caps.js), a resource is named by its id where the UI has a translation (projects.resources.<id>.name, .short, .hint, .unit), else by the server's text; availabilities root admins add in the portal have no translation and stay as written. A GPU class is named from its structured gpu_class (pool and tier names as the GPU administration gives them) with a translated suffix. Every place that shows a resource's name, hint or unit goes through these.

// GPU_CLASS_RESOURCE are the two resources of a GPU class: ws-gpus-<class> (GPUs at the same time) and ws-gpu-hours-<class> (GPU hours per window).
const GPU_CLASS_RESOURCE = /^ws-(gpus|gpu-hours)-(.+)$/;

// gpuClassResource says what a GPU class resource is: kind 'gpus' or 'hours', the class id and the class's name ("General · medium", from gpu_class; '' without it). null for any other resource.
export function gpuClassResource(r) {
    const m = GPU_CLASS_RESOURCE.exec(r?.id || '');
    if (!m) return null;
    const c = r.gpu_class || {};
    const name = c.pool_name && c.tier_name ? `${c.pool_name} · ${c.tier_name}` : '';
    return { kind: m[1] === 'gpus' ? 'gpus' : 'hours', classId: m[2], name };
}

// translatable is whether an id can be a key segment: ids from the deployment are; anything with a key or namespace separator is not looked up at all.
function translatable(r) {
    return !!r?.id && !/[.:]/.test(r.id);
}

// resourceName is a resource's name: the translation where the UI has one, for a GPU class "<pool> · <tier>: GPU hours" from its structured data, else the server's name.
export function resourceName(t, r) {
    if (!r) return '';
    const fallback = r.name || r.id || '';
    const gpu = gpuClassResource(r);
    if (gpu?.name) return t(`projects.resources.gpuClass.${gpu.kind}.name`, { class: gpu.name });
    if (!translatable(r)) return fallback;
    return t(`projects.resources.${r.id}.name`, { defaultValue: fallback });
}

// shortName drops the prefix a section heading says already: "Workspace CPU" → "CPU", "LLM tokens per minute" → "Tokens per minute", "LLM: every model directly" → "Every model directly". Only for names the UI has no short form of (resourceShortName).
export function shortName(name) {
    const rest = (name || '').replace(/^(workspaces?|llm)(\s*:\s*|\s+|-)/i, '');
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : name;
}

// resourceShortName is a resource's name under a heading that names its area (Workspaces, LLM): the translated short form where the UI has one, else its name without the area's prefix.
export function resourceShortName(t, r) {
    const full = resourceName(t, r);
    if (!translatable(r) || gpuClassResource(r)) return shortName(full);
    return t(`projects.resources.${r.id}.short`, { defaultValue: shortName(full) });
}

// RANGE_HINTS are the hints that state a resource's range ("1 - 100000 cores", "1 GB - 256 TB"): translated with the catalogue's own min and max, so a deployment's range still shows.
const gbAmount = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000} TB` : `${n} GB`);
const RANGE_HINTS = { cores: String, ram: gbAmount, storage: gbAmount };

// resourceHint is a resource's explanation: the translation where the UI has one, else the server's message; '' where the server gives none.
export function resourceHint(t, r) {
    if (!r?.message) return '';
    const gpu = gpuClassResource(r);
    if (gpu?.name) return t(`projects.resources.gpuClass.${gpu.kind}.hint`, { class: gpu.name, window: windowName(t, r.window || '30d') });
    if (!translatable(r)) return r.message;
    const range = RANGE_HINTS[r.id];
    if (range) {
        if (typeof r.min !== 'number' || typeof r.max !== 'number') return r.message;
        return t(`projects.resources.${r.id}.hint`, { defaultValue: r.message, min: range(r.min), max: range(r.max) });
    }
    return t(`projects.resources.${r.id}.hint`, { defaultValue: r.message });
}

// resourceUnitName is a resource's unit ("M tokens" → "Mio. Tokens"): the translation where the UI has one, else the server's; '' without a unit.
export function resourceUnitName(t, r) {
    if (!r?.unit) return '';
    if (!translatable(r)) return r.unit;
    return t(`projects.resources.${r.id}.unit`, { defaultValue: r.unit });
}

// resourceAmount is an amount of a resource in running text: "8 GB Arbeitsspeicher", "4 Kerne"; an availability reads as its name alone.
export function resourceAmount(t, r, amount) {
    if (isAvailability(r)) return resourceName(t, r);
    const unit = resourceUnitName(t, r);
    return unit ? `${amount} ${unit} ${resourceName(t, r)}` : `${amount} ${resourceName(t, r)}`;
}

// resourceLabel is how a resource is named next to a value: its name, its unit,
// and for an amount per window the window — "GPU hours (h per 30 days)".
export function resourceLabel(t, r) {
    const name = resourceName(t, r);
    const suffix = resourceUnit(t, r);
    return suffix ? `${name} ${suffix}` : name;
}

// resourceUnit is the unit and window of a resource in brackets ("(GPU h per 30 days)"); '' without either.
export function resourceUnit(t, r) {
    const per = r.window ? t('projects.resources.perWindow', { window: windowName(t, r.window) }) : '';
    const suffix = [resourceUnitName(t, r), per].filter(Boolean).join(' ');
    return suffix ? `(${suffix})` : '';
}

// groupResources sorts the catalogue into its display groups, keeping the
// catalogue's own order inside each one so two nodes never reshuffle relative to
// each other. Resources without a group land in one unnamed bucket at the end.
// Once the catalogue spans more than one provider, the provider heads each
// group ("Workspaces · GPU"); providerLabel names it.
export function groupResources(resources, providerLabel = (p) => p) {
    const multi = new Set((resources || []).map(r => r.provider).filter(Boolean)).size > 1;
    const groups = new Map();
    for (const r of resources || []) {
        const key = multi && r.provider ? [providerLabel(r.provider), r.group].filter(Boolean).join(' · ') : (r.group || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    // The unnamed bucket last: a heading-less block reads as a footnote, and it
    // looks wrong above named sections.
    const named = [...groups.entries()].filter(([k]) => k !== '');
    const unnamed = groups.has('') ? [['', groups.get('')]] : [];
    return [...named, ...unnamed];
}

// ── Quota helpers ───────────────────────────────────────────────────────────

// Sums the usage of all statuses in a node's usage rollup for one resource.
export function usedAmount(node, resourceId) {
    const usage = node?.usage ?? {};
    return Object.values(usage).reduce((sum, s) => sum + (s?.limit?.[resourceId] ?? 0), 0);
}

// Remaining free capacity of a budget for one resource; Infinity when uncapped.
export function freeAmount(node, resourceId) {
    const cap = node?.limit?.[resourceId];
    if (cap === UNLIMITED_QUOTA || cap === undefined || cap === null) return Infinity;
    return cap - usedAmount(node, resourceId);
}

// roomIn is what a budget still has free, per quantity — the most a request
// there could ever be granted.
export function roomIn(budget, resources) {
    return Object.fromEntries((resources || [])
        .filter(r => !isAvailability(r))
        .map(r => [r.id, freeAmount(budget, r.id)]));
}

// defaultsWithin fills a request with the catalogue's defaults, each capped to
// what `room` leaves: a default larger than the budget holds would open the
// form asking for more than it can grant — 16 GB of RAM from a budget of 8.
// Where even the minimum does not fit, the default stays and validation says
// why; a silent zero would read as a choice.
export function defaultsWithin(resources, room) {
    return Object.fromEntries((resources || []).map(r => {
        const value = r.default ?? 0;
        const cap = isAvailability(r) ? Infinity : (room?.[r.id] ?? Infinity);
        return [r.id, cap >= (r.min ?? 0) ? Math.min(value, cap) : value];
    }));
}

// True when the requested quota fits into the budget's remaining capacity.
//
// Availabilities are skipped: they consume nothing, so "does it fit" is not a
// question about them. Left in, every granted availability would eat 1 from a
// budget that never counted it — and a budget whose availability sat at 0 would
// refuse a request that the server accepts, which is the worse direction: the UI
// would block something the API allows.
export function quotaFits(budget, requestedQuota, resources) {
    return (resources || [])
        .filter(r => !isAvailability(r))
        .every(r => (requestedQuota?.[r.id] ?? 0) <= freeAmount(budget, r.id));
}

// mostSpecificFirst orders the budgets a person may request from deepest first, keeping the server's order among equals: a course or programme budget (Kurs, Studiengang) before the base budget of the site (Grundversorgung), so the picker preselects the one meant for this person and the offers start with it. A person sees every budget whose own requesters name one of their groups; without this, the lowest id came first.
export function mostSpecificFirst(budgets) {
    return [...(budgets || [])].sort((a, b) => (b.parent_path?.length ?? 0) - (a.parent_path?.length ?? 0));
}

// hasAutoApprove reports whether the budget grants requests without a manager.
export function hasAutoApprove(budget) {
    return !!budget?.auto_approve;
}

// isPoolAutoApprove reports whether the budget's auto-approve has no per-person
// limit: the budget's own free capacity is then the only bound — the shape of
// a budget handed to one person or shared by a team.
export function isPoolAutoApprove(budget) {
    return hasAutoApprove(budget)
        && Object.keys(budget.auto_approve.per_requester_limit || {}).length === 0;
}

// autoApproveHeadroom returns the largest request a budget would approve on the
// spot for this user, or null when the budget has no auto-approve policy.
//
// The backend grants instantly while the requester's own ACTIVE usage under the
// budget stays within its per-requester limit (if it has one) AND every ancestor
// still has room (see autoApprovable in the API). Both halves are mirrored here:
// the personal cap minus what this user already holds, capped by the budget's
// own free capacity. Own usage is summed from the caller's projects because the
// node's `usage` is the total over all owners. A pool has no personal cap, so
// its headroom is the budget's free capacity — Infinity where it has no cap.
export function autoApproveHeadroom(budget, resources, myProjects) {
    if (!hasAutoApprove(budget)) return null;
    const pool = isPoolAutoApprove(budget);
    const perRequester = budget.auto_approve.per_requester_limit || {};
    const mine = activeUsageUnder(budget, resources, myProjects);

    const out = {};
    for (const r of resources || []) {
        // "How much of this is left for you" means nothing for an availability;
        // it is granted or it is not, and the per-requester cap does not divide.
        if (isAvailability(r)) continue;
        const personal = pool ? Infinity : Math.max(0, (perRequester[r.id] ?? 0) - (mine[r.id] || 0));
        const free = freeAmount(budget, r.id);
        out[r.id] = Math.max(0, Math.min(personal, free));
    }
    return out;
}

// activeUsageUnder sums what the caller's active projects under this budget
// hold — the same definition of "active" the server uses for the per-person sum.
// Since allocation_leaves a person's share is counted per budget, so this sums what their projects' paying allocations FROM this budget hold, not the projects' totals.
function activeUsageUnder(budget, resources, myProjects) {
    const mine = {};
    for (const project of myProjects || []) {
        for (const a of project?.allocations || []) {
            if (a.budget_id !== budget.id || !PAYING_ALLOCATION_STATUSES.includes(a.status)) continue;
            for (const r of resources || []) {
                if (isAvailability(r)) continue;
                mine[r.id] = (mine[r.id] || 0) + (a.limit?.[r.id] || 0);
            }
        }
    }
    return mine;
}

// requestedBy reports whether a budget was requested (created) by the user with this email. It stays theirs whoever manages it later.
export function requestedBy(node, email) {
    return !!email && (node?.created_by || '').toLowerCase() === email.toLowerCase();
}

// headroomExhaustedBy says why autoApproveHeadroom came out empty: 'share' when
// the caller's own projects hold their whole per-person share, 'budget' when the
// budget itself has nothing left, null when there was never anything to take
// (a share of zero) — the one case where "nothing" is the honest answer.
export function headroomExhaustedBy(budget, resources, myProjects) {
    if (!hasAutoApprove(budget)) return null;
    const counted = (resources || []).filter(r => !isAvailability(r));
    if (!isPoolAutoApprove(budget)) {
        const perRequester = budget.auto_approve.per_requester_limit || {};
        const granted = counted.filter(r => (perRequester[r.id] ?? 0) > 0);
        if (granted.length === 0) return null;
        const mine = activeUsageUnder(budget, counted, myProjects);
        if (granted.every(r => (mine[r.id] || 0) >= perRequester[r.id])) return 'share';
    }
    return counted.some(r => freeAmount(budget, r.id) <= 0) ? 'budget' : null;
}

// beyondAutoApproveRefused reports whether the budget refuses requests its
// auto-approve does not cover, instead of queueing them for a manager.
export function beyondAutoApproveRefused(budget) {
    return hasAutoApprove(budget) && budget.allow_requests_beyond_auto_approve === false;
}

// autoApproveFacts answers the two questions a budget's auto-approve raises —
// what it grants without asking, and what happens to the rest — as two separate
// values rather than one sentence assembled from clauses. null without a policy.
export function autoApproveFacts(t, resources, budget) {
    if (!hasAutoApprove(budget)) return null;
    const amount = isPoolAutoApprove(budget)
        ? '' : resourceSummaryText(t, resources, budget.auto_approve.per_requester_limit);
    return {
        // A pool grants whatever the budget still has, so it has no figure of
        // its own to show.
        grants: amount
            ? t('projects.autoApprove.perPerson', { amount })
            : t('projects.autoApprove.whileRoom'),
        beyond: beyondAutoApproveRefused(budget)
            ? t('projects.autoApprove.beyondRefused')
            : t('projects.autoApprove.beyondManager'),
    };
}

// What happens when a request is sent — the same decision the API makes, made
// early so the form can say it before the button is pressed:
//   'direct'    the viewer manages the budget; created active on the spot
//   'refused'   the viewer manages the budget, but it has no room: a manager's
//               own creation is checked on the spot and turned down
//   'instant'   the budget's auto-approve grants it (or it needs no approval)
//   'approval'  a manager of the budget decides
//   'blocked'   beyond what auto-approve grants, and the budget takes no
//               requests beyond that — the server refuses it
//
// requestOutcome is for a NEW project under `budget`.
export function requestOutcome({ budget, manages, quota, resources, myProjects }) {
    if (!budget) return null;
    if (manages) return quotaFits(budget, quota, resources) ? 'direct' : 'refused';
    const headroom = autoApproveHeadroom(budget, resources, myProjects);
    if (!headroom) return 'approval';
    const fits = (resources || [])
        .filter(r => !isAvailability(r))
        .every(r => (quota?.[r.id] ?? 0) <= (headroom[r.id] ?? 0));
    if (fits) return 'instant';
    return beyondAutoApproveRefused(budget) ? 'blocked' : 'approval';
}

// changeOutcome is for a proposed change to an active project `node` under
// `budget` (null when the viewer cannot see it). It mirrors leafChangeDecision
// in the API: giving back, ending sooner and member changes never wait; growing
// and extending take effect at once only where the budget's auto-approve covers
// them — for growth only the DIFFERENCE has to fit, since the project already
// holds its current size.
//
// `manages`: the viewer manages the budget or one above it (managesChainOf) — the people who would approve the change. The API applies their change at once when every budget has room for the growth ('direct'), and refuses it otherwise ('refused'); the budgets above the project's own are raisePlan's business.
// latestProjectEnd is the latest a project under budget may end at `now`:
// the budget's end, or now plus the longest term the budget gives its projects
// (max_project_term_days), whichever comes first. `term` is set when the term is
// what binds, so a form can say so. Null where neither exists — a project there
// may run open-ended. Budgets carry the shortest term of their chain, so the
// budget's own value is the one that applies.
// endDate reads a stored end as the Date the date pickers work with. Since 10.11.2026 openstack-management-api stores an end as its day ("2026-12-31", counted in Europe/Berlin); new Date() would read that as midnight UTC, an hour or two after the picker's local midnight, so picking the same day again looked like an earlier end. A day is read as local midnight, an older timestamp as it is.
export function endDate(s) {
    if (!s) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? dayjs(s).toDate() : new Date(s);
}

// endDay is a picked Date as the server stores it: its local day, "2026-12-31". Sending the day rather than toISOString() keeps the time zone out of it.
export function endDay(d) {
    return d ? dayjs(d).format('YYYY-MM-DD') : null;
}

export function latestProjectEnd(budget, now = Date.now()) {
    const end = endDate(budget?.termination_date);
    const term = budget?.max_project_term_days;
    const byTerm = term ? new Date(now + term * 24 * 60 * 60 * 1000) : null;
    if (byTerm && (!end || byTerm < end)) return { date: byTerm, term };
    return end ? { date: end, term: null } : null;
}

export function changeOutcome({ node, budget, quota, terminationDate, resources, myProjects, manages = false }) {
    const current = node?.limit || {};
    const counted = (resources || []).filter(r => !isAvailability(r));
    const grows = (resources || []).some(r => isAvailability(r)
        ? (quota?.[r.id] ?? 0) > 0 && (current[r.id] ?? 0) <= 0
        : (quota?.[r.id] ?? 0) > (current[r.id] ?? 0));
    const endOf = (d) => (d ? (d instanceof Date ? d : endDate(d)).getTime() : null);
    const currentEnd = endOf(node?.termination_date);
    const nextEnd = endOf(terminationDate);
    const extendsEnd = nextEnd !== null && currentEnd !== null && nextEnd > currentEnd;

    if (!grows && !extendsEnd) return 'instant';
    if (manages) {
        // Only the growth needs room: the project holds its current size already. Without the budget in view the server decides.
        const fits = !budget || counted.every(r =>
            Math.max(0, (quota?.[r.id] ?? 0) - (current[r.id] ?? 0)) <= freeAmount(budget, r.id));
        return fits ? 'direct' : 'refused';
    }
    const beyond = beyondAutoApproveRefused(budget) ? 'blocked' : 'approval';
    if (!hasAutoApprove(budget) || budget.status !== 'approved') return 'approval';
    if (extendsEnd) {
        const budgetEnd = endOf(budget.termination_date);
        if (budgetEnd !== null && nextEnd > budgetEnd) return beyond;
    }
    if (grows) {
        // An availability newly switched on is no quantity: the policy grants
        // it like a new request would (it is in the budget's scope, or the
        // form would not have offered it).
        const headroom = autoApproveHeadroom(budget, resources, myProjects);
        const fits = counted.every(r =>
            (quota?.[r.id] ?? 0) - (current[r.id] ?? 0) <= (headroom[r.id] ?? 0));
        if (!fits) return beyond;
    }
    // A budget may leave extensions to its managers: they wait, but are not
    // refused — the hard limit is about resources, not about asking.
    if (extendsEnd && budget.auto_approve_extensions === false) return 'approval';
    return 'instant';
}

// ── Raising a budget from the project dialog ────────────────────────────────

const idSet = (ids) => (ids instanceof Set ? ids : new Set(ids || []));

// idsAbove are the ids of the budgets above budget that its record names, nearest first: its parent and the path down to it (parent_path, root-most first, without the root itself), and ancestor_ids where the listing carries them.
export function idsAbove(budget) {
    const ids = [budget?.parent_id, ...[...(budget?.parent_path || [])].reverse().map(p => p.id), ...[...(budget?.ancestor_ids || [])].reverse()];
    return [...new Set(ids.filter(Boolean))];
}

// managesChainOf reports whether the viewer manages budget or a budget above it — who the API lets create a project there directly and decide on, and change at once, a project in it. myBudgetIds are the budgets the viewer manages themselves (my-budgets); isRoot: the viewer is a root admin, who manages the top of every chain.
export function managesChainOf(budget, myBudgetIds, isRoot = false) {
    if (!budget) return false;
    if (isRoot) return true;
    const mine = idSet(myBudgetIds);
    return [budget.id, ...idsAbove(budget)].some(id => mine.has(id));
}

// canRaise reports whether the viewer may raise budget's limit: the API takes a new limit only from a manager of a budget ABOVE it (managing it alone is not enough, nobody raises their own budget), and the top budget has nobody above it.
export function canRaise(budget, myBudgetIds, isRoot = false) {
    if (!budget?.parent_id) return false;
    if (isRoot) return true;
    const mine = idSet(myBudgetIds);
    return idsAbove(budget).some(id => mine.has(id));
}

// projectNeed is what a project asks its budgets to have free, per quantity, positive amounts only: a new or still pending project all it asks for, an active one only its growth — what it holds already is counted in the budgets' use.
export function projectNeed({ isChange, node, quota, resources }) {
    const held = isChange && (node?.status === 'approved' || node?.status === 'change_pending') ? (node.limit || {}) : {};
    const out = {};
    for (const r of resources || []) {
        if (isAvailability(r)) continue;
        const v = (quota?.[r.id] ?? 0) - (held[r.id] ?? 0);
        if (v > 0) out[r.id] = v;
    }
    return out;
}

// budgetShortfall is how much budget lacks of need, per quantity: need minus what it has free, where that is positive. A budget already over its limit lacks that excess too.
export function budgetShortfall(budget, need, resources) {
    const out = {};
    for (const r of resources || []) {
        if (isAvailability(r)) continue;
        const n = need?.[r.id] ?? 0;
        if (n <= 0) continue;
        const free = freeAmount(budget, r.id);
        if (n > free) out[r.id] = n - free;
    }
    return out;
}

// Per resource the larger of two amounts.
function maxEach(a, b) {
    const out = { ...a };
    for (const [id, v] of Object.entries(b || {})) out[id] = Math.max(out[id] ?? 0, v);
    return out;
}

// edgeOver is how far budget's limit raised by add would exceed the limit of the budget above (the API's edge rule: a budget holds no more than the one above it).
function edgeOver(budget, add, parent) {
    const out = {};
    for (const [id, v] of Object.entries(add)) {
        const cap = parent.limit?.[id];
        const own = budget.limit?.[id] ?? 0;
        if (cap === undefined || cap === null || cap === UNLIMITED_QUOTA || own === UNLIMITED_QUOTA) continue;
        if (own + v > cap) out[id] = own + v - cap;
    }
    return out;
}

// raisePlan says which budgets would have to grow for a project's need to fit, top-most first. A project is granted only where every budget above it has room, while raising a budget the API checks only the limit of the one above it (not its free room), so the dialog checks the chain it can see itself. chain: the budgets from the project's own upward, nearest first, as far as the viewer can read them. canRaise(budget): whether the viewer may raise it.
//
// Each step is { budget, short, ownShort, parent, edgeShort, child, raisable, reason }: short is how much its limit has to grow — its own lack of room, and what the budget below it needs its limit to hold to be raised itself (edgeShort of that one); ownShort whether it lacks room itself; parent the budget whose limit bounds it; child the budget below it in the plan; reason why it cannot be raised here: 'pending' (a request for more of it waits, approving it would replace the raise), 'notManager', 'inherits' (it passes on the limit of a budget out of view). A budget that inherits its limit is skipped where the budget it inherits from is in view: that one sees the same projects and carries its shortage.
export function raisePlan(chain, need, resources, { canRaise: may = () => false } = {}) {
    const steps = [];
    const budgets = (chain || []).filter(Boolean);
    let carry = {};
    let child = null;
    for (let i = 0; i < budgets.length; i++) {
        const b = budgets[i];
        const parent = budgets.slice(i + 1).find(x => !x.inherits_limit) ?? null;
        const own = budgetShortfall(b, need, resources);
        if (b.inherits_limit) {
            if (parent) continue;
            const short = maxEach(own, carry);
            if (Object.keys(short).length > 0) steps.push({ budget: b, short, ownShort: Object.keys(own).length > 0, parent: null, edgeShort: {}, child, raisable: false, reason: 'inherits' });
            break;
        }
        const short = maxEach(own, carry);
        if (Object.keys(short).length === 0) {
            carry = {};
            child = b;
            continue;
        }
        const edgeShort = parent ? edgeOver(b, short, parent) : {};
        const reason = b.status === 'change_pending' ? 'pending' : may(b) ? null : 'notManager';
        steps.push({ budget: b, short, ownShort: Object.keys(own).length > 0, parent, edgeShort, child, raisable: reason === null, reason });
        carry = edgeShort;
        child = b;
    }
    return steps.reverse();
}

// resourceBarSegments turns absolute amounts into the widths of the stacked
// segments of a usage bar. Split out of ResourceBar so the arithmetic
// can be checked without rendering anything: the clamping is the whole point.
// Each segment is capped by what the ones before it left over, so the segments
// never sum past 100 — otherwise an over-committed budget draws a bar that
// runs out of its own track.
//
// used is what the projects below actually consume, drawn inside the allocated part (used ⊂ allocated ⊂ budget); usedPct is its width and approvedPct the whole allocated part, used included. A project may use more than the budget in between handed out (the rest came from further up), so the allocated part is never drawn narrower than the used one.
export function resourceBarSegments(limit, { approved = 0, changePending = 0, incoming = 0, used = 0 } = {}) {
    const pct = (v) => (limit > 0 ? Math.round((v / limit) * 100) : 0);
    const usedPct = Math.min(100, pct(used));
    const approvedPct = Math.max(usedPct, Math.min(100, pct(approved)));
    const pendingPct = Math.min(100 - approvedPct, pct(changePending));
    const incomingPct = Math.min(100 - approvedPct - pendingPct, pct(incoming));
    return { usedPct, approvedPct, pendingPct, incomingPct, totalPct: approvedPct + pendingPct + incomingPct };
}

// usageState is what a budget's bar says about one resource. Handed out and used are two different things: a budget whose projects hold all of it but use none is full, not short — only consumption at the limit is a shortage.
//   'open'       room left (or no limit at all)
//   'full'       everything handed out (taken = allocated + requested + about to be granted), whether used or not
//   'over'       more handed out than the budget holds
//   'exhausted'  the projects below use all of it
// used is undefined where nothing measures the resource.
export function usageState(limit, { taken = 0, used } = {}) {
    if (limit === UNLIMITED_QUOTA) return 'open';
    if (used !== undefined && used > 0 && used >= limit) return 'exhausted';
    if (taken > limit) return 'over';
    if (limit > 0 && taken >= limit) return 'full';
    return 'open';
}

// limitDelta is one row of the before/after table: what a resource is now, what
// it would become, and the difference. A missing key means 0 — a quota that
// does not mention a resource grants none of it.
export function limitDelta(limitFrom, limitTo, resourceId) {
    const before = limitFrom?.[resourceId] ?? 0;
    const after = limitTo?.[resourceId] ?? 0;
    return { before, after, d: after - before };
}

// nodeChanges answers "what would this change actually do" for a proposed edit:
// which of limit, termination date and member list moved, and who was added,
// removed or given a different role.
//
// Members are compared by token, not by position: the API returns them in no
// guaranteed order, and a list-identity comparison would report every reorder
// as a change. `usersTo === undefined` means the caller is not editing members
// at all, which is different from editing them down to an empty list — hence
// hasUserData rather than checking for an empty array.
export function nodeChanges({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo } = {}) {
    const hasLimitChange = Boolean(limitFrom && limitTo && resources &&
        resources.some(r => (limitFrom[r.id] ?? 0) !== (limitTo[r.id] ?? 0)));
    // An end given to something that had none is a change too — it is what a
    // budget receiving an end does to everything below it.
    // Both through endDate: a stored end is a day ("2027-01-10"), the form's a Date at local midnight; new Date() on the day would read midnight UTC and see a change of an hour or two where there is none (12.11.2026).
    const hasDateChange = Boolean(dateTo &&
        (!dateFrom || endDate(dateFrom).getTime() !== endDate(dateTo).getTime()));

    const hasUserData = usersTo !== undefined && usersTo !== null;
    const from = usersFrom || [];
    const to = usersTo || [];
    const fromMap = new Map(from.map(u => [u.token, u]));
    const toMap = new Map(to.map(u => [u.token, u]));
    const added = hasUserData ? to.filter(u => !fromMap.has(u.token)) : [];
    const removed = hasUserData ? from.filter(u => !toMap.has(u.token)) : [];
    // Carries `previous_role` along: "what it was" is part of the change, and
    // the caller would otherwise have to rebuild the same lookup to render the
    // "member → reader" arrow.
    const roleChanged = hasUserData ? to.flatMap(u => {
        const previous = fromMap.get(u.token);
        return previous && previous.role !== u.role
            ? [{ ...u, previous_role: previous.role }]
            : [];
    }) : [];

    return {
        hasLimitChange,
        hasDateChange,
        added,
        removed,
        roleChanged,
        hasUserChanges: added.length > 0 || removed.length > 0 || roleChanged.length > 0,
    };
}

// One-line resource summary, e.g. "8 vCPUs · 16 GB RAM · 200 GB Disk".
export function resourceSummaryText(t, resources, quota) {
    if (!resources || !quota) return '';
    return resources
        .filter(r => (quota[r.id] ?? 0) !== 0)
        // An availability reads as its own name (resourceAmount). "1 DHBW IPv4" invites the question of what two would be, and there is no answer.
        .map(r => resourceAmount(t, r, quota[r.id] === UNLIMITED_QUOTA ? '∞' : quota[r.id]))
        .join(' · ');
}

// "72 / 80 Cores · 288 / 320 GB RAM": what is in use of what was granted, for
// the quantities OpenStack measures. A resource missing from inUse is not
// measured — it is shown as granted only, never as zero in use.
// Availabilities read as their name, as in resourceSummaryText.
// usageLevel is how full a project is on one resource: 'ok', 'high' from 80 %
// on, 'full' once everything granted is in use (or more — OpenStack keeps
// running what a lowered quota no longer covers). null when there is nothing to
// compare: not measured, nothing granted, or no cap. One rule for the table,
// the bars on the card and the line under an input field.
export const USAGE_HIGH = 0.8;
export function usageLevel(used, limit) {
    if (typeof used !== 'number' || typeof limit !== 'number' || limit === UNLIMITED_QUOTA || limit < 0) return null;
    if (limit === 0) return used > 0 ? 'full' : null;
    const share = used / limit;
    return share >= 1 ? 'full' : share >= USAGE_HIGH ? 'high' : 'ok';
}

// USAGE_COLOR is the colour of a level: normal, a hint, a warning.
export const USAGE_COLOR = { ok: null, high: COLOR.attention, full: COLOR.negative };

export function resourceUsageText(t, resources, quota, inUse) {
    return resourceUsageItems(t, resources, quota, inUse, ' / ').join(' · ');
}

// resourceUsageItems is the same as a list, one entry per resource, for places
// that lay the entries out themselves; `sep` goes between used and granted.
export function resourceUsageItems(t, resources, quota, inUse, sep = '/') {
    if (!resources || !quota) return [];
    return resources
        .filter(r => (quota[r.id] ?? 0) !== 0)
        .map(r => {
            const limit = quota[r.id] === UNLIMITED_QUOTA ? '∞' : quota[r.id];
            const used = inUse?.[r.id];
            return resourceAmount(t, r, used === undefined ? limit : `${used}${sep}${limit}`);
        });
}

// The resources a project is CHARGED for beyond what it declared, i.e. where
// OpenStack measures more than the granted limit.
//
// Mirrors chargedQuota in the API (internal/tree/service.go) rather than
// re-inventing the rule, including both of its edge cases: a resource MISSING
// from in_use means "OpenStack does not measure this", not zero, and an
// unlimited limit stays unlimited. Only a measured value strictly above a
// finite limit is an overage.
//
// Without this the card says "Overcommitted" and then lists the declared
// limit — which is exactly the number that is NOT being billed, so the badge
// states there is a problem while the figures next to it deny it.
export function overageEntries(resources, node) {
    const inUse = measuredUse(node);
    if (!resources || !inUse) return [];
    return resources.flatMap(r => {
        const limit = node.limit?.[r.id] ?? 0;
        if (limit === UNLIMITED_QUOTA) return [];
        const used = inUse[r.id];
        if (used === undefined || used <= limit) return [];
        return [{ ...r, limit, used }];
    });
}

// "8 Cores · 5 GB RAM" for the overage rows above, in the same shape as
// resourceSummaryText so the two lines read as a pair.
export function overageText(t, entries) {
    return entries.map(r => resourceAmount(t, r, r.used)).join(' · ');
}

// childrenById turns the per-branch query results of the budget tree into one
// lookup: node id → the loaded page, branches still in flight left out.
//
// It returns a PLAIN OBJECT, and that is load-bearing. react-query hands a
// `combine` result through replaceEqualDeep, which preserves the previous
// reference when the contents are equal — but only for plain objects and
// arrays; anything else (a Map, for one) it returns as-is, i.e. a fresh
// reference on every call. The tree data is memoised on this value and Mantine's
// Tree re-initialises its controller whenever `data` changes identity, and that
// sets state. A Map therefore rendered the view into an infinite loop, which is
// how it shipped in 0.8.13-test.1: "Maximum update depth exceeded", the whole
// section replaced by the error boundary.
//
// If this ever needs a richer container, the identity has to be pinned some
// other way first.
export function childrenById(ids, results) {
    const out = {};
    ids.forEach((id, i) => {
        const page = results[i]?.data;
        if (page) out[id] = page;
    });
    return out;
}

// ── Generic helpers (unchanged semantics) ───────────────────────────────────

export function normalizeObjectResponse(res, fallback = {}) {
    if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        if (res.data.data && typeof res.data.data === 'object' && !Array.isArray(res.data.data)) {
            return res.data.data;
        }
        return res.data;
    }
    if (res && typeof res === 'object' && !Array.isArray(res)) {
        return res;
    }
    return fallback;
}

// The role of a project member, as OpenStack knows it (member, reader). In the workspaces of the AI service it decides nothing: who writes the shared folder ~/dhbw/project is a setting of the project (shared_write), the managers always do. kinds is kept for the callers.
export function formatRoleLabel(roleId, _kinds) {
    if (!roleId) return '';
    return roleId.charAt(0).toUpperCase() + roleId.slice(1);
}

// getAuthUserEmail is whose view the page shows: the person this tab acts on behalf of (providers/acting-as.js), else the signed-in person. Every caller asks it to tell the viewer's own projects from others' and to fill in the viewer as requester, which while acting on behalf must be the person acted for, as the APIs see it.
export function getAuthUserEmail(user) {
    if (actingAsAtLoad) return actingAsAtLoad;
    const profile = user?.profile || {};
    return profile.email || '';
}

// Re-exported so the projects area keeps one import for its formatting, while
// the decision itself lives in one module for the whole UI.
export { formatDate, formatDateTime } from '../format-date.js';
import { formatDate } from '../format-date.js';

// Formats a date value as "05.08.2026 (in 2 months)" or '—' if falsy.
export function formatRelativeDate(d) {
    return d ? `${formatDate(d)} (${dayjs(d).fromNow()})` : '—';
}

// expiryTone turns "how much time is left" into a colour. A date years away is
// background information; one that is days away is the most important thing on
// the card, and grey text does not say that.
export function expiryTone(d) {
    if (!d) return 'gray';
    const days = dayjs(d).diff(dayjs(), 'day');
    if (days <= 14) return 'red';
    if (days <= 60) return 'orange';
    return 'gray';
}

// expiryLabel reads as a sentence in both directions: "Valid until 4/8/2027
// (in a year)" / "Expired 2/8/2026 (2 days ago)". The relative part comes from
// dayjs' relativeTime plugin, so "in 13 days", "in a month", "in a year" are
// phrased the way a person would say them.
export function expiryLabel(t, d) {
    if (!d) return '';
    return isExpired(d)
        ? t('projects.expiry.expiredOn', { date: formatRelativeDate(d) })
        : t('projects.expiry.validUntil', { date: formatRelativeDate(d) });
}

// expiryValue is the same information without the leading words, for places
// that already carry a "Valid until:" label of their own.
export function expiryValue(t, d) {
    if (!d) return '';
    return isExpired(d) ? t('projects.expiry.expiredValue', { date: formatRelativeDate(d) }) : formatRelativeDate(d);
}

export function isExpired(d) {
    return !!d && dayjs(d).isBefore(dayjs());
}

// ── Sorting a list of projects ──────────────────────────────────────────────

// PROJECT_SORTS are the orders My Projects offers; the first is the default.
// Every one falls back to the name, so equal keys still give a fixed order —
// the API returns the projects by their (random) ID.
export const PROJECT_SORTS = ['name', 'created', 'expiry', 'status'];

// What needs the owner's attention first, what is over last.
const STATUS_RANK = { rejected: 0, change_pending: 1, pending: 2, approved: 3, imported: 4, released: 5, archived: 6, ended: 7 };

export function sortProjects(items, key) {
    const byName = (a, b) => nodeTitle(a).localeCompare(nodeTitle(b), undefined, { sensitivity: 'base', numeric: true });
    const time = (d) => (d ? dayjs(d).valueOf() : null);
    const cmp = {
        // Newest first.
        created: (a, b) => (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0),
        // The one ending soonest first; one without an end last.
        expiry: (a, b) => (time(a.termination_date) ?? Infinity) - (time(b.termination_date) ?? Infinity),
        status: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    }[key];
    return [...items].sort((a, b) => (cmp ? cmp(a, b) : 0) || byName(a, b));
}

// ── Requests waiting for a decision ─────────────────────────────────────────

// The four kinds of thing a manager decides on. Used by the filter in the
// budget tree; the values are also what `requestType` returns.
export const REQUEST_TYPE_VALUES = ['project', 'budget', 'change', 'imported'];

export function requestTypes(t) {
    return REQUEST_TYPE_VALUES.map(value => ({ value, label: t(`projects.requestTypes.${value}`) }));
}

// Classifies a node into one of REQUEST_TYPES; null when it waits for nobody.
export function requestType(node) {
    if (isImported(node)) return 'imported';
    if (node?.status === 'change_pending') return 'change';
    if (node?.status !== 'pending') return null;
    return isBudget(node) ? 'budget' : 'project';
}

// Re-exported so the existing `import { formatError } from './util-project.jsx'`
// call sites keep working; the implementation lives with its sibling
// apiErrorMessage in /helper/api-error.js. Imported rather than re-exported
// straight through because useAsyncRefresh below calls it locally.
export { formatError };

// Custom hook that wraps an async fetcher with loading and error state.
// `loaded` flips true after the first attempt completes and stays true, so
// callers can show a loader only on the INITIAL load and keep rendering stale
// content across refreshes (stale-while-revalidate) — no blank-out flicker.
// Usage:
//   const { loading, loaded, refresh } = useAsyncRefresh(async () => {
//       setNodes(await api.listMine());
//   });
//   useEffect(() => { refresh(); }, [api]);
export function useAsyncRefresh(fetcher, onError) {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            await fetcher();
        } catch (e) {
            onError?.(formatError(e));
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    };

    return { loading, loaded, refresh };
}

// ── Allocations ─────────────────────────────────────────────────────────────
//
// Since allocation_leaves (25.11.2026) a project is not in the budget tree: it consists of allocations, each a leaf directly under the one budget that pays for it and subject to that budget's rules alone. The project's limit is the sum of the allocations that pay, its termination_date the latest of their ends; `allocations` on every project lists them (live ones first), and an allocation row of a budget's table carries its whole `project`.

// The allocation states that still mean something for the project: asked for, or paying.
export const LIVE_ALLOCATION_STATUSES = ['pending', 'approved', 'change_pending'];
// The states in which an allocation pays for its project now.
export const PAYING_ALLOCATION_STATUSES = ['approved', 'change_pending'];

export function isAllocation(node) { return node?.kind === 'allocation'; }

// liveAllocations are a project's allocations that are asked for or pay.
export function liveAllocations(project) {
    return (project?.allocations || []).filter(a => LIVE_ALLOCATION_STATUSES.includes(a.status));
}

// isCoFunded reports whether more than one budget pays for (or is asked to pay for) the project.
export function isCoFunded(project) {
    return liveAllocations(project).length > 1;
}

// projectOf is the project a row stands for: an allocation's project, a project itself.
export function projectOf(node) {
    return isAllocation(node) ? (node.project ?? null) : node;
}

// projectBudgetId is the budget a project's place in the tree is read from: its home allocation's budget (a project has no parent any more); a budget's or allocation's parent.
export function projectBudgetId(node) {
    return node?.home_budget_id ?? node?.parent_id ?? null;
}

// fundedBy reports whether a budget pays for the project, or is asked to.
export function fundedBy(project, budgetId) {
    return liveAllocations(project).some(a => a.budget_id === budgetId);
}

// projectAsked is what a project holds or asks for in total: per live allocation its waiting change where there is one, else its limit. While nothing pays yet (a request), the project's own limit is empty and this is what it is about.
export function projectAsked(project) {
    const out = {};
    for (const a of liveAllocations(project)) {
        for (const [id, v] of Object.entries(a.pending?.limit || a.limit || {})) out[id] = addQuota(out[id], v);
    }
    return out;
}

// addQuota adds two amounts of one resource: unlimited stays unlimited. An availability comes from one allocation only, so its 0s and 1s never add up past 1.
function addQuota(a, b) {
    if (a === UNLIMITED_QUOTA || b === UNLIMITED_QUOTA) return UNLIMITED_QUOTA;
    return (a ?? 0) + (b ?? 0);
}

// projectDisplayLimit is what a project card and its dialogs show as the project's resources: what it holds, or while it waits as a whole, what it asks for.
export function projectDisplayLimit(project) {
    return project?.status === 'pending' ? projectAsked(project) : (project?.limit || {});
}

// effectiveLimit is what a project holds in total. Since allocation_leaves that is its limit (the sum of its paying allocations), so the given quota is returned as it is; kept as one name for every place that means "the whole project".
export function effectiveLimit(node, own = node?.limit) {
    return { ...(own || {}) };
}

// availabilityElsewhere reports whether the project already gets an availability from another live allocation than allocationId: it comes from one place, so another budget is not asked for it again.
export function availabilityElsewhere(project, resourceId, allocationId) {
    return liveAllocations(project).some(a => a.id !== allocationId
        && ((a.limit?.[resourceId] ?? 0) === 1 || (a.pending?.limit?.[resourceId] ?? 0) === 1));
}

// holdsProject reports whether the viewer answers for the project — its owner or one of its admins — and so manages the whole of it: every allocation, giving one back, asking other budgets for more. viewer_relation says so where the API sets it (my projects); elsewhere the owner and the person's own token among the admins decide (a group among them is the API's to recognise).
export function holdsProject(project, email) {
    if (!project) return false;
    if (project.viewer_relation) return project.viewer_relation === 'owner' || project.viewer_relation === 'admin';
    const me = (email || '').toLowerCase();
    if (!me) return false;
    return ownerEmail(project).toLowerCase() === me || (project.admin_scope || []).some(tk => tk.toLowerCase() === `user:${me}`);
}

// managesAllocation reports whether the viewer manages the budget an allocation is paid from, or one above it: then they change, approve, reject or withdraw it — and no other budget's allocation (decided 25.11.2026, (4) and (5)). budget_path runs from below the root down to the budget itself.
export function managesAllocation(allocation, managedIds, isRoot = false) {
    if (!allocation) return false;
    if (isRoot) return true;
    const mine = managedIds instanceof Set ? managedIds : new Set(managedIds || []);
    const budgetId = allocation.budget_id ?? allocation.parent_id;
    const path = (allocation.budget_path ?? allocation.parent_path ?? []).map(p => p.id);
    return [budgetId, ...path].some(id => id && mine.has(id));
}

// allocationActions says what the viewer may do with one allocation of a project: holder (holdsProject) or manager of its budget (managesAllocation). The API decides in the end; the UI only offers what it would allow.
//   change  a new amount or end: the holders ask (or give back), the budget's managers set it
//   end     give it back (holders) or withdraw it (managers)
//   decide  approve or reject a waiting allocation or change: its budget's managers
export function allocationActions(allocation, { holder = false, manager = false } = {}) {
    const live = LIVE_ALLOCATION_STATUSES.includes(allocation?.status);
    const waiting = allocation?.status === 'pending' || allocation?.status === 'change_pending';
    return {
        change: live && allocation.status !== 'change_pending' && (holder || manager),
        end: live && (holder || manager),
        decide: waiting && manager,
    };
}

// expiryOf describes an expired allocation for the people looking at it: { at, due, cause, budgetName }, null when it has not expired.
export function expiryOf(allocation) {
    const e = allocation?.expired;
    if (!e) return null;
    return { at: e.at, due: e.due ?? null, cause: e.cause, budgetName: e.budget_name || allocation.budget_name || allocation.parent_name || '' };
}

// expiredText is the one sentence naming an expired allocation: when it ran out and what happens next — cut on its due day, or (without a notification service) left to the budget's managers; a deleted budget is named as the cause.
export function expiredText(t, allocation) {
    const e = expiryOf(allocation);
    if (!e) return '';
    if (e.cause === 'budget_deleted') {
        return e.due
            ? t('projects.allocation.budgetDeletedDue', { name: e.budgetName, due: formatDate(e.due) })
            : t('projects.allocation.budgetDeleted', { name: e.budgetName });
    }
    return e.due
        ? t('projects.allocation.expiredDue', { at: formatDate(e.at), due: formatDate(e.due) })
        : t('projects.allocation.expiredOpen', { at: formatDate(e.at) });
}

// projectActions says which actions a project offers, for its owner or for a
// manager of the budget it is paid from. One answer for the card and the
// budget's project table, so the two cannot drift apart.
//
// Editing is not an owner privilege: on a pending request a manager's edit
// amends it in place, on an approved project it becomes a proposal. Release is
// a manager's to do as well — they carry the budget it is paid from.
//
// Deleting for good is offered on a released or archived project wherever the
// deployment deletes on request (canDelete, from the config), until it is
// under way.
export function projectActions(node, { manager = false, canDelete = false } = {}) {
    const approved = node?.status === 'approved';
    const pending = node?.status === 'pending';
    const decidable = pending || node?.status === 'change_pending';
    // Moving, handing over and allocations are fields and sections of the
    // project's one dialog (change), not actions of their own.
    return {
        details: true,
        change: approved || pending,
        release: approved,
        deleteForGood: canDelete && isRetired(node) && !deletionRequested(node),
        decide: manager && decidable,
        adopt: manager && isImported(node) && !(node.flags || []).includes('promote_on_reconcile'),
    };
}
