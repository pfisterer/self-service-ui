import { CodeBlock } from '/helper/codeblock.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useAuth } from '/providers/auth.jsx';
import { Container, Stack, Text, Alert, Anchor, Title } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

// ----------------------------------------
// TLS-Certificates (cert-manager) config display
// Mirrors the "External DNS Config" tab: shows how to issue certificates for
// this zone with cert-manager, DNS-01 (RFC2136 via this server) by default and
// HTTP-01 as an alternative. Matches how the k3s-dhbw-cloud-role sets it up.
// ----------------------------------------
export function TlsCertificates({ zone }) {
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { user } = useAuth();

    const zoneName = zone.zone;
    const key = zone.zone_keys?.[0];
    // Default to the "default" namespace so the manifests apply as-is; the user
    // adjusts it to wherever their workload/Ingress and the TLS Secret live.
    const ns = 'default';
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
        `# 1) TSIG secret for the RFC2136 (DNS-01) solver`,
        `apiVersion: v1`,
        `kind: Secret`,
        `metadata:`,
        `  name: ${safeZone}-rfc2136-tsig`,
        `  namespace: ${ns}`,
        `type: Opaque`,
        `stringData:`,
        `  secret: "${key?.key || '<tsig-secret>'}"`,
        `---`,
        `# 2) Issuer using DNS-01 (RFC2136) against this Dynamic Zones server`,
        `apiVersion: cert-manager.io/v1`,
        `kind: Issuer`,
        `metadata:`,
        `  name: ${safeZone}-letsencrypt-dns01`,
        `  namespace: ${ns}`,
        `spec:`,
        `  acme:`,
        `    email: ${email}`,
        `    server: ${acmeServer}`,
        `    privateKeySecretRef:`,
        `      name: ${safeZone}-letsencrypt-dns01-key`,
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
        `# 3) Certificate (adjust the host / dnsNames as needed)`,
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
        `    name: ${safeZone}-letsencrypt-dns01`,
        `    kind: Issuer`,
    ].join('\n');

    const http01Yaml = [
        `apiVersion: cert-manager.io/v1`,
        `kind: Issuer`,
        `metadata:`,
        `  name: ${safeZone}-letsencrypt-http01`,
        `  namespace: ${ns}`,
        `spec:`,
        `  acme:`,
        `    email: ${email}`,
        `    server: ${acmeServer}`,
        `    privateKeySecretRef:`,
        `      name: ${safeZone}-letsencrypt-http01-key`,
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
        `    name: ${safeZone}-letsencrypt-http01`,
        `    kind: Issuer`,
    ].join('\n');

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Text component="p">
                    Set up <Anchor href="https://cert-manager.io" target="_blank">cert-manager</Anchor> to issue TLS
                    certificates for <code>{zoneName}</code>. The recommended method is <b>DNS-01</b> via this Dynamic
                    Zones server (RFC2136 + your zone's TSIG key): it needs no public HTTP access and can issue
                    wildcards. The examples are prefilled for <code>{zoneName}</code> against
                    the DHBW ACME server; adjust the <code>namespace</code> (defaults to <code>{ns}</code>) to where
                    your workload runs{emailIsPlaceholder ? <> and set the ACME account <code>{email}</code></> : <>. The
                    ACME account email is prefilled with <code>{email}</code></>}.
                </Text>

                {!key && (
                    <Alert icon={<AlertCircle size="16" />} color="red">
                        This zone has no TSIG key yet — create one under the "Keys" tab first, then the DNS-01 example
                        below will be filled in automatically.
                    </Alert>
                )}

                <div>
                    <Title order={4} mb="xs">DNS-01 (recommended)</Title>
                    <CodeBlock code={dns01Yaml} />
                </div>

                <div>
                    <Title order={4} mb="xs">HTTP-01 (alternative)</Title>
                    <Text component="p" mb="md" size="sm" c="dimmed">
                        No TSIG needed, but the host must be reachable over HTTP (:80) through an Ingress from within
                        the DHBW network (where the ACME server runs), and wildcard certificates are not possible.
                    </Text>
                    <CodeBlock code={http01Yaml} />
                </div>
            </Stack>
        </Container>
    );
}
