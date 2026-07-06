import { Component } from 'react';
import { Alert, Button, Container, Group, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

// React error boundaries must be class components (no hook equivalent). Catches
// render-time errors in the child tree and shows a fallback instead of letting
// the error unmount the whole app (white screen). Does NOT catch errors in event
// handlers or async code — use try/catch / showError for those.
export class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught:', error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        return (
            <Container size="md" py="xl">
                <Alert icon={<AlertCircle size="16" />} title={this.props.title || 'Something went wrong'} color="red">
                    <Stack gap="sm" align="flex-start">
                        <Text size="sm">
                            {this.props.message || 'This part of the app failed to render. You can try again or reload the page.'}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                            {String(this.state.error?.message || this.state.error)}
                        </Text>
                        <Group gap="xs">
                            <Button size="xs" variant="light" onClick={() => this.setState({ error: null })}>Try again</Button>
                            <Button size="xs" variant="default" onClick={() => window.location.reload()}>Reload page</Button>
                        </Group>
                    </Stack>
                </Alert>
            </Container>
        );
    }
}
