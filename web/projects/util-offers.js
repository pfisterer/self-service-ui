// "Was ich bekommen kann" (new layout): what the budgets a person may request from offer them, added up per resource. Plain functions, tested without rendering.

import { autoApproveHeadroom, beyondAutoApproveRefused, freeAmount, hasAutoApprove, isAvailability, isPoolAutoApprove, kindOfResource, visibleResources } from './util-project.jsx';

// offerOf is what one budget offers the viewer, per quantity of its scope (availabilities aside):
//   now  what a request gets at once (auto-approve: the viewer's remaining share, for a pool the budget's free room); 0 without auto-approve
//   ask  the most a request can be granted at all: the budget's free room, or for a budget that refuses what its auto-approve does not cover only `now`
// A budget passing on its parent's limit (inherits_limit) has no cap of its own: ask is Infinity there. Values may be Infinity (uncapped).
export function offerOf(budget, resources, myProjects) {
    const scope = visibleResources(resources, budget).filter(r => !isAvailability(r));
    const instant = hasAutoApprove(budget);
    const head = instant ? autoApproveHeadroom(budget, scope, myProjects) : {};
    const refused = beyondAutoApproveRefused(budget);
    const out = {};
    for (const r of scope) {
        const now = instant ? (head[r.id] ?? 0) : 0;
        const free = budget.inherits_limit ? Infinity : Math.max(0, freeAmount(budget, r.id));
        out[r.id] = { now, ask: Math.max(now, refused ? now : free) };
    }
    return out;
}

// offerTotals adds offerOf up over the budgets, per resource id: { now, ask }. Only resources at least one budget offers appear.
export function offerTotals(budgets, resources, myProjects) {
    const totals = {};
    for (const b of budgets || []) {
        for (const [id, v] of Object.entries(offerOf(b, resources, myProjects))) {
            const tot = totals[id] ?? { now: 0, ask: 0 };
            totals[id] = { now: tot.now + v.now, ask: tot.ask + v.ask };
        }
    }
    return totals;
}

// offeredAvailabilities lists the availabilities of a kind the budgets offer (networks, GPU flavours, models), each with whether one of them grants it at once (its auto-approve includes it per person, or it is a pool).
export function offeredAvailabilities(budgets, resources, kind) {
    const out = new Map();
    for (const b of budgets || []) {
        const instant = hasAutoApprove(b);
        const pool = instant && isPoolAutoApprove(b);
        for (const r of visibleResources(resources, b)) {
            if (!isAvailability(r) || kindOfResource(r) !== kind) continue;
            const now = instant && (pool || b.auto_approve.per_requester_limit?.[r.id] === 1);
            out.set(r.id, { resource: r, now: (out.get(r.id)?.now ?? false) || now });
        }
    }
    return [...out.values()];
}

// termOf is the longest project term (days) among the budgets, for those granting at once (now) and for all (ask); null where a budget sets none (no limit of its own).
export function termOf(budgets) {
    const longest = (list) => (list.length === 0 ? 0 : list.some(b => !b.max_project_term_days) ? null : Math.max(...list.map(b => b.max_project_term_days)));
    const all = budgets || [];
    return { now: longest(all.filter(hasAutoApprove)), ask: longest(all) };
}
