import { Alert, Container, List, Paper, Stack, Text, Title } from '@mantine/core';
import { cloudProjectsEnabled, dnsZonesEnabled } from '/features.js';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { useNodesApi } from '/projects/api-nodes.jsx';
import { projectKeys } from '/projects/query-keys.js';
import { TokenScopePanel } from '/tokens/token-scope-panel.jsx';

// One page for every API token a person holds, rather than one page per API.
//
// The sections of this UI are grouped by domain — "what can I do here" — and a
// token is not a thing you do, it is a credential your account has. But the
// deciding reason is revocation: "which credentials exist in my name?" must
// have exactly one place to look. Split across the sections that issue them, a
// token someone forgot about is a token they cannot find in the one moment it
// matters. The other half of that is the create flow, which shows a secret
// exactly once — worth having once, not twice.
//
// What this page must NOT suggest is one credential. The tokens are not
// interchangeable: different prefixes, different databases, different issuers,
// and the two services do not even agree on which claim identifies their owner.
// Hence a panel per scope, each labelled and prefixed, instead of one merged
// list.
export function ApiTokens() {
    // Both hooks run unconditionally — hooks cannot be called behind a
    // condition, and neither one talks to a server until a query does.
    // useNodesApi returns null where the projects API is not configured.
    const zonesApi = useZonesApi();
    const nodesApi = useNodesApi();

    const scopes = [
        dnsZonesEnabled && zonesApi && {
            id: 'dyndns',
            label: 'DNS Zones',
            prefix: 'dynz_token_',
            description: 'Manages your zones and DNS records — the credential a router or an ACME client uses for dynamic updates.',
            queryKey: dyndnsKeys.tokens(),
            api: {
                list: () => zonesApi.listTokens(),
                create: (opts) => zonesApi.createToken(opts),
                remove: (id) => zonesApi.deleteToken(id),
            },
        },
        cloudProjectsEnabled && nodesApi && {
            id: 'projects',
            label: 'Cloud Projects',
            prefix: 'os_mgt_',
            description: 'Reads and changes your projects, budgets and quota requests from a script or CI job.',
            queryKey: projectKeys.apiTokens(),
            api: {
                list: () => nodesApi.listApiTokens(),
                create: (opts) => nodesApi.createApiToken(opts),
                remove: (id) => nodesApi.deleteApiToken(id),
            },
        },
    ].filter(Boolean);

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Title order={2}>API Tokens</Title>

                <Paper p="md" radius="md" withBorder>
                    <Stack gap="xs">
                        <Text size="sm">
                            An API token authenticates a script, a CI job or a device without a browser
                            login.
                        </Text>
                        <List size="sm" spacing={4}>
                            <List.Item>
                                Each token is bound to one API. A DNS token does not work against Cloud Projects, and the other way round.
                            </List.Item>
                            <List.Item>
                                {/* `inherit`, not size="sm": a nested Text starts at
                                    the default size and would sit larger than the
                                    list around it. Inheriting keeps it matched to
                                    whatever the list is set to. */}
                                Send it as <Text span inherit ff="monospace">Authorization: Bearer &lt;token&gt;</Text>.
                            </List.Item>
                            <List.Item>
                                A read-only token is refused for anything but reads — the right default for a monitoring job or an agent.
                            </List.Item>
                            <List.Item>
                                The token itself is shown once, when it is created, and cannot be recovered afterwards.
                            </List.Item>
                        </List>
                    </Stack>
                </Paper>

                {scopes.length === 0 ? (
                    // Reachable only by typing the URL: the route and the menu
                    // entry are both gated on at least one API being configured.
                    <Alert color="yellow" title="No API available">
                        This deployment has neither the DNS nor the Cloud Projects API configured, so there is nothing to issue a token for.
                    </Alert>
                ) : (
                    scopes.map(scope => <TokenScopePanel key={scope.id} scope={scope} />)
                )}
            </Stack>
        </Container>
    );
}
