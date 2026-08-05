import { useAuth } from '/providers/auth.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { Accordion, Alert, Anchor, Stack, Text } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
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
    const helmAddRepoCommand = `helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/; helm repo update`;
    const helmInstallCommand = `helm upgrade --install external-dns external-dns/external-dns -n external-dns --create-namespace -f external-dns-values.yaml`;

    return (
        <Stack gap="lg">
            <Text size="sm" c="dimmed">
                Install <Anchor href="https://github.com/kubernetes-sigs/external-dns" target="_blank">external-dns</Anchor>{' '}
                into a cluster you already run, so this zone's records follow your Kubernetes resources
                (Services / Ingresses). It signs its updates with this zone's TSIG key.
            </Text>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    1. Add the external-dns Helm repository (only once):
                </Text>
                <CodeBlock code={helmAddRepoCommand} />
            </div>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    2. Save these values as <code>external-dns-values.yaml</code> — they carry this zone's TSIG
                    key, so keep the file private:
                </Text>
                <CodeBlock code={externalDnsValuesYaml} />
            </div>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    3. Install:
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
                Turn one or more fresh Linux hosts into a{' '}
                <Anchor href="https://k3s.io" target="_blank">k3s</Anchor> cluster with the{' '}
                <Anchor href={ROLE_URL} target="_blank">k3s-dhbw-cloud-role</Anchor> Ansible role. It installs
                external-dns and cert-manager for you, so every Ingress under this zone automatically gets a DNS
                record and a wildcard HTTPS certificate. Add the block below to your inventory — it is everything
                the role needs to know about this zone. Keep that file private: the TSIG key grants write access
                to the zone.
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
    const { config: dynDnsConfig } = useDynDnsConfig();
    const cfg = deriveZoneConfig(zone, dynDnsConfig);

    return (
        <Stack gap="lg">
            <TabIntro title={`Dynamic DNS (Kubernetes) for ${cfg.zoneNoDot}`}>
                Manage this zone's records from Kubernetes — either with{' '}
                <Anchor href="https://github.com/kubernetes-sigs/external-dns" target="_blank">external-dns</Anchor>{' '}
                in a cluster you already have, or by setting up a whole k3s cluster (DNS + HTTPS included) with the{' '}
                <Anchor href={ROLE_URL} target="_blank">k3s-dhbw-cloud-role</Anchor> Ansible role.
                Both use this zone's TSIG key.
            </TabIntro>

            <PrefilledValues cfg={cfg} />

            {!cfg.hasKey && (
                <Alert icon={<AlertCircle size="16" />} color="red">
                    This zone has no TSIG key yet — create one under the "Keys" tab first, then the snippets below
                    will be filled in automatically.
                </Alert>
            )}

            {/* Both accordions start collapsed — the user opens whichever they need. */}
            <Accordion variant="separated">
                <Accordion.Item value="external-dns">
                    <Accordion.Control>external-dns (existing cluster)</Accordion.Control>
                    <Accordion.Panel>
                        <ExternalDnsPanel externalDnsValuesYaml={externalDnsValuesYaml} />
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="ansible">
                    <Accordion.Control>Ansible k3s-dhbw-cloud-role (new k3s cluster)</Accordion.Control>
                    <Accordion.Panel><AnsibleRolePanel cfg={cfg} /></Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
}
