import { Box, Text, Anchor, Group } from '@mantine/core';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useCloudConfig } from '/providers/cloud-config.jsx';

export function Footer({ title, version }) {
    // Both versions are reused from the config providers (each loads its API's
    // /config.json once) — the footer does not fetch anything itself.
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { config: cloudConfig } = useCloudConfig();

    const apiVersions = [
        dynDnsConfig?.version && { name: 'Dynamic Zones API', ver: dynDnsConfig.version },
        cloudConfig?.version && { name: 'Cloud API', ver: cloudConfig.version },
    ].filter(Boolean);

    return (
        <Box component="div" py="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box ta="center">
                {/* App name + version */}
                <Text size="sm" c="dimmed" mb={apiVersions.length ? 2 : 'xs'}>
                    {title} — Version {version}
                </Text>

                {/* Versions of the APIs this UI talks to */}
                {apiVersions.length > 0 && (
                    <Text size="xs" c="dimmed" mb="xs">
                        {apiVersions.map(a => `${a.name} ${a.ver}`).join(' · ')}
                    </Text>
                )}

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
