import { Clock, Inbox, Zap } from 'lucide-react';
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FactRow, formatTerm, NodeUsageBars, TokenBadgeList } from './component-common.jsx';
import {
    autoApproveHeadroom, beyondAutoApproveRefused, COLOR, expiryTone, expiryValue, freeAmount, hasAutoApprove, headroomExhaustedBy,
    budgetKinds, isAvailability, isPoolAutoApprove, resourceSummaryText, UNLIMITED_QUOTA, visibleResources,
} from './util-project.jsx';
import { NewProjectButton } from './component-new-project-button.jsx';

// What a budget still offers, as a quota map resourceSummaryText can print:
// an uncapped amount (Infinity) becomes the ∞ it knows.
function printable(amounts) {
    return Object.fromEntries(Object.entries(amounts)
        .map(([id, v]) => [id, v === Infinity ? UNLIMITED_QUOTA : v]));
}

// BudgetOfferCard is one budget the viewer may draw from, seen from the
// requester's side: how much of it is theirs right now, whether taking it needs
// anybody's approval, and the button that starts a project there.
//
// kinds: the kinds of project the catalogue tells apart; the button offers
// those of them this budget has resources for.
function BudgetOfferCard({ budget, resources, kinds = [], myProjects, onNewProject, onRequestBudget }) {
    const { t } = useTranslation();
    const scope = visibleResources(resources, budget).filter(r => !isAvailability(r));
    const instant = hasAutoApprove(budget);
    // With auto-approve the interesting number is what goes through without
    // asking — for a pool the budget's free room, for individual limits the
    // person's remaining share. Without it, it is what the budget still has.
    const available = instant
        ? autoApproveHeadroom(budget, scope, myProjects)
        : Object.fromEntries(scope.map(r => [r.id, freeAmount(budget, r.id)]));
    const summary = resourceSummaryText(t, scope, printable(available));
    // Zero for a reason: "nothing" read as if there never had been anything.
    const exhausted = instant && !summary ? headroomExhaustedBy(budget, scope, myProjects) : null;
    const nothingText = exhausted === 'share'
        ? t('projects.offers.shareInUse', { share: resourceSummaryText(t, scope, budget.auto_approve.per_requester_limit) })
        : exhausted === 'budget'
            ? t('projects.offers.budgetUsedUp')
            : t('projects.offers.nothing');
    const hardLimit = beyondAutoApproveRefused(budget);
    const takesBudgetRequests = budget.allow_sub_budget_requests !== false;

    return (
        // Tinted, unlike a project card: this is somewhere to get resources
        // from, not something the viewer has.
        <Card withBorder radius="md" padding="sm" bg="var(--mantine-color-gray-light)"
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text fw={700} size="sm" truncate>{budget.name || budget.id}</Text>
                {instant ? (
                    <Badge size="sm" variant="light" color={COLOR.positive} leftSection={<Zap size="11" />}>
                        {t('projects.offers.instant')}
                    </Badge>
                ) : (
                    <Badge size="sm" variant="light" color="gray" leftSection={<Clock size="11" />}>
                        {t('projects.offers.onRequest')}
                    </Badge>
                )}
            </Group>

            <Stack gap={6} style={{ flex: 1 }} mb="sm">
                {/* The same bars a manager sees: what the budget holds, what is taken and what is left. A budget that passes on its parent's limit has no cap of its own; bars at ∞ for the whole catalogue would read as if all of it were there for the asking. */}
                {budget.inherits_limit ? (
                    <FactRow label={t('projects.offers.stillFree')}>{t('projects.offers.noOwnLimit')}</FactRow>
                ) : (
                    <NodeUsageBars resources={visibleResources(resources, budget)} node={budget} />
                )}
                {/* A per-person share is not in the bars: what of it is still the viewer's. */}
                {instant && !isPoolAutoApprove(budget) && (
                    <FactRow label={t('projects.offers.yourShare')}>
                        {summary || nothingText}
                    </FactRow>
                )}
                <FactRow label={instant ? t('projects.fact.beyondThat') : t('projects.offers.everyProject')}>
                    {instant && hardLimit ? t('projects.autoApprove.beyondRefused') : t('projects.autoApprove.beyondManager')}
                </FactRow>
                <FactRow label={t('projects.fact.managedBy')}>
                    <TokenBadgeList size="xs" tokens={budget.admin_scope}
                        emptyMessage={t('projects.fact.managedByEmpty')} />
                </FactRow>
                {budget.termination_date && (
                    <FactRow label={t('projects.fact.validUntil')}>
                        <Text size="xs" c={expiryTone(budget.termination_date) === 'gray'
                            ? undefined
                            : `${expiryTone(budget.termination_date)}.7`}>
                            {expiryValue(t, budget.termination_date)}
                        </Text>
                    </FactRow>
                )}
                {budget.max_project_term_days && (
                    <FactRow label={t('projects.maxTerm.fact')}>
                        <Text size="xs">{t('projects.maxTerm.factValue', { duration: formatTerm(t, budget.max_project_term_days) })}</Text>
                    </FactRow>
                )}
            </Stack>

            <Group gap="xs" grow>
                <NewProjectButton size="xs" kinds={kinds.length > 1 ? budgetKinds(budget, resources) : kinds}
                    onPick={(k) => onNewProject(budget, k)} />
                {takesBudgetRequests && onRequestBudget && (
                    <Button size="xs" variant="light" leftSection={<Inbox size="14" />} onClick={() => onRequestBudget(budget)}>
                        {t('projects.actions.requestBudget')}
                    </Button>
                )}
            </Group>
        </Card>
    );
}

// BudgetOffers lists the budgets the viewer may request from — the answer to
// "where can I get resources, and will I have to wait?" on the page where
// projects are made, instead of in a budget tree meant for their managers.
export function BudgetOffers({ budgets, resources, kinds = [], myProjects, onNewProject, onRequestBudget }) {
    const { t } = useTranslation();
    if (!budgets?.length) return null;
    return (
        <Stack gap="xs">
            <div>
                <Title order={4}>{t('projects.offers.heading')}</Title>
                <Text size="sm" c="dimmed">{t('projects.offers.headingHint')}</Text>
            </div>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {budgets.map(b => (
                    <BudgetOfferCard key={b.id} budget={b} resources={resources} kinds={kinds} myProjects={myProjects}
                        onNewProject={onNewProject} onRequestBudget={onRequestBudget} />
                ))}
            </SimpleGrid>
        </Stack>
    );
}
