import { AlertTriangle, ArrowRightLeft, Check, Eye, FolderInput, Pencil, Rocket, X } from 'lucide-react';
import { Alert, Badge, Box, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { FactRow, NodeChangesDiff, NodeStatusBadge, PersonBadge } from './component-common.jsx';
import { COLOR, expiryTone, expiryValue, isImported, isProvisioning, overageEntries, overageText, ownerEmail, resourceSummaryText } from './util-project.jsx';
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
export function ProjectCard({ node, resources, parentName, perspective = 'owner', onAction }) {
    const act = (action) => onAction?.(action, node);
    const config = useProjectConfig();

    const imported = isImported(node);
    // Approved but not in OpenStack yet — the reconciler runs on an interval.
    const provisioning = isProvisioning(node, config?.provisioningEnabled);
    const isApproved = node.status === 'approved';
    const isPending = node.status === 'pending';
    const isChangePending = node.status === 'change_pending';
    const isRejected = node.status === 'rejected';
    const hasHistory = (node.history || []).length > 0;
    const isManager = perspective === 'manager';

    const createdDate = node.created_at ? formatDate(node.created_at) : '';
    const authorizedCount = (node.authorized_users || []).length;
    const owner = ownerEmail(node);

    // Resources shown in the summary line: the proposed limit while a change
    // awaits approval, the current limit otherwise.
    const summaryQuota = (isChangePending && node.pending?.limit) ? node.pending.limit : node.limit;
    const resourceSummary = resourceSummaryText(resources, summaryQuota);

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
                        {node.os_overcommitted && (
                            <Tooltip label={overage.length > 0
                                ? `Uses ${overageText(overage)} in OpenStack, more than granted. The budget is charged the larger figure, and creating new resources is blocked.`
                                : 'The project currently uses more in OpenStack than was granted. Creating new resources is blocked.'}>
                                <Badge color={COLOR.negative} variant="filled" style={{ cursor: 'default' }}>
                                    <AlertTriangle size="11" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    Overcommitted
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed">{createdDate}</Text>
                </Group>

                {/* ── Purpose ────────────────────────────────────────────── */}
                <Text fw={700} size="sm" mb="xs">
                    {imported ? (node.os_project_name || node.os_project_id || node.id) : (node.name || node.reason)}
                </Text>

                {imported && (
                    <Alert color={COLOR.outside} variant="light" mb="xs" p="xs">
                        {(node.flags || []).includes('promote_on_reconcile')
                            ? 'Queued for adoption — the next synchronization run will bring this project under management.'
                            : isManager
                                ? 'This project exists in OpenStack but is not managed here yet. Use “Adopt” to place it under a budget.'
                                : 'This project exists in OpenStack but is not managed here. It cannot be edited.'}
                    </Alert>
                )}

                {/* ── Key facts ──────────────────────────────────────────── */}
                <Stack gap="6" mb="xs">
                    {isManager && owner && (
                        <FactRow label="Owner">
                            <PersonBadge email={owner} size="xs" />
                        </FactRow>
                    )}

                    {parentName && (
                        <FactRow label="Paid from">{parentName}</FactRow>
                    )}

                    {resourceSummary && (
                        <FactRow label="Resources">{resourceSummary}</FactRow>
                    )}

                    {/* Only the resources that exceed their limit, so the row
                        stays short and every figure on it is the reason the
                        badge is there. */}
                    {overage.length > 0 && (
                        <FactRow label="In use" hint="Charged to the budget instead of the granted amount.">
                            <Text size="xs" c={COLOR.negative} fw={600}>{overageText(overage)}</Text>
                        </FactRow>
                    )}

                    {/* Only a date that is close keeps a colour, because then it
                        IS the message; anything further out reads like the rows
                        above it. */}
                    {node.termination_date && (
                        <FactRow label="Valid until">
                            <Text size="xs" c={expiryTone(node.termination_date) === 'gray'
                                ? undefined
                                : `${expiryTone(node.termination_date)}.7`}>
                                {expiryValue(node.termination_date)}
                            </Text>
                        </FactRow>
                    )}

                    {authorizedCount > 0 && (
                        <FactRow label="Members">
                            {`the owner and ${authorizedCount} other${authorizedCount !== 1 ? 's' : ''}`}
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
                        <Eye size="13" style={{ marginRight: 4 }} />Details
                    </Button>

                    {/* Editing is not an owner privilege: a manager of the funding
                        chain may change a project too, and on a request that is
                        still pending their edit amends it in place — which is how
                        you trim an over-sized request instead of rejecting it.
                        On an approved project the same edit becomes a proposal
                        they then approve, for owners and managers alike. */}
                    {(isApproved || isPending) && (
                        <Button variant="light" size="xs" onClick={() => act('change')}>
                            <Pencil size="13" style={{ marginRight: 4 }} />Edit
                        </Button>
                    )}
                    {/* Also a manager's to do: they carry the budget it is paid
                        from, and the API has always allowed a manager of the
                        funding chain to release a leaf. Without the button they
                        had to ask the owner to hand back resources. */}
                    {isApproved && (
                        <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('release')}>
                            Release
                        </Button>
                    )}

                    {/* Manager actions */}
                    {isManager && (isPending || isChangePending) && (
                        <>
                            <Button color={COLOR.positive} variant="light" size="xs" onClick={() => act('approve')}>
                                <Check size="13" style={{ marginRight: 4 }} />Approve
                            </Button>
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('reject')}>
                                <X size="13" style={{ marginRight: 4 }} />Reject
                            </Button>
                        </>
                    )}
                    {isManager && imported && !(node.flags || []).includes('promote_on_reconcile') && (
                        <Button color={COLOR.outside} variant="light" size="xs" onClick={() => act('adopt')}>
                            <Rocket size="13" style={{ marginRight: 4 }} />Adopt
                        </Button>
                    )}
                    {isManager && isApproved && (
                        <>
                            <Button variant="light" size="xs" onClick={() => act('transfer')}>
                                <ArrowRightLeft size="13" style={{ marginRight: 4 }} />Owner
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('move')}>
                                <FolderInput size="13" style={{ marginRight: 4 }} />Move
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>
        </Card>
    );
}
