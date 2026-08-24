import { cloudProjectsEnabled, dnsZonesEnabled } from '/features.js';

// The token scopes, in one place because two callers need the same list: the
// header renders them as the second-level tabs, the page as its routes. Kept
// apart if they disagreed, a tab would lead to a page that is not there.
//
// `id` is also the path segment, so /tokens/dns and /tokens/projects follow
// from this list rather than being spelled out again.
//
// Pure data on purpose: nav.jsx imports it, and nav.jsx is in the main bundle.
// The API adapters live in the page, where the hooks are.
export const TOKEN_SCOPES = [
    dnsZonesEnabled && {
        id: 'dns',
        label: 'DNS Zones',
        prefix: 'dynz_token_',
        description: 'Manages your zones and DNS records — what a router or an ACME client uses for dynamic updates.',
    },
    cloudProjectsEnabled && {
        id: 'projects',
        label: 'Cloud Projects',
        prefix: 'os_mgt_',
        description: 'Reads and changes your projects, budgets and quota requests from a script or a CI job.',
    },
].filter(Boolean);

export const tokenScopePath = (scope) => `/tokens/${scope.id}`;
