import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, History, Rocket, Users, X } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import { Alert, Badge, Box, Button, Card, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { ProjectChangesDiff, ProjectBar } from './component-common.jsx';
import { RequestHistoryModal } from './project-history-modal.jsx';
import { RequestModal } from './project-modal.jsx';
import { ProjectRejectModal } from './project-reject-modal.jsx';
import { isReadOnly, statusStyle, statusLabel, UNLIMITED_QUOTA } from './util-project.jsx';

// One-line resource summary, e.g. "8 vCPUs · 16 GB RAM · 200 GB Disk"
function resourceSummaryText(config, quota) {
    if (!config?.projects || !quota) return '';
    return config.projects
        .filter(r => (quota[r.id] ?? 0) > 0)
        .map(r => r.unit ? `${quota[r.id]} ${r.unit} ${r.name}` : `${quota[r.id]} ${r.name}`)
        .join(' · ');
}

// Shows ResourceBars for all resources in the selected funder,
// with a teal "incoming" segment representing the net new allocation if granted.
// Resources without an explicit cap are shown as unlimited (∞) text rows.
function FunderImpactPanel({ config, funder, incomingQuota }) {
    if (!config?.projects || !funder) return null;

    const limit = funder.quota?.limit ?? {};
    const usageByStatus = funder.quota?.usage_by_status ?? {};
    const approved = usageByStatus.approved?.quota ?? {};
    const changePending = usageByStatus.change_pending?.quota ?? {};

    return (
        <Stack gap="xs">
            <Text size="xs" c="dimmed">Impact after granting:</Text>
            {config.projects.map(r => (
                <ProjectBar
                    key={r.id}
                    resource={r}
                    limit={limit[r.id] ?? UNLIMITED_QUOTA}
                    approved={approved[r.id] ?? 0}
                    changePending={changePending[r.id] ?? 0}
                    incoming={incomingQuota?.[r.id] ?? 0}
                />
            ))}
        </Stack>
    );
}

export function ProjectCard({ req, config, onRelease, onEdit, potentialFunders, onApprove, onReject, onPromote }) {
    const [showHistory, { open, close }] = useDisclosure(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showPromoteModal, setShowPromoteModal] = useState(false);

    const funders = potentialFunders || [];
    const [selectedFunder, setSelectedFunder] = useState(funders[0]?.id ?? null);

    useEffect(() => {
        setSelectedFunder(funders[0]?.id ?? null);
    }, [potentialFunders]);

    const readOnly = isReadOnly(req);
    const isOSOnly = req.status === 'openstack_only';
    const isPendingPromotion = isOSOnly && (req.flags || []).includes('promote_on_reconcile');
    const isApproved = req.status === 'approved';
    const isPending = req.status === 'pending';
    const isChangePending = req.status === 'change_pending';
    const isChangeRejected = req.status === 'change_rejected';
    const isRejected = req.status === 'rejected';
    const hasHistory = req.history && req.history.length > 0;
    const canEdit = !readOnly && (isApproved || isChangeRejected || isRejected) && !req.pending;
    const isAdminView = funders && funders.length > 0;
    const isPendingApproval = isPending || isChangePending;

    const rejectionEntry = hasHistory && (isRejected || isChangeRejected)
        ? [...req.history].reverse().find(h => h.event === 'rejected' || h.event === 'change_rejected')
        : null;
    const rejectionReason = rejectionEntry?.reason;

    const style = statusStyle(req.status);
    const createdDate = hasHistory ? new Date(req.history[0].timestamp).toLocaleDateString() : '';
    const authorizedCount = (req.authorized_users || []).length;

    // Resources to show in the summary line:
    //   change_pending → show the proposed quota; otherwise show current
    const summaryQuota = (isChangePending && req.pending?.quota) ? req.pending.quota : req.quota;
    const resourceSummary = resourceSummaryText(config, summaryQuota);

    // Net incoming quota for the impact panel:
    //   pending       → full requested quota is new
    //   change_pending → only the positive delta per resource
    const selectedFunderObj = funders.find(f => f.id === selectedFunder) ?? null;
    const incomingQuota = isChangePending && req.pending?.quota
        ? Object.fromEntries(
            (config?.projects || []).map(r => [
                r.id,
                Math.max(0, (req.pending.quota[r.id] ?? 0) - (req.quota?.[r.id] ?? 0)),
            ])
        )
        : (req.quota ?? {});

    return (
        <Card withBorder shadow="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box style={{ flex: 1 }}>

                {/* ── Header ──────────────────────────────────────────── */}
                <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                        <Badge color={style.color} variant={style.variant}>
                            {statusLabel(req.status)}
                        </Badge>
                        {req.os_overcommitted && (
                            <Tooltip label="Project is overcommitted: current OS usage exceeds approved quota. New resource creation is blocked.">
                                <Badge color="red" variant="filled" style={{ cursor: 'default' }}>
                                    <AlertTriangle size="11" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                    Overcommitted
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed">{createdDate}</Text>
                </Group>

                {/* ── Purpose ─────────────────────────────────────────── */}
                <Text fw={700} size="sm" mb="xs">
                    {isOSOnly ? (req.os_project_name || req.os_project_id || req.reason) : req.reason}
                </Text>

                {readOnly && (
                    <Alert color={isPendingPromotion ? 'teal' : 'violet'} variant="light" mb="xs" p="xs">
                        {isPendingPromotion
                            ? 'Queued for adoption — the reconciler will transition this project on its next run.'
                            : isAdminView
                                ? 'This project exists in OpenStack without a matching allocation. Use Promote to adopt it into the managed lifecycle.'
                                : 'This project exists in OpenStack but has no matching allocation. It cannot be edited or released.'
                        }
                    </Alert>
                )}

                {/* ── Executive summary ────────────────────────────────── */}
                <Stack gap="3" mb="xs">

                    {isOSOnly && (() => {
                        const owners = (req.requester_tokens || [])
                            .filter(t => t.startsWith('user:'))
                            .map(t => t.slice(5));
                        return owners.length > 0 && (
                            <Group gap="xs" wrap="wrap">
                                <Text size="xs" c="dimmed" style={{ minWidth: 68 }}>Owner:</Text>
                                {owners.map(email => (
                                    <Badge key={email} size="xs" variant="light" color="violet"
                                        style={{ textTransform: 'none' }}>
                                        {email}
                                    </Badge>
                                ))}
                            </Group>
                        );
                    })()}

                    {!isOSOnly && (req.requester_tokens || []).length > 0 && (
                        <Group gap="xs" wrap="wrap">
                            <Text size="xs" c="dimmed" style={{ minWidth: 68 }}>Requester:</Text>
                            {(req.requester_tokens || []).map(t => (
                                <Badge key={t} size="xs" variant="outline" color="gray"
                                    style={{ textTransform: 'none' }}>
                                    {t}
                                </Badge>
                            ))}
                        </Group>
                    )}

                    {resourceSummary && (
                        <Group gap="xs">
                            <Text size="xs" c="dimmed" style={{ minWidth: 68 }}>Resources:</Text>
                            <Text size="xs">{resourceSummary}</Text>
                        </Group>
                    )}

                    <Group gap="xs" wrap="wrap">
                        {req.termination_date && (
                            <Badge size="xs" variant="outline" color="gray">
                                Expires {new Date(req.termination_date).toLocaleDateString()}
                            </Badge>
                        )}
                        {authorizedCount > 0 && (
                            <Badge size="xs" variant="outline" color="gray">
                                <Users size="10" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                {authorizedCount} user{authorizedCount !== 1 ? 's' : ''}
                            </Badge>
                        )}
                        {isApproved && req.funded_by && (
                            <Badge size="xs" variant="light" color="blue"
                                style={{ textTransform: 'none' }}>
                                Funded by: {req.funded_by}
                            </Badge>
                        )}
                    </Group>

                </Stack>

                {/* ── Proposed changes (change_pending) ────────────────── */}
                <ProjectChangesDiff
                    config={config}
                    quotaFrom={req.quota}
                    quotaTo={req.pending?.quota}
                    dateFrom={req.termination_date}
                    dateTo={req.pending?.termination_date}
                    usersFrom={req.authorized_users}
                    usersTo={req.pending?.authorized_users}
                />

                {/* ── Rejection reason ─────────────────────────────────── */}
                {rejectionReason && (
                    <Card.Section withBorder inheritPadding py="xs" mt="xs">
                        <Group gap="xs">
                            <X size="14" />
                            <Text size="xs">{rejectionReason}</Text>
                        </Group>
                    </Card.Section>
                )}

            </Box>

            {/* ── Funder selector + impact panel (admin, pending only) ─── */}
            {!readOnly && isAdminView && isPendingApproval && (
                <Card.Section withBorder inheritPadding py="xs">
                    <Text size="xs" c="dimmed" mb="xs">Grant funding from:</Text>
                    <Select
                        size="sm"
                        placeholder="Fund from…"
                        data={funders.map(f => ({ value: f.id, label: f.name || f.id }))}
                        value={selectedFunder}
                        onChange={setSelectedFunder}
                    />
                    {selectedFunderObj && (
                        <Box mt="xs">
                            <FunderImpactPanel
                                config={config}
                                funder={selectedFunderObj}
                                incomingQuota={incomingQuota}
                            />
                        </Box>
                    )}
                </Card.Section>
            )}

            {/* ── Action buttons ────────────────────────────────────────── */}
            <Card.Section withBorder inheritPadding py="xs" mt="auto">
                <Group grow>
                    <Button variant="light" size="xs" onClick={() => setShowViewModal(true)}>
                        <Eye size="13" style={{ marginRight: 4 }} />View
                    </Button>
                    <Button variant="light" size="xs" disabled={!hasHistory} onClick={open}>
                        <History size="13" style={{ marginRight: 4 }} />History
                    </Button>
                    {readOnly && isAdminView && onPromote && !isPendingPromotion && (
                        <Button color="violet" variant="light" size="xs"
                            onClick={() => setShowPromoteModal(true)}>
                            <Rocket size="13" style={{ marginRight: 4 }} />Promote
                        </Button>
                    )}
                    {canEdit && onEdit && (
                        <Button variant="light" size="xs" onClick={() => onEdit(req)}>
                            Edit
                        </Button>
                    )}
                    {!readOnly && (isApproved || isChangeRejected || isRejected) && onRelease && (
                        <Button color="red" variant="light" size="xs" onClick={() => onRelease(req.id)}>
                            Release
                        </Button>
                    )}
                    {!readOnly && isAdminView && isPendingApproval && (
                        <>
                            <Button color="green" variant="light" size="xs"
                                disabled={!selectedFunder}
                                onClick={() => onApprove(req.id, selectedFunder)}>
                                Approve
                            </Button>
                            <Button color="red" variant="light" size="xs"
                                onClick={() => setShowRejectModal(true)}>
                                Reject
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>

            {/* ── Modals ────────────────────────────────────────────────── */}
            <RequestHistoryModal opened={showHistory} onClose={close} request={req} config={config} />

            <RequestModal
                opened={showViewModal}
                onClose={() => setShowViewModal(false)}
                config={config}
                readOnly
                initialData={req}
            />

            {!readOnly && (
                <ProjectRejectModal
                    request={req}
                    opened={showRejectModal}
                    onClose={() => setShowRejectModal(false)}
                    onSubmit={(reason) => { onReject(req.id, reason); setShowRejectModal(false); }}
                />
            )}

            {readOnly && isAdminView && onPromote && (
                <RequestModal
                    opened={showPromoteModal}
                    onClose={() => setShowPromoteModal(false)}
                    promoteProject={req}
                    config={config}
                    onSubmit={async (body) => {
                        await onPromote(req.id, body);
                        setShowPromoteModal(false);
                    }}
                />
            )}
        </Card>
    );
}
