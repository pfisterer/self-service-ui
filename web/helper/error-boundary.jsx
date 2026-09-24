import { Component } from 'react';
import { Alert, Button, Container, Group, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { withTranslation } from 'react-i18next';

// React error boundaries must be class components (no hook equivalent). Catches
// render-time errors in the child tree and shows a fallback instead of letting
// the error unmount the whole app (white screen). Does NOT catch errors in event
// handlers or async code — use try/catch / showError for those.
//
// A class cannot call useTranslation, so `t` arrives as a prop through
// withTranslation below. Callers still pass their own `title` and `message`
// where they have something more specific to say.
class ErrorBoundaryView extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught:', error, info);
    }

    render() {
        const { t } = this.props;
        if (!this.state.error) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        return (
            <Container size="md" py="xl">
                <Alert icon={<AlertCircle size="16" />} color="red"
                    title={this.props.title || t('helper.errorBoundary.title')}>
                    <Stack gap="sm" align="flex-start">
                        <Text size="sm">
                            {this.props.message || t('helper.errorBoundary.message')}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                            {String(this.state.error?.message || this.state.error)}
                        </Text>
                        <Group gap="xs">
                            <Button size="xs" variant="light" onClick={() => this.setState({ error: null })}>
                                {t('helper.errorBoundary.tryAgain')}
                            </Button>
                            <Button size="xs" variant="default" onClick={() => window.location.reload()}>
                                {t('helper.errorBoundary.reload')}
                            </Button>
                        </Group>
                    </Stack>
                </Alert>
            </Container>
        );
    }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryView);
