import { describe, expect, it } from 'vitest';
import { dealablePeople, distribute, groupNameError, groupTokens, memberChoices, nextGroupName, resolveGroupToken, resolvedChoices, splitGroupToken, tokenLabel, typedPerson } from '/gpu/groups.js';
import { uploadPath, uploadTargets } from '/gpu/jobs.js';

describe('groups', () => {
    it('checks names like the service', () => {
        const groups = [{ name: 'gruppe-1' }, { name: 'B' }];
        expect(groupNameError('gruppe-2', groups, 5)).toBeNull();
        expect(groupNameError(' Gruppe-1 ', groups, 5)).toBe('duplicate');
        expect(groupNameError('gruppe-1', groups, 0)).toBeNull();
        expect(groupNameError('../x', groups, 5)).toBe('invalid');
        expect(groupNameError('a b', groups, 5)).toBe('invalid');
        expect(groupNameError('', groups, 5)).toBe('invalid');
    });
    it('offers members but not managers', () => {
        expect(memberChoices([{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'group:kurs', role: 'reader' }, { token: 'user:m@dhbw.de', role: 'manager' }])).toEqual(['user:a@dhbw.de', 'group:kurs']);
        expect(tokenLabel('user:a@dhbw.de')).toBe('a@dhbw.de');
    });
    it('names and deals out new groups', () => {
        expect(nextGroupName([{ name: 'gruppe-1' }, { name: 'gruppe-3' }])).toBe('gruppe-2');
        const out = distribute([{ name: 'gruppe-1', members: ['user:x@dhbw.de'] }], ['user:a@dhbw.de', 'user:b@dhbw.de', 'user:c@dhbw.de', 'group:kurs'], 2);
        expect(out.map(g => g.name)).toEqual(['gruppe-1', 'gruppe-2', 'gruppe-3']);
        expect(out[0].members).toEqual(['user:x@dhbw.de']);
        expect(out[1].members).toEqual(['user:a@dhbw.de', 'user:c@dhbw.de']);
        expect(out[2].members).toEqual(['user:b@dhbw.de']);
    });
    it('deals out the people of resolved course groups too, each once and none already in a group', () => {
        const members = [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'group:wwi24#studierende', role: 'member' }, { token: 'group:wwi25', role: 'reader' }, { token: 'user:m@dhbw.de', role: 'manager' }];
        const groups = [{ name: 'gruppe-1', members: ['user:x@dhbw.de'] }];
        const resolved = [
            { token: 'group:wwi24#studierende', people: ['user:b@dhbw.de', 'user:x@dhbw.de', 'user:A@dhbw.de', 'user:c@dhbw.de'] },
            { token: 'group:wwi25', people: ['user:c@dhbw.de', 'user:d@dhbw.de', 'user:m@dhbw.de'] },
        ];
        const people = dealablePeople(members, groups, resolved);
        expect(people).toEqual(['user:a@dhbw.de', 'user:b@dhbw.de', 'user:c@dhbw.de', 'user:d@dhbw.de']);
        const out = distribute(groups, people, 2);
        expect(out[1].members).toEqual(['user:a@dhbw.de', 'user:c@dhbw.de']);
        expect(out[2].members).toEqual(['user:b@dhbw.de', 'user:d@dhbw.de']);
        // Without anything resolved, as before: the direct members only.
        expect(dealablePeople(members, groups)).toEqual(['user:a@dhbw.de']);
    });
    it('offers the people of course groups once, under the first group that has them', () => {
        const members = [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'group:wwi24#studierende', role: 'member' }, { token: 'group:chef', role: 'manager' }];
        expect(groupTokens(members, [{ members: ['group:wwi25', 'group:wwi24#studierende', 'user:a@dhbw.de'] }])).toEqual(['group:wwi24#studierende', 'group:wwi25']);
        expect(resolvedChoices(['user:a@dhbw.de', 'group:wwi24#studierende'], [
            { token: 'group:wwi24#studierende', people: ['user:A@dhbw.de', 'user:b@dhbw.de'] },
            { token: 'group:wwi25', people: ['user:b@dhbw.de'] },
            { token: 'group:wwi26', people: ['user:c@dhbw.de'] },
        ])).toEqual([{ token: 'group:wwi24#studierende', people: ['user:b@dhbw.de'] }, { token: 'group:wwi26', people: ['user:c@dhbw.de'] }]);
        expect(typedPerson(' Neu@DHBW.de ')).toBe('user:neu@dhbw.de');
        expect(typedPerson('neu')).toBeNull();
    });
    it('resolves a group token like the role provider counts it', async () => {
        expect(splitGroupToken('group:wwi24#studierende')).toEqual({ id: 'wwi24', relation: 'studierende' });
        expect(splitGroupToken('group:wwi24')).toEqual({ id: 'wwi24', relation: 'member' });
        const details = {
            wwi24: { memberships: [
                { member: 'user:s1@dhbw.de', relation: 'studierende' },
                { member: 'user:d1@dhbw.de', relation: 'dozent' },
                { member: 'user:alt@dhbw.de', relation: 'studierende', expired: true },
                { member: 'group:wwi24a', relation: 'studierende' },
                { member: 'group:wwi24b#studierende', relation: 'studierende' },
                { member: 'group:wwi24c', relation: 'member' },
                { member: 'pattern:*@student.dhbw.de', relation: 'studierende' },
            ] },
            wwi24b: { memberships: [{ member: 'user:s3@dhbw.de', relation: 'studierende' }, { member: 'user:d2@dhbw.de', relation: 'dozent' }, { member: 'group:wwi24#studierende', relation: 'studierende' }] },
        };
        const effective = async (id) => ({ wwi24: ['user:s1@dhbw.de', 'user:d1@dhbw.de'], wwi24a: ['user:s2@dhbw.de', 'user:s1@dhbw.de'] }[id] ?? []);
        const detail = async (id) => details[id];
        // The relation: its live entries, a plain sub-group as a whole, group:y#r as the people holding r in y; a loop back ends.
        expect(await resolveGroupToken('group:wwi24#studierende', { effective, detail })).toEqual(['user:s1@dhbw.de', 'user:s2@dhbw.de', 'user:s3@dhbw.de']);
        // The plain group: its effective members.
        expect(await resolveGroupToken('group:wwi24', { effective, detail })).toEqual(['user:s1@dhbw.de', 'user:d1@dhbw.de']);
        // A group the person may not read: the error reaches the caller.
        const forbidden = Object.assign(new Error('forbidden'), { status: 403 });
        await expect(resolveGroupToken('group:x', { effective: async () => { throw forbidden; }, detail })).rejects.toBe(forbidden);
    });
});

describe('upload targets', () => {
    it('lists the home and the writable areas', () => {
        const p = { role: 'member', areas: [{ mount: 'dhbw/project', read_only: false }, { mount: 'dhbw/groups/g1', read_only: false }, { mount: 'dhbw/groups/g2', read_only: true }] };
        expect(uploadTargets(p)).toEqual(['home', 'dhbw/project', 'dhbw/groups/g1']);
        expect(uploadTargets({ role: 'reader', areas: [{ mount: 'dhbw/project', read_only: true }] })).toEqual(['home']);
        expect(uploadTargets({ role: 'member' })).toEqual(['home']);
    });
    it('builds the path below the chosen folder', () => {
        expect(uploadPath('home', 'daten', 'a.csv')).toBe('daten/a.csv');
        expect(uploadPath('shared', '', 'a.csv')).toBe('dhbw/project/a.csv');
        expect(uploadPath('dhbw/groups/g1', 'x', 'a.csv')).toBe('dhbw/groups/g1/x/a.csv');
        expect(uploadPath('dhbw/groups/g1', '../x', 'a.csv')).toBeNull();
    });
});
