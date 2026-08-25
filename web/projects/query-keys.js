// Names the cached server state of the projects section. See the dyndns
// counterpart for the reasoning; keys are arrays so a prefix invalidates
// everything below it.
//
// `tree()` is the prefix every list of nodes sits under, because almost every
// write moves a node between those lists: approving a request takes it out of
// "to manage" and into "mine", a new sub-budget changes both the parent's usage
// and the eligible-budget list. Invalidating the prefix is honest about that
// and costs one round trip; enumerating which of the six lists each write
// affects is the kind of bookkeeping that is wrong within a month.
export const projectKeys = {
    tree: () => ['projects', 'tree'],
    mine: () => ['projects', 'tree', 'mine'],
    myBudgets: () => ['projects', 'tree', 'my-budgets'],
    toManage: (scope) => ['projects', 'tree', 'to-manage', scope],
    eligibleForMe: () => ['projects', 'tree', 'eligible-for-me'],
    eligibleForOwner: (tokens) => ['projects', 'tree', 'eligible-for-owner', tokens],
    node: (id) => ['projects', 'tree', 'node', id],
    // Keyed by LIMIT, not by offset: a node's children are one query holding
    // the first N rows, and "show more" raises N. Offset-keyed pages would put
    // one branch in several cache entries that have to be stitched back
    // together in the view — which is how this ended up outside the cache in
    // the first place, and with it the bug that a move left the tree showing
    // two different answers until a reload.
    children: (id, limit) => ['projects', 'tree', 'children', id, limit],
    search: (q, offset) => ['projects', 'tree', 'search', q, offset],
    config: () => ['projects', 'config'],
    rootStatus: () => ['projects', 'root-status'],
    // Deliberately outside tree(): a credential is not a node, and no write in
    // the tree changes the list of tokens.
    apiTokens: () => ['projects', 'api-tokens'],
};
