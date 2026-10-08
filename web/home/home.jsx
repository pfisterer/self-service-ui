import { Link } from 'wouter';
import { Container, Stack, Title, Text, Paper, Button, ThemeIcon, SimpleGrid, List, Group } from '@mantine/core';
import { Globe, ShieldCheck, ArrowRight, FolderKanban, Sparkles } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { cloudProjectsEnabled, dnsZonesEnabled } from '/features.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';

// First-run friendly landing page: what this portal offers, one card per
// service, each with the one button that gets someone started there. Most
// users arrive here on their first login and do not yet know what to do.
//
// The budget/delegation side of Cloud Projects is deliberately absent — it
// concerns the handful of people who hand out resources, not the people
// arriving here.
//
// Which sections exist comes from /features.js — the same statement the header
// and the router read — and, for the language models, from whether the LLM
// service lets this person in (use-llm-me.jsx). A card for a section that is not
// there would send its button to the 404 page.

export function Home() {
    const { t } = useTranslation();
    const acmeServer = window.appconfig?.acmeServer || 'https://certificates.dhbw.cloud';
    const acmeHost = acmeServer.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const { hasAccess: withLlm } = useLlmMe();

    const services = [
        cloudProjectsEnabled && {
            key: 'projects',
            icon: FolderKanban,
            color: 'blue',
            to: '/projects',
        },
        dnsZonesEnabled && {
            key: 'dns',
            icon: Globe,
            color: 'teal',
            to: '/dyndns/zones',
        },
        withLlm && {
            key: 'llm',
            icon: Sparkles,
            color: 'grape',
            to: '/llm/overview',
        },
    ].filter(Boolean);

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                <Stack gap="xs">
                    <Title order={1}>{t('home.hero.title')}</Title>
                    <Text size="lg" c="dimmed" maw={760}>{t('home.hero.intro')}</Text>
                </Stack>

                <SimpleGrid cols={{ base: 1, md: services.length > 2 ? 3 : services.length }} spacing="md">
                    {services.map(({ key, icon: Icon, color, to }) => (
                        <Paper key={key} p="lg" shadow="xs" radius="md" withBorder
                            style={{ display: 'flex', flexDirection: 'column' }}>
                            <Stack gap="sm" style={{ flex: 1 }}>
                                <Group gap="sm" wrap="nowrap">
                                    <ThemeIcon size={40} radius="md" variant="light" color={color}>
                                        <Icon size="22" />
                                    </ThemeIcon>
                                    <Text fw={600} size="lg">{t(`home.services.${key}.title`)}</Text>
                                </Group>
                                <Text size="sm">{t(`home.services.${key}.lead`)}</Text>
                                <List size="sm" spacing={6} c="dimmed">
                                    {['a', 'b', 'c'].map(p => (
                                        <List.Item key={p}>{t(`home.services.${key}.${p}`)}</List.Item>
                                    ))}
                                </List>
                            </Stack>
                            <Button component={Link} to={to} variant="light" mt="md" fullWidth
                                rightSection={<ArrowRight size="16" />}>
                                {t(`home.services.${key}.open`)}
                            </Button>
                        </Paper>
                    ))}
                </SimpleGrid>

                {/* The one rule that surprises people: the names handed out here
                    take certificates only from the DHBW's own CA. */}
                {dnsZonesEnabled && (
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <ThemeIcon size={28} radius="md" variant="light" color="blue">
                            <ShieldCheck size="16" />
                        </ThemeIcon>
                        <Text size="sm" c="dimmed">
                            <Trans i18nKey="home.acme" values={{ host: acmeHost }}
                                components={{ 1: <b />, 2: <b /> }} />
                        </Text>
                    </Group>
                )}
            </Stack>
        </Container>
    );
}
