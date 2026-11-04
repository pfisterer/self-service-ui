import { Activity, AlertTriangle, ExternalLink, Eye, Gift, Pencil, Play, Rocket, Scale, Trash2, Users, X } from 'lucide-react';
import { Alert, Anchor, Badge, Box, Button, Card, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { CopyLinkButton, DeletingBadge, FactRow, NodeChangesDiff, NodeStatusBadge, PersonBadge, PurgeProgress, TokenBadgeList } from './component-common.jsx';
import { COLOR, deletesOnRequest, deletionRequested, effectiveLimit, expiryTone, expiryValue, getAuthUserEmail, hasAllocations, isImported, isProvisioning, isRetired, lastEventAt, openstackProjectUrl, overageEntries, overageText, ownerEmail, projectActions, resourceSummaryText, finalDeletion, labDeletion, openstackSide, catalogKinds, projectKinds } from './util-project.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { useProjectConfig } from './projects.jsx';
import { formatDate } from '../format-date.js';
import { BudgetPath } from './component-budget-path.jsx';
import { ProjectResources } from './component-project-resources.jsx';
import { LlmLimitHints } from './component-llm-limits.jsx';
import { TAB_USAGE } from './modal-inspect.jsx';

// ProjectCard renders one project leaf. It is purely presentational: every
// button reports an action to the owning view via onAction(actionId, node),
// and the view opens the matching dialog. This keeps a single instance of each
// dialog per view instead of one per card.
//
// perspective:
//   'owner'    the viewer owns or administers this project (My Projects)
//   'member'   the viewer only works in it as an authorized user (My Projects): read-only, only its details
//   'manager'  the viewer decides on it (Approvals)
// How many members a card names before it counts the rest.
const MEMBERS_SHOWN = 5;

//
// link: when set, a button next to the date copies this link to the project.
// jobs: what the project allows of batch jobs ({perPerson, hours}), else null.
// start: where a workspace of the project starts (the start page with it chosen), else null.
// envBuild: the build of the project's workspace environment from Git while it builds or after it failed ({status, message, hasImage}), else null.
export function ProjectCard({ node, resources, parentName, perspective = 'owner', onAction, link, envBuild, jobs, start }) {
    const { t } = useTranslation();
    const act = (action, tab) => onAction?.(action, node, tab);
    const config = useProjectConfig();

    const imported = isImported(node);
    // Cloud, AI or both — only where the catalogue has both to tell apart.
    const kinds = catalogKinds(resources).length > 1 ? projectKinds(node, resources) : [];
    // Approved but not in OpenStack yet — the reconciler runs on an interval.
    const provisioning = isProvisioning(node, config?.provisioningEnabled, resources, config?.providers);
    const openstackUrl = openstackProjectUrl(config?.openstackDashboardUrl, node);
    const isChangePending = node.status === 'change_pending';
    const isRejected = node.status === 'rejected';
    const hasHistory = (node.history || []).length > 0;
    const isManager = perspective === 'manager';
    const isMember = perspective === 'member';
    // A member reads the project and works in it; changing, releasing and deleting it stay with its owner and admins (the API refuses them too).
    const can = isMember ? { details: true } : projectActions(node, { manager: isManager, canDelete: deletesOnRequest(config?.retirement) });
    // Given up: when it was put away, and when it goes by itself.
    const archivedAt = node.status === 'archived' ? lastEventAt(node, 'archived') : null;
    // A retired project has one day it goes for good, wherever it lives; an active one only the day its Lab/AI part goes after its end.
    const deletionAt = deletionRequested(node) ? null : finalDeletion(node, resources, config?.retirement);
    const labDeletionAt = deletionRequested(node) || isRetired(node) ? null : labDeletion(node, resources, config?.retirement);

    const createdDate = node.created_at ? formatDate(node.created_at) : '';
    const owner = ownerEmail(node);
    // In My Projects a card is either the viewer's own project or one they
    // administer with its owner — then who that owner is belongs on it too.
    const { user } = useAuth();
    const me = getAuthUserEmail(user).toLowerCase();
    const shared = !isManager && !!owner && owner.toLowerCase() !== me;
    // Always, also on one's own project: every card then reads the same way.
    const showOwner = !!owner;
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
    // An LLM project that is still in use: say when its limits keep it from working (no tokens, rates too low).
    const llmHints = projectKinds(node, resources).includes('llm') && !isRetired(node) && !isRejected && !deletionRequested(node);

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
                        <NodeStatusBadge status={node.status} provisioning={provisioning} deletionAt={deletionAt} />
                        {kinds.map(k => (
                            <Badge key={k} color={COLOR.identity} variant="light">{t(`projects.kind.${k}`)}</Badge>
                        ))}
                        {deletionRequested(node) && <DeletingBadge size="sm" purge={openstackSide(node).purge} />}
                        {envBuild && <EnvBuildBadge build={envBuild} />}
                        {jobs && <Badge color={COLOR.identity} variant="outline" tt="none">{t('projects.projectCard.jobs', { count: jobs.perPerson, hours: jobs.hours })}</Badge>}
                        {/* Who shared it says it all, so it stands on the badge rather
                            than behind a hover nobody finds. Not uppercased: an
                            address in capitals is hard to read. */}
                        {shared && (
                            <Tooltip label={t('projects.projectCard.memberTip')} disabled={!isMember} multiline w={280} withArrow>
                                <Badge color={COLOR.identity} variant="outline" tt="none" leftSection={<Users size="11" />}>
                                    {t(isMember ? 'projects.projectCard.memberOf' : 'projects.projectCard.sharedBy', { owner })}
                                </Badge>
                            </Tooltip>
                        )}
                        {openstackSide(node).overcommitted && (
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
                    <Group gap={4} wrap="nowrap">
                        <Text size="xs" c="dimmed">{createdDate}</Text>
                        {link && <CopyLinkButton link={link} />}
                    </Group>
                </Group>

                {/* Emptying before the deletion takes passes; this is how far it got. */}
                {deletionRequested(node) && <PurgeProgress purge={openstackSide(node).purge} />}

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
                    ) : (imported ? (openstackSide(node).external_name || openstackSide(node).external_id || node.id) : (node.name || node.reason))}
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
                        <FactRow label={t('projects.fact.resources')}>
                            <ProjectResources node={node} resources={resources}
                                quota={effectiveLimit(node, summaryQuota)} size="sm" />
                        </FactRow>
                    )}

                    {/* With allocations, which budget pays for what: the own
                        share from the project's budget, the rest from further up. */}
                    {allocated ? (
                        <FactRow label={t('projects.fact.paidFrom')}>
                            <Stack gap={2}>
                                <Text size="xs">
                                    <b>{parentName ? <BudgetPath path={node.parent_path} name={parentName} inherit /> : t('projects.allocation.ownBudget')}</b>
                                    {' · '}{resourceSummaryText(resources, summaryQuota) || '—'}
                                </Text>
                                {node.allocations.map(a => (
                                    <Text size="xs" key={a.budget_id}>
                                        <Gift size="11" style={{ verticalAlign: '-1px', marginRight: 4, color: `var(--mantine-color-${COLOR.info}-7)` }} />
                                        <b><BudgetPath path={a.budget_path} name={a.budget_name || a.budget_id} inherit /></b>
                                        {' · '}{resourceSummaryText(resources, a.limit)}
                                        <Text span size="xs" c="dimmed">{' '}({t('projects.allocation.badge')})</Text>
                                    </Text>
                                ))}
                            </Stack>
                        </FactRow>
                    ) : parentName && (
                        <FactRow label={t('projects.fact.paidFrom')}>
                            <BudgetPath path={node.parent_path} name={parentName} />
                        </FactRow>
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
                    {/* The Lab/AI part goes by itself after the end: from then on the date is the message. */}
                    {labDeletionAt && (
                        <FactRow label={t('projects.fact.labDeletion')} hint={t('projects.fact.labDeletionHint')}>
                            <Text size="xs" c={expiryTone(labDeletionAt) === 'gray' ? undefined : `${expiryTone(labDeletionAt)}.7`}>
                                {formatDate(labDeletionAt)}
                            </Text>
                        </FactRow>
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

                {llmHints && (
                    <Box mb="xs">
                        <LlmLimitHints compact resources={resources} limit={effectiveLimit(node, summaryQuota)} />
                    </Box>
                )}

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
                    {/* One dialog per project, with history and usage as tabs:
                        editable where it may be changed, read-only otherwise.
                        Editing is not an owner privilege: a manager of the
                        funding chain may change a project too, and on a request
                        that is still pending their edit amends it in place —
                        which is how you trim an over-sized request instead of
                        rejecting it. On an approved project the same edit
                        becomes a proposal they then approve. */}
                    {can.change ? (
                        <Button variant="light" size="xs" onClick={() => act('change')}>
                            <Pencil size="13" style={{ marginRight: 4 }} />{t('projects.actions.edit')}
                        </Button>
                    ) : (
                        <Button variant="light" size="xs" onClick={() => act('details')}>
                            <Eye size="13" style={{ marginRight: 4 }} />{t('projects.actions.details')}
                        </Button>
                    )}
                    {/* What it consumes: the same dialog, on its consumption tab. */}
                    <Button variant="light" size="xs" onClick={() => act(can.change ? 'change' : 'details', TAB_USAGE)}>
                        <Activity size="13" style={{ marginRight: 4 }} />{t('projects.consumption.tab')}
                    </Button>
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
                    {can.decide && (
                        <>
                            {/* One dialog for both answers: approve or reject,
                                knowing the same facts. */}
                            <Button color={COLOR.attention} variant="light" size="xs" onClick={() => act('decide')}>
                                <Scale size="13" style={{ marginRight: 4 }} />{t('projects.actions.decide')}
                            </Button>
                        </>
                    )}
                    {can.adopt && (
                        <Button color={COLOR.outside} variant="light" size="xs" onClick={() => act('adopt')}>
                            <Rocket size="13" style={{ marginRight: 4 }} />{t('projects.actions.adopt')}
                        </Button>
                    )}
                </Group>
                {/* The main action on a line of its own below, the whole width: beside three others its label was cut off. */}
                {start && (
                    <Button fullWidth mt="xs" variant="filled" size="xs" component={Link} href={start}>
                        <Play size="13" style={{ marginRight: 4 }} />{t('projects.actions.startWorkspace')}
                    </Button>
                )}
            </Card.Section>
        </Card>
    );
}

// EnvBuildBadge says that the project's environment is being built (servers wait for it, or start with the previous one) or that its build failed, with the reason on hover.
function EnvBuildBadge({ build }) {
    const { t } = useTranslation();
    if (build.status === 'failed') {
        return (
            <Tooltip label={t('projects.projectCard.envFailedTip', { message: build.message })} multiline w={320} withArrow>
                <Badge color="red" variant="light" leftSection={<AlertTriangle size="11" />}>{t('projects.projectCard.envFailed')}</Badge>
            </Tooltip>
        );
    }
    const key = build.hasImage ? 'envRebuilding' : 'envBuilding';
    return (
        <Tooltip label={t(`projects.projectCard.${key}Tip`)} multiline w={320} withArrow>
            <Badge color="blue" variant="light" leftSection={<Loader size={10} color="blue" />}>{t(`projects.projectCard.${key}`)}</Badge>
        </Tooltip>
    );
}
