import { Box, Text, Anchor, Group } from '@mantine/core';

export function Footer({ title, version }) {
    return (
        <Box component="div" py="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box ta="center">
                {/* Top Line: Project Name and Version */}
                <Text size="sm" c="dimmed" mb="xs">
                    {title} — Version {version}
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
