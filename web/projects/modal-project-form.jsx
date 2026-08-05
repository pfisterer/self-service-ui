import { useEffect, useMemo, useState } from 'react';
import { Select, Stack, Text, Textarea } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { NodeChangesDiff, TerminationDatePicker } from './component-common.jsx';
import { FormModal, FormTabs, useFormErrors } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenRoleEditor } from './component-token-role-editor.jsx';
import { autoApproveHeadroom, COLOR, formatError, freeAmount, quotaFits, resourceSummaryText } from './util-project.jsx';

const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_MEMBERS = 'members';

// BudgetSelect groups the budgets a user can place a project under:
//   - budgets they manage → the project is created active immediately
//   - budgets they may request under → the project awaits approval
//     (or is approved instantly when the budget's auto-approve covers it)
function BudgetSelect({ myBudgets, eligibleBudgets, resources, requestedQuota, value, onChange, error }) {
    const data = useMemo(() => {
        const managedIds = new Set((myBudgets || []).map(b => b.id));
        const remainingText = (b) => resources
            .filter(r => freeAmount(b, r.id) !== Infinity)
            .map(r => `${freeAmount(b, r.id)} ${r.unit || ''} ${r.name}`.replace('  ', ' '))
            .join(', ');

        const managed = (myBudgets || []).map(b => ({
            value: b.id,
            label: `${b.name || b.id}${remainingText(b) ? ` — free: ${remainingText(b)}` : ''}`,
        }));

        const eligible = (eligibleBudgets || [])
            .filter(b => !managedIds.has(b.id))
            .map(b => {
                const auto = b.auto_approve?.per_requester_limit;
                const hint = auto ? ` — instant up to ${resourceSummaryText(resources, auto)} per person` : '';
                return { value: b.id, label: `${b.name || b.id}${hint}` };
            });

        const groups = [];
        if (managed.length) groups.push({ group: 'Budgets you manage (created immediately)', items: managed });
        if (eligible.length) groups.push({ group: 'Budgets you can request under (needs approval)', items: eligible });
        return groups;
    }, [myBudgets, eligibleBudgets, resources]);

    const selected = [...(myBudgets || []), ...(eligibleBudgets || [])].find(b => b.id === value);
    const overCap = selected && requestedQuota && !quotaFits(selected, requestedQuota, resources);

    if (!data.length) {
        return (
            <Select label="Budget" required data={[]} value={null} disabled error={error}
                description="You cannot request a project right now — ask your lecturer or administrator to add you to a budget." />
        );
    }

    return (
        <Stack gap="4">
            <Select
                label="Budget"
                description="Every project lives under a budget that provides its resources."
                required
                searchable
                data={data}
                value={value}
                onChange={onChange}
                error={error}
                placeholder="Choose where to request this project"
            />
            {overCap && (
                <Text size="xs" c="orange">
                    The requested amount exceeds this budget's free capacity — the request will
                    wait until a manager decides (they may grant an adjusted amount).
                </Text>
            )}
        </Stack>
    );
}

// ProjectFormModal creates a new project request or proposes changes to an
// existing project (mode is derived from `node`):
//   node == null  → create: budget picker + purpose + resources + members
//   node != null  → change: resources, end date and members are editable;
//                   pending projects are amended in place, active projects get
//                   a change request that a manager must approve.
export function ProjectFormModal({ opened, onClose, onDone, resources, openstackRoles, node = null, myBudgets = [], eligibleBudgets = [], myProjects = [] }) {
    const api = useNodesApi();
    const isChange = !!node;

    const [activeTab, setActiveTab] = useState(TAB_DETAILS);
    const [parentId, setParentId] = useState(null);
    const [reason, setReason] = useState('');
    const [quota, setQuota] = useState({});
    const [terminationDate, setTerminationDate] = useState(null);
    const [authorizedUsers, setAuthorizedUsers] = useState([]);
    const { errors, setErrors, clear } = useFormErrors();
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    // Group token search for the members editor.
    const [tokenSearchResults, setTokenSearchResults] = useState([]);
    const [isSearchingTokens, setIsSearchingTokens] = useState(false);

    // (Re-)initialize the form whenever the dialog opens.
    useEffect(() => {
        if (!opened) return;
        setActiveTab(TAB_DETAILS);
        setErrors({});
        setSubmitError(null);
        if (isChange) {
            setReason(node.reason || '');
            setQuota({ ...(node.pending?.limit || node.limit) });
            const date = node.pending?.termination_date || node.termination_date;
            setTerminationDate(date ? new Date(date) : null);
            setAuthorizedUsers(node.pending?.authorized_users || node.authorized_users || []);
        } else {
            setReason('');
            setQuota(defaultQuota(resources));
            setTerminationDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
            setAuthorizedUsers([]);
            const initial = myBudgets[0]?.id ?? eligibleBudgets[0]?.id ?? null;
            setParentId(initial);
            const headroom = autoApproveHeadroom(
                [...(myBudgets || []), ...(eligibleBudgets || [])].find(b => b.id === initial),
                resources, myProjects);
            if (headroom) setQuota(headroom);
        }
    }, [opened, node?.id]);

    const validate = () => {
        const next = validateQuota(resources, quota);
        if (!reason || reason.trim().length < 5) next.reason = 'Please describe the purpose (at least 5 characters)';
        if (!isChange && !parentId) next.parentId = 'Please choose a budget';
        if (!terminationDate) next.terminationDate = 'Please set an end date';
        else if (terminationDate <= new Date()) next.terminationDate = 'The end date must be in the future';
        setErrors(next);
        return next;
    };

    const allBudgets = [...(myBudgets || []), ...(eligibleBudgets || [])];
    const selectedHeadroom = autoApproveHeadroom(
        allBudgets.find(b => b.id === parentId), resources, myProjects);

    // Picking a budget with auto-approve fills the resources with the most it
    // would grant on the spot, so the common case ("give me what I may have")
    // is one click. Any other budget leaves the numbers alone — overwriting
    // carefully typed values with a default would be worse than a stale form.
    const selectBudget = (id) => {
        setParentId(id);
        const headroom = autoApproveHeadroom(allBudgets.find(b => b.id === id), resources, myProjects);
        if (headroom) setQuota(headroom);
    };

    const errorsInTab = (tab, errs) => {
        if (tab === TAB_DETAILS) return ['reason', 'parentId', 'terminationDate'].some(k => errs[k]);
        if (tab === TAB_RESOURCES) return (resources || []).some(r => errs[r.id]);
        return false;
    };
    const tabHasError = (tab) => errorsInTab(tab, errors);

    const handleSearchTokens = async (query) => {
        if (!query) { setTokenSearchResults([]); return; }
        setIsSearchingTokens(true);
        try {
            // No second filter on the query here: the API already matched, and a
            // group found through its DESCRIPTION has a token that does not
            // contain the search text — filtering again would drop exactly those.
            const tokens = await api.searchPrincipals(query);
            setTokenSearchResults(tokens.filter(t =>
                !authorizedUsers.some(au => au.token === t)));
        } catch {
            setTokenSearchResults([]);
        } finally {
            setIsSearchingTokens(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            // Jump to the problem instead of leaving the button looking broken:
            // the offending field is usually on a tab the user is not looking at.
            const bad = [TAB_DETAILS, TAB_RESOURCES, TAB_MEMBERS].find(t => errorsInTab(t, errs));
            if (bad) setActiveTab(bad);
            return;
        }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const iso = terminationDate.toISOString();
            const result = isChange
                ? await api.requestChange(node.id, {
                    limit: quota,
                    termination_date: iso,
                    authorized_users: authorizedUsers,
                    reason,
                })
                : await api.createNode({
                    parent_id: parentId,
                    kind: 'project',
                    reason,
                    limit: quota,
                    termination_date: iso,
                    authorized_users: authorizedUsers,
                });
            onDone?.(result);
            onClose();
        } catch (err) {
            setSubmitError(formatError(err));
        } finally {
            setSubmitting(false);
        }
    };

    const detailsTab = (
        <Stack>
            {!isChange && (
                <BudgetSelect
                    myBudgets={myBudgets}
                    eligibleBudgets={eligibleBudgets}
                    resources={resources}
                    requestedQuota={quota}
                    value={parentId}
                    onChange={(v) => { selectBudget(v); clear('parentId'); }}
                    error={errors.parentId}
                />
            )}

            {/* Say why the numbers on the next tab just changed by themselves. */}
            {!isChange && selectedHeadroom && (
                <Text size="xs" c={COLOR.positive}>
                    Resources set to {resourceSummaryText(resources, selectedHeadroom) || 'nothing left'} — the most
                    this budget approves instantly for you. Ask for less and it is still instant; ask for more and a
                    manager decides.
                </Text>
            )}

            <Textarea
                label="Purpose"
                description="What is this project for? Shown to the people who approve it."
                placeholder="e.g. Lab exercises for the Distributed Systems course"
                required
                rows={2}
                value={reason}
                onChange={e => { setReason(e.target.value); clear('reason'); }}
                error={errors.reason}
            />

            <TerminationDatePicker
                value={terminationDate}
                error={errors.terminationDate}
                onChange={(d) => { setTerminationDate(d); clear('terminationDate'); }}
            />
        </Stack>
    );

    const resourcesTab = (
        <QuotaInputs
            resources={resources}
            value={quota}
            errors={errors}
            onChange={(id, v) => { setQuota(q => ({ ...q, [id]: v })); clear(id); }}
        />
    );

    const membersTab = (
        <TokenRoleEditor
            label=""
            authorizedUsers={authorizedUsers}
            onAddToken={(token, role) => setAuthorizedUsers(u => u.some(x => x.token === token) ? u : [...u, { token, openstack_role: role }])}
            onRemoveToken={(token) => setAuthorizedUsers(u => u.filter(x => x.token !== token))}
            onOpenstackRoleChange={(token, role) => setAuthorizedUsers(u => u.map(x => x.token === token ? { ...x, openstack_role: role || 'member' } : x))}
            searchResults={tokenSearchResults}
            isSearching={isSearchingTokens}
            onSearch={handleSearchTokens}
            roles={openstackRoles || []}
            defaultOpenstackRole="member"
            emptyMessage="Nobody else has access yet. You (the owner) always do."
        />
    );

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            title={isChange
                ? (node?.status === 'pending' ? 'Edit request' : 'Request a change')
                : 'Request a project'}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
            submitLabel={isChange
                ? (node?.status === 'pending' ? 'Update request' : 'Submit change request')
                : 'Submit request'}
        >
            <FormTabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { value: TAB_DETAILS, label: 'Details', hasError: tabHasError(TAB_DETAILS), content: detailsTab },
                    { value: TAB_RESOURCES, label: 'Resources', hasError: tabHasError(TAB_RESOURCES), content: resourcesTab },
                    { value: TAB_MEMBERS, label: 'Members', content: membersTab },
                ]}
            />

            {/* Live preview of what will change (change mode only). */}
            {isChange && node.status !== 'pending' && (
                <NodeChangesDiff
                    resources={resources}
                    limitFrom={node.limit}
                    limitTo={quota}
                    dateFrom={node.termination_date}
                    dateTo={terminationDate}
                    usersFrom={node.authorized_users}
                    usersTo={authorizedUsers}
                    label="Your proposed changes"
                />
            )}
        </FormModal>
    );
}
