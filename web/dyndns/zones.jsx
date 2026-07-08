import { useState, useEffect, Fragment } from 'react';
import { Route, Switch, Link, useRoute, useLocation, Redirect } from 'wouter';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '/providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useAuth } from '/providers/auth.jsx';
import { ShowKeys } from '/dyndns/zones/keys.jsx';
import { ExternalDnsConfig } from '/dyndns/zones/external-dns.jsx';
import { DnsUpdateCommand } from '/dyndns/zones/dns-update-cmd.jsx';
import { DnsRecordsList } from '/dyndns/zones/dns-record-list.jsx';
import { TlsCertificates } from '/dyndns/zones/tls-certificates.jsx';
import { Container, Title, Paper, Stack, NavLink, Tabs, Button, Text, Loader, Alert, Group, TextInput, Modal, Box, Flex, Tooltip } from '@mantine/core';
import { AlertCircle, Globe, CornerDownRight, Plus, Users, RefreshCw, LogOut } from 'lucide-react';
import { subzoneLabelError } from '/helper/dns-validation.js';

const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

// ----------------------------------------
// DynDnsZones
// ----------------------------------------
export function DynDnsZones() {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadTrigger, setReloadTrigger] = useState(true);
    // Parent zone whose "create subzone" modal is currently open (null = closed).
    const [subzoneParent, setSubzoneParent] = useState(null);
    const [match, params] = useRoute("/zone/:name/*?");
    // navigate() here is relative to this component's router base (/dyndns/zones),
    // so navigate('/') returns to the zone overview.
    const [, navigate] = useLocation();
    const activeZoneName = match ? params.name : null;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadFailed(false);

            const res = await sdk.listZones({ client });
            const err = sdkError(res);
            if (!cancelled) {
                if (err) { showError(err); setLoadFailed(true); }
                else if (!res.data?.zones) { showError("Unable to load zones"); setLoadFailed(true); }
                else { setZones(res.data.zones); }
                setLoading(false);
            }
        })();

        //Add cleanup function to prevent state updates after unmount
        return () => { cancelled = true; };
    }, [client, reloadTrigger]);

    if (loading) return (<Delayed><Loader size="lg" /></Delayed>);
    if (loadFailed) return (<Button onClick={() => setReloadTrigger(!reloadTrigger)}>Retry Load</Button>);

    // Group zones: policy base zones (no parent) plus the user's created subzones
    // grouped under their parent base zone (shown indented by label depth).
    const baseZones = zones.filter(z => !z.parent);
    const subzonesByParent = {};
    for (const z of zones) {
        if (z.parent) (subzonesByParent[z.parent] ??= []).push(z);
    }
    for (const k in subzonesByParent) subzonesByParent[k].sort((a, b) => a.name.localeCompare(b.name));
    const reload = () => setReloadTrigger(t => !t);

    return (
        <Container size="xl" py="md">
            <Stack gap="lg">
                <Title order={2}>Zone Management</Title>

                <Paper shadow="sm" radius="md" withBorder>
                    <Paper p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                        <Text fw={600}>Available Zones ({zones.length})</Text>
                    </Paper>

                    <Stack gap={0}>
                        {baseZones.map(base => (
                            <Fragment key={base.name}>
                                <NavLink
                                    component={Link}
                                    to={"/zone/" + base.name}
                                    label={base.name}
                                    description={base.owners?.length > 1 ? `Shared with ${base.owners.length} owners: ${base.owners.join(', ')}` : undefined}
                                    leftSection={<Globe size="16" />}
                                    active={activeZoneName === base.name}
                                    rightSection={base.allow_subdomains && base.exists ? (
                                        <Button
                                            size="compact-xs"
                                            variant="light"
                                            leftSection={<Plus size="12" />}
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubzoneParent(base.name); }}
                                        >
                                            Subzone
                                        </Button>
                                    ) : null}
                                />
                                {(subzonesByParent[base.name] || []).map(sz => (
                                    <NavLink
                                        key={sz.name}
                                        component={Link}
                                        to={"/zone/" + sz.name}
                                        label={sz.name}
                                        description={sz.owners?.length > 1 ? `Shared with ${sz.owners.length} owners: ${sz.owners.join(', ')}` : undefined}
                                        leftSection={<CornerDownRight size="14" />}
                                        active={activeZoneName === sz.name}
                                        style={{ paddingLeft: `${12 + subzoneDepth(sz.name, base.name) * 22}px` }}
                                        rightSection={sz.allow_subdomains && sz.exists ? (
                                            <Button
                                                size="compact-xs"
                                                variant="light"
                                                leftSection={<Plus size="12" />}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubzoneParent(sz.name); }}
                                            >
                                                Subzone
                                            </Button>
                                        ) : null}
                                    />
                                ))}
                            </Fragment>
                        ))}
                        {zones.length === 0 && (
                            <Text p="md" c="dimmed">No zones available.</Text>
                        )}
                    </Stack>
                </Paper>

                <SubzoneModal
                    parent={subzoneParent}
                    onClose={() => setSubzoneParent(null)}
                    onCreated={() => { setSubzoneParent(null); reload(); }}
                />

                <Switch>
                    <Route path="/zone/:name" nest>
                        {param => {
            const zone = zones.find(z => z.name === param.name)
            // Unknown zone in the URL (e.g. after deleting/leaving it, or a stale
            // link) -> send the user back to the zone overview instead of a dead end.
            return zone ?
                <AvailableDomain
                    zone={zone}
                    onChange={() => setReloadTrigger(!reloadTrigger)}
                    onDeleted={() => { navigate('/'); setReloadTrigger(t => !t); }}
                /> :
                <Redirect to="/" replace />
        }}
                    </Route>

                    <Route path="/">
                        {() => zones.length > 0 ? (
                            <Redirect to={`/zone/${zones[0].name}`} replace />
                        ) : (
                            <Paper p="xl" withBorder>
                                <Text ta="center" size="lg">⬆️ Select a zone above to manage its DNS records.</Text>
                            </Paper>
                        )}
                    </Route>
                </Switch>
            </Stack>
        </Container>
    );
}

// Number of labels a subzone has beyond its base zone (used for indentation).
function subzoneDepth(name, base) {
    return name.split('.').length - base.split('.').length;
}

// ----------------------------------------
// Subzone Modal — create a delegated subzone under a parent that allows it.
// Opened by the "Subzone" button on a zone row; `parent` null = closed.
// ----------------------------------------
function SubzoneModal({ parent, onClose, onCreated }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [label, setLabel] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset the field whenever a different parent opens the modal.
    useEffect(() => { setLabel(''); }, [parent]);

    const validationError = subzoneLabelError(label, parent);
    const valid = validationError === null;

    async function add() {
        if (!valid) return;
        const sub = label.trim().replace(/\.+$/, '');
        setLoading(true);
        const res = await sdk.createZone({ path: { zone: `${sub}.${parent}` }, client });
        const err = sdkError(res) ?? (res.response.status !== 201 ? res.response.statusText : null);
        setLoading(false);
        if (err) { showError(err); } else { onCreated(); }
    }

    const preview = label.trim().replace(/\.+$/, '');
    return (
        <Modal opened={!!parent} onClose={onClose} title="Create subzone" centered size="lg">
            <Stack gap="lg" p="xs">
                <Text size="sm" c="dimmed">
                    Create a delegated subzone under <code>{parent}</code>.
                </Text>
                <TextInput
                    label="Subzone label"
                    placeholder="new-subzone"
                    value={label}
                    onChange={e => setLabel(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') add(); }}
                    error={label.trim() ? validationError : null}
                    size="md"
                    data-autofocus
                />
                <Text size="sm" c="dimmed">
                    Full name:{' '}
                    {valid
                        ? <code>{preview}.{parent}</code>
                        : <Text span c="dimmed">…<code>.{parent}</code></Text>}
                </Text>
                <Group justify="flex-end" gap="sm" mt="xs">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button onClick={add} loading={loading} disabled={!valid} leftSection={<Plus size="16" />}>
                        Create subzone
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

// ----------------------------------------
// Available Domain List
// ----------------------------------------
function AvailableDomain({ zone, onChange, onDeleted }) {
    let response;

    if (zone.already_taken_by_someone_else) {
        response = (<Alert icon={<AlertCircle size="16" />} color="red">This zone is already taken by someone else.</Alert>)
    } else if (zone.exists) {
        response = (<ActiveDomain zone={zone.name} onChange={onChange} onDeleted={onDeleted} />)
    } else if (zone.can_join) {
        response = (<Paper p="md"><JoinZone zone={zone.name} owners={zone.owners} onChange={onChange} /></Paper>)
    } else {
        response = (<Paper p="md"><ActivateZone zone={zone.name} onChange={onChange} /></Paper>)
    }

    return (
        <Paper shadow="sm" radius="md" withBorder>
            {response}
        </Paper>
    );
}

// ----------------------------------------
// Activate Zone
// ----------------------------------------
function ActivateZone({ zone, onChange }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(false);

    async function activate() {
        setLoading(true);
        const res = await sdk.createZone({ path: { zone }, client });
        const err = sdkError(res) ?? (res.response.status !== 201 ? res.response.statusText : null);
        if (err) { showError(err); } else { onChange(zone); }
        setLoading(false);
    }

    if (loading) return (<Delayed><Loader size="sm" /></Delayed>);

    return (<Button onClick={activate}>Activate</Button>);
}

// ----------------------------------------
// Join Zone — explicitly become a co-owner of an existing shared zone.
// ----------------------------------------
function JoinZone({ zone, owners, onChange }) {
    const { client } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(false);

    async function join() {
        setLoading(true);
        const res = await client.post({ url: '/v1/zones/{zone}/join', path: { zone } });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? (res.data?.error || res.response.statusText) : null);
        if (err) { showError(err); } else { onChange(zone); }
        setLoading(false);
    }

    if (loading) return (<Delayed><Loader size="sm" /></Delayed>);

    return (
        <Stack gap="sm">
            <Text>
                This is a shared zone{owners?.length ? <> currently managed by <b>{owners.join(', ')}</b></> : ''}.
                Join it to co-manage its DNS records — you'll get your own TSIG key.
            </Text>
            <Group>
                <Button leftSection={<Users size={16} />} onClick={join}>Join zone</Button>
            </Group>
        </Stack>
    );
}


// ----------------------------------------
// Active Domain Tabs
// ----------------------------------------
function ActiveDomain({ zone: zoneName, onChange, onDeleted }) {
    const [zone, setZone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [message, setMessage] = useState("Loading zone details...");
    const [currentLocation, navigate] = useLocation()
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const { user } = useAuth();
    const [shareOpen, setShareOpen] = useState(false);

    const tabs = [
        { name: "Manage", path: "/" },
        { name: "Keys", path: "/keys" },
        { name: "DNS Update Command", path: "/update" },
        { name: "External DNS Config", path: "/config" },
        { name: "TLS-Certificates", path: "/tls" }
    ];

    // Fetch zone data. Depend only on the client and the zone — NOT on
    // currentLocation. The tabs are nested routes, so including currentLocation
    // made every tab click refetch the whole zone and replace the content with
    // a loader, collapsing the layout (the footer visibly jumped). All tab
    // contents render from the already-loaded `zone` (records load themselves),
    // so switching tabs needs no refetch.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadFailed(false);
            const res = await sdk.getZone({ path: { zone: zoneName }, client });
            if (cancelled) return;
            const err = sdkError(res);
            if (err) { showError(err); setLoadFailed(true); }
            else if (!res.data) { showError(`Zone ${zoneName} not found`); setLoadFailed(true); }
            else { setZone(res.data); }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [client, zoneName]);

    // Re-fetch the zone (e.g. after owners changed) to refresh the header.
    async function refreshZone() {
        const res = await sdk.getZone({ path: { zone: zoneName }, client });
        if (!sdkError(res) && res.data) setZone(res.data);
    }

    async function handleDeleteClick() {
        const ok = await confirm({
            title: '⚠️ Delete zone?',
            confirmLabel: 'Delete zone',
            message: (<Text size="sm">This permanently deletes the zone <b>{zone.zoneData.zone}</b> and all of its DNS records{zone.owners?.length > 1 ? <> for <b>all {zone.owners.length} owners</b></> : ''}. This cannot be undone.{zone.owners?.length > 1 ? ' To remove only yourself, use "Leave zone" instead.' : ''}</Text>),
        });
        if (!ok) return;
        setLoading(true);
        setMessage("Deleting zone...");
        const res = await sdk.deleteZone({ path: { zone: zone.zoneData.zone }, client });
        const err = sdkError(res) ?? (res.response.status !== 204 ? res.response.statusText : null);
        // On success leave the (now-gone) zone URL and return to the overview,
        // otherwise the nested route renders "Zone Not Found". Fall back to
        // onChange if no onDeleted handler was provided.
        if (err) { showError(err); setLoading(false); } else { (onDeleted || onChange)(); }
    }

    async function handleRotateKeys() {
        const ok = await confirm({
            title: '⚠️ Rotate keys?',
            confirmLabel: 'Rotate keys',
            message: 'This regenerates the TSIG key of every owner of this zone. Consider it if a key was used in a shared/untrusted environment or may be compromised. All owners (external-dns secrets, scripts, nsupdate) must re-fetch their key afterwards.',
        });
        if (!ok) return;
        const res = await client.post({ url: '/v1/zones/{zone}/keys/rotate', path: { zone: zone.zoneData.zone } });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? (res.data?.error || res.response.statusText) : null);
        if (err) { showError(err); } else { refreshZone(); }
    }

    // Co-owner leaving a shared zone: remove only themselves (their key), the zone
    // and other owners are unaffected.
    async function handleLeave() {
        const me = (user?.profile?.email || '').toLowerCase();
        const ok = await confirm({
            title: 'Leave this zone?',
            confirmLabel: 'Leave zone',
            message: (<Text size="sm">Remove yourself as an owner of <b>{zone.zoneData.zone}</b>? Your TSIG key is deleted and you lose access immediately. The zone and its other owners are unaffected.</Text>),
        });
        if (!ok) return;
        const res = await client.delete({ url: '/v1/zones/{zone}/owners/{owner}', path: { zone: zone.zoneData.zone, owner: me } });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? (res.data?.error || res.response.statusText) : null);
        if (err) { showError(err); } else { (onDeleted || onChange)(); }
    }

    if (loading) return (<Delayed><Text>{message}</Text></Delayed>);
    if (loadFailed) return (<Alert icon={<AlertCircle size="16" />} color="red">Failed to load zone. Check the error dialog for details.</Alert>);
    if (!zone || !zone.zoneData) return (<Alert icon={<AlertCircle size="16" />} color="red">Zone data corrupted.</Alert>);

    const activeTab = tabs.find(t => currentLocation === t.path)?.name || "Manage";

    return (
        <Stack gap="md">
            <Paper p="md" withBorder bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                {/* Responsive: stack the title over the actions on mobile, row on >=sm.
                    Long zone/owner names wrap instead of overflowing. */}
                <Flex direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ base: 'stretch', sm: 'center' }} gap="sm">
                    <div style={{ minWidth: 0 }}>
                        <Text fw={600} style={{ wordBreak: 'break-word' }}>Zone: {zone.zoneData.zone}</Text>
                        {zone.owners?.length > 0 && (
                            <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                                Managed by: {zone.owners.join(', ')}
                            </Text>
                        )}
                    </div>
                    <Group gap="sm" wrap="wrap">
                        {zone.sharing_allowed && (
                            <Button variant="light" size="sm" leftSection={<Users size={16} />} onClick={() => setShareOpen(true)}>
                                Share zone
                            </Button>
                        )}
                        <Tooltip label="Consider rotating if a key was used in a shared environment or may be compromised — regenerates every owner's key.">
                            <Button variant="light" color="orange" size="sm" leftSection={<RefreshCw size={16} />} onClick={handleRotateKeys}>
                                Rotate keys
                            </Button>
                        </Tooltip>
                        {zone.owners?.length > 1 && (
                            <Tooltip label="Remove only yourself as an owner — the zone and the other owners stay.">
                                <Button variant="light" color="red" size="sm" leftSection={<LogOut size={16} />} onClick={handleLeave}>
                                    Leave zone
                                </Button>
                            </Tooltip>
                        )}
                        <Button color="red" size="sm" onClick={handleDeleteClick}>Delete Zone</Button>
                    </Group>
                </Flex>
            </Paper>

            <ShareZoneModal
                opened={shareOpen}
                onClose={() => setShareOpen(false)}
                zoneName={zone.zoneData.zone}
                owners={zone.owners || []}
                onChanged={() => { refreshZone(); onChange?.(); }}
            />

            <Tabs value={activeTab} onChange={(val) => navigate(tabs.find(t => t.name === val)?.path || '/')}>
                <Tabs.List>
                    {tabs.map(({ name }) => <Tabs.Tab key={name} value={name}>{name}</Tabs.Tab>)}
                </Tabs.List>
            </Tabs>

            {/* Consistent padding for every tab's content (each tab renders a
                bare <Stack>, so the horizontal/bottom padding lives here once). */}
            <Box px="md" pb="md">
                {activeTab === "Manage" && (
                    <DnsRecordsList zone={zone.zoneData.zone} tsigKey={zone.zoneData.zone_keys?.[0]} />
                )}

                {activeTab === "Keys" && (
                    <ShowKeys zone={zone.zoneData} />
                )}

                {activeTab === "DNS Update Command" && (
                    <DnsUpdateCommand zone={zone.zoneData} />
                )}

                {activeTab === "External DNS Config" && (
                    <ExternalDnsConfig externalDnsValuesYaml={zone.externalDnsValuesYaml} externalDnsSecretYaml={zone.externalDnsSecretYaml} zone={zone.zoneData} />
                )}

                {activeTab === "TLS-Certificates" && (
                    <TlsCertificates zone={zone.zoneData} />
                )}
            </Box>
        </Stack>
    );
}

// ----------------------------------------
// Share Zone Modal — manage co-owners (equal rights) and rotate keys.
// Each owner has their own TSIG key; removing an owner deletes only their key.
// ----------------------------------------
function ShareZoneModal({ opened, onClose, zoneName, owners: initialOwners, onChanged }) {
    const { client } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const { user } = useAuth();
    const [owners, setOwners] = useState(initialOwners || []);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { setOwners(initialOwners || []); }, [initialOwners, opened]);

    const me = (user?.profile?.email || '').toLowerCase();
    const resError = (res) => sdkError(res) ?? (res.response && res.response.status >= 400 ? (res.data?.error || res.response.statusText) : null);

    async function addOwner() {
        const e = email.trim().toLowerCase();
        if (!e) return;
        setBusy(true);
        const res = await client.post({ url: '/v1/zones/{zone}/owners', path: { zone: zoneName }, body: { email: e } });
        const err = resError(res);
        if (err) { showError(err); } else { setOwners(res.data?.owners || owners); setEmail(''); onChanged?.(); }
        setBusy(false);
    }

    async function removeOwner(owner) {
        const ok = await confirm({
            title: 'Remove owner?',
            confirmLabel: 'Remove owner',
            message: `Remove ${owner} from this zone? Their TSIG key is deleted and they lose access immediately. Other owners are unaffected.`,
        });
        if (!ok) return;
        setBusy(true);
        const res = await client.delete({ url: '/v1/zones/{zone}/owners/{owner}', path: { zone: zoneName, owner } });
        const err = resError(res);
        if (err) { showError(err); } else { setOwners(res.data?.owners || owners.filter(o => o !== owner)); onChanged?.(); }
        setBusy(false);
    }

    return (
        <Modal opened={opened} onClose={onClose} title={`Share ${zoneName}`} centered size="lg">
            <Stack gap="lg">
                <Text size="sm" c="dimmed">
                    Everyone listed here manages this zone with equal rights. Each owner gets their own TSIG key;
                    removing an owner deletes only their key, so the others keep working.
                </Text>

                <Stack gap="xs">
                    {owners.map(o => (
                        <Group key={o} justify="space-between" wrap="nowrap">
                            <Text size="sm">{o}{o === me && <Text span c="dimmed"> (you)</Text>}</Text>
                            <Button size="compact-xs" color="red" variant="light" disabled={busy || owners.length <= 1}
                                onClick={() => removeOwner(o)} title={owners.length <= 1 ? 'The last owner cannot be removed — delete the zone instead.' : undefined}>
                                Remove
                            </Button>
                        </Group>
                    ))}
                    {owners.length === 0 && <Text size="sm" c="dimmed">No owners.</Text>}
                </Stack>

                <Group gap="xs" align="flex-end">
                    <TextInput style={{ flex: 1 }} label="Add owner (email)" placeholder="user@dhbw.de" value={email}
                        onChange={e => setEmail(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') addOwner(); }} />
                    <Button onClick={addOwner} loading={busy} disabled={!email.trim()} leftSection={<Plus size={16} />}>Add</Button>
                </Group>

                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={onClose}>Close</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
