import { describe, expect, it } from 'vitest';
import { zoneAuthority } from './zone-authority.js';

const zone = { owners: ['creator@dhbw.de', 'co@dhbw.de'], creator: 'creator@dhbw.de' };

describe('zoneAuthority', () => {
    it('lets the creator delete, remove others and rotate every key, but not leave', () => {
        const a = zoneAuthority(zone, 'Creator@dhbw.de');
        expect(a).toMatchObject({ isCreator: true, manages: true, canLeave: false, rotatesAll: true });
        expect(a.canRemove('co@dhbw.de')).toBe(true);
        expect(a.canRemove('creator@dhbw.de')).toBe(false);
    });

    it('lets a co-owner only leave and rotate their own key', () => {
        const a = zoneAuthority(zone, 'co@dhbw.de');
        expect(a).toMatchObject({ isCreator: false, manages: false, canLeave: true, rotatesAll: false });
        expect(a.canRemove('creator@dhbw.de')).toBe(false);
    });

    it('lets a super admin who is a co-owner do what the creator may, including removing the creator', () => {
        const a = zoneAuthority(zone, 'co@dhbw.de', true);
        expect(a).toMatchObject({ manages: true, canLeave: true, rotatesAll: true });
        expect(a.canRemove('creator@dhbw.de')).toBe(true);
    });

    it('treats a sole creator as managing, with nobody to remove and nothing to leave', () => {
        const a = zoneAuthority({ owners: ['creator@dhbw.de'], creator: 'creator@dhbw.de' }, 'creator@dhbw.de');
        expect(a).toMatchObject({ manages: true, canLeave: false, rotatesAll: false });
    });

    it('falls back to every owner managing when the server names no creator', () => {
        const a = zoneAuthority({ owners: ['a@dhbw.de', 'b@dhbw.de'] }, 'b@dhbw.de');
        expect(a).toMatchObject({ manages: true, canLeave: true });
    });

    it('lets an owner through a group delete the zone, but not leave, and keeps others from removing them one by one', () => {
        const shared = { owners: ['creator@dhbw.de', 'member@dhbw.de'], creator: 'creator@dhbw.de', via: { 'member@dhbw.de': 'group:lab' } };
        const member = zoneAuthority(shared, 'member@dhbw.de');
        expect(member).toMatchObject({ manages: false, canDelete: true, canLeave: false, viaGroup: 'group:lab' });
        const creator = zoneAuthority(shared, 'creator@dhbw.de');
        expect(creator.canRemove('member@dhbw.de')).toBe(false);
        expect(creator.throughGroup('member@dhbw.de')).toBe(true);
    });

    it('reads the caller\'s group from the zone list too', () => {
        const listed = { owners: ['creator@dhbw.de', 'member@dhbw.de'], creator: 'creator@dhbw.de', via: 'group:lab', owners_via: { 'member@dhbw.de': 'group:lab' } };
        expect(zoneAuthority(listed, 'member@dhbw.de')).toMatchObject({ canDelete: true, viaGroup: 'group:lab' });
        expect(zoneAuthority({ ...listed, via: undefined }, 'creator@dhbw.de')).toMatchObject({ canDelete: true, viaGroup: '' });
    });
});
