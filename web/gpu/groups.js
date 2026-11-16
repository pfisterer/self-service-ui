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

// distribute makes count new groups <prefix>-1… and deals the people (user tokens) among them in turn, in the order given; group tokens are not dealt, they are a whole course. Existing groups stay as they are; names already taken are skipped.
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

// tokenLabel shows a member token without its prefix.
export const tokenLabel = (t) => (t ?? '').replace(/^(user|group):/, '');
