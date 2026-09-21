import { Clock, Inbox, Plus, Zap } from 'lucide-react';
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { FactRow, TokenBadgeList } from './component-common.jsx';
import {
    autoApproveHeadroom, COLOR, expiryTone, expiryValue, freeAmount, hasAutoApprove, isAvailability,
    isPoolAutoApprove, resourceSummaryText, UNLIMITED_QUOTA, visibleResources,
} from './util-project.jsx';

// What a budget still offers, as a quota map resourceSummaryText can print:
// an uncapped amount (Infinity) becomes the ∞ it knows.
function printable(amounts) {
    return Object.fromEntries(Object.entries(amounts)
        .map(([id, v]) => [id, v === Infinity ? UNLIMITED_QUOTA : v]));
}

// BudgetOfferCard is one budget the viewer may draw from, seen from the
// requester's side: how much of it is theirs right now, whether taking it needs
// anybody's approval, and the button that starts a project there.
function BudgetOfferCard({ budget, resources, myProjects, onNewProject, onRequestBudget }) {
    const scope = visibleResources(resources, budget).filter(r => !isAvailability(r));
    const instant = hasAutoApprove(budget);
    // With auto-approve the interesting number is what goes through without
    // asking — for a pool the budget's free room, for individual limits the
    // person's remaining share. Without it, it is what the budget still has.
    const available = instant
        ? autoApproveHeadroom(budget, scope, myProjects)
        : Object.fromEntries(scope.map(r => [r.id, freeAmount(budget, r.id)]));
    const summary = resourceSummaryText(scope, printable(available));
    const usedUp = instant && !isPoolAutoApprove(budget) && !summary;
    const takesBudgetRequests = budget.allow_sub_budget_requests !== false;

    return (
        <Card withBorder radius="md" padding="sm" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text fw={700} size="sm" truncate>{budget.name || budget.id}</Text>
                {instant ? (
                    <Badge size="sm" variant="light" color={COLOR.positive} leftSection={<Zap size="11" />}>Instant</Badge>
                ) : (
                    <Badge size="sm" variant="light" color="gray" leftSection={<Clock size="11" />}>On request</Badge>
                )}
            </Group>

            <Stack gap={6} style={{ flex: 1 }} mb="sm">
                <Text size="xs">
                    {usedUp
                        ? 'Your automatic share is used up — further projects go to a manager.'
                        : instant
                            ? <>Yours right away: {summary || 'nothing left'}</>
                            : <>Still free here: {summary || 'nothing'} — a manager approves each project.</>}
                </Text>
                <FactRow label="Managed by">
                    <TokenBadgeList size="xs" tokens={budget.admin_scope} emptyMessage="Whoever manages the budget above" />
                </FactRow>
                {budget.termination_date && (
                    <FactRow label="Valid until">
                        <Text size="xs" c={expiryTone(budget.termination_date) === 'gray'
                            ? undefined
                            : `${expiryTone(budget.termination_date)}.7`}>
                            {expiryValue(budget.termination_date)}
                        </Text>
                    </FactRow>
                )}
            </Stack>

            <Group gap="xs" grow>
                <Button size="xs" leftSection={<Plus size="14" />} onClick={() => onNewProject(budget)}>
                    New project
                </Button>
                {takesBudgetRequests && onRequestBudget && (
                    <Button size="xs" variant="light" leftSection={<Inbox size="14" />} onClick={() => onRequestBudget(budget)}>
                        Request budget
                    </Button>
                )}
            </Group>
        </Card>
    );
}

// BudgetOffers lists the budgets the viewer may request from — the answer to
// "where can I get resources, and will I have to wait?" on the page where
// projects are made, instead of in a budget tree meant for their managers.
export function BudgetOffers({ budgets, resources, myProjects, onNewProject, onRequestBudget }) {
    if (!budgets?.length) return null;
    return (
        <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Budgets you can use</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {budgets.map(b => (
                    <BudgetOfferCard key={b.id} budget={b} resources={resources} myProjects={myProjects}
                        onNewProject={onNewProject} onRequestBudget={onRequestBudget} />
                ))}
            </SimpleGrid>
        </Stack>
    );
}
