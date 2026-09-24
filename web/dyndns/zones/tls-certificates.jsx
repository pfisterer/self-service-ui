import { useState } from 'react';
import { ExternalLink } from '/helper/external-link.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useAuth } from '/providers/auth.jsx';
import { isValidLabel } from '/helper/dns-validation.js';
import { TabIntro } from './tab-intro.jsx';
import { Stack, Text, Alert, Anchor, Paper, Group, SimpleGrid, Accordion, TextInput } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

// Compact "label + value" row for the prefilled-values panel.
function InfoItem({ label, value, note }) {
    return (
        <div>
            <Text size="xs" c="dimmed" tt="uppercase">{label}</Text>
            <Group gap="xs" wrap="nowrap" align="baseline">
                <Text size="sm" style={{ wordBreak: 'break-all' }}><code>{value}</code></Text>
                {note && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>({note})</Text>}
            </Group>
        </div>
    );
}

// ----------------------------------------
// TLS-Certificates (cert-manager) config display
// Mirrors the "Dynamic DNS (Kubernetes)" tab (external-dns): shows how to issue certificates for
// this zone with cert-manager, DNS-01 (RFC2136 via this server) by default and
// HTTP-01 as an alternative. Matches how the k3s-dhbw-cloud-role sets it up.
// ----------------------------------------
export function TlsCertificates({ zone }) {
    const { t } = useTranslation();
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { user } = useAuth();

    const zoneName = zone.zone;
    const key = zone.zone_keys?.[0];
    // The namespace where the Certificate (and its TLS Secret) live — i.e. your
    // workload's namespace. Editable; the examples update live. Not "default".
    const [ns, setNs] = useState('default');
    const nsValid = isValidLabel(ns, { lowercase: true });
    // Prefill the ACME account email from the logged-in user (OIDC profile);
    // fall back to a placeholder if it is not available.
    const email = user?.profile?.email || '<your-email>';
    const emailIsPlaceholder = email === '<your-email>';
    const safeZone = zoneName.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');

    const host = dynDnsConfig?.advertised_nameserver || dynDnsConfig?.dns_server_address || '<dns-server>';
    const nameserver = `${host.includes(':') ? `[${host}]` : host}:${dynDnsConfig?.dns_server_port ?? 53}`;
    // cert-manager expects the algorithm without dashes and uppercase, e.g. HMACSHA512
    const tsigAlg = (key?.algorithm || 'hmac-sha512').replace(/-/g, '').toUpperCase();
    // DHBW-internal ACME server (acme2certifier); the per-env value is injected
    // via window.appconfig.acmeServer (staging vs prod). Reachable only from
    // inside the DHBW network / VPN — the same server the k3s-dhbw-cloud-role
    // ClusterIssuer uses.
    const acmeServer = window.appconfig?.acmeServer || 'https://certificates.dhbw.cloud';

    const dns01Yaml = [
        `# 1) TSIG secret for the RFC2136 (DNS-01) solver. For a ClusterIssuer the`,
        `#    solver Secret must live in the cert-manager namespace.`,
        `apiVersion: v1`,
        `kind: Secret`,
        `metadata:`,
        `  name: ${safeZone}-rfc2136-tsig`,
        `  namespace: cert-manager`,
        `type: Opaque`,
        `stringData:`,
        `  secret: "${key?.key || '<tsig-secret>'}"`,
        `---`,
        `# 2) ClusterIssuer using DNS-01 (RFC2136) against this Dynamic Zones server`,
        `apiVersion: cert-manager.io/v1`,
        `kind: ClusterIssuer`,
        `metadata:`,
        `  name: ${safeZone}-dhbw-dns01`,
        `spec:`,
        `  acme:`,
        `    email: ${email}`,
        `    server: ${acmeServer}`,
        `    privateKeySecretRef:`,
        `      name: ${safeZone}-dhbw-dns01-key`,
        `    solvers:`,
        `      - dns01:`,
        `          rfc2136:`,
        `            nameserver: "${nameserver}"`,
        `            tsigKeyName: "${key?.keyname || '<keyname>'}"`,
        `            tsigAlgorithm: ${tsigAlg}`,
        `            tsigSecretSecretRef:`,
        `              name: ${safeZone}-rfc2136-tsig`,
        `              key: secret`,
        `---`,
        `# 3) Certificate (in your workload's namespace; adjust the dnsNames)`,
        `apiVersion: cert-manager.io/v1`,
        `kind: Certificate`,
        `metadata:`,
        `  name: ${safeZone}-tls`,
        `  namespace: ${ns}`,
        `spec:`,
        `  secretName: ${safeZone}-tls`,
        `  dnsNames:`,
        `    - "www.${zoneName}"`,
        `    # - "*.${zoneName}"   # wildcard — DNS-01 only`,
        `  issuerRef:`,
        `    name: ${safeZone}-dhbw-dns01`,
        `    kind: ClusterIssuer`,
    ].join('\n');

    const http01Yaml = [
        `apiVersion: cert-manager.io/v1`,
        `kind: ClusterIssuer`,
        `metadata:`,
        `  name: ${safeZone}-dhbw-http01`,
        `spec:`,
        `  acme:`,
        `    email: ${email}`,
        `    server: ${acmeServer}`,
        `    privateKeySecretRef:`,
        `      name: ${safeZone}-dhbw-http01-key`,
        `    solvers:`,
        `      - http01:`,
        `          ingress:`,
        `            class: traefik`,
        `---`,
        `# Certificate via HTTP-01 — the host must resolve to your Ingress and be`,
        `# reachable on :80 from within the DHBW network. Wildcards are NOT possible with HTTP-01.`,
        `apiVersion: cert-manager.io/v1`,
        `kind: Certificate`,
        `metadata:`,
        `  name: ${safeZone}-tls-http01`,
        `  namespace: ${ns}`,
        `spec:`,
        `  secretName: ${safeZone}-tls-http01`,
        `  dnsNames:`,
        `    - "www.${zoneName}"`,
        `  issuerRef:`,
        `    name: ${safeZone}-dhbw-http01`,
        `    kind: ClusterIssuer`,
    ].join('\n');

    // CLI ACME clients (DNS-01 / RFC2136) using this zone's TSIG key. cert-manager
    // (above) is the Kubernetes-native option; these are for non-k8s workflows.
    const cliHost = host;
    const cliPort = dynDnsConfig?.dns_server_port ?? 53;
    const cliKeyname = key?.keyname || '<keyname>';
    const cliSecret = key?.key || '<tsig-secret>';
    const cliAlg = key?.algorithm || 'hmac-sha512';

    // certbot: credentials file (INI) + the issue command (bash), shown separately.
    const certbotIni = [
        `# rfc2136.ini  (run chmod 600 rfc2136.ini to ensure only the user can read it)`,
        `dns_rfc2136_server = ${cliHost}`,
        `dns_rfc2136_port = ${cliPort}`,
        `dns_rfc2136_name = ${cliKeyname}`,
        `dns_rfc2136_secret = ${cliSecret}`,
        `dns_rfc2136_algorithm = ${cliAlg.toUpperCase()}`,
    ].join('\n');

    const certbotCmd = [
        `certbot certonly --server ${acmeServer} --dns-rfc2136 --dns-rfc2136-credentials ./rfc2136.ini -d www.${zoneName}`,
    ].join('\n');

    // acme.sh: TSIG key file + the issue command (bash), shown separately.
    const acmeShKey = [
        `# tsig.key  (run chmod 600 tsig.key to ensure only the user can read it)`,
        `key "${cliKeyname}" {`,
        `  algorithm ${cliAlg};`,
        `  secret "${cliSecret}";`,
        `};`,
    ].join('\n');

    const acmeShCmd = [
        `export NSUPDATE_SERVER="${cliHost}"`,
        `export NSUPDATE_SERVER_PORT="${cliPort}"`,
        `export NSUPDATE_KEY="/path/to/tsig.key"`,
        `acme.sh --issue --server ${acmeServer} --dns dns_nsupdate -d www.${zoneName}`,
    ].join('\n');

    return (
        <Stack gap="lg">
            <TabIntro title={t('dyndns.tls.title', { zone: zoneName })}>
                <Trans i18nKey="dyndns.tls.intro" components={{
                    1: <ExternalLink href="https://certbot.eff.org/" />,
                    2: <ExternalLink href="https://github.com/acmesh-official/acme.sh" />,
                    3: <ExternalLink href="https://cert-manager.io" />,
                    4: <ExternalLink href="https://en.wikipedia.org/wiki/Wildcard_certificate" />,
                }} />
            </TabIntro>

            {/* Prefilled values overview (shared by all clients) */}
            <Paper withBorder radius="md" p="md">
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" verticalSpacing="sm">
                    <InfoItem label={t('dyndns.tls.acmeServer')} value={acmeServer} />
                    <InfoItem label={t('dyndns.tls.acmeEmail')} value={email} note={emailIsPlaceholder ? t('dyndns.tls.setYourEmail') : undefined} />
                    <InfoItem label={t('dyndns.tls.dns01Nameserver')} value={nameserver} />
                </SimpleGrid>
            </Paper>

            {!key && (
                <Alert icon={<AlertCircle size="16" />} color="red">{t('dyndns.noKey.dns01')}</Alert>
            )}

            <Accordion variant="separated">
                <Accordion.Item value="certbot">
                    <Accordion.Control>certbot</Accordion.Control>
                    <Accordion.Panel>
                        <Text size="sm" c="dimmed" mb="sm">
                            <Trans i18nKey="dyndns.tls.certbotIntro" components={{ 1: <code /> }} />
                        </Text>
                        <Text size="xs" c="dimmed" fw={600} mb={4}>rfc2136.ini</Text>
                        <CodeBlock code={certbotIni} language="ini" />
                        <Text size="xs" c="dimmed" fw={600} mt="md" mb={4}>{t('dyndns.tls.issueCertificate')}</Text>
                        <CodeBlock code={certbotCmd} language="bash" />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="acmesh">
                    <Accordion.Control>acme.sh</Accordion.Control>
                    <Accordion.Panel>
                        <Text size="sm" c="dimmed" mb="sm">
                            <Trans i18nKey="dyndns.tls.acmeShIntro" components={{ 1: <code /> }} />
                        </Text>
                        <Text size="xs" c="dimmed" fw={600} mb={4}>tsig.key</Text>
                        <CodeBlock code={acmeShKey} language="plaintext" />
                        <Text size="xs" c="dimmed" fw={600} mt="md" mb={4}>{t('dyndns.tls.issueCertificate')}</Text>
                        <CodeBlock code={acmeShCmd} language="bash" />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="cert-manager">
                    <Accordion.Control>cert-manager (Kubernetes)</Accordion.Control>
                    <Accordion.Panel>
                        <TextInput
                            label={t('dyndns.tls.namespaceLabel')}
                            description={t('dyndns.tls.namespaceDescription')}
                            value={ns}
                            onChange={e => setNs(e.currentTarget.value)}
                            error={ns && !nsValid ? t('dyndns.tls.namespaceError') : null}
                            size="xs"
                            mb="md"
                            maw={360}
                        />
                        <Text size="sm" c="dimmed" mb="sm">
                            <Trans i18nKey="dyndns.tls.dns01Intro" components={{
                                1: <b />,
                                2: <ExternalLink href="https://cert-manager.io/docs/configuration/acme/dns01/rfc2136/" />,
                            }} />
                        </Text>
                        <CodeBlock code={dns01Yaml} />
                        <Text size="sm" c="dimmed" mt="lg" mb="sm">
                            <Trans i18nKey="dyndns.tls.http01Intro" components={{ 1: <b /> }} />
                        </Text>
                        <CodeBlock code={http01Yaml} />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
}
