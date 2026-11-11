import { describe, expect, it } from 'vitest';
import { allPages, asPage } from './pages.js';

describe('asPage', () => {
    it('takes a page as it is', () => {
        expect(asPage({ items: [1, 2], total: 5, limit: 2, offset: 2 })).toEqual({ items: [1, 2], total: 5, limit: 2, offset: 2 });
    });
    it('reads a plain array from a service before paging as one page', () => {
        expect(asPage([1, 2, 3])).toEqual({ items: [1, 2, 3], total: 3, limit: 3, offset: 0 });
    });
    it('is an empty page for nothing', () => {
        expect(asPage(undefined)).toEqual({ items: [], total: 0, limit: 0, offset: 0 });
    });
});

describe('allPages', () => {
    const list = Array.from({ length: 1203 }, (_, i) => i);
    it('pages through to the total', async () => {
        const asked = [];
        const all = await allPages(async ({ limit, offset }) => {
            asked.push(offset);
            return { items: list.slice(offset, offset + limit), total: list.length, limit, offset };
        });
        expect(all).toEqual(list);
        expect(asked).toEqual([0, 500, 1000]);
    });
    it('stops after a plain array', async () => {
        let calls = 0;
        expect(await allPages(async () => { calls++; return [1, 2]; })).toEqual([1, 2]);
        expect(calls).toBe(1);
    });
    it('stops at an empty page although total says more', async () => {
        expect(await allPages(async ({ offset }) => (offset === 0 ? { items: [1], total: 9 } : { items: [], total: 9 }))).toEqual([1]);
    });
});
