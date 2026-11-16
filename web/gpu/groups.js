// Groups of a workspace project (aiaas-deployment docs/todo.md areas_groups): members with their own folder ~/dhbw/groups/<name>, kept by the project's managers. The service checks the same rules (llm-management-api, workspace/groups.go); these are for the form.

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

// memberChoices are the project's members a group can take: people and groups of the role provider, managers left out (they see every group anyway).
export function memberChoices(members) {
    return (members ?? []).filter(m => m.role !== 'manager').map(m => m.token);
}

// nextGroupName is the first free name of the form <prefix>-<n>.
export function nextGroupName(groups, prefix = 'gruppe') {
    const taken = new Set(groups.map(g => g.name));
    let n = 1;
    while (taken.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
}

// distribute makes count new groups <prefix>-1… and deals the people (user tokens) among them in turn, in the order given (dealablePeople); group tokens are not dealt, they are a whole course. Existing groups stay as they are; names already taken are skipped.
export function distribute(groups, people, count, prefix = 'gruppe') {
    const out = [...groups];
    const made = [];
    for (let i = 0; i < count && out.length < MAX_GROUPS; i++) {
        const g = { name: nextGroupName(out, prefix), members: [], read_only: false, archived: false };
        out.push(g);
        made.push(g);
    }
    people.filter(t => t.startsWith('user:')).forEach((t, i) => {
        if (made.length) made[i % made.length].members.push(t);
    });
    return out;
}

// splitGroupToken parses group:<id> or group:<id>#<relation> (the role provider's member tokens); the plain group is relation "member", everyone in it whatever their relation.
export function splitGroupToken(token) {
    const [id, relation] = (token ?? '').replace(/^group:/, '').split('#');
    return { id, relation: relation || 'member' };
}

// groupTokens are the course groups (group: tokens) among the project's members, managers left out, and among the members of its groups: the ones whose people can be looked up to pick or deal them out.
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

// dealablePeople are the people distribute deals out: the project's own members (user tokens, managers left out), then the people of the resolved course groups (resolved: [{ token, people }]), each once (e-mail addresses compared without case), without the ones already in a group.
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
