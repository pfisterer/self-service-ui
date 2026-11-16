// The cached server state of the groups section (see dyndns/query-keys.js for why keys are arrays). `me` is read by the navigation on every page.
export const groupsKeys = {
    all: () => ['groups'],
    me: () => ['groups', 'me'],
    lists: () => ['groups', 'list'],
    // params as given to listGroups: { q, source, parent }.
    list: (params) => ['groups', 'list', params ?? {}],
    sources: () => ['groups', 'sources'],
    detail: (id) => ['groups', 'detail', id],
    effective: (id) => ['groups', 'effective', id],
    history: (id) => ['groups', 'history', id],
    // The people a member token (group:<id> or group:<id>#<relation>) counts, as a workspace project's groups offer them (gpu/groups.js resolveGroupToken).
    resolved: (token) => ['groups', 'resolved', token],
    // Prefix only; the autocomplete appends the search term and limit.
    principals: () => ['groups', 'principals'],
};
