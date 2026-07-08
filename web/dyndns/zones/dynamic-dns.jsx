import { useState } from 'react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { recordNameError, recordValueError } from '/helper/dns-validation.js';
import { TabIntro } from './tab-intro.jsx';
import { Stack, Text, Alert, Anchor, Paper, Group, SimpleGrid, Accordion, TextInput, Select, NumberInput, Grid, Title } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

// ----------------------------------------
// Shared command generators (also used by the DNS records table).
// ----------------------------------------

// Nameserver to show in user-facing commands: the public NS hostname when the
// API advertises one, otherwise the raw server address.
function nameserverFor(appConfig) {
    return appConfig?.advertised_nameserver || appConfig?.dns_server_address;
}

// dig query-command generator.
export function generateDig(record, zone, appConfig) {
    // Build the FQDN, treating '@' / empty name as the zone apex.
    const fqdn = (!record.name || record.name === '@') ? zone : `${record.name}.${zone}`;
    const fqdnDotted = fqdn.endsWith('.') ? fqdn : `${fqdn}.`;
    return `dig @${nameserverFor(appConfig)} -p ${appConfig.dns_server_port} ${fqdnDotted} ${record.type} +short`;
}

// nsupdate command generator.
export function generateNsUpdate(record, zone, tsigKey, appConfig) {
    return [
        `# Create/Update record in DNS`,
        `nsupdate -y "${tsigKey.algorithm}:${tsigKey.keyname}:${tsigKey.key}" <<EOF`,
        `server ${nameserverFor(appConfig)} ${appConfig.dns_server_port}`,
        `zone ${zone}`,
        `update delete ${record.name}.${zone}. IN ${record.type} ${record.value}`,
        `update add ${record.name}.${zone}. ${record.ttl} IN ${record.type} ${record.value}`,
        `send`,
        `EOF`,
        ``,
        `# Verify`,
        generateDig(record, zone, appConfig)
    ].join('\n');
}

// ----------------------------------------
// Dynamic DNS (RFC2136) tab
// Umbrella for keeping a host's public IP current in this zone. It is split into
// small pieces here:
//   InfoItem / PrefilledValues  — the shared, read-only values panel
//   OneShotPanel                — the one-shot nsupdate command builder
//   DdclientPanel               — a self-running updater (ddclient)
//   keyFileText / deriveName    — shared string builders
// All snippets are pre-filled from this zone + its TSIG key, mirroring the TLS tab.
// ----------------------------------------

// Compact "label + value" row for the prefilled-values panel (mirrors the TLS tab).
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

// Read-only overview of the values every client below is pre-filled with.
function PrefilledValues({ cfg }) {
    return (
        <Paper withBorder radius="md" p="md">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" verticalSpacing="sm">
                <InfoItem label="Nameserver" value={`${cfg.host}:${cfg.port}`} />
                <InfoItem label="Zone" value={cfg.zoneNoDot} />
                <InfoItem label="TSIG key" value={cfg.keyname} note={cfg.alg} />
            </SimpleGrid>
        </Paper>
    );
}

// Bind-style TSIG key file (chmod 600) — read by ddclient's nsupdate protocol, so
// the secret never appears on a command line or in the process list.
function keyFileText({ keyname, alg, secret, keyfilePath }) {
    return [
        `# ${keyfilePath}   (chmod 600 — only the service user should read this)`,
        `key "${keyname}" {`,
        `    algorithm ${alg};`,
        `    secret "${secret}";`,
        `};`,
    ].join('\n');
}

// Turn a relative record name ('@' = apex) into its FQDN variants for this zone.
function deriveName({ zoneFqdn, zoneNoDot }, recordName) {
    const rn = (recordName || '@').trim().replace(/\.+$/, '') || '@';
    return {
        rn,
        fqdn: rn === '@' ? zoneFqdn : `${rn}.${zoneFqdn}`,
        fqdnNoDot: rn === '@' ? zoneNoDot : `${rn}.${zoneNoDot}`,
    };
}

// Labeled record-name input with the shared d6 validation, reused by the updaters.
// `fqdnPreview` shows the resulting fully-qualified name live so users don't have to
// know what "relative to the zone" means.
function RecordNameInput({ value, onChange, fqdnPreview }) {
    return (
        <TextInput
            label="Hostname to keep updated"
            description={
                <>
                    The DNS name that should point at this machine's public IP, written relative to the zone
                    (e.g. <code>my-host</code>{fqdnPreview ? <> → <code>{fqdnPreview}</code></> : null}).
                    Use <code>@</code> to update the zone itself (its apex/root).
                </>
            }
            placeholder="my-host"
            value={value}
            onChange={e => onChange(e.currentTarget.value)}
            error={value.trim() ? recordNameError(value) : null}
            size="xs"
            maw={460}
        />
    );
}

// ----------------------------------------
// Accordion 1 — the one-shot nsupdate command builder (formerly its own tab/file).
// A live-updating form whose generated nsupdate + dig command is copy-pasteable.
// ----------------------------------------
function OneShotPanel({ zone }) {
    const { config: dynDnsConfig } = useDynDnsConfig();
    const [form, setForm] = useState({ name: 'testname', type: 'A', ttl: 60, value: '127.1.2.3' });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    return (
        <Stack gap="lg">
            <Text size="sm" c="dimmed">
                Build a one-shot <code>nsupdate</code> command via{' '}
                <Anchor href="https://datatracker.ietf.org/doc/html/rfc2136" target="_blank">RFC&nbsp;2136</Anchor>{' '}
                (signed with this zone's TSIG key). Fill in the fields — the command below updates live. Run it once
                to create or update the record, and verify with <code>dig</code>.
            </Text>

            <Paper withBorder radius="md" p="md">
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput label="Name" name="name" value={form.name} onChange={handleChange}
                            error={recordNameError(form.name)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Select label="Type" name="type" value={form.type}
                            onChange={(val) => setForm(prev => ({ ...prev, type: val }))}
                            data={['A', 'AAAA', 'CNAME', 'TXT', 'MX']} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <NumberInput label="TTL" name="ttl" min={0} value={form.ttl}
                            onChange={(val) => setForm(prev => ({ ...prev, ttl: val }))} />
                    </Grid.Col>
                    <Grid.Col span={12}>
                        <TextInput label="Value" name="value" value={form.value} onChange={handleChange}
                            error={form.value.trim() ? recordValueError(form.type, form.value) : null} />
                    </Grid.Col>
                </Grid>
            </Paper>

            {zone.zone_keys.map(key => (
                <Paper key={key.keyname} withBorder radius="md" p="md">
                    <Title order={5} mb="sm">Key: {key.keyname}</Title>
                    <CodeBlock code={generateNsUpdate({ name: form.name, type: form.type, ttl: Number(form.ttl), value: form.value }, zone.zone, key, dynDnsConfig)} />
                </Paper>
            ))}

            <Alert variant="light" color="blue" icon={<AlertCircle size="16" />} title="Run it automatically">
                <Text size="sm">
                    To keep a record updated (e.g. a host whose public IP changes), save this command as a small
                    script and run it on a schedule — for example with a{' '}
                    <Anchor href="https://wiki.archlinux.org/title/Systemd/Timers" target="_blank">systemd&nbsp;timer</Anchor>{' '}
                    or a cron job. For a ready-made updater that also detects your current public IP, use the{' '}
                    <b>ddclient</b> section below.
                </Text>
            </Alert>
        </Stack>
    );
}

// ----------------------------------------
// Accordion 2 — a self-running updater (ddclient). Discovers the host's public
// address and keeps the record current on a daemon interval.
// ----------------------------------------
function DdclientPanel({ cfg }) {
    const [recordName, setRecordName] = useState('my-host');
    const { fqdnNoDot } = deriveName(cfg, recordName);

    const keyFile = keyFileText(cfg);

    const ddclientConf = `# /etc/ddclient/ddclient.conf   (chmod 600; needs ddclient >= 3.10 for split IPv4/IPv6)
daemon=300
protocol=nsupdate
server=${cfg.host}
password=${cfg.keyfilePath}
zone=${cfg.zoneNoDot}
ttl=${cfg.ttl}
# IPv4 (A): 'ifv4' reads a local global address; behind NAT use a web echo instead:
#   usev4=webv4, webv4=https://api.ipify.org
usev4=ifv4, ifv4=eth0
# IPv6 (AAAA): a global address on the interface (ddclient skips temporary ones)
usev6=ifv6, ifv6=eth0
${fqdnNoDot}`;

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                A self-running updater (<code>apt install ddclient</code>) that discovers this host's public address
                and keeps the record current. It uses the TSIG key file below via its <code>nsupdate</code> protocol.
                Use ddclient&nbsp;≥&nbsp;3.10, which updates IPv4 and IPv6 independently
                (<code>usev4</code>/<code>usev6</code>) so a missing address never clears the other family. Adjust the
                interface (<code>eth0</code>) to yours.
            </Text>

            <RecordNameInput value={recordName} onChange={setRecordName} fqdnPreview={fqdnNoDot} />

            <div>
                <Text size="xs" c="dimmed" fw={600} mb={4}>zone.key</Text>
                <CodeBlock code={keyFile} language="plaintext" />
            </div>
            <div>
                <Text size="xs" c="dimmed" fw={600} mb={4}>ddclient.conf</Text>
                <CodeBlock code={ddclientConf} language="ini" />
            </div>
        </Stack>
    );
}

// ----------------------------------------
// Tab shell: derives the shared config once and lays out the accordions.
// ----------------------------------------
export function DynamicDns({ zone }) {
    const { config: dynDnsConfig } = useDynDnsConfig();

    const zoneName = zone.zone;
    const key = zone.zone_keys?.[0];
    const cfg = {
        host: dynDnsConfig?.advertised_nameserver || dynDnsConfig?.dns_server_address || '<dns-server>',
        port: dynDnsConfig?.dns_server_port ?? 53,
        zoneFqdn: zoneName.endsWith('.') ? zoneName : `${zoneName}.`,
        zoneNoDot: zoneName.replace(/\.$/, ''),
        keyname: key?.keyname || '<keyname>',
        alg: key?.algorithm || 'hmac-sha256',
        secret: key?.key || '<tsig-secret>',
        keyfilePath: '/etc/dyndns/zone.key',
        ttl: 60,
    };

    return (
        <Stack gap="lg">
            <TabIntro title={`Dynamic DNS for ${cfg.zoneNoDot}`}>
                Keep a host's public IP current in this zone via{' '}
                <Anchor href="https://datatracker.ietf.org/doc/html/rfc2136" target="_blank">RFC&nbsp;2136</Anchor>{' '}
                — a one-shot <code>nsupdate</code> command, or{' '}
                <Anchor href="https://ddclient.net/" target="_blank">ddclient</Anchor> for a self-running updater.
                Both use this zone's TSIG key.
            </TabIntro>

            <PrefilledValues cfg={cfg} />

            {!key && (
                <Alert icon={<AlertCircle size="16" />} color="red">
                    This zone has no TSIG key yet — create one under the "Keys" tab first, then the snippets below
                    will be filled in automatically.
                </Alert>
            )}

            {/* Both accordions start collapsed — the user opens whichever they need. */}
            <Accordion variant="separated">
                <Accordion.Item value="oneshot">
                    <Accordion.Control>nsupdate command (one-shot)</Accordion.Control>
                    <Accordion.Panel><OneShotPanel zone={zone} /></Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="ddclient">
                    <Accordion.Control>ddclient (automatic updates)</Accordion.Control>
                    <Accordion.Panel><DdclientPanel cfg={cfg} /></Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Stack>
    );
}
