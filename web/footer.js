import { html } from 'htm/preact';
import { Box, Text, Anchor, Group } from '@mantine/core';

export function Footer({ title, version }) {
    return html`
        <${Box} component="div" py="xs" style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <${Box} ta="center">
                <!-- Top Line: Project Name and Version -->
                <${Text} size="sm" c="dimmed" mb="xs">
                    ${title} — Version ${version}
                <//>
                
                <${Group} justify="center" gap="xs">
                    <${Anchor} href="https://github.com/pfisterer/self-service-ui" size="sm" target="_blank">
                        Source Code
                    <//>
                    <${Text} size="sm" c="dimmed">|<//>
                    <${Anchor} href="https://dennis-pfisterer.de" size="sm" target="_blank">
                        © Dennis Pfisterer, DHBW
                    <//>
                <//>
            <//>
        <//>
    `;
}
