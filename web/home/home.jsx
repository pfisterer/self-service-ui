import { Link } from 'wouter';
import { Container, Stack, Group, Title, Text, Paper, Button, ThemeIcon, SimpleGrid, List, Alert } from '@mantine/core';
import { Globe, ListPlus, ShieldCheck, ArrowRight, ServerCog, FolderKanban } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { cloudProjectsEnabled, dnsZonesEnabled } from '/features.js';

// First-run friendly landing page: explain what this portal is for and give a
// short, scannable path through it. Most users arrive here on their first login
// and don't yet know what to do.
//
// The path follows what a student actually does: request a project to run
// something in, give it hostnames, then secure those hostnames with TLS. The
// budget/delegation side of Cloud Projects is deliberately absent — it concerns
// the handful of people who hand out resources, not the people arriving here.

// Which sections exist comes from /features.js — the same statement the header
// and the router read. This file used to re-derive the projects flag from
// window.appconfig itself, which was a third copy of one fact.
//
// It matters here beyond the wording: a button pointing at a section whose route
// is not registered lands on the 404 page.

// The steps take the caller's `t`: the texts are translated, so a step cannot
// be a module-level constant any more — it is built when the page renders, in
// the language it renders in.
const projectStep = (t) => ({
    icon: FolderKanban,
    color: 'blue',
    title: t('home.steps.project.title'),
    points: [
        t('home.steps.project.own'),
        t('home.steps.project.instant'),
        t('home.steps.project.together'),
    ],
});

const zoneStep = (t) => ({
    icon: Globe,
    color: 'teal',
    title: t('home.steps.zone.title'),
    points: [
        t('home.steps.zone.activate'),
        t('home.steps.zone.hostnames'),
        t('home.steps.zone.point'),
    ],
});

const tlsStep = (t) => ({
    icon: ShieldCheck,
    color: 'indigo',
    title: t('home.steps.tls.title'),
    points: [
        t('home.steps.tls.issue'),
        t('home.steps.tls.manifests'),
        t('home.steps.tls.acme'),
    ],
});

// Without Cloud Projects the portal starts at the zone, so the DNS steps are
// spelled out separately instead of being condensed into one.
const dnsOnlySteps = (t) => [
    {
        ...zoneStep(t),
        title: t('home.steps.zoneOnly.title'),
        points: [
            t('home.steps.zone.activate'),
            t('home.steps.zone.hostnames'),
            t('home.steps.zoneOnly.basis'),
        ],
    },
    {
        icon: ListPlus,
        color: 'teal',
        title: t('home.steps.records.title'),
        points: [
            t('home.steps.records.point'),
            t('home.steps.records.tsig'),
            t('home.steps.records.automate'),
        ],
    },
    tlsStep(t),
];

export function Home() {
    const { t } = useTranslation();
    const acmeServer = window.appconfig?.acmeServer || 'https://certificates.dhbw.cloud';
    const acmeHost = acmeServer.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const withProjects = cloudProjectsEnabled;
    const withDns = dnsZonesEnabled;

    // Every step below the first one is about zones and certificates, so a
    // deployment without the DNS API keeps only the project step rather than
    // walking someone through a section that is not there.
    const steps = withDns
        ? (withProjects ? [projectStep(t), zoneStep(t), tlsStep(t)] : dnsOnlySteps(t))
        : [projectStep(t)];

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                {/* Hero */}
                <Paper p="xl" shadow="sm" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={1}>{t('home.hero.title')}</Title>
                        <Text size="lg" c="dimmed">
                            <Trans i18nKey={introKey(withProjects, withDns)}
                                components={{ 1: <b />, 2: <b />, 3: <b /> }} />
                        </Text>
                        <Group mt="sm">
                            {/* Same target as the header's Cloud Projects link: /projects
                                redirects to My Projects, where "New project" lives. */}
                            {withProjects && (
                                <Button component={Link} to="/projects" size="md" rightSection={<ArrowRight size="18" />}>
                                    {t('home.hero.requestProject')}
                                </Button>
                            )}
                            {withDns && (
                                <Button component={Link} to="/dyndns/zones" size="md"
                                    variant={withProjects ? 'light' : 'filled'}
                                    rightSection={withProjects ? null : <ArrowRight size="18" />}>
                                    {t('home.hero.manageZones')}
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Paper>

                {/* Get started */}
                <div>
                    <Title order={3} mb="md">{t('home.steps.heading')}</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                        {steps.map(({ icon: Icon, color, title, points }) => (
                            <Paper key={title} p="lg" shadow="xs" radius="md" withBorder>
                                <Stack gap="sm">
                                    <ThemeIcon size={44} radius="md" variant="light" color={color}>
                                        <Icon size="24" />
                                    </ThemeIcon>
                                    <Text fw={600}>{title}</Text>
                                    <List size="sm" spacing={6} c="dimmed">
                                        {points.map(p => <List.Item key={p}>{p}</List.Item>)}
                                    </List>
                                </Stack>
                            </Paper>
                        ))}
                    </SimpleGrid>
                </div>

                {/* DHBW ACME callout — about the zones this portal hands out, so
                    it goes with them. */}
                {withDns && (
                <Alert icon={<ServerCog size="20" />} color="blue" variant="light" radius="md"
                    title={t('home.acme.title')}>
                    <Text size="sm">
                        <Trans i18nKey="home.acme.body" values={{ host: acmeHost }}
                            components={{ 1: <b />, 2: <b />, 3: <b />, 4: <b />, 5: <b /> }} />
                    </Text>
                </Alert>
                )}
            </Stack>
        </Container>
    );
}

// Which of the three opening sentences this deployment gets. One key per case,
// because the sentences differ in more than a clause — a German reader would
// not recognise them as one sentence with parts switched off.
function introKey(withProjects, withDns) {
    if (withProjects && withDns) return 'home.hero.introBoth';
    return withProjects ? 'home.hero.introProjects' : 'home.hero.introDns';
}
