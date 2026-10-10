import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Code, Container, Group, Paper, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { Download, ExternalLink as ExternalIcon } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { SubNavItem } from '/header.jsx';
import { SUBNAV_HEIGHT } from '/nav.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { llmDownloadUrl, useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';

// The API reports states as the German words the old portal showed. They are
// mapped to translation keys here — one table per column, so a value the API
// adds later shows up as itself instead of as a missing key.
const STATE = { aktiv: ['active', 'teal'], 'ohne Rückmeldung': ['silent', 'orange'], gesperrt: ['blocked', 'gray'] };
const INFERENCE = {
    erreichbar: ['reachable', 'teal'], 'gestört': ['failing', 'red'], teilweise: ['partial', 'orange'],
    angehalten: ['paused', 'blue'], 'nicht registriert': ['unregistered', 'gray'], unbekannt: ['unknown', 'gray'],
};
const SCRIPTS = { aktuell: ['current', 'teal'], veraltet: ['outdated', 'orange'], 'zurückgehalten': ['heldBack', 'blue'], unbekannt: ['unknown', 'gray'] };
const UPDATE_MODE = { aus: ['off', 'gray'], alle: ['all', 'teal'], testgeraete: ['canary', 'blue'] };
const POOL_STATE = { bereit: ['ready', 'teal'], startet: ['starting', 'blue'], 'wartet auf GPU': ['waiting', 'orange'], 'wird beendet': ['terminating', 'gray'] };
const POOL_ROLE = { 'gap-filler': ['gapFiller', 'gray'], 'base-load': ['baseLoad', 'blue'] };

function StateBadge({ table, value, group, tooltip }) {
    const { t } = useTranslation();
    const [key, colour] = table[value] ?? [null, 'gray'];
    const badge = (
        <Badge variant="light" color={colour} style={{ textTransform: 'none' }}>
            {key ? t(`llm.fleet.${group}.${key}`) : (value || '—')}
        </Badge>
    );
    return tooltip ? <Tooltip label={tooltip} multiline w={300} withArrow>{badge}</Tooltip> : badge;
}

function duration(seconds, t) {
    if (seconds > 86400) return t('llm.fleet.days', { count: Math.round(seconds / 86400) });
    if (seconds > 3600) return t('llm.fleet.hours', { count: Math.round(seconds / 3600) });
    return t('llm.fleet.minutes', { count: Math.round(seconds / 60) });
}

// The fleet admins' pages, each a URL of its own (/llm/fleet/<page>) under a third navigation level like the root admins' pages under Cloud Projects: the machines, the GPU cluster's inference pool, and how machines join.
const FLEET_PAGES = [
    { id: 'machines', label: 'llm.fleet.page.machines', component: MachinesPage },
    { id: 'gpu', label: 'llm.fleet.page.gpu', component: InferencePage },
    { id: 'setup', label: 'llm.fleet.page.setup', component: SetupPage },
];

export function LlmFleet({ params }) {
    const { t } = useTranslation();
    const page = FLEET_PAGES.find(p => p.id === params?.page);
    if (!page) return <Redirect to={`/fleet/${FLEET_PAGES[0].id}`} replace />;
    const Page = page.component;
    return (
        <Container size="xl" py="md">
            <Stack gap="lg">
                <Group gap="0" wrap="nowrap" h={SUBNAV_HEIGHT}
                    style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', overflowX: 'auto' }}>
                    {FLEET_PAGES.map(p => (
                        <SubNavItem key={p.id} item={{ href: `/fleet/${p.id}`, label: t(p.label) }} active={p.id === page.id} />
                    ))}
                </Group>
                <Page />
            </Stack>
        </Container>
    );
}

// One query for the machines and the setup page: switching between them shows the cached answer at once.
function useFleetQuery() {
    const api = useLlmApi();
    return useQuery({ queryKey: llmKeys.fleet(), queryFn: () => api.getFleet(), refetchInterval: 60_000 });
}

function MachinesPage() {
    const fleet = useFleetQuery();
    if (fleet.isPending) return <Loading />;
    if (fleet.isError) return <LoadError query={fleet} />;
    return <Machines f={fleet.data ?? {}} />;
}

function SetupPage() {
    const fleet = useFleetQuery();
    const { me, isAdmin } = useLlmMe();
    if (fleet.isPending) return <Loading />;
    if (fleet.isError) return <LoadError query={fleet} />;
    const f = fleet.data ?? {};
    return (
        <Stack gap="lg">
            {f.enabled && <Onboarding f={f} email={me?.email} isAdmin={isAdmin} />}
            <LinuxInstall f={f} email={me?.email} />
            {isAdmin && me?.admin_ui_url && <AdminUiCard url={me.admin_ui_url} />}
        </Stack>
    );
}

// The GPU cluster's vLLM replicas: one gap filler per GPU node that gives its GPU to jobs and notebooks, and the base load that keeps it. Polled more often than the fleet, because an eviction or a restart takes about a minute.
function InferencePage() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const pool = useQuery({ queryKey: llmKeys.fleetInference(), queryFn: () => api.getFleetInference(), refetchInterval: 15_000 });
    if (pool.isPending) return <Loading />;
    if (pool.isError) return <LoadError query={pool} />;
    const p = pool.data ?? {};
    const pods = p.pods ?? [];
    const tip = (table, group, value) => {
        const [key] = table[value] ?? [null];
        return key ? t(`llm.fleet.pool.${group}Tip.${key}`) : null;
    };

    return (
        <Paper p="lg" radius="md" withBorder>
            <Title order={4}>{t('llm.fleet.pool.title')}</Title>
            <Text size="xs" c="dimmed">{t('llm.fleet.pool.hint')}</Text>
            {!p.enabled ? (
                <Text size="sm" c="dimmed" mt="md">{t('llm.fleet.pool.disabled')}</Text>
            ) : (
                <Table.ScrollContainer minWidth={800} mt="md">
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                {['replica', 'node', 'role', 'model', 'state', 'since'].map(c => (
                                    <Table.Th key={c}>{t(`llm.fleet.pool.col.${c}`)}</Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {pods.length === 0 && (
                                <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">{t('llm.fleet.pool.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {pods.map(r => (
                                <Table.Tr key={r.pod}>
                                    <Table.Td>
                                        <Text size="sm" ff="monospace">{r.replica}</Text>
                                        <Tooltip multiline w={300} withArrow label={t('llm.fleet.pool.siteTip')}>
                                            <Text size="xs" c="dimmed" ff="monospace">{r.site}</Text>
                                        </Tooltip>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" ff="monospace">{r.node || '—'}</Text>
                                        {r.gpu_class && <Text size="xs" c="dimmed">{r.gpu_class}</Text>}
                                    </Table.Td>
                                    <Table.Td><StateBadge table={POOL_ROLE} value={r.role} group="pool.role" tooltip={tip(POOL_ROLE, 'role', r.role)} /></Table.Td>
                                    <Table.Td><Text size="sm" ff="monospace">{r.model || '—'}</Text></Table.Td>
                                    <Table.Td><StateBadge table={POOL_STATE} value={r.state} group="pool.state" tooltip={tip(POOL_STATE, 'state', r.state)} /></Table.Td>
                                    <Table.Td>{r.since ? formatDateTime(r.since) : '—'}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            {p.url && (
                <Text size="xs" c="dimmed" mt="sm">
                    <Trans i18nKey="llm.fleet.pool.url" values={{ url: p.url }} components={{ 2: <Code /> }} />
                </Text>
            )}
        </Paper>
    );
}

function AdminUiCard({ url }) {
    const { t } = useTranslation();
    return (
        <Paper p="lg" radius="md" withBorder>
            <Group justify="space-between" wrap="wrap">
                <div>
                    <Title order={4}>{t('llm.fleet.adminUi.title')}</Title>
                    <Text size="xs" c="dimmed">{t('llm.fleet.adminUi.hint')}</Text>
                </div>
                <Button component="a" href={url} target="_blank" variant="light" rightSection={<ExternalIcon size={16} />}>
                    {t('llm.fleet.adminUi.open')}
                </Button>
            </Group>
        </Paper>
    );
}

function Onboarding({ f, email, isAdmin }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const [location, setLocation] = useState('');
    const [operator, setOperator] = useState('');
    const [contact, setContact] = useState(email || '');
    const pkg = f.package;
    const su = f.self_update ?? {};
    const [modeKey] = UPDATE_MODE[su.mode] ?? ['off'];

    const removePackage = useApiMutation({ mutationFn: () => api.deletePackage(), invalidates: [llmKeys.fleet()] });
    async function onRemovePackage() {
        const ok = await confirm({
            title: t('llm.fleet.package.deleteTitle'),
            confirmLabel: t('llm.fleet.package.deleteConfirm'),
            message: t('llm.fleet.package.deleteMessage', { file: pkg.file }),
        });
        if (ok) removePackage.mutate();
    }

    const policy = t('llm.fleet.package.policy');
    const net = [
        `${t('llm.fleet.net.out')} TCP 443      → ${f.enroll_host}`,
        `${t('llm.fleet.net.out')} UDP ${String(f.listen_port).padEnd(6)} → ${f.endpoint_v6}`,
        `${t('llm.fleet.net.in')}               ${t('llm.fleet.net.nothing')}`,
    ].join('\n');
    const check = [
        'sudo tail -20 /var/log/dhbw-llm/enroll.log',
        'sudo /usr/local/libexec/dhbw-llm/wg show',
        "grep -E 'library=' /var/log/dhbw-llm/ollama.log",
    ].join('\n');

    return (
        <Paper p="lg" radius="md" withBorder>
            <Group justify="space-between" align="flex-start">
                <div>
                    <Title order={4}>{t('llm.fleet.jamf.title')}</Title>
                    <Text size="xs" c="dimmed">{t('llm.fleet.jamf.hint')}</Text>
                </div>
                <Button size="xs" variant="subtle" component="a" href={llmDownloadUrl('v1/fleet/readme')}
                    leftSection={<Download size={14} />}>
                    {t('llm.fleet.jamf.readme')}
                </Button>
            </Group>

            <Text size="sm" fw={600} mt="md">{t('llm.fleet.profile.title')}</Text>
            <Text size="xs" c="dimmed">{t('llm.fleet.profile.hint')}</Text>
            <Group gap="xs" mt="xs" align="flex-end" wrap="wrap">
                <TextInput size="xs" label={t('llm.fleet.profile.location')} placeholder="DHBW Mannheim"
                    style={{ flex: '1 1 160px' }} value={location} onChange={e => setLocation(e.currentTarget.value)} />
                <TextInput size="xs" label={t('llm.fleet.profile.operator')} placeholder="Labor WI"
                    style={{ flex: '1 1 160px' }} value={operator} onChange={e => setOperator(e.currentTarget.value)} />
                <TextInput size="xs" label={t('llm.fleet.profile.contact')}
                    style={{ flex: '1 1 200px' }} value={contact} onChange={e => setContact(e.currentTarget.value)} />
                <Button size="xs" component="a" leftSection={<Download size={14} />}
                    href={llmDownloadUrl('v1/fleet/profile', { location, operator, contact })}>
                    {t('llm.fleet.profile.download')}
                </Button>
            </Group>
            <Text size="xs" c="orange" mt={4}>{t('llm.fleet.profile.secret')}</Text>

            <Text size="sm" fw={600} mt="md">{t('llm.fleet.package.title')}</Text>
            {pkg ? (
                <>
                    <Group gap="xs" mt={4} wrap="wrap">
                        <Button size="xs" component="a" href={llmDownloadUrl('v1/fleet/package')} leftSection={<Download size={14} />}>
                            {t('llm.fleet.package.download', { file: pkg.file })}
                        </Button>
                        <Text size="xs" c="dimmed">
                            {t('llm.fleet.package.info', { size: (pkg.size / 1048576).toFixed(1), date: formatDateTime(pkg.uploaded_at) })}
                        </Text>
                        {isAdmin && (
                            <Tooltip multiline w={280} withArrow label={t('llm.fleet.package.deleteHint')}>
                                <Button size="xs" variant="subtle" color="red" loading={removePackage.isPending} onClick={onRemovePackage}>
                                    {t('llm.fleet.package.delete')}
                                </Button>
                            </Tooltip>
                        )}
                    </Group>
                    {pkg.sha256 && <Text size="xs" c="dimmed" mt={4}>SHA-256: <Code>{pkg.sha256}</Code></Text>}
                </>
            ) : (
                <Alert variant="light" color="orange" mt={4} p="xs">
                    <Text size="xs"><Trans i18nKey="llm.fleet.package.missing" components={{ 2: <Code /> }} /></Text>
                </Alert>
            )}
            <CodeBlock language="plaintext" code={policy} />
            <Text size="xs" c="dimmed" mt={4}>
                <Trans i18nKey="llm.fleet.package.hint" values={{ id: f.package_id }} components={{ 2: <Code /> }} />
                {f.allowed_serials > 0 && <> <Trans i18nKey="llm.fleet.package.allowList" values={{ count: f.allowed_serials }}
                    components={{ 1: <b />, 2: <Code /> }} /></>}
            </Text>

            <Text size="sm" fw={600} mt="md">{t('llm.fleet.net.title')}</Text>
            <CodeBlock language="plaintext" code={net} />
            <Text size="xs" c="dimmed" mt={4}>{t('llm.fleet.net.hint')}</Text>

            <Text size="sm" fw={600} mt="md">{t('llm.fleet.check.title')}</Text>
            <Text size="xs" c="dimmed">{t('llm.fleet.check.hint', { minutes: Math.round((f.reenroll_seconds ?? 3600) / 60) })}</Text>
            <CodeBlock language="bash" code={check} />

            <Text size="sm" fw={600} mt="md">{t('llm.fleet.updates.title')}</Text>
            <Group gap="xs" mt={4}>
                <StateBadge table={UPDATE_MODE} value={su.mode} group="updates.mode" />
                {Object.entries(su.scripts ?? {}).map(([name, sha]) => (
                    <Badge key={name} variant="outline" color="gray" size="sm" style={{ textTransform: 'none' }}>
                        {name.replace(/^dhbw-llm-/, '')} {sha}
                    </Badge>
                ))}
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
                {t(`llm.fleet.updates.explain.${modeKey}`)}
                {modeKey !== 'off' && <> {t('llm.fleet.updates.root')}</>}
            </Text>
            {modeKey === 'canary' && (
                <Text size="xs" c="dimmed" mt={4}>{t('llm.fleet.updates.canaries')}: <Code>{(su.canary ?? []).join(', ')}</Code></Text>
            )}
        </Paper>
    );
}

function Machines({ f }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const peers = f.peers ?? [];

    const act = useApiMutation({
        mutationFn: ({ action, serial }) => ({
            block: api.blockMachine, unblock: api.unblockMachine, forget: api.forgetMachine,
        })[action](serial),
        invalidates: [llmKeys.fleet()],
    });
    const busy = (serial) => act.isPending && act.variables?.serial === serial;

    async function forget(p) {
        const ok = await confirm({
            title: t('llm.fleet.forgetTitle'),
            confirmLabel: t('llm.fleet.forgetConfirm'),
            message: t('llm.fleet.forgetMessage', { name: p.name, serial: p.serial }),
        });
        if (ok) act.mutate({ action: 'forget', serial: p.serial });
    }

    // What the machines actually serve, assignment only as a fallback. A
    // machine with several models counts for each; the base stays the number
    // of machines.
    const active = peers.filter(p => !p.blocked && p.enabled !== false && !p.busy);
    const spread = {};
    for (const p of active) {
        for (const m of (p.models?.length ? p.models : [p.model].filter(Boolean))) spread[m] = (spread[m] || 0) + 1;
    }

    const stateTip = (p) => p.blocked ? t('llm.fleet.stateTip.blocked')
        : p.quiet_seconds ? t('llm.fleet.stateTip.silent', { since: duration(p.quiet_seconds, t) })
            : t('llm.fleet.stateTip.active');
    const infTip = (p) => {
        const [key] = INFERENCE[p.inference] ?? [null];
        return key ? t(`llm.fleet.inferenceTip.${key}`, { error: p.inference_error || t('llm.fleet.unknownError') }) : '';
    };

    return (
        <Paper p="lg" radius="md" withBorder>
            <Group justify="space-between">
                <div>
                    <Title order={4}>{t('llm.fleet.machines.title')}</Title>
                    <Text size="xs" c="dimmed">
                        {t('llm.fleet.machines.summary', { count: peers.length, pool: f.pool, capacity: f.capacity })}
                    </Text>
                </div>
                <Button size="xs" variant="light" component="a" href={llmDownloadUrl('v1/fleet/inventory.csv')}
                    leftSection={<Download size={14} />}>
                    {t('llm.fleet.machines.csv')}
                </Button>
            </Group>
            {active.length > 0 && (
                <Group gap="xs" mt="sm">
                    <Text size="xs" c="dimmed">{t('llm.fleet.machines.spread')}</Text>
                    {Object.entries(spread).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                        <Badge key={m} variant="light" color="gray" size="sm" style={{ textTransform: 'none' }}>
                            {m} · {n} ({Math.round((100 * n) / active.length)} %)
                        </Badge>
                    ))}
                </Group>
            )}
            <Text size="xs" c="dimmed" mt="xs"><Trans i18nKey="llm.fleet.machines.assignment" components={{ 2: <Code /> }} /></Text>
            <Alert variant="light" color="gray" mt="sm" title={t('llm.fleet.machines.pathsTitle')}>
                <Text size="xs"><Trans i18nKey="llm.fleet.machines.paths" components={{ 1: <b /> }} /></Text>
            </Alert>

            <Table.ScrollContainer minWidth={1100} mt="md">
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            {['name', 'address', 'profile', 'model', 'lastSeen', 'scripts', 'state', 'inference'].map(c => (
                                <Table.Th key={c}>{t(`llm.fleet.col.${c}`)}</Table.Th>
                            ))}
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {peers.length === 0 && (
                            <Table.Tr><Table.Td colSpan={9}><Text size="sm" c="dimmed">{t('llm.fleet.machines.none')}</Text></Table.Td></Table.Tr>
                        )}
                        {peers.map(p => (
                            <Table.Tr key={p.serial}>
                                <Table.Td>
                                    <Text size="sm" ff="monospace">{p.name}</Text>
                                    <Text size="xs" c="dimmed">{p.serial}{p.os ? ` · ${p.os === 'darwin' ? 'macOS' : p.os}` : ''}</Text>
                                    {p.location && <Text size="xs" c="dimmed">{p.location}{p.operator ? ` · ${p.operator}` : ''}</Text>}
                                    {p.contact
                                        ? <Anchor size="xs" href={`mailto:${p.contact}`}>{p.contact}</Anchor>
                                        : !p.controls && <Text size="xs" c="orange">{t('llm.fleet.noContact')}</Text>}
                                </Table.Td>
                                <Table.Td>
                                    {p.transport === 'direct' ? (
                                        <Tooltip multiline w={300} withArrow label={t('llm.fleet.directTip')}>
                                            <div>
                                                <Text size="sm">{t('llm.fleet.direct')}</Text>
                                                <Text size="xs" c="dimmed" ff="monospace">{p.api_base}</Text>
                                            </div>
                                        </Tooltip>
                                    ) : <Text size="sm" ff="monospace">{p.address}</Text>}
                                    {p.primary_ip && (
                                        <Tooltip multiline w={300} withArrow label={t('llm.fleet.primaryIpTip')}>
                                            <Text size="xs" c="dimmed" ff="monospace">{p.primary_ip}</Text>
                                        </Tooltip>
                                    )}
                                </Table.Td>
                                <Table.Td>{p.profile} <Text span size="xs" c="dimmed">{p.ram_gb} GB</Text></Table.Td>
                                <Table.Td>
                                    {p.model_state === 'fremdverwaltet' ? (
                                        <Tooltip multiline w={300} withArrow label={t('llm.fleet.externalTip')}>
                                            <div>
                                                <Text size="sm" ff="monospace">{(p.models ?? []).join(', ') || '—'}</Text>
                                                <Text size="xs" c="dimmed">{t('llm.fleet.external')}</Text>
                                            </div>
                                        </Tooltip>
                                    ) : (
                                        <>
                                            <Text size="sm" ff="monospace">{p.model}</Text>
                                            {p.model_state === 'abweichend' && (
                                                <Tooltip multiline w={300} withArrow label={t('llm.fleet.differsTip', { model: p.model })}>
                                                    <Text size="xs" c="orange" ff="monospace">
                                                        {t('llm.fleet.has', { models: (p.models ?? []).join(', ') })}
                                                    </Text>
                                                </Tooltip>
                                            )}
                                        </>
                                    )}
                                    <Group gap={4}>
                                        {p.gate === 'always' && <Text size="xs" c="dimmed">{t('llm.fleet.dedicated')}</Text>}
                                        {p.enabled === false && <Text size="xs" c="orange">{t('llm.fleet.disabled')}</Text>}
                                    </Group>
                                </Table.Td>
                                <Table.Td>{p.last_seen ? formatDateTime(p.last_seen) : '—'}</Table.Td>
                                <Table.Td>
                                    {p.script_state
                                        ? <StateBadge table={SCRIPTS} value={p.script_state} group="scripts"
                                            tooltip={SCRIPTS[p.script_state] && t(`llm.fleet.scriptsTip.${SCRIPTS[p.script_state][0]}`)} />
                                        : <Text size="xs" c="dimmed">—</Text>}
                                    {p.pkg_version && <Text size="xs" c="dimmed" ff="monospace">{t('llm.fleet.pkg', { version: p.pkg_version })}</Text>}
                                    {p.canary && <Text size="xs" c="blue">{t('llm.fleet.canary')}</Text>}
                                </Table.Td>
                                <Table.Td><StateBadge table={STATE} value={p.state} group="state" tooltip={stateTip(p)} /></Table.Td>
                                <Table.Td><StateBadge table={INFERENCE} value={p.inference} group="inference" tooltip={infTip(p)} /></Table.Td>
                                <Table.Td align="right">
                                    <Group gap={4} justify="flex-end" wrap="nowrap">
                                        <Tooltip multiline w={300} withArrow label={t(p.blocked ? 'llm.fleet.unblockTip' : 'llm.fleet.blockTip')}>
                                            <Button size="xs" variant="subtle" loading={busy(p.serial)}
                                                onClick={() => act.mutate({ action: p.blocked ? 'unblock' : 'block', serial: p.serial })}>
                                                {t(p.blocked ? 'llm.fleet.unblock' : 'llm.fleet.block')}
                                            </Button>
                                        </Tooltip>
                                        <Tooltip multiline w={300} withArrow label={t('llm.fleet.forgetTip')}>
                                            <Button size="xs" variant="subtle" color="red" loading={busy(p.serial)} onClick={() => forget(p)}>
                                                {t('llm.fleet.forget')}
                                            </Button>
                                        </Tooltip>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );
}

// Joining a Linux machine: one command with the enrolment token, location and contact filled in.
function LinuxInstall({ f, email }) {
    const { t } = useTranslation();
    const peers = f.peers ?? [];
    // Prefilled with what the service already knows: the signed-in person as
    // contact and the most common location of the fleet. A placeholder address
    // used to be copied unchanged often enough to end up in the inventory.
    const [contact, setContact] = useState(email || '');
    const [location, setLocation] = useState(() => {
        const n = {};
        for (const p of peers) if (p.location) n[p.location] = (n[p.location] || 0) + 1;
        return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    });
    const install = f.enroll_host && f.enroll_token
        ? `curl -fsSL -H "Authorization: Bearer ${f.enroll_token}" \\\n`
        + `  https://${f.enroll_host}/scripts/dhbw-llm-agent.sh \\\n`
        + `  | sudo bash -s -- --token "${f.enroll_token}" \\\n`
        + `      --location ${JSON.stringify(location || 'DHBW Mannheim')} \\\n`
        + `      --contact ${contact || 'it@example.org'}`
        : null;

    if (!install) return null;
    return (
        <Paper p="lg" radius="md" withBorder>
            <Title order={4}>{t('llm.fleet.linux.title')}</Title>
            <Text size="xs" mt={4}><Trans i18nKey="llm.fleet.linux.hint" components={{ 1: <b /> }} /></Text>
            <Group gap="xs" mt="xs" align="flex-end" wrap="wrap">
                <TextInput size="xs" label={t('llm.fleet.profile.location')} placeholder="DHBW Mannheim"
                    style={{ flex: '1 1 200px' }} value={location} onChange={e => setLocation(e.currentTarget.value)} />
                <TextInput size="xs" label={t('llm.fleet.profile.contact')} style={{ flex: '1 1 240px' }}
                    value={contact} onChange={e => setContact(e.currentTarget.value)}
                    error={contact && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(contact) ? t('llm.fleet.linux.badContact') : null} />
            </Group>
            <CodeBlock language="bash" code={install} />
            <Text size="xs" c="dimmed" mt="xs"><Trans i18nKey="llm.fleet.linux.options" components={{ 1: <b />, 2: <Code /> }} /></Text>
            <Text size="xs" c="orange" mt="xs">{t('llm.fleet.linux.secret')}</Text>
        </Paper>
    );
}
