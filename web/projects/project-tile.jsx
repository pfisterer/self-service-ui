import { useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useClipboard } from '@mantine/hooks';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Anchor, Badge, Box, Button, Card, Drawer, Group, Menu, Progress, Stack, Table, Tabs, Text, UnstyledButton } from '@mantine/core';
import { formatDate } from '../format-date.js';
import { useProjectConfig } from './projects.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useAiAreasVisible } from '/ai-areas.jsx';
import { MemberSummary, PersonBadge } from './component-common.jsx';
import { AttributesView, hasAttributes } from './component-node-attributes.jsx';
import { AllocationList, allocationNode } from './component-allocations.jsx';
import { AccessTab, NodeFacts, NodeHistoryPanel, PendingChange, ProjectConsumption, ProjectResourcesNow } from './modal-inspect.jsx';
import { SyncErrorDetails } from './component-project-resources.jsx';
import {
    COLOR, UNLIMITED_QUOTA, deletesOnRequest, deletionRequested, expiryTone, getAuthUserEmail, holdsProject, isMemberView, isProvisioning, isRetired,
    liveAllocations, managesAllocation, measuredUse, nodeTitle, openstackProjectUrl, openstackSide, overageEntries, ownerEmail, projectActions, projectKinds,
    resourceName, resourceSummaryText, resourceUnitName,
} from './util-project.jsx';
import { tileActions, tileBars, tileFlag, tileKind } from './util-tile.js';

// The unified project tile of the new layout (gate ui-v2) and what belongs to it: the list row, the "Mehr" menu and the side panel. One shape for every kind: the kind, a chip only where something differs, the name (opening the side panel), the purpose in two lines, at most three bars, one line of facts, and two buttons plus "Mehr". The decisions are in util-tile.js.

export const PANEL_TABS = ['overview', 'allocations', 'members', 'usage', 'history'];

// panelTab is the side panel's tab for a tab of the project's dialogs (the details dialog's ids, see modal-inspect.jsx): the panel takes the place of that dialog in the new layout, so "Details" or "Verbrauch" from anywhere lands on the matching tab.
export function panelTab(tab) {
    if (PANEL_TABS.includes(tab)) return tab;
    return { access: 'members' }[tab] ?? 'overview';
}

// useTileModel gathers what a tile, a row and the panel show of one project. ctx: resources (of the page), filter (the page's kind or 'all'), perspective ('owner' or 'member'), start (where a workspace starts, relative to /workspaces), jobsHref (the project's batch jobs), envBuild, managedIds, isRoot.
export function useTileModel(node, ctx) {
    const { t } = useTranslation();
    const config = useProjectConfig();
    const { user } = useAuth();
    const { llmArea } = useAiAreasVisible();
    const { resources = [], filter = 'all', perspective = 'owner', start = null, jobsHref = null, envBuild = null, managedIds = null, isRoot = false } = ctx;
    const me = getAuthUserEmail(user).toLowerCase();
    const memberView = perspective === 'member' || isMemberView(node);
    const can = memberView ? { details: true } : projectActions(node, { manager: perspective === 'manager', canDelete: deletesOnRequest(config?.retirement) });
    const kinds = projectKinds(node, resources);
    const kind = tileKind(kinds, filter);
    const allocations = liveAllocations(node);
    const waitingMine = allocations.filter(a => (a.status === 'pending' || a.status === 'change_pending') && managesAllocation(a, managedIds, isRoot));
    const decideOn = waitingMine[0] ?? null;
    const holder = !memberView && (perspective === 'owner' || holdsProject(node, me));
    const releasable = holder || (allocations.length > 0 && allocations.every(a => managesAllocation(a, managedIds, isRoot)));
    const openstackUrl = openstackProjectUrl(config?.openstackDashboardUrl, node);
    const usage = !!openstackSide(node).external_id;
    const actions = tileActions({
        kind, can, openstackUrl, start, keys: kind === 'llm' && llmArea === 'member' && node.status === 'approved',
        jobs: !!jobsHref, decide: !!decideOn, releasable, usage, memberView,
    });
    const limit = node.limit || {};
    const inUse = measuredUse(node);
    const bars = tileBars(resources, limit, inUse);
    const full = bars.find(b => b.high);
    const flag = tileFlag({
        status: node.status,
        provisioning: isProvisioning(node, config?.provisioningEnabled, resources, config?.providers),
        decide: !!decideOn,
        overage: overageEntries(resources, node).length > 0,
        expiryTone: !isRetired(node) && node.termination_date ? expiryTone(node.termination_date) : 'gray',
        envFailed: envBuild?.status === 'failed',
        deleting: deletionRequested(node),
        full: full ? resourceName(t, full.resource) : null,
    });
    const budgets = [...new Set(allocations.map(a => a.budget_name || a.budget_id))];
    const members = (node.authorized_users || []).length;
    const title = nodeTitle(node);
    // The purpose, unless it already is the title (a project without a name is called by its purpose).
    const description = node.reason && node.reason !== title ? node.reason : '';
    return {
        node, kind, kinds, actions, flag, bars, inUse, limit, budgets, members, title, description, memberView, holder, decideOn, openstackUrl, start, jobsHref,
        owner: ownerEmail(node), allocations, summary: resourceSummaryText(t, resources, limit),
    };
}

// useTileActs turns the action ids of a tile into what they do. onAction is the view's (dialogs), onOpen(node, tab) opens the side panel.
export function useTileActs(model, { onAction, onOpen }) {
    const [, navigate] = useLocation();
    const clipboard = useClipboard({ timeout: 1500 });
    const { node, decideOn, openstackUrl, start, jobsHref } = model;
    const run = (id) => {
        switch (id) {
            case 'openstack': window.open(openstackUrl, '_blank', 'noopener'); break;
            case 'start': navigate(`~/workspaces${start}`); break;
            case 'keys': navigate('~/llm/keys'); break;
            case 'jobs': navigate(`~${jobsHref}`); break;
            case 'decide': onAction?.('decide', decideOn ? allocationNode(decideOn, node) : node); break;
            case 'edit': onAction?.('change', node); break;
            case 'details': onOpen?.(node, 'overview'); break;
            case 'usage': onOpen?.(node, 'usage'); break;
            case 'members': onOpen?.(node, 'members'); break;
            case 'history': onOpen?.(node, 'history'); break;
            case 'link': clipboard.copy(`${window.location.origin}/projects?project=${encodeURIComponent(node.id)}`); break;
            default: onAction?.(id, node);
        }
    };
    return { run, copied: clipboard.copied };
}

// MoreMenu is the "Mehr" button: well visible (a labelled, bordered button, not three dots), each entry with a short explanation, the dangerous ones red behind a divider.
export function MoreMenu({ items, run, copied, size = 'sm' }) {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    if (!items.length) return null;
    const firstDanger = items.findIndex(i => i.danger);
    return (
        <Menu opened={opened} onChange={setOpened} position="bottom-end" width={270} shadow="md" withinPortal>
            <Menu.Target>
                <Button variant="default" size={size} rightSection={<ChevronDown size={14} />} aria-haspopup="menu">{t('projects.v2.more')}</Button>
            </Menu.Target>
            <Menu.Dropdown>
                {items.map((item, i) => (
                    <Box key={item.id}>
                        {i === firstDanger && <Menu.Divider />}
                        <Menu.Item color={item.danger ? 'red' : undefined} onClick={() => run(item.id)} closeMenuOnClick={item.id !== 'link'}>
                            <Text size="sm" fw={600} c={item.danger ? 'red.7' : undefined}>
                                {item.id === 'link' && copied ? t('projects.actions.linkCopied') : t(`projects.v2.action.${item.id}`)}
                            </Text>
                            <Text size="xs" c="dimmed">{t(`projects.v2.hint.${item.id}`)}</Text>
                        </Menu.Item>
                    </Box>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}

// TileButtons: the primary action (filled), the second one (outlined) and "Mehr".
export function TileButtons({ model, acts, size = 'sm', grow = true }) {
    const { t } = useTranslation();
    const { primary, secondary, menu } = model.actions;
    return (
        <Group gap="xs" wrap="wrap">
            {primary && <Button size={size} style={grow ? { flex: '1 0 auto' } : undefined} color={primary === 'decide' ? COLOR.attention : undefined} onClick={() => acts.run(primary)}>{t(`projects.v2.action.${primary}`)}</Button>}
            {secondary && <Button size={size} variant="outline" style={grow ? { flex: '1 0 auto' } : undefined} onClick={() => acts.run(secondary)}>{t(`projects.v2.action.${secondary}`)}</Button>}
            <MoreMenu items={menu} run={acts.run} copied={acts.copied} size={size} />
        </Group>
    );
}

// TileFlag is the one chip of a tile.
function TileFlag({ flag }) {
    const { t } = useTranslation();
    if (!flag) return null;
    return <Badge size="sm" variant="light" color={flag.color} tt="none">{t(`projects.v2.flag.${flag.key}`, { name: flag.name })}</Badge>;
}

// TileBar is one quantity: used of granted, orange from 80 %; without a measurement only what is granted.
export function TileBar({ bar }) {
    const { t } = useTranslation();
    const unlimited = bar.limit === UNLIMITED_QUOTA;
    const measured = typeof bar.used === 'number';
    const limitText = unlimited ? '∞' : bar.limit;
    const unit = resourceUnitName(t, bar.resource);
    return (
        <Stack gap={3}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" c="dimmed" truncate>{resourceName(t, bar.resource)}</Text>
                <Text size="xs" fw={bar.high ? 600 : 500} c={bar.high ? 'orange.8' : undefined} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {measured ? `${bar.used} / ${limitText}` : limitText}{unit ? ` ${unit}` : ''}
                </Text>
            </Group>
            {measured && !unlimited && <Progress size="sm" value={Math.min(100, (bar.share ?? 0) * 100)} color={bar.high ? 'orange' : 'blue'} />}
        </Stack>
    );
}

function kindLabel(t, model) {
    return model.kinds.length ? model.kinds.map(k => t(`projects.v2.kind.${k}`)).join(' · ') : t('projects.v2.kind.none');
}

function endText(t, node) {
    return node.termination_date ? t('projects.v2.until', { date: formatDate(node.termination_date) }) : t('projects.v2.noEnd');
}

// MetaLine is the one line of facts: end, who pays, members.
function MetaLine({ model }) {
    const { t } = useTranslation();
    const { node, budgets, members, memberView } = model;
    const parts = [
        endText(t, node),
        budgets.length ? budgets.join(' + ') : null,
        memberView ? t('projects.v2.othersMembers', { count: node.members_hidden ?? 0 }) : t('projects.v2.members', { count: members }),
    ].filter(Boolean);
    return <Text size="xs" c="dimmed">{parts.join(' · ')}</Text>;
}

// ProjectTile is one project as a card. ctx: what useTileModel needs of it.
export function ProjectTile({ node, ctx, onAction, onOpen, marked = false }) {
    const { t } = useTranslation();
    const model = useTileModel(node, ctx);
    const acts = useTileActs(model, { onAction, onOpen });
    return (
        <Card withBorder radius="md" padding="lg" id={`project-${model.node.id}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', ...(marked ? { outline: `2px solid var(--mantine-color-${COLOR.attention}-5)` } : {}) }}>
            <Stack gap={4}>
                <Group gap="xs" wrap="wrap">
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>{kindLabel(t, model)}</Text>
                    <TileFlag flag={model.flag} />
                </Group>
                <UnstyledButton onClick={() => onOpen(model.node, 'overview')} aria-label={t('projects.v2.openPanel', { name: model.title })}>
                    <Text fw={600} size="lg" lh={1.3}>{model.title}</Text>
                </UnstyledButton>
            </Stack>
            <Text size="sm" c="dimmed" lineClamp={2} mih={42}>{model.description}</Text>
            <Stack gap={10} style={{ flex: 1 }}>
                {model.bars.map(b => <TileBar key={b.resource.id} bar={b} />)}
                {model.bars.length === 0 && <Text size="xs" c="dimmed">{model.summary || t('projects.v2.nothingYet')}</Text>}
            </Stack>
            <Box pt={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}><MetaLine model={model} /></Box>
            <TileButtons model={model} acts={acts} />
        </Card>
    );
}

// ProjectRow is one project as a row of the list.
function ProjectRow({ node, ctx, onAction, onOpen, marked }) {
    const { t } = useTranslation();
    const model = useTileModel(node, ctx);
    const acts = useTileActs(model, { onAction, onOpen });
    const top = model.bars[0];
    return (
        <Table.Tr id={`project-${model.node.id}`} style={marked ? { outline: `2px solid var(--mantine-color-${COLOR.attention}-5)` } : undefined}>
            <Table.Td>
                <UnstyledButton onClick={() => onOpen(model.node, 'overview')}><Text fw={600} size="sm">{model.title}</Text></UnstyledButton>
                {model.description && <Text size="xs" c="dimmed" truncate maw={360}>{model.description}</Text>}
                {model.flag && <Box mt={4}><TileFlag flag={model.flag} /></Box>}
            </Table.Td>
            <Table.Td><Text size="sm">{kindLabel(t, model)}</Text></Table.Td>
            <Table.Td><Text size="sm">{model.node.termination_date ? formatDate(model.node.termination_date) : '–'}</Text></Table.Td>
            <Table.Td><Text size="sm">{model.budgets.join(' + ') || '–'}</Text></Table.Td>
            <Table.Td miw={170}>{top ? <TileBar bar={top} /> : <Text size="xs" c="dimmed">–</Text>}</Table.Td>
            <Table.Td><TileButtons model={model} acts={acts} size="xs" grow={false} /></Table.Td>
        </Table.Tr>
    );
}

// ProjectsBoard lays the tiles out as cards or as a list. nodes: the projects in their order; ctxOf(node): what useTileModel needs of each; marked: the id a link names.
export function ProjectsBoard({ nodes, ctxOf, view, onAction, onOpen, marked }) {
    const { t } = useTranslation();
    if (view === 'list') {
        return (
            <Table.ScrollContainer minWidth={900}>
                <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t('projects.v2.col.project')}</Table.Th>
                            <Table.Th>{t('projects.v2.col.kind')}</Table.Th>
                            <Table.Th>{t('projects.v2.col.end')}</Table.Th>
                            <Table.Th>{t('projects.v2.col.paidFrom')}</Table.Th>
                            <Table.Th>{t('projects.v2.col.usage')}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {nodes.map(n => <ProjectRow key={n.id} node={n} ctx={ctxOf(n)} onAction={onAction} onOpen={onOpen} marked={n.id === marked} />)}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        );
    }
    return (
        // As many columns as fit with room for the three buttons in one row.
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: 'var(--mantine-spacing-lg)' }}>
            {nodes.map(n => <ProjectTile key={n.id} node={n} ctx={ctxOf(n)} onAction={onAction} onOpen={onOpen} marked={n.id === marked} />)}
        </Box>
    );
}

// ProjectPanel is the side panel of a project: its head (kind, end, name, purpose, the tile's buttons) and five tabs — overview, allocations, members, usage, history — built from the contents of the project's dialogs.
// node: the project shown, null while the panel is closed; ctx as for a tile.
export function ProjectPanel({ node, ctx, tab, onTab, onClose, onAction, onOpen }) {
    return (
        <Drawer opened={!!node} onClose={onClose} position="right" size={640} padding="lg" title={node ? <PanelTitle node={node} ctx={ctx} /> : null}>
            {node && <PanelBody node={node} ctx={ctx} tab={tab} onTab={onTab} onAction={onAction} onOpen={onOpen} />}
        </Drawer>
    );
}

function PanelTitle({ node, ctx }) {
    const { t } = useTranslation();
    const model = useTileModel(node, ctx);
    return <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>{kindLabel(t, model)} · {endText(t, node)}</Text>;
}

function PanelBody({ node, ctx, tab, onTab, onAction, onOpen }) {
    const { t } = useTranslation();
    const model = useTileModel(node, ctx);
    const acts = useTileActs(model, { onAction, onOpen });
    const [extras, setExtras] = useState(false);
    const { resources = [], managedIds = null, isRoot = false } = ctx;
    const tabs = PANEL_TABS.filter(id => id !== 'history' || !model.memberView);
    return (
            <>
                <Stack gap="md">
                    <Stack gap={6}>
                        <Group gap="xs"><Text fw={700} size="xl" lh={1.25}>{model.title}</Text><TileFlag flag={model.flag} /></Group>
                        {model.description && <Text size="sm" c="dimmed">{model.description}</Text>}
                    </Stack>
                    <TileButtons model={model} acts={acts} grow={false} />
                    <Tabs value={tab} onChange={(v) => v && onTab(v)} keepMounted={false}>
                        <Tabs.List>
                            {tabs.map(id => <Tabs.Tab key={id} value={id}>{t(`projects.v2.tab.${id}`)}</Tabs.Tab>)}
                        </Tabs.List>
                        <Tabs.Panel value="overview" pt="md">
                            <Stack gap="lg">
                                <Box><ProjectResourcesNow node={node} resources={resources} /></Box>
                                <PendingChange node={node} resources={resources} />
                                <Table withRowBorders={false} verticalSpacing={6}>
                                    <Table.Tbody>
                                        {model.owner && <Table.Tr><Table.Td w={150}><Text size="sm" c="dimmed">{t('projects.v2.fact.owner')}</Text></Table.Td><Table.Td><PersonBadge email={model.owner} size="sm" /></Table.Td></Table.Tr>}
                                        <Table.Tr>
                                            <Table.Td><Text size="sm" c="dimmed">{t('projects.v2.fact.paidFrom')}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{model.budgets.join(' + ') || '–'} {model.allocations.length > 0 && <Anchor component="button" size="sm" onClick={() => onTab('allocations')}>· {t('projects.v2.fact.seeAllocations')}</Anchor>}</Text></Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Td><Text size="sm" c="dimmed">{t('projects.v2.fact.members')}</Text></Table.Td>
                                            <Table.Td>{model.memberView ? <MemberSummary node={node} /> : <Text size="sm">{t('projects.v2.members', { count: model.members })} <Anchor component="button" size="sm" onClick={() => onTab('members')}>· {t('projects.v2.fact.manage')}</Anchor></Text>}</Table.Td>
                                        </Table.Tr>
                                        {node.created_at && <Table.Tr><Table.Td><Text size="sm" c="dimmed">{t('projects.v2.fact.created')}</Text></Table.Td><Table.Td><Text size="sm">{formatDate(node.created_at)}</Text></Table.Td></Table.Tr>}
                                    </Table.Tbody>
                                </Table>
                                {/* Folded: the way to the batch jobs and what the project is booked to (its attributes, sent only to those who look after it). */}
                                {(model.jobsHref || hasAttributes(node)) && (
                                    <Stack gap={6}>
                                        <UnstyledButton onClick={() => setExtras(v => !v)} aria-expanded={extras}>
                                            <Group gap={6}>{extras ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Text size="sm" fw={600}>{t('projects.v2.extras')}</Text></Group>
                                        </UnstyledButton>
                                        {extras && model.jobsHref && <Anchor size="sm" onClick={() => acts.run('jobs')}>{t('projects.v2.action.jobs')}</Anchor>}
                                        {extras && hasAttributes(node) && <AttributesView node={node} />}
                                    </Stack>
                                )}
                            </Stack>
                        </Tabs.Panel>
                        <Tabs.Panel value="allocations" pt="md">
                            <AllocationList project={node} resources={resources} holder={model.holder} managedIds={managedIds} isRoot={isRoot}
                                onAction={model.memberView ? undefined : onAction} all={liveAllocations(node).length === 0} />
                        </Tabs.Panel>
                        <Tabs.Panel value="members" pt="md">
                            <Stack>
                                <AccessTab node={node} resources={resources} />
                                {!model.memberView && model.actions && (model.actions.primary === 'edit' || model.actions.secondary === 'edit') && (
                                    <Button variant="light" w="fit-content" onClick={() => onAction?.('change', node)}>{t('projects.v2.editMembers')}</Button>
                                )}
                            </Stack>
                        </Tabs.Panel>
                        <Tabs.Panel value="usage" pt="md"><ProjectConsumption node={node} resources={resources} /></Tabs.Panel>
                        {!model.memberView && (
                            <Tabs.Panel value="history" pt="md">
                                <Stack><NodeFacts node={node} /><SyncErrorDetails node={node} resources={resources} /><NodeHistoryPanel node={node} resources={resources} /></Stack>
                            </Tabs.Panel>
                        )}
                    </Tabs>
                </Stack>
            </>
    );
}
