import { useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Button, Checkbox, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useProjectConfig } from './projects.jsx';
import { autoApproveHeadroom, defaultsWithin, isAvailability, kindOfResource, latestProjectEnd, endDay, PROJECT_KINDS, resourceSummaryText, roomIn, visibleResources } from './util-project.jsx';
import { AREA_PROJECTS } from './start-link.js';

// Where somebody comes who has no project with resources of a provider yet —
// sent here from Jupyter, the chat or the keys page (/projects/start?for=aiaas).
// It lists the budgets the person may draw from that offer the provider's
// resources, with what each would give them; the ones that approve on the spot
// are ticked. One click creates a project under each ticked budget.
export function StartView() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const config = useProjectConfig();
    const queryClient = useQueryClient();
    const params = new URLSearchParams(useSearch());
    // The area the project is for (?for=workspaces|llm|cloud).
    const area = PROJECT_KINDS.includes(params.get('for')) ? params.get('for') : 'workspaces';
    const back = safeBack(params.get('back'));

    const [eligibleQuery, mineQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api },
        ],
    });
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null); // { created: [...], failed: [...] }

    const resources = useMemo(() => config?.resources ?? [], [config]);
    const offers = useMemo(() => {
        // Only the viewer's own projects: the list also holds the ones they administer or are a member of, which neither count against their share nor mean they already have a project there.
        const mine = (mineQuery.data?.items ?? []).filter(p => (p.viewer_relation ?? 'owner') === 'owner');
        return (eligibleQuery.data?.items ?? []).map(budget => {
            const offered = visibleResources(resources, budget).filter(r => kindOfResource(r) === area && !isAvailability(r));
            if (offered.length === 0) return null;
            const has = mine.some(p => p.parent_id === budget.id && ['pending', 'approved', 'change_pending'].includes(p.status));
            const headroom = autoApproveHeadroom(budget, resources, mine);
            const instant = !!headroom && offered.some(r => (headroom[r.id] ?? 0) > 0);
            // The availabilities of the area the budget offers come with their defaults (e.g. the server types of workspaces); the server would add them too, this keeps what is sent and what is shown the same.
            const switches = defaultsWithin(visibleResources(resources, budget).filter(r => kindOfResource(r) === area && isAvailability(r)), null);
            const amounts = {
                ...switches,
                ...(instant ? Object.fromEntries(offered.map(r => [r.id, headroom[r.id] ?? 0])) : defaultsWithin(offered, roomIn(budget, offered))),
            };
            return { budget, offered, amounts, instant, has };
        }).filter(Boolean);
    }, [eligibleQuery.data, mineQuery.data, resources, area]);

    if (!api || !config || eligibleQuery.isPending || mineQuery.isPending) return <Loading />;
    if (eligibleQuery.isError) return <LoadError query={eligibleQuery} />;

    const chosen = picked ?? new Set(offers.filter(o => o.instant && !o.has).map(o => o.budget.id));
    const toggle = (id) => setPicked(() => {
        const next = new Set(chosen);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    async function create() {
        setBusy(true);
        const created = [];
        const failed = [];
        for (const o of offers.filter(x => chosen.has(x.budget.id))) {
            const end = latestProjectEnd(o.budget);
            try {
                await api.createNode({
                    kind: 'project', parent_id: o.budget.id,
                    name: t('projects.start.projectName', { budget: o.budget.name }),
                    reason: t('projects.start.reason'),
                    limit: o.amounts,
                    termination_date: end ? endDay(end.date) : undefined,
                });
                created.push(o.budget.name);
            } catch (e) {
                failed.push(`${o.budget.name}: ${e.message}`);
            }
        }
        await queryClient.invalidateQueries({ queryKey: projectKeys.mine() });
        setResult({ created, failed });
        setBusy(false);
    }

    const providerName = t(`projects.kind.${area}`);
    return (
        <Stack gap="md" maw={720}>
            <Title order={3}>{t('projects.start.title', { provider: providerName })}</Title>
            <Text size="sm" c="dimmed">{t('projects.start.intro', { provider: providerName })}</Text>

            {result ? (
                <Stack gap="sm">
                    {result.created.length > 0 && <Alert color="green" variant="light">{t('projects.start.created', { list: result.created.join(', ') })}</Alert>}
                    {result.failed.length > 0 && <Alert color="red" variant="light">{t('projects.start.failed', { list: result.failed.join(' · ') })}</Alert>}
                    <Group>
                        {back && <Button component="a" href={back}>{t('projects.start.back')}</Button>}
                        <Button variant="default" component="a" href={AREA_PROJECTS[area]}>{t('projects.start.toProjects')}</Button>
                    </Group>
                </Stack>
            ) : offers.length === 0 ? (
                <Alert color="gray" variant="light">{t('projects.start.none', { provider: providerName })}</Alert>
            ) : (
                <>
                    <Stack gap="xs">
                        {offers.map(o => (
                            <Paper key={o.budget.id} p="sm" withBorder radius="md">
                                <Checkbox
                                    disabled={o.has}
                                    checked={!o.has && chosen.has(o.budget.id)}
                                    onChange={() => toggle(o.budget.id)}
                                    label={<Text fw={600} size="sm">{o.budget.name}</Text>}
                                    description={
                                        o.has ? t('projects.start.has')
                                            : `${resourceSummaryText(t, o.offered, o.amounts) || t('projects.start.nothing')} — ${t(o.instant ? 'projects.start.instant' : 'projects.start.approval')}`
                                    }
                                />
                            </Paper>
                        ))}
                    </Stack>
                    <Group>
                        <Button loading={busy} disabled={chosen.size === 0} onClick={create}>{t('projects.start.create', { count: chosen.size })}</Button>
                        {back && <Anchor href={back} size="sm">{t('projects.start.skip')}</Anchor>}
                    </Group>
                </>
            )}
        </Stack>
    );
}

// safeBack keeps a return address only when it is a URL of a DHBW service, so
// the page cannot be used to send people anywhere.
function safeBack(raw) {
    if (!raw) return null;
    try {
        const u = new URL(raw, window.location.origin);
        const host = u.hostname;
        if (u.protocol !== 'https:' && u.origin !== window.location.origin) return null;
        if (u.origin === window.location.origin || host === 'dhbw.cloud' || host.endsWith('.dhbw.cloud')) return u.toString();
    } catch {
        return null;
    }
    return null;
}
