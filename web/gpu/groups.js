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

// sameToken compares tokens as the service does: e-mail addresses without case.
const sameToken = (a, b) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

// moveMember takes a person out of every group and puts them into the group at index to (null: into none), as dragging a card on the board does; the other members stay in their order.
export function moveMember(groups, token, to) {
    return groups.map((g, i) => {
        const rest = (g.members ?? []).filter(m => !sameToken(m, token));
        return i === to ? { ...g, members: [...rest, token] } : (rest.length === (g.members ?? []).length ? g : { ...g, members: rest });
    });
}

// overCapacity tells whether a group has more people than the group choice gives it places (max 0 = no limit): the managers may put more in, the board shows it.
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

// distribute makes count new groups <prefix>-1… and deals the people (user tokens) among them in turn, in the order given (dealablePeople); a group token is never dealt, groups take persons only (a course comes in as its people, resolved beforehand). Existing groups stay as they are; names already taken are skipped.
export function distribute(groups, people, count, prefix = 'gruppe') {
    const out = [...groups];
    const made = [];
    for (let i = 0; i < count && out.length < MAX_GROUPS; i++) {
        const g = { name: nextGroupName(out, prefix), members: [], read_only: false, archived: false };
        out.push(g);
        made.push(g);
    }
    people.filter(isPerson).forEach((t, i) => {
        if (made.length) made[i % made.length].members.push(t);
    });
    return out;
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

// dealablePeople are the people not in a group yet, whom distribute deals out and the board shows under "not in a group": the project's own members (user tokens, managers left out), then the people of the resolved course groups (resolved: [{ token, people }]), each once (e-mail addresses compared without case), without the managers and the ones already in a group.
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

// seatState is what a group offers the person: their own ('mine', to leave), full, closed to them while they are in another group ('taken'), or open to join.
export function seatState(seat, seats) {
    if (seat.mine) return 'mine';
    if (seats.some(s => s.mine)) return 'taken';
    if (seat.max > 0 && seat.count >= seat.max) return 'full';
    return 'open';
}
