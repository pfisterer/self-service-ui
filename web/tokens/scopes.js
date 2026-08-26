import { cloudProjectsEnabled, cloudProjectsMcpUrl, dnsZonesEnabled, dnsZonesMcpUrl } from '/features.js';

// The token scopes, in one place because two callers need the same list: the
// header renders them as the second-level tabs, the page as its routes. Kept
// apart if they disagreed, a tab would lead to a page that is not there.
//
// `id` is also the path segment, so /tokens/dns and /tokens/projects follow
// from this list rather than being spelled out again.
//
// Pure data on purpose: nav.jsx imports it, and nav.jsx is in the main bundle.
// The API adapters live in the page, where the hooks are.
//
// `mcpUrl` is empty where this deployment has not been given an address for that
// API's MCP endpoint, and the panel then renders nothing about MCP — so a scope
// whose backend is too old to speak it simply stays silent rather than handing
// out an address that answers 404. `mcpSubject` is what an assistant would be
// working on, and exists because that sentence has to name it.
export const TOKEN_SCOPES = [
    dnsZonesEnabled && {
        id: 'dns',
        label: 'DNS Zones',
        prefix: 'dynz_token_',
        description: 'Manages your zones and DNS records — what a router or an ACME client uses for dynamic updates.',
        mcpUrl: dnsZonesMcpUrl,
        mcpServerName: 'dhbw-cloud-dns',
        mcpSubject: 'zones and DNS records',
    },
    cloudProjectsEnabled && {
        id: 'projects',
        label: 'Cloud Projects',
        prefix: 'os_mgt_',
        description: 'Reads and changes your projects, budgets and quota requests from a script or a CI job.',
        mcpUrl: cloudProjectsMcpUrl,
        mcpServerName: 'dhbw-cloud-projects',
        mcpSubject: 'projects, budgets and quota requests',
    },
].filter(Boolean);

export const tokenScopePath = (scope) => `/tokens/${scope.id}`;
