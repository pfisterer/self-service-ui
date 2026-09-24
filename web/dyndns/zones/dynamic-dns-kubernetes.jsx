import { useAuth } from '/providers/auth.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { Accordion, Alert, Anchor, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { TabIntro } from './tab-intro.jsx';
import { deriveZoneConfig, PrefilledValues } from './dynamic-dns.jsx';

// ----------------------------------------
// Dynamic DNS (Kubernetes) tab
// Umbrella for driving this zone from a Kubernetes cluster, split into one
// accordion per tool (mirroring the Dynamic DNS tab):
//   ExternalDnsPanel  — external-dns in an existing cluster
//   AnsibleRolePanel  — a whole k3s cluster incl. DNS + TLS via the Ansible role
// Both are pre-filled from this zone + its TSIG key.
// ----------------------------------------

// ----------------------------------------
// Accordion 1 — external-dns for a cluster you already have.
// ----------------------------------------
// The values are shown here and installed from a local file. There used to be a
// one-liner that curl'd them from the API with one of the user's tokens filled
// in — tokens are stored hashed now, so nothing can fill one in, and a snippet
// that only works after pasting a credential is worse than showing the values.
function ExternalDnsPanel({ externalDnsValuesYaml }) {
    const { t } = useTranslation();
    const helmAddRepoCommand = `helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/; helm repo update`;
    const helmInstallCommand = `helm upgrade --install external-dns external-dns/external-dns -n external-dns --create-namespace -f external-dns-values.yaml`;

    return (
        <Stack gap="lg">
            <Text size="sm" c="dimmed">
                <Trans i18nKey="dyndns.kubernetes.externalDnsIntro" components={{
                    1: <ExternalLink href="https://github.com/kubernetes-sigs/external-dns" />,
                }} />
            </Text>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    {t('dyndns.kubernetes.step1')}
                </Text>
                <CodeBlock code={helmAddRepoCommand} />
            </div>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    <Trans i18nKey="dyndns.kubernetes.step2" components={{ 1: <code /> }} />
                </Text>
                <CodeBlock code={externalDnsValuesYaml} />
            </div>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    {t('dyndns.kubernetes.step3')}
                </Text>
                <CodeBlock code={helmInstallCommand} />
            </div>
        </Stack>
    );
}

// ----------------------------------------
// Accordion 2 — the zone's settings for the k3s-dhbw-cloud-role Ansible role,
// which installs a k3s cluster incl. external-dns and cert-manager.
//
// Only the zone-specific config is generated here. The rest of the inventory
// (hosts, ansible_user, node roles) belongs to whoever maintains it — showing it
// would just be a copy of the role's README with our guesses filled in.
//
// The values go under `all.vars`, NOT into a host entry: they describe the zone,
// not a machine, so every host in the inventory — server and agents, however many
// are added later — picks them up without repeating the key.
// ----------------------------------------
const ROLE_URL = 'https://github.com/pfisterer/k3s-dhbw-cloud-role';

function AnsibleRolePanel({ cfg }) {
    const { user } = useAuth();
    // The ACME account address is the logged-in user's — no input needed.
    const email = user?.profile?.email || 'your@mail.com';

    const inventoryYml = [
        `all:`,
        `  # Global variables — they apply to every host in the inventory, so a`,
        `  # cluster can grow (server + agents) without repeating the zone or key.`,
        `  vars:`,
        `    cert_manager_email: ${email}`,
        ``,
        `    # DNS + automatic (wildcard) TLS for ${cfg.zoneNoDot}`,
        `    rfc2136_zone: ${cfg.zoneNoDot}`,
        `    rfc2136_dns_host: ${cfg.host}`,
        `    rfc2136_dns_port: ${cfg.port}`,
        `    rfc2136_tsig_secret_keyname: "${cfg.keyname}"`,
        `    rfc2136_tsig_secret_alg: ${cfg.alg}`,
        `    rfc2136_tsig_secret_value: "${cfg.secret}"`,
    ].join('\n');

    return (
        <Stack gap="lg">
            <Text size="sm" c="dimmed">
                <Trans i18nKey="dyndns.kubernetes.ansibleIntro" components={{
                    1: <ExternalLink href="https://k3s.io" />,
                    2: <ExternalLink href={ROLE_URL} />,
                }} />
            </Text>

            <div>
                <Text size="xs" c="dimmed" fw={600} mb={4}>inventory.yml</Text>
                <CodeBlock code={inventoryYml} language="yaml" />
            </div>
        </Stack>
    );
}

// ----------------------------------------
// Tab shell: derives the shared config once and lays out the accordions.
// ----------------------------------------
export function DynamicDnsKubernetes({ externalDnsValuesYaml, zone }) {
    const { t } = useTranslation();
    const { config: dynDnsConfig } = useDynDnsConfig();
    const cfg = deriveZoneConfig(zone, dynDnsConfig);

    return (
        <Stack gap="lg">
            <TabIntro title={t('dyndns.kubernetes.title', { zone: cfg.zoneNoDot })}>
                <Trans i18nKey="dyndns.kubernetes.intro" components={{
                    1: <ExternalLink href="https://github.com/kubernetes-sigs/external-dns" />,
                    2: <ExternalLink href={ROLE_URL} />,
                }} />
            </TabIntro>

            <PrefilledValues cfg={cfg} />

            {!cfg.hasKey && (
                <Alert icon={<AlertCircle size="16" />} color="red">{t('dyndns.noKey.snippets')}</Alert>
            )}

            {/* Both accordions start collapsed — the user opens whichever they need. */}
            <Accordion variant="separated">
                <Accordion.Item value="external-dns">
                    <Accordion.Control>{t('dyndns.kubernetes.accordionExternalDns')}</Accordion.Control>
                    <Accordion.Panel>
                        <ExternalDnsPanel externalDnsValuesYaml={externalDnsValuesYaml} />
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="ansible">
                    <Accordion.Control>{t('dyndns.kubernetes.accordionAnsible')}</Accordion.Control>
                    <Accordion.Panel><AnsibleRolePanel cfg={cfg} /></Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
}
