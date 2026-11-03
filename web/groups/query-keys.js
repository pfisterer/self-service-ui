// The cached server state of the groups section (see dyndns/query-keys.js for why keys are arrays). `me` is read by the navigation on every page.
export const groupsKeys = {
    all: () => ['groups'],
    me: () => ['groups', 'me'],
    lists: () => ['groups', 'list'],
    list: (q) => ['groups', 'list', q ?? ''],
    detail: (id) => ['groups', 'detail', id],
    effective: (id) => ['groups', 'effective', id],
    history: (id) => ['groups', 'history', id],
    // Prefix only; the autocomplete appends the search term and limit.
    principals: () => ['groups', 'principals'],
};
