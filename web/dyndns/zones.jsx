import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Route, Switch, useRoute, useLocation, Redirect } from 'wouter';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useAuth } from '/providers/auth.jsx';
import { ShowKeys } from '/dyndns/zones/keys.jsx';
import { DynamicDnsKubernetes } from '/dyndns/zones/dynamic-dns-kubernetes.jsx';
import { DynamicDns } from '/dyndns/zones/dynamic-dns.jsx';
import { DnsRecordsList } from '/dyndns/zones/dns-record-list.jsx';
import { TlsCertificates } from '/dyndns/zones/tls-certificates.jsx';
import { Title, Paper, Stack, Tabs, Button, Text, Alert, Group, TextInput, Modal, Box, Tooltip, Badge, ActionIcon, VisuallyHidden } from '@mantine/core';
import { AlertCircle, Plus, Users, RefreshCw, LogOut } from 'lucide-react';
import { subzoneLabelError, wildcardCnRemaining, WILDCARD_CN_MAX } from '/helper/dns-validation.js';
import { CopyableText } from '/helper/copyable-text.jsx';
import { MasterDetail } from '/helper/master-detail.jsx';
import { NavTree, TreeFilter, useTreeExpansion } from '/helper/tree.jsx';
import { useZoneEvents, ZoneEventIndicator, ZoneEventsBanner } from '/dyndns/zones/zone-events-banner.jsx';
import { defaultZone, sharedOwners, zoneMatches, zoneRowId, zoneTree } from '/dyndns/zone-tree.js';
import { zoneAuthority } from '/dyndns/zone-authority.js';
import { useDnsMeQuery } from '/dyndns/use-dns-me.jsx';

// From this many zones on, a filter box stands above the tree.
const FILTER_FROM = 6;


// ----------------------------------------
// DynDnsZones — the zones as a tree on the left (NavTree, helper/tree.jsx), the selected one on the right (helper/master-detail.jsx). The selection is the URL (/zone/<name>/<tab>), so a reload and a link keep it; without one the page opens on the person's own base zone.
// ----------------------------------------
export function DynDnsZones() {
    const { t } = useTranslation();
    const api = useZonesApi();
    // Parent zone whose "create subzone" modal is currently open (null = closed).
    const [subzoneParent, setSubzoneParent] = useState(null);
    const [filter, setFilter] = useState('');
    const [match, params] = useRoute("/zone/:name/*?");
    // navigate() here is relative to this component's router base (/dyndns/zones),
    // so navigate('/') returns to the zone overview.
    const [, navigate] = useLocation();
    const activeZoneName = match ? params.name : null;
    const zonesQuery = useQuery({
        queryKey: dyndnsKeys.zones(),
        queryFn: () => api.listZones(),
        enabled: !!api,
    });

    // Problems the platform observed with the caller's zones — best-effort
    // context for the list (small indicator per affected zone).
    const eventsByZone = useZoneEvents();

    const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);
    // The tree (dyndns/zone-tree.js): a caption per domain the zones were given out of (users.dhbw.site, dhbw.cloud), below it the zones with their subzones, one line each: the part of the name below the caption or the zone above, the full name as tooltip. No signs but the one for shared, always in the same column at the end, so the right edge stays calm; a zone not in use is only dimmed (and says so in its tooltip and to a screen reader).
    const nodes = useMemo(() => {
        const { sections, parent } = zoneTree(zones);
        const toNode = (r) => {
            const z = r.zone;
            // Shared: on the root zone, on a subzone only where its owners differ from the zone above.
            const shared = sharedOwners(r, parent(r));
            const owners = shared ? t('dyndns.zoneList.sharedWith', { owners: shared.join(', ') }) : null;
            return {
                id: r.id, name: r.name, zone: z, label: r.label,
                title: z.exists ? r.name : `${r.name} (${t('dyndns.zoneList.inactive')})`,
                muted: !z.exists,
                badge: (
                    <>
                        <ZoneEventIndicator events={eventsByZone[z.name]} />
                        {!z.exists && <VisuallyHidden>{t('dyndns.zoneList.inactive')}</VisuallyHidden>}
                        {owners && (
                            <Tooltip multiline maw={320} label={owners}>
                                <Box component="span" role="img" aria-label={owners} c="dimmed" w={14} style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                    <Users size={12} aria-hidden />
                                </Box>
                            </Tooltip>
                        )}
                    </>
                ),
                children: r.children.map(toNode),
            };
        };
        return sections.map(s => ({ id: s.id, label: s.soa, section: true, caption: true, title: t('dyndns.zoneList.headingTitle', { domain: s.soa }), children: s.roots.map(toNode) }));
    }, [zones, eventsByZone, t]);
    // Everything starts open (a person has a handful of zones, rarely a deep tree); what is stored per browser are the branches closed by hand. A zone selected by link or reload below a closed branch or caption has them opened by the tree, once per zone selected.
    const expansion = useTreeExpansion({ storageKey: 'self-service.dyndns-zones.collapsed', nodes, defaultOpen: true });

    if (!api || zonesQuery.isPending) return <Loading />;
    if (zonesQuery.isError) return <LoadError query={zonesQuery} title={t('dyndns.zoneList.loadError')} />;

    const canAddSubzone = (z) => z.allow_subdomains && z.exists;
    const q = filter.trim();

    const tree = zones.length === 0
        ? <Text p="xs" c="dimmed">{t('dyndns.zoneList.empty')}</Text>
        : (
            <NavTree label={t('dyndns.zoneList.title')} nodes={nodes} expansion={expansion} withLines
                selectedId={activeZoneName ? zoneRowId(activeZoneName) : null} onSelect={n => navigate(`/zone/${n.zone.name}`)}
                query={q} matches={(n, query) => !n.section && zoneMatches(n, query)} noMatch={t('dyndns.zoneList.noMatch')} />
        );

    return (
        <MasterDetail
            header={<Title order={2} mb="md">{t('dyndns.zoneList.title')}</Title>}
            filter={zones.length >= FILTER_FROM ? <TreeFilter value={filter} onChange={setFilter} label={t('dyndns.zoneList.filter')} clearLabel={t('dyndns.zoneList.clearFilter')}
                expansion={expansion} /> : null}
            master={tree}
            // Zone names are short in the tree, and the DNS records beside it want the room.
            masterSpan={{ base: 12, md: 4, lg: 3 }}
            scrollKey={activeZoneName}
            detail={(
                <>
                    <SubzoneModal
                        // Remounting per parent resets the field: React's own way of
                        // saying "this is a different form now", instead of an effect
                        // that writes state on every open.
                        key={subzoneParent}
                        parent={subzoneParent}
                        onClose={() => setSubzoneParent(null)}
                        onCreated={() => setSubzoneParent(null)}
                    />
                    <Switch>
                        <Route path="/zone/:name" nest>
                            {param => {
                                const zone = zones.find(z => z.name === param.name);
                                // Unknown zone in the URL (e.g. after deleting/leaving it, or a stale
                                // link) -> send the user back to the zone overview instead of a dead end.
                                return zone ?
                                    <AvailableDomain
                                        key={zone.name}
                                        zone={zone}
                                        onDeleted={() => navigate('/')}
                                        onAddSubzone={canAddSubzone(zone) ? () => setSubzoneParent(zone.name) : null}
                                    /> :
                                    <Redirect to="/" replace />;
                            }}
                        </Route>

                        <Route path="/">
                            {() => zones.length > 0 ? (
                                <Redirect to={`/zone/${defaultZone(zones).name}`} replace />
                            ) : (
                                <Paper p="xl" withBorder>
                                    <Text ta="center" size="lg">{t('dyndns.zoneList.empty')}</Text>
                                </Paper>
                            )}
                        </Route>
                    </Switch>
                </>
            )} />
    );
}


// ----------------------------------------
// Subzone Modal — create a delegated subzone under a parent that allows it.
// Opened by the "Subzone" button on a zone row; `parent` null = closed.
// ----------------------------------------
export function SubzoneModal({ parent, onClose, onCreated }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const [label, setLabel] = useState('');

    const validationError = subzoneLabelError(label, parent, t);
    const valid = validationError === null;

    const createZone = useApiMutation({
        mutationFn: (zone) => api.createZone(zone),
        invalidates: [dyndnsKeys.zones()],
        onSuccess: () => onCreated(),
    });

    function add() {
        if (!valid) return;
        const sub = label.trim().replace(/\.+$/, '');
        createZone.mutate(`${sub}.${parent}`);
    }

    const preview = label.trim().replace(/\.+$/, '');
    // Room left for `*.<subzone>` as a certificate's commonName, live while typing: the fixed parent differs per person, so a fixed maximum for the label would say nothing. Over the limit is a warning only, the zone itself works in DNS.
    const remaining = wildcardCnRemaining(label, parent);
    const wildcardZone = preview ? `${preview}.${parent}` : `….${parent}`;
    return (
        <Modal opened={!!parent} onClose={onClose} title={t('dyndns.subzone.title')} centered size="lg">
            <Stack gap="lg" p="xs">
                <Text size="sm" c="dimmed">
                    <Trans i18nKey="dyndns.subzone.intro" values={{ parent }} components={{ 1: <code /> }} />
                </Text>
                <TextInput
                    label={t('dyndns.subzone.labelField')}
                    placeholder="new-subzone"
                    value={label}
                    onChange={e => setLabel(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') add(); }}
                    error={label.trim() ? validationError : null}
                    size="md"
                    data-autofocus
                />
                {remaining >= 0 ? (
                    <Text size="xs" c={remaining < 10 ? 'orange' : 'dimmed'} data-testid="wildcard-remaining">
                        {t('dyndns.subzone.wildcardRemaining', { count: remaining, zone: wildcardZone, max: WILDCARD_CN_MAX })}
                    </Text>
                ) : (
                    <Alert color="orange" icon={<AlertCircle size={16} />} data-testid="wildcard-too-long">
                        {t('dyndns.subzone.wildcardTooLong', { count: -remaining, zone: wildcardZone, max: WILDCARD_CN_MAX })}
                    </Alert>
                )}
                <Text size="sm" c="dimmed">
                    {t('dyndns.subzone.fullNameLabel')}{' '}
                    {valid
                        ? <code>{preview}.{parent}</code>
                        : <Text span c="dimmed">…<code>.{parent}</code></Text>}
                </Text>
                <Group justify="flex-end" gap="sm" mt="xs">
                    <Button variant="default" onClick={onClose}>{t('dyndns.actions.cancel')}</Button>
                    <Button onClick={add} loading={createZone.isPending} disabled={!valid} leftSection={<Plus size="16" />}>
                        {t('dyndns.subzone.submit')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

// ----------------------------------------
// Available Domain List
// ----------------------------------------
function AvailableDomain({ zone, onDeleted, onAddSubzone }) {
    const { t } = useTranslation();
    let response;

    // No onChange prop any more: activating, joining and leaving all invalidate
    // the zone list through their mutation, so nothing has to be told to reload.
    if (zone.exists && !zone.already_taken_by_someone_else) {
        response = (<ActiveDomain zone={zone.name} onDeleted={onDeleted} onAddSubzone={onAddSubzone} />)
    } else {
        // A zone not (yet) the caller's: its name on top, then what can be done with it.
        let body;
        if (zone.already_taken_by_someone_else) {
            body = (<Alert icon={<AlertCircle size="16" />} color="red">{t('dyndns.zoneDetail.takenByOther')}</Alert>)
        } else if (zone.can_join) {
            body = (<JoinZone zone={zone.name} owners={zone.owners} />)
        } else {
            body = (<ActivateZone zone={zone.name} />)
        }
        response = (
            <Stack gap="md" p="md">
                <ZoneName name={zone.name} />
                {body}
            </Stack>
        );
    }

    return (
        <Paper shadow="sm" radius="md" withBorder>
            {response}
        </Paper>
    );
}

// ZoneName: the full name of the selected zone as the detail's heading, a click copies it.
function ZoneName({ name }) {
    return (
        <Title order={3} style={{ wordBreak: 'break-word' }}>
            <CopyableText value={name}>{name}</CopyableText>
        </Title>
    );
}

// ----------------------------------------
// Activate Zone
// ----------------------------------------
function ActivateZone({ zone }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const activate = useApiMutation({
        mutationFn: () => api.createZone(zone),
        invalidates: [dyndnsKeys.zones()],
    });

    return (<Button onClick={() => activate.mutate()} loading={activate.isPending}>{t('dyndns.zoneDetail.activate')}</Button>);
}

// ----------------------------------------
// Join Zone — explicitly become a co-owner of an existing shared zone.
// ----------------------------------------
function JoinZone({ zone, owners }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const join = useApiMutation({
        mutationFn: () => api.joinZone(zone),
        invalidates: [dyndnsKeys.zones(), dyndnsKeys.zone(zone)],
    });

    return (
        <Stack gap="sm">
            <Text>{t('dyndns.joinZone.intro')}</Text>
            {owners?.length > 0 && (
                <Text size="sm" c="dimmed">{t('dyndns.joinZone.managedBy', { owners: owners.join(', ') })}</Text>
            )}
            <Group>
                <Button leftSection={<Users size={16} />} onClick={() => join.mutate()} loading={join.isPending}>{t('dyndns.joinZone.join')}</Button>
            </Group>
        </Stack>
    );
}


// ----------------------------------------
// Active Domain Tabs
// ----------------------------------------
function ActiveDomain({ zone: zoneName, onDeleted, onAddSubzone }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const [currentLocation, navigate] = useLocation()
    const confirm = useConfirm();
    const me = useZoneIdentity();
    const [shareOpen, setShareOpen] = useState(false);

    // `id` is what the code compares on and what the URL maps to; `label` is
    // the only part that changes with the language.
    const tabs = [
        { id: "manage", label: t('dyndns.zoneDetail.tabs.manage'), path: "/" },
        { id: "keys", label: t('dyndns.zoneDetail.tabs.keys'), path: "/keys" },
        { id: "dyndns", label: t('dyndns.zoneDetail.tabs.dynamicDns'), path: "/dyndns" },
        { id: "config", label: t('dyndns.zoneDetail.tabs.kubernetes'), path: "/config" },
        { id: "tls", label: t('dyndns.zoneDetail.tabs.tls'), path: "/tls" }
    ];

    // Keyed by zone name only. Switching TABS does not refetch: the tabs are
    // nested routes, and keying this on the location used to replace the whole
    // content with a loader on every tab click (the layout collapsed and the
    // footer jumped). All tab contents render from this one result.
    const zoneQuery = useQuery({
        queryKey: dyndnsKeys.zone(zoneName),
        queryFn: () => api.getZone(zoneName),
        enabled: !!api,
    });
    const zone = zoneQuery.data;

    const zoneKeys = [dyndnsKeys.zones(), dyndnsKeys.zone(zoneName)];

    // Shares the list's query (same key), so opening a zone costs no request.
    const eventsByZone = useZoneEvents();

    const deleteZone = useApiMutation({
        mutationFn: () => api.deleteZone(zone.zoneData.zone),
        invalidates: zoneKeys,
        // On success leave the (now-gone) zone URL and return to the overview,
        // otherwise the nested route renders "Zone Not Found".
        onSuccess: () => onDeleted?.(),
    });

    const rotateKeys = useApiMutation({
        mutationFn: () => api.rotateKeys(zone.zoneData.zone),
        invalidates: zoneKeys,
    });

    const leaveZone = useApiMutation({
        mutationFn: () => api.leaveZone(zone.zoneData.zone, me.email),
        invalidates: zoneKeys,
        onSuccess: () => onDeleted?.(),
    });

    async function handleDeleteClick() {
        const ok = await confirm({
            title: t('dyndns.zoneDetail.deleteTitle'),
            confirmLabel: t('dyndns.zoneDetail.deleteConfirm'),
            // Two whole messages instead of one sentence with two switches in it.
            message: (
                <Text size="sm">
                    <Trans
                        i18nKey={zone.owners?.length > 1
                            ? 'dyndns.zoneDetail.deleteMessageShared'
                            : 'dyndns.zoneDetail.deleteMessageSole'}
                        values={{ zone: zone.zoneData.zone }}
                        components={{ 1: <b /> }}
                    />
                </Text>
            ),
        });
        if (ok) deleteZone.mutate();
    }

    async function handleRotateKeys() {
        const ok = await confirm({
            title: t('dyndns.zoneDetail.rotateTitle'),
            confirmLabel: t('dyndns.zoneDetail.rotateConfirm'),
            message: t(authority.rotatesAll ? 'dyndns.zoneDetail.rotateMessage' : 'dyndns.zoneDetail.rotateOwnMessage'),
        });
        if (ok) rotateKeys.mutate();
    }

    // Co-owner leaving a shared zone: remove only themselves (their key), the zone
    // and other owners are unaffected.
    async function handleLeave() {
        const ok = await confirm({
            title: t('dyndns.zoneDetail.leaveTitle'),
            confirmLabel: t('dyndns.zoneDetail.leaveConfirm'),
            message: (
                <Text size="sm">
                    <Trans i18nKey="dyndns.zoneDetail.leaveMessage"
                        values={{ zone: zone.zoneData.zone }} components={{ 1: <b /> }} />
                </Text>
            ),
        });
        if (ok) leaveZone.mutate();
    }

    if (!api || zoneQuery.isPending) return <Loading size="sm" />;
    if (zoneQuery.isError) return <LoadError query={zoneQuery} title={t('dyndns.zoneDetail.loadError', { zone: zoneName })} />;
    if (!zone || !zone.zoneData) return (<Alert icon={<AlertCircle size="16" />} color="red">{t('dyndns.zoneDetail.corrupted')}</Alert>);

    const activeTab = tabs.find(tab => currentLocation === tab.path)?.id || "manage";
    const authority = zoneAuthority(zone, me.email, me.superAdmin);

    return (
        <Stack gap="md">
            <Paper p="md" withBorder bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                {/* The name and who manages the zone above, the actions below: beside the tree the column is too narrow to put a long zone name and four buttons in one row. Long zone/owner names wrap instead of overflowing. */}
                <Stack gap="sm">
                    <div style={{ minWidth: 0 }}>
                        <ZoneName name={zone.zoneData.zone} />
                        {zone.owners?.length > 0 && (
                            <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                                {t('dyndns.zoneDetail.managedBy', { owners: zone.owners.join(', ') })}
                            </Text>
                        )}
                        {zone.creator && zone.owners?.length > 1 && (
                            <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                                {t('dyndns.zoneDetail.createdBy', { creator: zone.creator })}
                            </Text>
                        )}
                    </div>
                    <Group gap="sm" wrap="wrap">
                        {onAddSubzone && (
                            <Button variant="light" size="sm" leftSection={<Plus size={16} />} onClick={onAddSubzone}>
                                {t('dyndns.subzone.title')}
                            </Button>
                        )}
                        {zone.sharing_allowed && (
                            <Button variant="light" size="sm" leftSection={<Users size={16} />} onClick={() => setShareOpen(true)}>
                                {t('dyndns.zoneDetail.share')}
                            </Button>
                        )}
                        <Tooltip multiline w={320} label={t(authority.rotatesAll ? 'dyndns.zoneDetail.rotateTooltip' : 'dyndns.zoneDetail.rotateOwnTooltip')}>
                            <Button variant="light" color="orange" size="sm" leftSection={<RefreshCw size={16} />} onClick={handleRotateKeys} loading={rotateKeys.isPending}>
                                {t(authority.rotatesAll ? 'dyndns.zoneDetail.rotateAll' : zone.owners?.length > 1 ? 'dyndns.zoneDetail.rotateOwn' : 'dyndns.zoneDetail.rotate')}
                            </Button>
                        </Tooltip>
                        {authority.canLeave && (
                            <Tooltip label={t('dyndns.zoneDetail.leaveTooltip')}>
                                <Button variant="light" color="red" size="sm" leftSection={<LogOut size={16} />} onClick={handleLeave}>
                                    {t('dyndns.zoneDetail.leave')}
                                </Button>
                            </Tooltip>
                        )}
                        {authority.manages && (
                            <Button color="red" size="sm" onClick={handleDeleteClick} loading={deleteZone.isPending}>{t('dyndns.zoneDetail.delete')}</Button>
                        )}
                    </Group>
                </Stack>
            </Paper>

            <ShareZoneModal
                opened={shareOpen}
                onClose={() => setShareOpen(false)}
                zoneName={zone.zoneData.zone}
                owners={zone.owners || []}
                creator={zone.creator}
                me={me.email}
                authority={authority}
            />

            <ZoneEventsBanner events={eventsByZone[zoneName]} />

            <Tabs value={activeTab} onChange={(val) => navigate(tabs.find(tab => tab.id === val)?.path || '/')}>
                <Tabs.List>
                    {tabs.map(({ id, label }) => <Tabs.Tab key={id} value={id}>{label}</Tabs.Tab>)}
                </Tabs.List>
            </Tabs>

            {/* Consistent padding for every tab's content (each tab renders a
                bare <Stack>, so the horizontal/bottom padding lives here once). */}
            <Box px="md" pb="md">
                {activeTab === "manage" && (
                    <DnsRecordsList zone={zone.zoneData.zone} tsigKey={zone.zoneData.zone_keys?.[0]} />
                )}

                {activeTab === "keys" && (
                    <ShowKeys zone={zone.zoneData} />
                )}

                {activeTab === "dyndns" && (
                    <DynamicDns zone={zone.zoneData} />
                )}

                {activeTab === "config" && (
                    <DynamicDnsKubernetes externalDnsValuesYaml={zone.externalDnsValuesYaml} zone={zone.zoneData} />
                )}

                {activeTab === "tls" && (
                    <TlsCertificates zone={zone.zoneData} />
                )}
            </Box>
        </Stack>
    );
}

// ----------------------------------------
// Share Zone Modal — add co-owners; the creator (or a super admin) also removes them.
// Each owner has their own TSIG key; removing an owner deletes only their key.
// ----------------------------------------
function ShareZoneModal({ opened, onClose, zoneName, owners, creator, me, authority }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const confirm = useConfirm();
    const [email, setEmail] = useState('');
    // Both writes invalidate the zone, so the owner list this modal renders
    // comes back through the parent's query. It used to be mirrored into local
    // state and patched from each response — two sources for one list.
    const zoneKeys = [dyndnsKeys.zones(), dyndnsKeys.zone(zoneName)];

    const addOwner = useApiMutation({
        mutationFn: (address) => api.addOwner(zoneName, address),
        invalidates: zoneKeys,
        onSuccess: () => setEmail(''),
    });

    const removeOwner = useApiMutation({
        mutationFn: (owner) => api.leaveZone(zoneName, owner),
        invalidates: zoneKeys,
    });

    const busy = addOwner.isPending || removeOwner.isPending;

    function handleAdd() {
        const address = email.trim().toLowerCase();
        if (address) addOwner.mutate(address);
    }

    async function handleRemove(owner) {
        const ok = await confirm({
            title: t('dyndns.share.removeTitle'),
            confirmLabel: t('dyndns.share.removeConfirm'),
            message: t('dyndns.share.removeMessage', { owner }),
        });
        if (ok) removeOwner.mutate(owner);
    }

    return (
        <Modal opened={opened} onClose={onClose} title={t('dyndns.share.title', { zone: zoneName })} centered size="lg">
            <Stack gap="lg">
                <Text size="sm" c="dimmed">{t('dyndns.share.intro')}</Text>
                {!authority.manages && <Text size="sm" c="dimmed">{t('dyndns.share.coOwnerHint')}</Text>}

                <Stack gap="xs">
                    {owners.map(o => (
                        <Group key={o} justify="space-between" wrap="nowrap">
                            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                                <Text size="sm" style={{ wordBreak: 'break-word' }}>{o}{o === me && <Text span c="dimmed"> {t('dyndns.share.you')}</Text>}</Text>
                                {creator && o.toLowerCase() === creator.toLowerCase() && (
                                    <Tooltip multiline w={280} label={t('dyndns.share.creatorTooltip')}>
                                        <Badge size="xs" variant="light" color="blue">{t('dyndns.share.creator')}</Badge>
                                    </Tooltip>
                                )}
                            </Group>
                            {authority.canRemove(o) && (
                                <Button size="compact-xs" color="red" variant="light" disabled={busy} onClick={() => handleRemove(o)}>
                                    {t('dyndns.actions.remove')}
                                </Button>
                            )}
                        </Group>
                    ))}
                    {owners.length === 0 && <Text size="sm" c="dimmed">{t('dyndns.share.noOwners')}</Text>}
                </Stack>

                <Group gap="xs" align="flex-end">
                    <TextInput style={{ flex: 1 }} label={t('dyndns.share.addLabel')} placeholder="user@dhbw.de" value={email}
                        onChange={e => setEmail(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
                    <Button onClick={handleAdd} loading={busy} disabled={!email.trim()} leftSection={<Plus size={16} />}>{t('dyndns.actions.add')}</Button>
                </Group>

                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={onClose}>{t('dyndns.actions.close')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

// The identity the zone requests act as, and whether it is a super admin there: from GET /v1/me, so acting for somebody (X-Act-As) shows that person's view. Until the answer is in — or if the service cannot say — the signed-in address stands in and nobody is a super admin; the server decides either way.
function useZoneIdentity() {
    const { user } = useAuth();
    const meQuery = useDnsMeQuery();
    return {
        email: (meQuery.data?.email || user?.profile?.email || '').toLowerCase(),
        superAdmin: !!meQuery.data?.super_admin,
    };
}
