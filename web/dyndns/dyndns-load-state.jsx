import { Container, Alert, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

// Only the remote config can still fail to load. The client used to be
// fetched from the API server too and had its own error branch; it is a
// build-time dependency now, so there is nothing left to fail (see d6).
export function DynDnsLoadState({ configLoadError }) {

    // Provide error feedback if module loading failed
    if (configLoadError) {
        return (
            <Container size="md" py="xl">
                <Alert icon={<AlertCircle size="16" />} title="❌ Dynamic DNS Setup Failed" color="red">
                    <Stack gap="sm">
                        {configLoadError && (
                            <div>
                                <Text fw={600} size="sm">Config Loading Error:</Text>
                                <Text size="sm">{configLoadError?.message}</Text>
                                {configLoadError?.details && <Text size="xs" c="dimmed">{configLoadError?.details}</Text>}
                            </div>
                        )}
                    </Stack>
                </Alert>
            </Container>
        );
    }

    return null;
}