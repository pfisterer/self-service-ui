import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { Stack, Paper, Text, Anchor, Group, ThemeIcon } from '@mantine/core';
import { KeyRound } from 'lucide-react';
import { TabIntro } from './tab-intro.jsx';

// ----------------------------------------
// Show Keys
// ----------------------------------------
export function ShowKeys({ zone }) {
    const { zone_keys } = zone;

    return (
        <Stack gap="lg">
            <TabIntro title={`TSIG keys for ${zone.zone}`}>
                These are <ExternalLink href="https://en.wikipedia.org/wiki/TSIG">TSIG</ExternalLink> keys
                (Transaction SIGnature). Shared secrets that authenticate changes to this zone. Tools like{' '}
                <code>nsupdate</code>, cert-manager and external-dns use a key to update your records via{' '}
                <ExternalLink href="https://en.wikipedia.org/wiki/Dynamic_DNS">dynamic DNS updates</ExternalLink>{' '}
                (<ExternalLink href="https://datatracker.ietf.org/doc/html/rfc2136">RFC&nbsp;2136</ExternalLink>)
                and zone transfers (AXFR). Anyone holding a key can modify the zone, so <b>keep it secret</b>.
                <br /><br />
                This zone has {zone_keys.length} key{zone_keys.length !== 1 ? 's' : ''}.
            </TabIntro>

            {zone_keys.map((key, index) => (
                <Paper key={key.keyname || index} withBorder radius="md" p="md">
                    <Group gap="xs" mb="sm">
                        <ThemeIcon variant="light" radius="md" color="blue"><KeyRound size="16" /></ThemeIcon>
                        <Text fw={600}>Key #{index + 1}</Text>
                    </Group>
                    <Stack gap="sm">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Zone</Text>
                            <CodeBlock code={zone.zone} language="plaintext" />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Algorithm</Text>
                            <CodeBlock code={key.algorithm} language="plaintext" />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Key name</Text>
                            <CodeBlock code={key.keyname} />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>Secret</Text>
                            <CodeBlock code={key.key} />
                        </div>
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}
