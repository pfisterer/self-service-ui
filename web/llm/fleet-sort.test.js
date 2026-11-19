import { describe, it, expect } from 'vitest';
import { ipKey, sortPeers } from './fleet-sort.js';

const names = (peers) => peers.map(p => p.name || p.serial);

describe('sortPeers', () => {
    it('orders by name naturally and case-insensitively, the serial deciding between equal or empty names', () => {
        const peers = [
            { serial: 'Z', name: 'wimac10' }, { serial: 'B', name: '' }, { serial: 'C', name: 'WIMAC2' },
            { serial: 'D', name: 'dmmac17-10' }, { serial: 'E', name: 'dmmac17-2' }, { serial: 'A', name: '' }, { serial: 'F', name: 'wimac2' },
        ];
        expect(sortPeers(peers, { key: 'name', order: 'asc' }).map(p => p.serial)).toEqual(['E', 'D', 'C', 'F', 'Z', 'A', 'B']);
        // Descending turns the whole order around, serials included; machines without a name stay last.
        expect(sortPeers(peers, { key: 'name', order: 'desc' }).map(p => p.serial)).toEqual(['Z', 'F', 'C', 'D', 'E', 'B', 'A']);
    });

    it('orders by address numerically, pending and direct machines last in either direction', () => {
        const peers = [
            { name: 'p', pending: true, address: '10.0.0.1' }, { name: 'a', address: '10.90.4.100' }, { name: 'b', address: '10.90.4.9' },
            { name: 'd', transport: 'direct', address: '' }, { name: 'c', address: '10.90.5.1' }, { name: 'v6', address: 'fd00::2' },
        ];
        expect(names(sortPeers(peers, { key: 'address', order: 'asc' }))).toEqual(['b', 'a', 'c', 'v6', 'd', 'p']);
        expect(names(sortPeers(peers, { key: 'address', order: 'desc' }))).toEqual(['v6', 'c', 'a', 'b', 'd', 'p']);
    });

    it('orders badge columns by the label shown, ties by name', () => {
        const peers = [{ name: 'x', state: 's1' }, { name: 'y', state: 's2' }, { name: 'w', state: 's1' }];
        const label = (_, p) => ({ s1: 'Zebra', s2: 'Affe' })[p.state];
        expect(names(sortPeers(peers, { key: 'state', order: 'asc' }, label))).toEqual(['y', 'w', 'x']);
        expect(names(sortPeers(peers, { key: 'state', order: 'desc' }, label))).toEqual(['w', 'x', 'y']);
    });

    it('leaves the list it was given alone', () => {
        const peers = [{ name: 'b' }, { name: 'a' }];
        sortPeers(peers, { key: 'name', order: 'asc' });
        expect(names(peers)).toEqual(['b', 'a']);
    });
});

describe('ipKey', () => {
    it('reads IPv4 and IPv6, IPv4 first', () => {
        expect(ipKey('10.90.4.9')).toEqual([4, 10, 90, 4, 9]);
        expect(ipKey('fd00::2')).toEqual([6, 0xfd00, 0, 0, 0, 0, 0, 0, 2]);
        expect(ipKey('direkt')).toBeNull();
        expect(ipKey('')).toBeNull();
    });
});
