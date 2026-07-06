import { Container, Alert, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

export function DynDnsLoadState({ clientLoadError, configLoadError }) {

    // Provide error feedback if module loading failed
    if (clientLoadError || configLoadError) {
        return (
            <Container size="md" py="xl">
                <Alert icon={<AlertCircle size="16" />} title="❌ Dynamic DNS Client Setup Failed" color="red">
                    <Stack gap="sm">
                        {configLoadError && (
                            <div>
                                <Text fw={600} size="sm">Config Loading Error:</Text>
                                <Text size="sm">{configLoadError?.message}</Text>
                                {configLoadError?.details && <Text size="xs" c="dimmed">{configLoadError?.details}</Text>}
                            </div>
                        )}
                        {clientLoadError && (
                            <div>
                                <Text fw={600} size="sm">Client Load Error:</Text>
                                <Text size="sm">{clientLoadError?.message}</Text>
                                {clientLoadError?.details && <Text size="xs" c="dimmed">{clientLoadError?.details}</Text>}
                            </div>
                        )}
                    </Stack>
                </Alert>
            </Container>
        );
    }

    return null;
}