import { html } from 'htm/preact';
import { Container, Alert, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-preact';

export function DynDnsLoadState({ clientLoadError, configLoadError }) {

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

    return null;
}