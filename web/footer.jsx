import { Box, Text, Anchor, Group } from '@mantine/core';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useCloudConfig } from '/providers/cloud-config.jsx';

export function Footer({ title, version }) {
    // Both versions are reused from the config providers (each loads its API's
    // /config.json once) — the footer does not fetch anything itself.
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { config: cloudConfig } = useCloudConfig();

    // One line, one format for every component: "<name> — Version <x>".
    const versions = [
        <>{title} — Version {version}</>,
        dynDnsConfig?.version && <>Dynamic Zones API — Version {dynDnsConfig.version}</>,
        cloudConfig?.version && <>Cloud API — Version {cloudConfig.version}</>,
    ].filter(Boolean);

    return (
        <Box component="div" py="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box ta="center">
                {/* This UI and the APIs it talks to, on one line */}
                <Text size="sm" c="dimmed" mb="xs">
                    {versions.map((v, i) => <span key={i}>{i > 0 && ' · '}{v}</span>)}
                </Text>

                <Group justify="center" gap="xs">
                    <Anchor href="https://github.com/pfisterer/self-service-ui" size="sm" target="_blank">
                        Source Code
                    </Anchor>
                    <Text size="sm" c="dimmed">|</Text>
                    <Anchor href="https://dennis-pfisterer.de" size="sm" target="_blank">
                        © Dennis Pfisterer, DHBW
                    </Anchor>
                </Group>
            </Box>
        </Box>
    );
}
