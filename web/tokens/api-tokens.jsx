import { Route, Switch, Redirect } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Container, Stack, Text, Title } from '@mantine/core';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { useNodesApi } from '/projects/api-nodes.jsx';
import { projectKeys } from '/projects/query-keys.js';
import { TOKEN_SCOPES } from '/tokens/scopes.js';
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
// One scope per tab, each with its own prefix, keeps that visible — the scopes
// were stacked on one page first, which read like one list in two boxes.
export function ApiTokens() {
    const { t } = useTranslation();
    // Both hooks run unconditionally — hooks cannot be called behind a
    // condition, and neither one talks to a server until a query does.
    // useNodesApi returns null where the projects API is not configured.
    const zonesApi = useZonesApi();
    const nodesApi = useNodesApi();

    // The API adapter per scope id. Kept next to the hooks rather than in
    // scopes.js, which nav.jsx imports and which therefore has to stay free of
    // anything that touches an SDK.
    const adapters = {
        dns: zonesApi && {
            queryKey: dyndnsKeys.tokens(),
            api: {
                list: () => zonesApi.listTokens(),
                create: (opts) => zonesApi.createToken(opts),
                remove: (id) => zonesApi.deleteToken(id),
            },
        },
        projects: nodesApi && {
            queryKey: projectKeys.apiTokens(),
            api: {
                list: () => nodesApi.listApiTokens(),
                create: (opts) => nodesApi.createApiToken(opts),
                remove: (id) => nodesApi.deleteApiToken(id),
            },
        },
    };

    const scopes = TOKEN_SCOPES.filter(s => adapters[s.id]);

    return (
        <Container size="lg" py="xl">
            <Stack gap="md">
                <Title order={2}>{t('tokens.page.title')}</Title>

                <Text size="sm" c="dimmed">
                    {/* The header is a code sample, so it stays out of the
                        translations and is passed in as a value. */}
                    <Trans i18nKey="tokens.page.intro"
                        values={{ header: 'Authorization: Bearer <token>' }}
                        components={{ 1: <Text span inherit ff="monospace" /> }} />
                </Text>

                {scopes.length === 0 ? (
                    // Reachable only by typing the URL: the route and the menu
                    // entry are both gated on at least one API being configured.
                    <Alert color="yellow" title={t('tokens.page.noApiTitle')}>
                        {t('tokens.page.noApiMessage')}
                    </Alert>
                ) : (
                    <Switch>
                        {scopes.map(scope => (
                            <Route key={scope.id} path={`/${scope.id}`}>
                                <TokenScopePanel scope={{ ...scope, ...adapters[scope.id] }} />
                            </Route>
                        ))}
                        {/* Bare /tokens lands on the first scope, so the tab bar
                            always has one tab marked as the current one. */}
                        <Route>
                            <Redirect to={`/${scopes[0].id}`} replace />
                        </Route>
                    </Switch>
                )}
            </Stack>
        </Container>
    );
}
