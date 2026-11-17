import { describe, expect, it } from 'vitest';
import { choosing, dealablePeople, fillFreePlaces, groupNameError, groupSizes, groupTokens, legacyTokens, memberChoices, newGroupsBySize, nextGroupName, overCapacity, peopleCount, personChoices, resolveGroupToken, resolvedChoices, seatState, splitGroupToken, tokenLabel, typedPerson } from '/gpu/groups.js';
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
    it('offers persons only for a group and shows group tokens from before apart', () => {
        const members = [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'group:kurs', role: 'reader' }, { token: 'user:m@dhbw.de', role: 'manager' }];
        expect(personChoices(members)).toEqual(['user:a@dhbw.de']);
        const g = { name: 'g1', members: ['user:a@dhbw.de', 'group:kurs', 'user:b@dhbw.de'] };
        expect(legacyTokens(g)).toEqual(['group:kurs']);
        expect(peopleCount(g)).toBe(2);
        expect(overCapacity(g, 2)).toBe(false);
        expect(overCapacity(g, 1)).toBe(true);
        expect(overCapacity(g, 0)).toBe(false);
    });
    it('tells a member what each group offers in the group choice', () => {
        const seats = [{ id: 'a', count: 2, max: 2 }, { id: 'b', count: 0, max: 2 }, { id: 'c', count: 5, max: 0 }];
        expect(seats.map(x => seatState(x, seats))).toEqual(['full', 'open', 'open']);
        const mine = [{ id: 'a', count: 2, max: 2 }, { id: 'b', count: 1, max: 2, mine: true }];
        expect(mine.map(x => seatState(x, mine))).toEqual(['taken', 'mine']);
        expect(choosing([{ slug: 'x', role: 'member', group_seats: [] }, { slug: 'y', role: 'manager', group_seats: [] }, { slug: 'z', role: 'reader' }, { slug: 'r', role: 'reader', group_seats: [] }]).map(p => p.slug)).toEqual(['x', 'r']);
    });
    it('makes new groups of a size, without a tiny last one', () => {
        expect(nextGroupName([{ name: 'gruppe-1' }, { name: 'gruppe-3' }])).toBe('gruppe-2');
        expect(groupSizes(13, 4)).toEqual([4, 4, 5]);
        expect(groupSizes(12, 4)).toEqual([4, 4, 4]);
        expect(groupSizes(3, 4)).toEqual([3]);
        expect(groupSizes(7, 4)).toEqual([7]);
        expect(groupSizes(0, 4)).toEqual([]);
        const people = ['user:a@dhbw.de', 'user:b@dhbw.de', 'user:c@dhbw.de', 'group:kurs', 'user:d@dhbw.de', 'user:e@dhbw.de'];
        const { groups: out, made } = newGroupsBySize([{ name: 'gruppe-1', members: ['user:x@dhbw.de'] }], people, 2);
        expect(out.map(g => g.name)).toEqual(['gruppe-1', 'gruppe-2', 'gruppe-3']);
        expect(out[0].members).toEqual(['user:x@dhbw.de']);
        expect(made.map(g => g.members)).toEqual([['user:a@dhbw.de', 'user:b@dhbw.de'], ['user:c@dhbw.de', 'user:d@dhbw.de', 'user:e@dhbw.de']]);
    });
    it('fills the free places of the open groups in turn, nobody beyond them', () => {
        const groups = [{ name: 'a', members: ['user:q@dhbw.de'] }, { name: 'b', members: [] }, { name: 'alt', members: [], archived: true }, { name: 'voll', members: ['user:r@dhbw.de', 'user:s@dhbw.de'] }];
        const people = ['user:p1@dhbw.de', 'user:p2@dhbw.de', 'user:p3@dhbw.de', 'user:p4@dhbw.de', 'user:p5@dhbw.de'];
        const { groups: out, added, left } = fillFreePlaces(groups, people, 2);
        expect(out[0].members).toEqual(['user:q@dhbw.de', 'user:p1@dhbw.de']);
        expect(out[1].members).toEqual(['user:p2@dhbw.de', 'user:p3@dhbw.de']);
        expect(added).toEqual([1, 2, 0, 0]);
        expect(left).toBe(2);
        // Untouched groups stay the same objects.
        expect(out[2]).toBe(groups[2]);
        expect(out[3]).toBe(groups[3]);
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
        const { made } = newGroupsBySize(groups, people, 2);
        expect(made.map(g => g.members)).toEqual([['user:a@dhbw.de', 'user:b@dhbw.de'], ['user:c@dhbw.de', 'user:d@dhbw.de']]);
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
