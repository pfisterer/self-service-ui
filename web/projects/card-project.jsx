import { AlertTriangle, ArrowRightLeft, Check, ExternalLink, Eye, FolderInput, Gift, Pencil, Rocket, Trash2, Users, X } from 'lucide-react';
import { Alert, Anchor, Badge, Box, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { DeletingBadge, FactRow, NodeChangesDiff, NodeStatusBadge, PersonBadge, TokenBadgeList } from './component-common.jsx';
import { COLOR, deletesOnRequest, deletionRequested, effectiveLimit, expiryTone, expiryValue, getAuthUserEmail, hasAllocations, isImported, isProvisioning, isRetired, lastEventAt, openstackProjectUrl, overageEntries, overageText, ownerEmail, projectActions, resourceSummaryText, scheduledDeletion } from './util-project.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useTranslation } from 'react-i18next';
import { useProjectConfig } from './projects.jsx';
import { formatDate } from '../format-date.js';

// ProjectCard renders one project leaf. It is purely presentational: every
// button reports an action to the owning view via onAction(actionId, node),
// and the view opens the matching dialog. This keeps a single instance of each
// dialog per view instead of one per card.
//
// perspective:
//   'owner'    the viewer owns this project (My Projects)
//   'manager'  the viewer decides on it (Approvals)
// How many members a card names before it counts the rest.
const MEMBERS_SHOWN = 5;

export function ProjectCard({ node, resources, parentName, perspective = 'owner', onAction }) {
    const { t } = useTranslation();
    const act = (action) => onAction?.(action, node);
    const config = useProjectConfig();

    const imported = isImported(node);
    // Approved but not in OpenStack yet — the reconciler runs on an interval.
    const provisioning = isProvisioning(node, config?.provisioningEnabled);
    const openstackUrl = openstackProjectUrl(config?.openstackDashboardUrl, node);
    const isChangePending = node.status === 'change_pending';
    const isRejected = node.status === 'rejected';
    const hasHistory = (node.history || []).length > 0;
    const isManager = perspective === 'manager';
    const can = projectActions(node, { manager: isManager, canDelete: deletesOnRequest(config?.retirement) });
    // Given up: when it was put away, and when it goes by itself.
    const archivedAt = node.status === 'archived' ? lastEventAt(node, 'archived') : null;
    const deletionAt = deletionRequested(node) ? null : scheduledDeletion(node, config?.retirement);

    const createdDate = node.created_at ? formatDate(node.created_at) : '';
    const owner = ownerEmail(node);
    // In My Projects a card is either the viewer's own project or one they
    // administer with its owner — then who that owner is belongs on it too.
    const { user } = useAuth();
    const me = getAuthUserEmail(user).toLowerCase();
    const shared = !isManager && !!owner && owner.toLowerCase() !== me;
    const showOwner = owner && (isManager || shared);
    const admins = node.admin_scope || [];
    // A few members by name say more than a count: "Owner + 1" read as if the
    // owner were one of two people, whoever the one was.
    const memberTokens = (node.authorized_users || []).map(u => u.token);
    const shownMembers = memberTokens.slice(0, MEMBERS_SHOWN);

    // Resources shown in the summary line: the proposed limit while a change
    // awaits approval, the current limit otherwise.
    const summaryQuota = (isChangePending && node.pending?.limit) ? node.pending.limit : node.limit;
    // In total, allocations from budgets further up included — that is what
    // the project has in OpenStack. Where it comes from is the next row.
    const resourceSummary = resourceSummaryText(resources, effectiveLimit(node, summaryQuota));
    const allocated = hasAllocations(node);

    // What OpenStack measures where that exceeds the limit above. This is the
    // number the budget is actually charged, so leaving it off turns the
    // Overcommitted badge into a claim the card itself contradicts.
    const overage = overageEntries(resources, node);

    // Rejection reason (if this project was rejected): last matching history entry.
    const rejectionReason = isRejected && hasHistory
        ? [...node.history].reverse().find(h => h.event === 'rejected')?.reason
        : null;

    return (
        <Card withBorder shadow="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box style={{ flex: 1 }}>

                {/* ── Header: status + creation date ─────────────────────── */}
                <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                        <NodeStatusBadge status={node.status} provisioning={provisioning} />
                        {deletionRequested(node) && <DeletingBadge size="sm" />}
                        {/* Who shared it says it all, so it stands on the badge rather
                            than behind a hover nobody finds. Not uppercased: an
                            address in capitals is hard to read. */}
                        {shared && (
                            <Badge color={COLOR.identity} variant="outline" tt="none" leftSection={<Users size="11" />}>
                                {t('projects.projectCard.sharedBy', { owner })}
                            </Badge>
                        )}
                        {node.os_overcommitted && (
                            <Tooltip label={overage.length > 0
                                ? t('projects.projectCard.overcommittedWithAmount', { amount: overageText(overage) })
                                : t('projects.projectCard.overcommitted')}>
                                <Badge color={COLOR.negative} variant="filled" style={{ cursor: 'default' }}>
                                    <AlertTriangle size="11" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    {t('projects.projectCard.overcommittedBadge')}
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed">{createdDate}</Text>
                </Group>

                {/* ── Purpose ────────────────────────────────────────────── */}
                {/* The name opens the project in OpenStack wherever there is
                    one to open (see openstackProjectUrl); otherwise it is text. */}
                <Text fw={700} size="sm" mb="xs">
                    {openstackUrl ? (
                        <Anchor href={openstackUrl} target="_blank" rel="noopener noreferrer" inherit
                            title={t('projects.projectCard.openInOpenStack')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {node.name || node.reason} <ExternalLink size="12" />
                        </Anchor>
                    ) : (imported ? (node.os_project_name || node.os_project_id || node.id) : (node.name || node.reason))}
                </Text>

                {imported && (
                    <Alert color={COLOR.outside} variant="light" mb="xs" p="xs">
                        {(node.flags || []).includes('promote_on_reconcile')
                            ? t('projects.projectCard.adoptionQueued')
                            : isManager
                                ? t('projects.projectCard.importedManager')
                                : t('projects.projectCard.imported')}
                    </Alert>
                )}

                {/* ── Key facts ──────────────────────────────────────────── */}
                <Stack gap="6" mb="xs">
                    {showOwner && (
                        <FactRow label={t('projects.fact.owner')}>
                            <PersonBadge email={owner} size="xs" />
                        </FactRow>
                    )}

                    {admins.length > 0 && (
                        <FactRow label={t('projects.fact.admins')}>
                            <TokenBadgeList tokens={admins} size="xs" />
                        </FactRow>
                    )}

                    {resourceSummary && (
                        <FactRow label={t('projects.fact.resources')}>{resourceSummary}</FactRow>
                    )}

                    {/* With allocations, which budget pays for what: the own
                        share from the project's budget, the rest from further up. */}
                    {allocated ? (
                        <FactRow label={t('projects.fact.paidFrom')}>
                            <Stack gap={2}>
                                <Text size="xs">
                                    <b>{parentName || t('projects.allocation.ownBudget')}</b>
                                    {' · '}{resourceSummaryText(resources, summaryQuota) || '—'}
                                </Text>
                                {node.allocations.map(a => (
                                    <Text size="xs" key={a.budget_id}>
                                        <Gift size="11" style={{ verticalAlign: '-1px', marginRight: 4, color: `var(--mantine-color-${COLOR.info}-7)` }} />
                                        <b>{a.budget_name || a.budget_id}</b>
                                        {' · '}{resourceSummaryText(resources, a.limit)}
                                        <Text span size="xs" c="dimmed">{' '}({t('projects.allocation.badge')})</Text>
                                    </Text>
                                ))}
                            </Stack>
                        </FactRow>
                    ) : parentName && (
                        <FactRow label={t('projects.fact.paidFrom')}>{parentName}</FactRow>
                    )}

                    {/* Only the resources that exceed their limit, so the row
                        stays short and every figure on it is the reason the
                        badge is there. */}
                    {overage.length > 0 && (
                        <FactRow label={t('projects.fact.inUse')} hint={t('projects.projectCard.inUseHint')}>
                            <Text size="xs" c={COLOR.negative} fw={600}>{overageText(overage)}</Text>
                        </FactRow>
                    )}

                    {/* Only a date that is close keeps a colour, because then it
                        IS the message; anything further out reads like the rows
                        above it. */}
                    {node.termination_date && !isRetired(node) && (
                        <FactRow label={t('projects.fact.validUntil')}>
                            <Text size="xs" c={expiryTone(node.termination_date) === 'gray'
                                ? undefined
                                : `${expiryTone(node.termination_date)}.7`}>
                                {expiryValue(t, node.termination_date)}
                            </Text>
                        </FactRow>
                    )}

                    {archivedAt && (
                        <FactRow label={t('projects.fact.archivedOn')}>{formatDate(archivedAt)}</FactRow>
                    )}
                    {deletionAt && (
                        <FactRow label={t('projects.fact.deletion')}>{formatDate(deletionAt)}</FactRow>
                    )}

                    {memberTokens.length > 0 && (
                        <FactRow label={t('projects.fact.members')}>
                            <Group gap="xs" wrap="wrap">
                                <TokenBadgeList tokens={shownMembers} size="xs" />
                                {memberTokens.length > shownMembers.length && (
                                    <Text size="xs" c="dimmed">
                                        {t('projects.projectCard.membersMore', { count: memberTokens.length - shownMembers.length })}
                                    </Text>
                                )}
                            </Group>
                        </FactRow>
                    )}
                </Stack>

                {/* ── Proposed changes while change_pending ──────────────── */}
                <NodeChangesDiff
                    resources={resources}
                    limitFrom={node.limit}
                    limitTo={node.pending?.limit}
                    dateFrom={node.termination_date}
                    dateTo={node.pending?.termination_date}
                    usersFrom={node.authorized_users}
                    usersTo={node.pending?.authorized_users}
                />

                {rejectionReason && (
                    <Card.Section withBorder inheritPadding py="xs" mt="xs">
                        <Group gap="xs">
                            <X size="14" />
                            <Text size="xs">{rejectionReason}</Text>
                        </Group>
                    </Card.Section>
                )}
            </Box>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <Card.Section withBorder inheritPadding py="xs" mt="auto">
                <Group grow>
                    {/* Details carries the history with it, as a tab. Two buttons
                        for one dialog only made the row longer. */}
                    <Button variant="light" size="xs" onClick={() => act('details')}>
                        <Eye size="13" style={{ marginRight: 4 }} />{t('projects.actions.details')}
                    </Button>

                    {/* Editing is not an owner privilege: a manager of the funding
                        chain may change a project too, and on a request that is
                        still pending their edit amends it in place — which is how
                        you trim an over-sized request instead of rejecting it.
                        On an approved project the same edit becomes a proposal
                        they then approve, for owners and managers alike. */}
                    {can.change && (
                        <Button variant="light" size="xs" onClick={() => act('change')}>
                            <Pencil size="13" style={{ marginRight: 4 }} />{t('projects.actions.edit')}
                        </Button>
                    )}
                    {/* Also a manager's to do: they carry the budget it is paid
                        from, and the API has always allowed a manager of the
                        funding chain to release a leaf. Without the button they
                        had to ask the owner to hand back resources. */}
                    {can.release && (
                        <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('release')}>
                            {t('projects.actions.release')}
                        </Button>
                    )}
                    {can.deleteForGood && (
                        <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('delete-for-good')}>
                            <Trash2 size="13" style={{ marginRight: 4 }} />{t('projects.actions.deleteForGood')}
                        </Button>
                    )}

                    {/* Manager actions */}
                    {can.approve && (
                        <>
                            <Button color={COLOR.positive} variant="light" size="xs" onClick={() => act('approve')}>
                                <Check size="13" style={{ marginRight: 4 }} />{t('projects.actions.approve')}
                            </Button>
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('reject')}>
                                <X size="13" style={{ marginRight: 4 }} />{t('projects.actions.reject')}
                            </Button>
                        </>
                    )}
                    {can.allocate && (
                        <Button variant="light" size="xs" onClick={() => act('allocate')}>
                            <Gift size="13" style={{ marginRight: 4 }} />{t('projects.actions.allocate')}
                        </Button>
                    )}
                    {can.adopt && (
                        <Button color={COLOR.outside} variant="light" size="xs" onClick={() => act('adopt')}>
                            <Rocket size="13" style={{ marginRight: 4 }} />{t('projects.actions.adopt')}
                        </Button>
                    )}
                    {can.transfer && (
                        <>
                            <Button variant="light" size="xs" onClick={() => act('transfer')}>
                                <ArrowRightLeft size="13" style={{ marginRight: 4 }} />{t('projects.actions.ownerAction')}
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('move')}>
                                <FolderInput size="13" style={{ marginRight: 4 }} />{t('projects.actions.move')}
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>
        </Card>
    );
}
