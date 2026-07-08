import { Link } from 'wouter';
import { Container, Stack, Group, Title, Text, Paper, Button, ThemeIcon, SimpleGrid, List, Alert } from '@mantine/core';
import { Globe, ListPlus, ShieldCheck, ArrowRight, ServerCog } from 'lucide-react';

// First-run friendly landing page: explain what this portal is for (DNS zones
// as the basis for hostnames and therefore TLS certificates) and give a short,
// scannable "get started" path. Most users arrive here on their first login and
// don't yet know what to do.

const STEPS = [
    {
        icon: Globe,
        color: 'blue',
        title: '1 · Activate a zone',
        points: [
            'Activate your personal zone in Zone Management',
            'You get your own hostnames, e.g. myapp.you.users.dhbw.cloud',
            'This is the basis for records and certificates',
        ],
    },
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
    {
        icon: ShieldCheck,
        color: 'indigo',
        title: '3 · Get a TLS certificate',
        points: [
            'Issue certificates with cert-manager once the hostname resolves',
            'Ready-to-copy manifests in the "TLS Certificates" tab',
            'Uses the DHBW ACME server (see below)',
        ],
    },
];

export function Home() {
    const acmeServer = window.appconfig?.acmeServer || 'https://certificates.dhbw.cloud';
    const acmeHost = acmeServer.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                {/* Hero */}
                <Paper p="xl" shadow="sm" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={1}>Welcome to dhbwCloud Self-Service</Title>
                        <Text size="lg" c="dimmed">
                            This portal is where you manage <b>your own DNS zones</b>. A zone gives you
                            your own <b>hostnames</b> — the basis for reaching your services by name and for
                            issuing <b>TLS certificates</b> for them.
                        </Text>
                        <Group mt="sm">
                            <Button component={Link} to="/dyndns/zones" size="md" rightSection={<ArrowRight size="18" />}>
                                Manage your zones
                            </Button>
                            <Button component={Link} to="/dyndns/api-doc" size="md" variant="light">
                                API documentation
                            </Button>
                        </Group>
                    </Stack>
                </Paper>

                {/* Get started */}
                <div>
                    <Title order={3} mb="md">Get started in three steps</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                        {STEPS.map(({ icon: Icon, color, title, points }) => (
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

                {/* DHBW ACME callout */}
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
            </Stack>
        </Container>
    );
}
