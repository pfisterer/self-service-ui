import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { Alert, Anchor, Button, List, Stack, Text } from '@mantine/core';
import { FolderPlus } from 'lucide-react';
import { SPLIT_GUIDE_URL } from '/gpu/profiles.js';
import { useNodesApi } from '/projects/api-nodes.jsx';
import { projectKeys } from '/projects/query-keys.js';
import { autoApproveHeadroom, isAvailability, kindOfResource, visibleResources } from '/projects/util-project.jsx';

// How many budgets the empty start page names; the projects page lists them all.
const BUDGETS_NAMED = 3;

// workspaceOffers are the budgets in reach that offer workspace resources, each with whether a project from it is there at once: a budget the person manages always (a manager's project is approved as it is created), one they may request from when its auto-approve still has room for them in a workspace resource. Instant ones first.
export function workspaceOffers({ managed = [], eligible = [], resources = [], ownProjects = [] }) {
    const offered = (b) => visibleResources(resources, b).filter(r => kindOfResource(r) === 'workspaces' && !isAvailability(r));
    const out = [];
    const seen = new Set();
    for (const b of managed) {
        if (b.status !== 'approved' || seen.has(b.id) || offered(b).length === 0) continue;
        seen.add(b.id);
        out.push({ budget: b, instant: true });
    }
    for (const b of eligible) {
        if (seen.has(b.id)) continue;
        const scope = offered(b);
        if (scope.length === 0) continue;
        seen.add(b.id);
        const headroom = autoApproveHeadroom(b, scope, ownProjects);
        out.push({ budget: b, instant: !!headroom && scope.some(r => (headroom[r.id] ?? 0) > 0) });
    }
    return [...out.filter(o => o.instant), ...out.filter(o => !o.instant)];
}

// NoStartableProject is the start page when there is nothing to start: a workspace needs a workspace project first. It says why (no project, or projects without an allowed environment), which budgets would give one and whether at once, and leads to Workspaces → Projects, where the project is created.
export function NoStartableProject({ blocked = [] }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [config, managed, eligible, mine] = useQueries({
        queries: [
            { queryKey: projectKeys.config(), queryFn: () => api.getConfig(), enabled: !!api, retry: false },
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api },
        ],
    });
    const loaded = !!api && [config, managed, eligible, mine].every(q => !q.isPending);
    const offers = loaded ? workspaceOffers({
        managed: managed.data?.items ?? [],
        eligible: eligible.data?.items ?? [],
        resources: config.data?.resources ?? [],
        ownProjects: (mine.data?.items ?? []).filter(p => (p.viewer_relation ?? 'owner') === 'owner'),
    }) : [];
    const named = offers.slice(0, BUDGETS_NAMED);

    return (
        <Alert color="blue" variant="light" title={t('gpu.start.empty.title')}>
            <Stack gap="sm">
                <Text size="sm">{t('gpu.start.empty.why')}</Text>
                {blocked.length > 0 && (
                    <Text size="sm">{t('gpu.start.empty.noEnv', { count: blocked.length, projects: blocked.map(p => `„${p.name || p.slug}“`).join(', ') })}</Text>
                )}
                {/* A project that would offer "CPU + GPU kernel" on one of our bases: say how to get it there. */}
                {blocked.some(p => p.split_needs_base) && (
                    <Text size="sm">{t('gpu.start.splitNeedsBase')} <Anchor href={SPLIT_GUIDE_URL} target="_blank" rel="noopener" size="sm">{t('gpu.start.splitNeedsBaseLink')}</Anchor></Text>
                )}
                {/* Only once the budgets are known: "no budget" while they load would be wrong for a moment. */}
                {loaded && (offers.length > 0 ? (
                    <List size="sm" spacing={4}>
                        {named.map(o => (
                            <List.Item key={o.budget.id}>{t(o.instant ? 'gpu.start.empty.instant' : 'gpu.start.empty.onRequest', { budget: o.budget.name || o.budget.id })}</List.Item>
                        ))}
                        {offers.length > named.length && <List.Item>{t('gpu.start.empty.more', { count: offers.length - named.length })}</List.Item>}
                    </List>
                ) : (
                    <Text size="sm">{t('gpu.start.empty.noBudget')}</Text>
                ))}
                <div>
                    <Button component={Link} href="/projects" leftSection={<FolderPlus size={16} />}>
                        {offers.length > 0 ? t('gpu.start.empty.create') : t('gpu.start.empty.toProjects')}
                    </Button>
                </div>
            </Stack>
        </Alert>
    );
}
