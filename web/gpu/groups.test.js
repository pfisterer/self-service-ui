import { describe, expect, it } from 'vitest';
import { distribute, groupNameError, memberChoices, nextGroupName, tokenLabel } from '/gpu/groups.js';
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
