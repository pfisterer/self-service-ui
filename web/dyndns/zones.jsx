import { useState, useEffect, Fragment } from 'react';
import { Route, Switch, Link, useRoute, useLocation, Redirect } from 'wouter';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '/providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { ShowKeys } from '/dyndns/zones/keys.jsx';
import { ExternalDnsConfig } from '/dyndns/zones/external-dns.jsx';
import { DnsUpdateCommand } from '/dyndns/zones/dns-update-cmd.jsx';
import { DnsRecordsList } from '/dyndns/zones/dns-record-list.jsx';
import { TlsCertificates } from '/dyndns/zones/tls-certificates.jsx';
import { Container, Title, Paper, Stack, NavLink, Tabs, Button, Text, Loader, Alert, Group, TextInput } from '@mantine/core';
import { AlertCircle, Globe, CornerDownRight } from 'lucide-react';

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
    const [match, params] = useRoute("/zone/:name/*?");
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
                                    leftSection={<Globe size="16" />}
                                    active={activeZoneName === base.name}
                                />
                                {(subzonesByParent[base.name] || []).map(sz => (
                                    <NavLink
                                        key={sz.name}
                                        component={Link}
                                        to={"/zone/" + sz.name}
                                        label={sz.name}
                                        leftSection={<CornerDownRight size="14" />}
                                        active={activeZoneName === sz.name}
                                        style={{ paddingLeft: `${12 + subzoneDepth(sz.name, base.name) * 22}px` }}
                                    />
                                ))}
                                {base.allow_subdomains && base.exists && (
                                    <AddSubzoneRow parent={base.name} onCreated={reload} />
                                )}
                            </Fragment>
                        ))}
                        {zones.length === 0 && (
                            <Text p="md" c="dimmed">No zones available.</Text>
                        )}
                    </Stack>
                </Paper>

                <Switch>
                    <Route path="/zone/:name" nest>
                        {param => {
            const zone = zones.find(z => z.name === param.name)
            return zone ?
                <AvailableDomain zone={zone} onChange={() => setReloadTrigger(!reloadTrigger)} /> :
                <RouteNotFound />
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
// Add Subzone Row — create a delegated subzone under a parent that allows it
// ----------------------------------------
function AddSubzoneRow({ parent, onCreated }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [label, setLabel] = useState('');
    const [loading, setLoading] = useState(false);

    async function add() {
        const sub = label.trim().replace(/\.+$/, '');
        if (!sub) return;
        setLoading(true);
        const res = await sdk.createZone({ path: { zone: `${sub}.${parent}` }, client });
        const err = sdkError(res) ?? (res.response.status !== 201 ? res.response.statusText : null);
        if (err) { showError(err); } else { setLabel(''); onCreated(); }
        setLoading(false);
    }

    return (
        <Group gap="xs" pl="md" py="6" wrap="nowrap" align="flex-end">
            <TextInput
                size="xs"
                placeholder="new-subzone"
                value={label}
                onChange={e => setLabel(e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') add(); }}
                style={{ width: 180 }}
            />
            <Text size="xs" c="dimmed">.{parent}</Text>
            <Button size="xs" variant="light" onClick={add} loading={loading} disabled={!label.trim()}>+ Subzone</Button>
        </Group>
    );
}

// ----------------------------------------
// Available Domain List
// ----------------------------------------
function AvailableDomain({ zone, onChange }) {
    let response;

    if (zone.already_taken_by_someone_else) {
        response = (<Alert icon={<AlertCircle size="16" />} color="red">This zone is already taken by someone else.</Alert>)
    } else if (zone.exists) {
        response = (<ActiveDomain zone={zone.name} onChange={onChange} />)
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
// Active Domain Tabs
// ----------------------------------------
function ActiveDomain({ zone: zoneName, onChange }) {
    const [zone, setZone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [message, setMessage] = useState("Loading zone details...");
    const [currentLocation, navigate] = useLocation()
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();

    const tabs = [
        { name: "Manage", path: "/" },
        { name: "Keys", path: "/keys" },
        { name: "DNS Update Command", path: "/update" },
        { name: "External DNS Config", path: "/config" },
        { name: "TLS-Certificates", path: "/tls" }
    ];

    // Fetch zone data
    useEffect(() => {
        (async () => {
            setLoading(true);
            setLoadFailed(false);
            const res = await sdk.getZone({ path: { zone: zoneName }, client });
            const err = sdkError(res);
            if (err) { showError(err); setLoadFailed(true); }
            else if (!res.data) { showError(`Zone ${zoneName} not found`); setLoadFailed(true); }
            else { setZone(res.data); }
            setLoading(false);
        })();
    }, [client, zoneName, currentLocation]);

    async function handleDeleteClick() {
        setLoading(true);
        setMessage("Deleting zone...");
        const res = await sdk.deleteZone({ path: { zone: zone.zoneData.zone }, client });
        const err = sdkError(res) ?? (res.response.status !== 204 ? res.response.statusText : null);
        if (err) { showError(err); setLoading(false); } else { onChange(); }
    }

    if (loading) return (<Delayed><Text>{message}</Text></Delayed>);
    if (loadFailed) return (<Alert icon={<AlertCircle size="16" />} color="red">Failed to load zone. Check the error dialog for details.</Alert>);
    if (!zone || !zone.zoneData) return (<Alert icon={<AlertCircle size="16" />} color="red">Zone data corrupted.</Alert>);

    const activeTab = tabs.find(t => currentLocation === t.path)?.name || "Manage";

    return (
        <Stack gap="md">
            <Paper p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                <Group justify="space-between" align="center">
                    <Text fw={600}>Zone: {zone.zoneData.zone}</Text>
                    <Button color="red" size="sm" onClick={handleDeleteClick}>Delete Zone</Button>
                </Group>
            </Paper>

            <Tabs value={activeTab} onChange={(val) => navigate(tabs.find(t => t.name === val)?.path || '/')}>
                <Tabs.List>
                    {tabs.map(({ name }) => <Tabs.Tab key={name} value={name}>{name}</Tabs.Tab>)}
                </Tabs.List>
            </Tabs>

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
        </Stack>
    );
}

function RouteNotFound() {
    return (
        <Container py="md">
            <Alert icon={<AlertCircle size="16" />} title="❌ Zone Not Found" color="red">
                The zone specified in the URL could not be located in your account.
            </Alert>
        </Container>
    )
}
