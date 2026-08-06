import { useMemo, useState } from 'react';
import { Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { useForm } from '@mantine/form';
import { NodeChangesDiff, TerminationDatePicker } from './component-common.jsx';
import { FormModal, FormTabs } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenRoleEditor } from './component-token-role-editor.jsx';
import { autoApproveHeadroom, COLOR, freeAmount, quotaFits, resourceSummaryText } from './util-project.jsx';

const DEFAULT_TERM_DAYS = 90;

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
    // Over capacity means two different things: a request queues up for a
    // manager, but a manager's own creation is approved on the spot and the
    // capacity check therefore rejects it outright.
    const managesSelected = (myBudgets || []).some(b => b.id === value);

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
                    {managesSelected
                        ? 'The requested amount exceeds this budget\'s free capacity — creating the project will be refused. Lower the amount, or raise this budget first.'
                        : 'The requested amount exceeds this budget\'s free capacity — the request will wait until a manager decides (they may grant an adjusted amount).'}
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

    // Group token search for the members editor.
    const [tokenSearchResults, setTokenSearchResults] = useState([]);
    const [isSearchingTokens, setIsSearchingTokens] = useState(false);

    // Auto-approve only ever applies to budgets you REQUEST under. On a budget
    // you manage the project is created approved outright, so its headroom is
    // not a limit for you — neither prefill the form with it nor talk about it.
    const managedIds = useMemo(() => new Set((myBudgets || []).map(b => b.id)), [myBudgets]);
    const headroomFor = (id) => managedIds.has(id)
        ? null
        : autoApproveHeadroom(
            [...(myBudgets || []), ...(eligibleBudgets || [])].find(b => b.id === id),
            resources, myProjects);

    // Reading the clock is a side effect, so it happens once in a lazy
    // initialiser rather than on every render. The dialog is remounted per
    // opening (see the `key` at the call sites), so once = per opening.
    const [defaultEnd] = useState(() => new Date(Date.now() + DEFAULT_TERM_DAYS * 24 * 60 * 60 * 1000));

    // The whole form is initialised HERE instead of by an effect that fired on
    // `opened` and wrote eight setStates. Remounting is what makes that correct:
    // "initial" and "for the node currently being edited" are the same moment.
    const initialParentId = isChange ? null : (myBudgets[0]?.id ?? eligibleBudgets[0]?.id ?? null);
    const form = useForm({
        initialValues: isChange
            ? {
                parentId: null,
                name: node.name || '',
                reason: node.reason || '',
                quota: { ...(node.pending?.limit || node.limit) },
                terminationDate: (node.pending?.termination_date || node.termination_date)
                    ? new Date(node.pending?.termination_date || node.termination_date)
                    : null,
                authorizedUsers: node.pending?.authorized_users || node.authorized_users || [],
            }
            : {
                parentId: initialParentId,
                name: '',
                reason: '',
                // A budget that approves instantly starts filled with the most
                // it would grant, so the common case is one click.
                quota: headroomFor(initialParentId) ?? defaultQuota(resources),
                terminationDate: defaultEnd,
                authorizedUsers: [],
            },
        validate: (values) => ({
            name: (values.name || '').trim().length < 3
                ? 'Please give the project a name (at least 3 characters)' : null,
            reason: (values.reason || '').trim().length < 5
                ? 'Please describe the purpose (at least 5 characters)' : null,
            parentId: (!isChange && !values.parentId) ? 'Please choose a budget' : null,
            terminationDate: !values.terminationDate
                ? 'Please set an end date'
                : (values.terminationDate <= new Date() ? 'The end date must be in the future' : null),
            ...Object.fromEntries(
                Object.entries(validateQuota(resources, values.quota)).map(([id, msg]) => [`quota.${id}`, msg])),
        }),
    });

    const { parentId, quota, terminationDate, authorizedUsers } = form.values;
    const selectedHeadroom = headroomFor(parentId);

    // Picking a budget with auto-approve fills the resources with the most it
    // would grant on the spot. Any other budget leaves the numbers alone —
    // overwriting carefully typed values with a default would be worse than a
    // stale form.
    const selectBudget = (id) => {
        form.setFieldValue('parentId', id);
        form.clearFieldError('parentId');
        const headroom = headroomFor(id);
        if (headroom) form.setFieldValue('quota', headroom);
    };

    // What the form was showing when it opened — a change request is only worth
    // sending when one of these actually moved. The user comparison is order
    // sensitive; a false positive costs an unnecessary change request, which is
    // exactly what happened for every save before.
    // Takes the submitted values rather than reading them from the closure, so
    // there is no chance of comparing against a render-stale copy.
    const approvalFieldsChanged = (values) => {
        if (!isChange) return true;
        const baseLimit = node.pending?.limit || node.limit || {};
        const baseDate = node.pending?.termination_date || node.termination_date;
        const baseUsers = node.pending?.authorized_users || node.authorized_users || [];
        return (resources || []).some(r => (values.quota[r.id] ?? 0) !== (baseLimit[r.id] ?? 0))
            || !baseDate || new Date(baseDate).getTime() !== values.terminationDate.getTime()
            || JSON.stringify(baseUsers) !== JSON.stringify(values.authorizedUsers)
            || values.reason.trim() !== (node.reason || '').trim();
    };

    const errorsInTab = (tab, errs) => {
        if (tab === TAB_DETAILS) return ['name', 'reason', 'parentId', 'terminationDate'].some(k => errs[k]);
        if (tab === TAB_RESOURCES) return (resources || []).some(r => errs[`quota.${r.id}`]);
        return false;
    };
    const tabHasError = (tab) => errorsInTab(tab, form.errors);

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

    const save = useApiMutation({
        mutationFn: async (values) => {
            const iso = values.terminationDate.toISOString();
            if (!isChange) {
                return api.createNode({
                    parent_id: values.parentId,
                    kind: 'project',
                    name: values.name.trim(),
                    reason: values.reason,
                    limit: values.quota,
                    termination_date: iso,
                    authorized_users: values.authorizedUsers,
                });
            }
            let result;
            // A rename takes effect immediately and on its own — dragging a
            // typo fix through the approval cycle would park the project in
            // change_pending until a manager gets around to it.
            if (values.name.trim() !== (node.name || '')) {
                result = await api.updateNode(node.id, { name: values.name.trim() });
            }
            // Everything with resource consequences still needs a decision —
            // but only when it actually differs, so renaming alone does not
            // manufacture a change request out of unchanged numbers.
            if (approvalFieldsChanged(values)) {
                result = await api.requestChange(node.id, {
                    limit: values.quota,
                    termination_date: iso,
                    authorized_users: values.authorizedUsers,
                    reason: values.reason,
                });
            }
            return result;
        },
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { if (result) onDone?.(result); onClose(); },
        // A 409 means this dialog was acting on a node that has moved on; there
        // is nothing here to correct, so close it and let the refreshed view speak.
        onConflict: () => { onDone?.(); onClose(); },
    });

    // Jump to the problem instead of leaving the button looking broken: the
    // offending field is usually on a tab the user is not looking at.
    const handleInvalid = (errs) => {
        const bad = [TAB_DETAILS, TAB_RESOURCES, TAB_MEMBERS].find(t => errorsInTab(t, errs));
        if (bad) setActiveTab(bad);
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
                    onChange={selectBudget}
                    error={form.errors.parentId}
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

            <TextInput
                label="Name"
                description="A short, recognizable name — this is what the project is called in OpenStack."
                placeholder="e.g. Cloud Computing Lab WS26"
                required
                {...form.getInputProps('name')}
            />

            <Textarea
                label="Purpose"
                description="What is this project for? Shown to the people who approve it."
                placeholder="e.g. Lab exercises for the Distributed Systems course"
                required
                rows={2}
                {...form.getInputProps('reason')}
            />

            <TerminationDatePicker
                value={terminationDate}
                error={form.errors.terminationDate}
                onChange={(d) => { form.setFieldValue('terminationDate', d); form.clearFieldError('terminationDate'); }}
            />
        </Stack>
    );

    const resourcesTab = (
        <QuotaInputs
            resources={resources}
            value={quota}
            errors={Object.fromEntries((resources || []).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
            onChange={(id, v) => { form.setFieldValue(`quota.${id}`, v); form.clearFieldError(`quota.${id}`); }}
        />
    );

    const membersTab = (
        <TokenRoleEditor
            label=""
            authorizedUsers={authorizedUsers}
            onAddToken={(token, role) => form.setFieldValue('authorizedUsers', u => u.some(x => x.token === token) ? u : [...u, { token, openstack_role: role }])}
            onRemoveToken={(token) => form.setFieldValue('authorizedUsers', u => u.filter(x => x.token !== token))}
            onOpenstackRoleChange={(token, role) => form.setFieldValue('authorizedUsers', u => u.map(x => x.token === token ? { ...x, openstack_role: role || 'member' } : x))}
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
            onSubmit={form.onSubmit(values => save.mutate(values), handleInvalid)}
            submitting={save.isPending}
            submitError={save.error && formatError(save.error)}
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
