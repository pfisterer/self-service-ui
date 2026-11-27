import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { Alert, Badge, Box, Button, Card, Group, SegmentedControl, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useProjectConfig } from './projects.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { formatTerm, TokenBadgeList } from './component-common.jsx';
import { COLOR, UNLIMITED_QUOTA, beyondAutoApproveRefused, budgetKinds, catalogKinds, getAuthUserEmail, hasAutoApprove, isAvailability, isPoolAutoApprove, kindOfResource, mostSpecificFirst, ownerEmail, resourceName, resourceSummaryText, resourceUnitName, resourcesOfKinds } from './util-project.jsx';
import { offerOf, offerTotals, offeredAvailabilities, termOf } from './util-offers.js';

// OffersView (/projects/offers, new layout): "Meine Ressourcen" — what the budgets one may request from offer, added up per kind ("Sofort" and "Mit Antrag, höchstens"), and below, folded, each budget on its own with a button to start a project from it alone. The same budgets as the former "Budgets für neue Projekte" under the project lists: those the viewer may request from and does not manage.
export function OffersView() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const config = useProjectConfig();
    const { user } = useAuth();
    const cloudStatus = useCloudStatus();
    const [kind, setKind] = useState(null);
    const [open, setOpen] = useState(false);
    const [newProject, setNewProject] = useState(null);
    const [mineQuery, myBudgetsQuery, eligibleQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api },
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
        ],
    });
    if (!api || !config || eligibleQuery.isPending || mineQuery.isPending) return <Loading />;
    if (eligibleQuery.isError) return <LoadError query={eligibleQuery} />;

    const resources = config.resources || [];
    const me = getAuthUserEmail(user).toLowerCase();
    const myProjects = (mineQuery.data?.items ?? []).filter(n => ownerEmail(n).toLowerCase() === me);
    const myBudgets = myBudgetsQuery.data?.items ?? [];
    const managed = new Set(myBudgets.map(b => b.id));
    const eligible = eligibleQuery.data?.items ?? [];
    const kinds = catalogKinds(resources).filter(k => eligible.some(b => !managed.has(b.id) && budgetKinds(b, resources).includes(k)));
    const current = kind && kinds.includes(kind) ? kind : kinds[0];
    const budgets = mostSpecificFirst(eligible).filter(b => !managed.has(b.id) && budgetKinds(b, resources).includes(current));
    const scope = resourcesOfKinds(resources, [current]).filter(r => kindOfResource(r) === current && !isAvailability(r));
    const totals = offerTotals(budgets, scope, myProjects);
    const amount = (r, v) => {
        if (v === Infinity || v === UNLIMITED_QUOTA) return t('projects.v2.offers.unlimited');
        const unit = resourceUnitName(t, r);
        return unit ? `${v} ${unit}` : String(v);
    };
    const rows = scope.filter(r => totals[r.id] && (totals[r.id].ask > 0 || totals[r.id].now > 0));
    const avail = offeredAvailabilities(budgets, resources, current);
    const term = termOf(budgets);
    const termText = (d) => (d === null ? t('projects.v2.offers.noTermLimit') : d === 0 ? '–' : formatTerm(t, d));

    if (kinds.length === 0) {
        return (
            <Stack>
                <Title order={3}>{t('projects.v2.offers.title')}</Title>
                <Alert color={COLOR.attention} variant="light">{t('projects.myProjects.none')}</Alert>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
            <div>
                <Title order={3}>{t('projects.v2.offers.title')}</Title>
                <Text size="sm" c="dimmed">{t('projects.v2.offers.intro')}</Text>
            </div>
            {kinds.length > 1 && (
                <SegmentedControl w="fit-content" value={current} onChange={setKind} aria-label={t('projects.kind.label')}
                    data={kinds.map(k => ({ value: k, label: t(`projects.v2.kind.${k}`) }))} />
            )}
            <Card withBorder radius="md" padding="lg">
                <Table verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th />
                            <Table.Th><Group gap={4}><Zap size={14} color="var(--mantine-color-green-7)" />{t('projects.v2.offers.now')}</Group></Table.Th>
                            <Table.Th>{t('projects.v2.offers.ask')}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map(r => (
                            <Table.Tr key={r.id}>
                                <Table.Td><Text size="sm">{resourceName(t, r)}</Text></Table.Td>
                                <Table.Td><Text size="lg" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{totals[r.id].now > 0 ? amount(r, totals[r.id].now) : '–'}</Text></Table.Td>
                                <Table.Td><Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{amount(r, totals[r.id].ask)}</Text></Table.Td>
                            </Table.Tr>
                        ))}
                        {avail.length > 0 && (
                            <Table.Tr>
                                <Table.Td><Text size="sm">{t('projects.v2.offers.availabilities')}</Text></Table.Td>
                                <Table.Td><Text size="sm">{avail.filter(a => a.now).map(a => resourceName(t, a.resource)).join(', ') || '–'}</Text></Table.Td>
                                <Table.Td><Text size="sm">{avail.filter(a => !a.now).map(a => resourceName(t, a.resource)).join(', ') || '–'}</Text></Table.Td>
                            </Table.Tr>
                        )}
                        <Table.Tr>
                            <Table.Td><Text size="sm">{t('projects.v2.offers.term')}</Text></Table.Td>
                            <Table.Td><Text size="sm">{termText(term.now)}</Text></Table.Td>
                            <Table.Td><Text size="sm">{termText(term.ask)}</Text></Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>
                <Group mt="md" gap="md">
                    <Button onClick={() => setNewProject({ budget: '', kind: current })}>{t('projects.v2.newProject')}</Button>
                    <Text size="sm" c="dimmed">{t('projects.v2.offers.split')}</Text>
                </Group>
            </Card>

            <Stack gap="xs">
                <UnstyledButton onClick={() => setOpen(v => !v)} aria-expanded={open}>
                    <Group gap={8}>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <Text fw={600}>{t('projects.v2.offers.fromBudgets', { count: budgets.length })}</Text>
                        <Text size="sm" c="dimmed" truncate maw={600}>{budgets.map(b => b.name || b.id).join(' · ')}</Text>
                    </Group>
                </UnstyledButton>
                {open && (
                    <Card withBorder radius="md" padding={0}>
                        {budgets.map(b => (
                            <BudgetOfferRow key={b.id} budget={b} scope={scope} myProjects={myProjects}
                                onPick={() => setNewProject({ budget: b.id, kind: current })} />
                        ))}
                    </Card>
                )}
            </Stack>

            <ProjectFormModal
                key={newProject === null ? 'new-closed' : `new:${newProject.kind}:${newProject.budget}`}
                opened={newProject !== null}
                onClose={() => setNewProject(null)}
                resources={resources}
                roles={config.roles}
                myBudgets={myBudgets}
                eligibleBudgets={eligible}
                myProjects={myProjects}
                isRoot={cloudStatus.isRoot}
                onBudgetChanged={cloudStatus.refresh}
                initialBudgetId={newProject?.budget || null}
                initialKind={newProject?.kind ?? null}
            />
        </Stack>
    );
}

// BudgetOfferRow is one budget: name and whether it grants at once, who runs it and its longest term, the viewer's own share (or that it all goes on request), what happens beyond it, the pool, and "Nur hieraus".
function BudgetOfferRow({ budget, scope, myProjects, onPick }) {
    const { t } = useTranslation();
    const instant = hasAutoApprove(budget);
    const offer = offerOf(budget, scope, myProjects);
    const own = Object.fromEntries(Object.entries(offer).map(([id, v]) => [id, v.now === Infinity ? UNLIMITED_QUOTA : v.now]));
    const pool = Object.fromEntries(Object.entries(offer).map(([id, v]) => [id, v.ask === Infinity ? UNLIMITED_QUOTA : v.ask]));
    const ownText = resourceSummaryText(t, scope, own);
    return (
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" align="center" wrap="wrap" gap="md">
                <Stack gap={4} style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Group gap={8}>
                        <Text fw={600}>{budget.name || budget.id}</Text>
                        <Badge size="sm" variant="light" color={instant ? 'green' : 'blue'} tt="none">{instant ? t('projects.v2.offers.instant') : t('projects.v2.offers.onRequest')}</Badge>
                    </Group>
                    <Group gap={6} wrap="wrap">
                        <Text size="xs" c="dimmed">{t('projects.v2.offers.managedBy')}</Text>
                        <TokenBadgeList tokens={budget.admin_scope} size="xs" emptyMessage={t('projects.fact.managedByEmpty')} />
                        {budget.max_project_term_days && <Text size="xs" c="dimmed">· {t('projects.v2.offers.termAtMost', { term: formatTerm(t, budget.max_project_term_days) })}</Text>}
                    </Group>
                </Stack>
                <Stack gap={2} style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Text size="sm">{t('projects.v2.offers.yourShare')}: <b>{instant ? (ownText || t('projects.offers.nothing')) : '–'}</b></Text>
                    <Text size="xs" c="dimmed">{!instant ? t('projects.v2.offers.allOnRequest') : beyondAutoApproveRefused(budget) ? t('projects.v2.offers.beyondRefused') : t('projects.v2.offers.beyondRequest')}</Text>
                </Stack>
                <Text size="xs" c="dimmed" style={{ flex: '1 1 180px' }}>{t('projects.v2.offers.pool')}: {budget.inherits_limit ? t('projects.offers.noOwnLimit') : (resourceSummaryText(t, scope, pool) || '–')}{instant && isPoolAutoApprove(budget) ? ` · ${t('projects.v2.offers.poolShared')}` : ''}</Text>
                <Button variant="default" onClick={onPick}>{t('projects.v2.offers.onlyHere')}</Button>
            </Group>
        </Box>
    );
}
