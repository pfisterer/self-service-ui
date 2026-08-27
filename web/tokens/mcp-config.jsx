import { Alert, Anchor, Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core';

// What an MCP client needs to reach one of these APIs on a person's behalf: an
// address and a credential. The credential is the token on this page; the
// address is deployment configuration the browser cannot work out for itself
// (see the *McpUrl exports in features.js). So this is the one place both are
// known at the same time.
//
// Written against the scope rather than against one API: both backends speak
// MCP, and everything that differs between them — the address, the server name,
// what the assistant would be working on — is already a field on the scope.

// PLACEHOLDER is what stands in for the secret where we no longer have it. It is
// deliberately obvious rather than a plausible-looking fake, so a config pasted
// without editing fails at the first request instead of at some later, stranger
// point.
const PLACEHOLDER = '<your-token>';

// mcpConfigJson builds one named server entry: the name, `type`, the URL, and
// the Authorization header sent with each request.
//
// Deliberately the ENTRY and not a whole config file. Anyone pasting this
// already has an mcpServers object with other servers in it, and a snippet that
// brings its own wrapper has to be taken apart before it can be used — while
// pasting it whole produces a second mcpServers key, which is invalid JSON and
// silently costs the servers that were there. The entry drops straight in.
//
// The consequence, stated because it is a real one: what this returns is a
// fragment, not a standalone JSON document. It does not parse on its own, so
// anything that reads it back has to supply the braces.
//
// `type` is the field that was missing until 2026-08-26, and the reason this had
// to be tested with a real client rather than a protocol library: Claude Code
// reads ~/.claude.json and drops an entry without it SILENTLY — no error, no
// warning, the server never appears in /mcp and none of its tools exist. The
// endpoint answered every curl, so nothing about the failure pointed here.
// Clients that do not need the field ignore it.
export function mcpConfigJson(scope, token) {
    const name = scope.mcpServerName || scope.id;
    const entry = {
        type: 'http',
        url: scope.mcpUrl,
        headers: { Authorization: `Bearer ${token || PLACEHOLDER}` },
    };

    return `${JSON.stringify(name)}: ${JSON.stringify(entry, null, 2)}`;
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
                    , so an assistant can read and change your {scope.mcpSubject || 'resources'} for you. It
                    acts as you and can do nothing you could not do yourself — a read-only token gives it a
                    read-only assistant.
                </Text>
                <McpConfigBlock scope={scope} />
                <Text size="xs" c="dimmed">
                    Goes inside the <Code>mcpServers</Code> object of your client's config, next to the
                    servers you already have. Replace <Code>{PLACEHOLDER}</Code> with a token from the table
                    above — a token is shown in full only once, when it is created, and the entry offered
                    there already has it filled in.
                </Text>
            </Stack>
        </Alert>
    );
}
