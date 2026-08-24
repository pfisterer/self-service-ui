import { Link } from 'wouter';
import { Container, Stack, Group, Title, Text, Paper, Button, ThemeIcon, SimpleGrid, List, Alert } from '@mantine/core';
import { Globe, ListPlus, ShieldCheck, ArrowRight, ServerCog, FolderKanban } from 'lucide-react';
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

const PROJECT_STEP = {
    icon: FolderKanban,
    color: 'blue',
    title: '1 · Request a project',
    points: [
        'A project is your own space in the DHBW cloud, with the CPU, RAM and storage you ask for',
        'Small requests are often approved instantly',
        'Add fellow students to it so you can work on it together',
    ],
};

const ZONE_STEP = {
    icon: Globe,
    color: 'teal',
    title: '2 · Give it a DNS name',
    points: [
        'Activate your personal zone in Zone Management',
        'You get your own hostnames, e.g. myapp.you.users.dhbw.cloud',
        'Point them at your machines (A / AAAA / CNAME); each zone has a TSIG key for ddclient, nsupdate or external-dns',
    ],
};

const TLS_STEP = {
    icon: ShieldCheck,
    color: 'indigo',
    title: '3 · Get TLS certificates',
    points: [
        'Issue certificates with cert-manager once the hostname resolves',
        'Ready-to-copy manifests in the "TLS Certificates" tab',
        'Uses the DHBW ACME server (see below)',
    ],
};

// Without Cloud Projects the portal starts at the zone, so the DNS steps are
// spelled out separately instead of being condensed into one.
const DNS_ONLY_STEPS = [
    { ...ZONE_STEP, title: '1 · Activate a zone', points: ZONE_STEP.points.slice(0, 2).concat('This is the basis for records and certificates') },
    {
        icon: ListPlus,
        color: 'teal',
        title: '2 · Add DNS records',
        points: [
            'Point a hostname at your service (A / AAAA / CNAME)',
            'Each zone comes with its own TSIG key',
            'Automate updates with ddclient, nsupdate, or external-dns',
        ],
    },
    TLS_STEP,
];

export function Home() {
    const acmeServer = window.appconfig?.acmeServer || 'https://certificates.dhbw.cloud';
    const acmeHost = acmeServer.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const withProjects = cloudProjectsEnabled;
    const withDns = dnsZonesEnabled;

    // Every step below the first one is about zones and certificates, so a
    // deployment without the DNS API keeps only the project step rather than
    // walking someone through a section that is not there.
    const steps = withDns
        ? (withProjects ? [PROJECT_STEP, ZONE_STEP, TLS_STEP] : DNS_ONLY_STEPS)
        : [PROJECT_STEP];

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                {/* Hero */}
                <Paper p="xl" shadow="sm" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={1}>Welcome to dhbwCloud Self-Service</Title>
                        <Text size="lg" c="dimmed">
                            {withProjects && withDns ? (
                                <>
                                    This portal is where you request <b>your own cloud project</b> — your space in
                                    the DHBW cloud with the resources you need — and where you give the services
                                    you run there <b>their own hostnames</b> and <b>TLS certificates</b>.
                                </>
                            ) : withProjects ? (
                                <>
                                    This portal is where you request <b>your own cloud project</b> — your space in
                                    the DHBW cloud with the CPU, RAM and storage you need.
                                </>
                            ) : (
                                <>
                                    This portal is where you manage <b>your own DNS zones</b>. A zone gives you
                                    your own <b>hostnames</b> — the basis for reaching your services by name and for
                                    issuing <b>TLS certificates</b> for them.
                                </>
                            )}
                        </Text>
                        <Group mt="sm">
                            {/* Same target as the header's Cloud Projects link: /projects
                                redirects to My Projects, where "Request project" lives. */}
                            {withProjects && (
                                <Button component={Link} to="/projects" size="md" rightSection={<ArrowRight size="18" />}>
                                    Request a project
                                </Button>
                            )}
                            {withDns && (
                                <Button component={Link} to="/dyndns/zones" size="md"
                                    variant={withProjects ? 'light' : 'filled'}
                                    rightSection={withProjects ? null : <ArrowRight size="18" />}>
                                    Manage DNS zones
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Paper>

                {/* Get started */}
                <div>
                    <Title order={3} mb="md">Get started in three steps</Title>
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
                    title="TLS certificates: use the DHBW ACME server">
                    <Text size="sm">
                        For the zones you create here you <b>must</b> obtain TLS certificates from DHBW's own ACME
                        certificate authority at <b>{acmeHost}</b>. These zones are set up to authorize only the DHBW
                        CA (via CAA records), so public CAs such as <b>Let's Encrypt can not be used</b> for these hostnames.
                        The DHBW server is free, has no public rate limits, and also issues certificates for services
                        that are only reachable from <b>inside the DHBW network / VPN</b>. Each zone's
                        {' '}<b>TLS Certificates</b> tab generates cert-manager manifests pre-filled for exactly this server.
                    </Text>
                </Alert>
                )}
            </Stack>
        </Container>
    );
}
