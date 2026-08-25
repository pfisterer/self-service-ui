import { Alert, Anchor, Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';

// What an MCP client needs to reach one of these APIs on a person's behalf: an
// address and a credential. The credential is the token on this page; the
// address is deployment configuration the browser cannot work out for itself
// (see cloudProjectsMcpUrl in features.js). So this is the one place both are
// known at the same time.

// PLACEHOLDER is what stands in for the secret where we no longer have it. It is
// deliberately obvious rather than a plausible-looking fake, so a config pasted
// without editing fails at the first request instead of at some later, stranger
// point.
const PLACEHOLDER = '<your-token>';

// mcpConfigJson builds the snippet a client is configured with. The shape is the
// remote-server form every current client accepts: a name, a URL, and the
// Authorization header sent with each request.
export function mcpConfigJson(scope, token) {
    return JSON.stringify({
        mcpServers: {
            [scope.mcpServerName || scope.id]: {
                url: scope.mcpUrl,
                headers: { Authorization: `Bearer ${token || PLACEHOLDER}` },
            },
        },
    }, null, 2);
}

// McpConfigBlock shows the snippet with a copy button.
//
// A block of text to copy, and deliberately not a one-click install link. VS
// Code and Cursor can add a server from a URL, but the configuration travels
// inside that URL — which would put a credential that can create and delete
// projects into browser history, clipboard managers and any proxy log on the
// way. The inconvenience is the point.
export function McpConfigBlock({ scope, token = '' }) {
    if (!scope?.mcpUrl) return null;
    const json = mcpConfigJson(scope, token);

    return (
        <Stack gap="xs">
            <Group gap="xs" align="center" wrap="wrap">
                <Text size="xs" c="dimmed">Endpoint</Text>
                <Code>{scope.mcpUrl}</Code>
                <CopyButton value={json}>
                    {({ copied, copy }) => (
                        <Button size="xs" variant="light" onClick={copy}>
                            {copied ? 'Copied' : 'Copy MCP config'}
                        </Button>
                    )}
                </CopyButton>
            </Group>
            <Code block style={{ fontSize: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {json}
            </Code>
        </Stack>
    );
}

// McpSection is the standing explanation on the panel, where the token is not
// available and the snippet carries a placeholder.
export function McpSection({ scope }) {
    if (!scope?.mcpUrl) return null;

    return (
        <Alert variant="light" title="Use with an AI assistant (MCP)" p="xs">
            <Stack gap="xs">
                <Text size="xs">
                    This API speaks the{' '}
                    <Anchor href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" inherit>
                        Model Context Protocol
                    </Anchor>
                    , so an assistant can read and change your projects for you. It acts as you and can do
                    nothing you could not do yourself — a read-only token gives it a read-only assistant.
                </Text>
                <McpConfigBlock scope={scope} />
                <Text size="xs" c="dimmed">
                    Replace <Code>{PLACEHOLDER}</Code> with a token from the table above. A token is shown in
                    full only once, when it is created — the config offered there already has it filled in.
                </Text>
            </Stack>
        </Alert>
    );
}
