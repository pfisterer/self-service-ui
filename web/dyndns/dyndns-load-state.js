import { html } from 'htm/preact';
import { Delayed } from '/helper/delayed.js';
import { Container, Alert, Stack, Text, Progress, Paper } from '@mantine/core';
import { AlertCircle } from 'lucide-preact';

export function DynDnsLoadState({ clientLoadError, configLoadError, client, sdk }) {

    // Provide error feedback if module loading failed
    if (clientLoadError || configLoadError) {
        return html`
            <${Container} size="md" py="xl">
                <${Alert} icon=${html`<${AlertCircle} size="16" />`} title="❌ Dynamic DNS Client Setup Failed" color="red">
                    <${Stack} gap="sm">
                        ${configLoadError && html`
                            <div>
                                <${Text} fw=${600} size="sm">Config Loading Error:<//>
                                <${Text} size="sm">${configLoadError?.message}<//>
                                ${configLoadError?.details && html`<${Text} size="xs" c="dimmed">${configLoadError?.details}</>`}
                            </div>
                        `}
                        ${clientLoadError && html`
                            <div>
                                <${Text} fw=${600} size="sm">Client Load Error:<//>
                                <${Text} size="sm">${clientLoadError?.message}<//>
                                ${clientLoadError?.details && html`<${Text} size="xs" c="dimmed">${clientLoadError?.details}</>`}
                            </div>
                        `}
                    <//>
                <//>
            <//>
        `;
    }

    if (!client || !sdk) {
        return html`
            <${Delayed}>
                <${Container} size="md" py="xl">
                    <${Paper} p="xl" withBorder>
                        <${Stack} gap="md" align="center">
                            <${Text} size="lg" fw=${500} ta="center">
                                ⚙️ Initializing API Client...
                            <//>
                            <${Progress} value=${100} animate />
                            <${Text} size="sm" c="dimmed" ta="center">
                                Loading SDK modules from remote service
                            <//>
                        <//>
                    <//>
                <//>
            <//>
        `;
    }
}