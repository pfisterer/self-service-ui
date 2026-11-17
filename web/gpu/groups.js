// Groups of a workspace project (aiaas-deployment docs/todo.md areas_groups): people of the project with their own folder ~/dhbw/groups/<name>, kept by the project's managers or, while the group choice is open, chosen by the members themselves. A group holds persons (user tokens) only; a course group among the project's members is resolved to its people to put them in one by one. A group token a group had before stays until it is removed (the service refuses only a new one). The service checks the same rules (llm-management-api, workspace/groups.go); these are for the form.

// GROUP_NAME is a group's name as the service takes it: it becomes the folder's name.
export const GROUP_NAME = /^[a-z0-9]([a-z0-9._-]{0,38}[a-z0-9])?$/;

export const MAX_GROUPS = 200;

// groupNameError is why a name is not taken ('invalid', 'duplicate') or null; names are compared as the service stores them (lower case, trimmed).
export function groupNameError(name, groups, index) {
    const n = (name ?? '').trim().toLowerCase();
    if (!GROUP_NAME.test(n)) return 'invalid';
    if (groups.some((g, i) => i !== index && (g.name ?? '').trim().toLowerCase() === n)) return 'duplicate';
    return null;
}

// MAX_GROUP_MEMBERS bounds the places per group of the group choice, as the service does.
export const MAX_GROUP_MEMBERS = 1000;

// memberChoices are the project's members apart from its managers (they see every group anyway): people and course groups of the role provider, the course groups to be resolved to their people.
export function memberChoices(members) {
    return (members ?? []).filter(m => m.role !== 'manager').map(m => m.token);
}

// personChoices are the people among memberChoices: what a group takes directly.
export function personChoices(members) {
    return memberChoices(members).filter(t => t.startsWith('user:'));
}

// isPerson tells a person's token (user:<e-mail>) from a group token.
export const isPerson = (t) => (t ?? '').startsWith('user:');

// legacyTokens are the group tokens a group still has from before groups took persons only: shown to be removed, never offered.
export function legacyTokens(group) {
    return (group?.members ?? []).filter(t => !isPerson(t));
}

// peopleCount is how many persons a group has: what the group choice counts against its places.
export function peopleCount(group) {
    return (group?.members ?? []).filter(isPerson).length;
}

// overCapacity tells whether a group has more people than the group choice gives it places (max 0 = no limit): the managers may put more in, the list marks it.
export function overCapacity(group, max) {
    return max > 0 && peopleCount(group) > max;
}

// nextGroupName is the first free name of the form <prefix>-<n>.
export function nextGroupName(groups, prefix = 'gruppe') {
    const taken = new Set(groups.map(g => g.name));
    let n = 1;
    while (taken.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
}

// groupSizes splits n people into groups of about size each: as many groups as size fits in full, the rest spread over them, so there is no tiny last group (13 by 4: 4, 4, 5); fewer people than size make one group; none, none.
export function groupSizes(n, size) {
    if (n <= 0) return [];
    const count = Math.max(1, Math.floor(n / Math.max(1, size)));
    const base = Math.floor(n / count);
    const extra = n % count;
    return Array.from({ length: count }, (_, i) => base + (i >= count - extra ? 1 : 0));
}

// newGroupsBySize makes new groups <prefix>-n… of about size people each (groupSizes) from the people given (dealablePeople, in that order; persons only: a group takes no group token) and adds them after the existing groups, which stay as they are; names already taken are skipped, at most MAX_GROUPS groups in all. made are the new groups.
export function newGroupsBySize(groups, people, size, prefix = 'gruppe') {
    const persons = people.filter(isPerson);
    const out = [...groups];
    const made = [];
    let at = 0;
    for (const n of groupSizes(persons.length, size)) {
        if (out.length >= MAX_GROUPS) break;
        const g = { name: nextGroupName(out, prefix), members: persons.slice(at, at + n), read_only: false, archived: false };
        at += n;
        out.push(g);
        made.push(g);
    }
    return { groups: out, made };
}

// fillFreePlaces puts the people given into the free places of the existing groups that are not archived (places: max, the group choice's places per group), in turn, one group after the other; nobody beyond the places. added is how many each group got (by index), left how many found no place.
export function fillFreePlaces(groups, people, max) {
    const persons = people.filter(isPerson);
    const out = groups.map(g => ({ ...g, members: [...(g.members ?? [])] }));
    const added = out.map(() => 0);
    const open = () => out.map((g, i) => i).filter(i => !out[i].archived && peopleCount(out[i]) < max);
    let left = 0;
    let turn = 0;
    for (const t of persons) {
        const free = open();
        if (max <= 0 || free.length === 0) { left++; continue; }
        const i = free[turn % free.length];
        out[i].members.push(t);
        added[i]++;
        turn++;
    }
    return { groups: out.map((g, i) => (added[i] ? g : groups[i])), added, left };
}

// splitGroupToken parses group:<id> or group:<id>#<relation> (the role provider's member tokens); the plain group is relation "member", everyone in it whatever their relation.
export function splitGroupToken(token) {
    const [id, relation] = (token ?? '').replace(/^group:/, '').split('#');
    return { id, relation: relation || 'member' };
}

// groupTokens are the course groups (group: tokens) among the project's members, managers left out, and those a group still has from before: the ones whose people can be looked up to pick or deal them out.
export function groupTokens(members, groups) {
    const all = [...memberChoices(members), ...(groups ?? []).flatMap(g => g.members ?? [])];
    return [...new Set(all.filter(t => t.startsWith('group:')))];
}

// resolveGroupToken lists the people (user tokens) a group token counts, the way the role provider counts them: a plain group is everyone in it, sub-groups resolved (effective(id), GET /v1/manage/groups/{id}/effective); group:<id>#<relation> only the people holding that relation — the endpoint takes no relation, so it goes through the group's own entries (detail(id), GET /v1/manage/groups/{id}): the live entries with that relation, a person as is, a group entry resolved the same way (a plain group as a whole, group:y#r as the people holding r in y). Pattern entries count nobody, as in the effective members.
export async function resolveGroupToken(token, { effective, detail }, seen = new Set()) {
    const { id, relation } = splitGroupToken(token);
    const key = `${id}#${relation}`;
    if (!id || seen.has(key)) return [];
    seen.add(key);
    if (relation === 'member') return (await effective(id)) ?? [];
    const entries = ((await detail(id))?.memberships ?? []).filter(m => !m.expired && (m.relation || 'member') === relation);
    const nested = await Promise.all(entries.filter(m => m.member.startsWith('group:')).map(m => resolveGroupToken(m.member, { effective, detail }, seen)));
    return [...new Set([...entries.filter(m => m.member.startsWith('user:')).map(m => m.member), ...nested.flat()])];
}

// resolvedChoices are the people of the resolved course groups (resolved: [{ token, people }]) that are not already offered directly (taken), each once, under the first group that has them.
export function resolvedChoices(taken, resolved) {
    const seen = new Set(taken.map(t => t.toLowerCase()));
    return resolved.map(({ token, people }) => ({
        token,
        people: (people ?? []).filter(t => {
            const k = t.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        }),
    })).filter(r => r.people.length > 0);
}

// dealablePeople are the people not in a group yet, whom distribute deals out and the list names as not in a group yet: the project's own members (user tokens, managers left out), then the people of the resolved course groups (resolved: [{ token, people }]), each once (e-mail addresses compared without case), without the managers and the ones already in a group.
export function dealablePeople(members, groups, resolved = []) {
    const skip = new Set([
        ...(members ?? []).filter(m => m.role === 'manager').map(m => m.token),
        ...(groups ?? []).flatMap(g => g.members ?? []),
    ].map(t => t.toLowerCase()));
    const out = [];
    for (const t of [...memberChoices(members), ...resolved.flatMap(r => r.people ?? [])]) {
        const k = t.toLowerCase();
        if (!t.startsWith('user:') || skip.has(k)) continue;
        skip.add(k);
        out.push(t);
    }
    return out;
}

// EMAIL is loose on purpose: an address typed into a group's members, checked again by the service.
const EMAIL = /^[^\s@:]+@[^\s@]+\.[^\s@]+$/;

// typedPerson is the user token for an e-mail address typed into a group's member field, or null.
export function typedPerson(search) {
    const s = (search ?? '').trim().toLowerCase();
    return EMAIL.test(s) ? `user:${s}` : null;
}

// tokenLabel shows a member token without its prefix.
export const tokenLabel = (t) => (t ?? '').replace(/^(user|group):/, '');

// choosing are the workspace projects whose group choice is open to the person: a member or reader there (the managers assign in the settings), with the groups to choose from (group_seats, only while the choice is open).
export function choosing(projects) {
    return (projects ?? []).filter(p => Array.isArray(p.group_seats) && (p.role === 'member' || p.role === 'reader'));
}

// seatState is what a group offers the person: their own ('mine'), full, closed to them since they are in another group already ('taken'; joining is binding), or open to join.
export function seatState(seat, seats) {
    if (seat.mine) return 'mine';
    if (seats.some(s => s.mine)) return 'taken';
    if (seat.max > 0 && seat.count >= seat.max) return 'full';
    return 'open';
}
