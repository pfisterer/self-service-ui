// Paged lists of the services (golib page): ?limit and ?offset, answered as { items, total, limit, offset }. Used for the lists of the AI service; openstack-management-api's node lists have the same shape and their own paging in projects/api-nodes.jsx.

// PAGE_MAX is the largest page a service gives (golib page.MaxLimit); a larger limit is cut to it.
export const PAGE_MAX = 500;

// asPage is a list answer as a page. A service from before paging answered with a plain array, which counts as one page holding everything, so the UI works with both while the services are released one after another.
export function asPage(res) {
    if (Array.isArray(res)) return { items: res, total: res.length, limit: res.length, offset: 0 };
    const items = Array.isArray(res?.items) ? res.items : [];
    return { items, total: Number.isFinite(res?.total) ? res.total : items.length, limit: res?.limit ?? items.length, offset: res?.offset ?? 0 };
}

// allPages loads every entry of a paged list, for a screen that needs the whole list (a picker, a lookup of names): fetchPage({ limit, offset }) for one page, until total is reached or a page comes back empty.
export async function allPages(fetchPage, limit = PAGE_MAX) {
    const all = [];
    for (;;) {
        const page = asPage(await fetchPage({ limit, offset: all.length }));
        all.push(...page.items);
        if (page.items.length === 0 || all.length >= page.total) return all;
    }
}
