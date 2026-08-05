import { Box, Text, Anchor, Group } from '@mantine/core';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useCloudConfig } from '/providers/cloud-config.jsx';

// Every component this portal is made of links to its own repository, so the
// separate "Source Code" link is gone: it only ever pointed at the UI, which is
// one of three.
const UI_REPO = 'https://github.com/pfisterer/self-service-ui';
const DYNDNS_REPO = 'https://github.com/pfisterer/dynamic-zones';
const CLOUD_REPO = 'https://github.com/pfisterer/openstack-management-api';

export function Footer({ title, version }) {
    // Both versions are reused from the config providers (each loads its API's
    // /config.json once) — the footer does not fetch anything itself.
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { config: cloudConfig } = useCloudConfig();

    // One line, one format for every component: "<name> (<version>)", the name
    // linking to its repository. An API that is not configured (Cloud API on
    // prod) reports no version and is left out entirely.
    const components = [
        { label: title, version, repo: UI_REPO },
        dynDnsConfig?.version && { label: 'Dynamic Zones API', version: dynDnsConfig.version, repo: DYNDNS_REPO },
        cloudConfig?.version && { label: 'Cloud API', version: cloudConfig.version, repo: CLOUD_REPO },
    ].filter(Boolean);

    return (
        // Left-aligned like the header and the page content: the portal has one
        // vertical edge, from the logo down to the last line on the page.
        <Box component="div" py="xs" px="md">
            <Box>
                {/* This UI and the APIs it talks to, on one line */}
                <Text size="sm" c="dimmed" mb="xs">
                    {components.map(({ label, version: v, repo }, i) => (
                        <span key={repo}>
                            {i > 0 && ' · '}
                            <Anchor href={repo} size="sm" target="_blank" rel="noreferrer">{label}</Anchor>
                            {' '}({v})
                        </span>
                    ))}
                </Text>

                <Group gap="xs">
                    <Anchor href="https://dennis-pfisterer.de" size="sm" target="_blank">
                        © Dennis Pfisterer, DHBW
                    </Anchor>
                </Group>
            </Box>
        </Box>
    );
}
