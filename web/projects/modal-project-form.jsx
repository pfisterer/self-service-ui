import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Group, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { Clock, Gift, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { formatError } from '/helper/api-error.js';
import { isEmail, useForm } from '@mantine/form';
import { formatTerm, NodeChangesDiff, TerminationDatePicker, TokenBadgeList } from './component-common.jsx';
import { formatDate } from '../format-date.js';
import { DIALOG_SIZE, FormModal, FormTabs, tabHasError as tabFlag, tabWithError } from './component-form-modal.jsx';
import { QuotaInputs, validateQuota, withUnsetAsZero } from './component-quota-inputs.jsx';
import { MemberRoleEditor, TokenListEditor } from './component-token-list-editor.jsx';
import { BudgetSelect } from './component-budget-select.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { PersonInput, personEmail } from './principal-search.jsx';
import { AllocationSection, useAllocationDraft } from './component-allocation-section.jsx';
import { WorkspaceSettingsPanel, useWorkspaceSettings } from '/gpu/workspace-settings.jsx';
import { withCurrentParent } from './component-budget-select.jsx';
import { autoApproveHeadroom, changeOutcome, COLOR, nodeTitle, ownerEmail as nodeOwnerEmail, defaultsWithin, effectiveLimit, hasAllocations, isAvailability, isPoolAutoApprove, latestProjectEnd, requestOutcome, resourceSummaryText, roomIn, visibleResources, measuredUse, openstackSide, resourceLabel, budgetKinds, catalogKinds, projectKinds, resourcesOfKinds, PROJECT_KINDS, kindOfResource, isLab, endDate, endDay } from './util-project.jsx';
import { AttributesEditor, AttributesView, hasAttributes, useAttributesTab } from './component-node-attributes.jsx';
import { nodeExtraTabs } from './modal-inspect.jsx';
import { ExternalGroups } from './component-external-groups.jsx';
import { LlmLimitHints } from './component-llm-limits.jsx';

const DEFAULT_TERM_DAYS = 90;

const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_MEMBERS = 'members';
const TAB_ATTRIBUTES = 'attributes';
const TAB_WORKSPACES = 'workspaces';

// OutcomeNote says, while the form is being filled in, what pressing the button
// will do — the one thing a requester cannot otherwise tell before it happened.
function OutcomeNote({ outcome, isChange, budget, hasPolicy, over = [] }) {
    const { t } = useTranslation();
    if (!outcome) return null;
    // One whole sentence per outcome — the budget is named by the picker above,
    // so it does not have to be spliced into the sentence as well.
    if (outcome === 'blocked') {
        return (
            <Text size="sm" c={COLOR.negative}>
                {t('projects.projectForm.outcomeBlocked')}
            </Text>
        );
    }
    if (outcome === 'refused') {
        return (
            <Text size="sm" c={COLOR.negative}>
                {t('projects.projectForm.outcomeRefused')}
                {over.length > 0 && ` ${t('projects.projectForm.outcomeRefusedWhich', { list: over.map(r => t('projects.projectForm.overItem', { name: resourceLabel(t, r), asked: r.asked, free: r.free })).join(', ') })}`}
            </Text>
        );
    }
    if (outcome === 'direct' || outcome === 'instant') {
        const text = outcome === 'direct'
            ? t('projects.projectForm.outcomeDirect')
            : isChange
                ? t('projects.projectForm.outcomeInstantChange')
                : t('projects.projectForm.outcomeInstant');
        return (
            <Group gap={6} wrap="nowrap">
                <Zap size="14" color="var(--mantine-color-green-7)" style={{ flexShrink: 0 }} />
                <Text size="sm" c="green.8">{text}</Text>
            </Group>
        );
    }
    const waiting = hasPolicy
        ? (isChange
            ? t('projects.projectForm.outcomeWaitingPolicyChange')
            : t('projects.projectForm.outcomeWaitingPolicy'))
        : (isChange
            ? t('projects.projectForm.outcomeWaitingChange')
            : t('projects.projectForm.outcomeWaiting'));
    return (
        <Stack gap={4}>
            <Group gap={6} wrap="nowrap">
                <Clock size="14" color="var(--mantine-color-orange-7)" style={{ flexShrink: 0 }} />
                <Text size="sm" c="orange.8">{waiting}</Text>
            </Group>
            {budget?.admin_scope?.length > 0 && (
                <Group gap={6} pl={20}>
                    <Text size="xs" c="dimmed">{t('projects.fact.managedBy')}</Text>
                    <TokenBadgeList size="xs" tokens={budget.admin_scope} />
                </Group>
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
//
// initialBudgetId preselects the budget of a new project — set when the dialog
// is opened from a budget's own card.
//
// asManager: opened by a manager of the project's budget. They alone set its
// attributes (who pays for it, a tab of its own), and on an approved project
// they move it to another budget and hand it to another owner — fields of the
// Details tab that act at once, like the name. `moveTargets` are the budgets it
// may move to. Allocations from budgets further up are part of the Resources
// tab, for the managers who may grant them and the holders who may give one back.
//
// initialKind: the kind of a new project ('cloud', 'workspaces', 'llm', see
// PROJECT_KINDS) — the list's filter when it was opened from there. The kind
// decides which budgets and resources the form offers; a project is of the
// kind whose resources it holds, so changing one keeps to the kinds it is
// (both for a project from before the split).
//
// adopt: `node` is an imported OpenStack project a root admin brings under
// management — the same tabs as any project, prefilled from OpenStack, plus who
// answers for it and which budget pays. Its members can be corrected before it
// goes through approval, instead of the adoption failing on one of them.
export function ProjectFormModal({ opened, onClose, onDone, resources, roles, node = null, myBudgets = [], eligibleBudgets = [], myProjects = [], initialBudgetId = null, initialKind = null, asManager = false, moveTargets = [], adopt = false, initialTab }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const isAdopt = adopt && !!node;
    const isChange = !!node && !isAdopt;

    // Adopting: who will answer for the project. Deliberately not prefilled:
    // a guess from the OpenStack members (the first of them) went through
    // unnoticed and made a student the owner of a course project.
    const [owner, setOwner] = useState('');
    const [ownerError, setOwnerError] = useState(null);
    const ownerEmail = personEmail(owner);
    // The budgets that owner may request under, offered next to the admin's
    // own (a root-only endpoint; a failure leaves the admin's budgets).
    const ownerBudgetsQuery = useQuery({
        queryKey: projectKeys.eligibleForOwner(`user:${ownerEmail}`),
        queryFn: () => api.listEligibleForOwner([`user:${ownerEmail}`]).then(page => page.items),
        enabled: !!api && opened && isAdopt && ownerEmail.includes('@'),
        retry: false,
    });
    const requestable = isAdopt ? (ownerBudgetsQuery.data ?? []) : eligibleBudgets;
    const withAttributes = isChange && asManager;
    // Moving and handing over: a manager's, on an approved project.
    const restructure = isChange && asManager && node.status === 'approved';
    const [newParent, setNewParent] = useState(node?.parent_id ?? null);
    const [newOwner, setNewOwner] = useState(() => nodeOwnerEmail(node) || '');
    const [newOwnerError, setNewOwnerError] = useState(null);
    const ownerChanged = restructure && personEmail(newOwner).toLowerCase() !== (nodeOwnerEmail(node) || '').toLowerCase();
    const parentChanged = restructure && newParent && newParent !== node.parent_id;
    const alloc = useAllocationDraft({ node: isChange ? node : null, resources, manager: isChange && asManager, opened });
    // Lab/KI: how the project's workspaces are used — the AI service's part, in its own tab, saved with the rest and at once.
    const workspaces = useWorkspaceSettings(isChange && opened ? node?.id : null, isChange && opened);
    const attrs = useAttributesTab(node);

    const [activeTab, setActiveTab] = useState(initialTab ?? TAB_DETAILS);


    // Auto-approve only ever applies to budgets you REQUEST under. On a budget
    // you manage the project is created approved outright, so its headroom is
    // not a limit for you — neither prefill the form with it nor talk about it.
    const managedIds = useMemo(() => new Set((myBudgets || []).map(b => b.id)), [myBudgets]);
    // Which resources a project may even ask for: only what the budget it hangs
    // under was delegated. Defined here rather than inline because validation
    // runs inside useForm, before the render has a chosen budget to look at —
    // and a form that validates a different set from the one it renders will
    // demand a value for a field nobody was shown.
    const budgetById = (id) => [...(myBudgets || []), ...(requestable || [])].find(b => b.id === id);
    // Nothing outlives the budget it draws from, and no project runs longer at
    // a time than the budget allows (see latestProjectEnd).
    const latestEndOf = (id) => latestProjectEnd(budgetById(id));
    const withinBudget = (date, id) => {
        const bound = latestEndOf(id)?.date;
        return bound && (!date || date > bound) ? bound : date;
    };
    // The kinds the form is about: a new project's one kind, an imported one is
    // a cloud project, and a change keeps to what the project is (every kind
    // while it holds nothing). No kinds in the catalogue — no filter.
    const catalog = catalogKinds(resources);
    const changeKinds = isChange ? projectKinds(node, resources) : [];
    const kindsFor = (kind) => catalog.length < 2 ? []
        : isAdopt ? ['cloud']
        : isChange ? (changeKinds.length ? changeKinds : catalog)
        : (kind ? [kind] : []);
    const offersKind = (b, kind) => catalog.length < 2 || !kind || budgetKinds(b, resources).includes(kind);
    const offeredFor = (id, kind) => {
        // A change request has no budget picker — the project stays where it
        // is, so the scope is its PARENT budget: that is what a request could
        // draw from. The leaf itself is the fallback when the parent is not in
        // view (never the whole catalogue: offering an availability the budget
        // was never delegated reads as a promise the approval cannot keep).
        const budget = budgetById(isChange ? node.parent_id : id) || (isChange ? node : null);
        return resourcesOfKinds(budget ? visibleResources(resources, budget) : resources, kindsFor(kind));
    };
    // Only what the form offers goes into a new project: a cloud default left
    // in an AI project's request would make it a cloud project as well.
    const onlyOffered = (quota, id, kind) => {
        const ids = new Set(offeredFor(id, kind).map(r => r.id));
        return Object.fromEntries(Object.entries(quota || {}).filter(([rid]) => ids.has(rid)));
    };

    const headroomFor = (id) => managedIds.has(id)
        ? null
        : autoApproveHeadroom(
            [...(myBudgets || []), ...(requestable || [])].find(b => b.id === id),
            resources, myProjects);

    // A headroom is only worth PRE-FILLING when every quantity in it is a
    // valid request on its own (>= the resource's minimum). Once the requester
    // has used up even one resource, filling the form with it would produce
    // invalid zeros — and a green "set to nothing left" note, which reads as
    // success while meaning the opposite.
    //
    // A pool is never pre-filled: its headroom is the whole budget, and a
    // form that opens asking for everything is a trap, not a convenience.
    const usableHeadroomFor = (id, kind) => {
        const h = headroomFor(id);
        if (!h || isPoolAutoApprove(budgetById(id))) return null;
        const ok = offeredFor(id, kind).every(r =>
            isAvailability(r) || (h[r.id] ?? 0) >= (r.min ?? 0));
        // The headroom counts quantities only; the availabilities come with their defaults (e.g. the server types), as in an untouched form.
        return ok ? onlyOffered({ ...defaultsWithin(resources.filter(isAvailability), null), ...h }, id, kind) : null;
    };

    // What an untouched form asks for under a budget: the most its auto-approve
    // grants on the spot, else the catalogue's defaults within what the budget
    // has room for (a pool's headroom is exactly that room).
    const initialQuotaFor = (id, kind) => {
        const budget = budgetById(id);
        return usableHeadroomFor(id, kind)
            ?? onlyOffered(defaultsWithin(resources, headroomFor(id) ?? (budget ? roomIn(budget, resources) : null)), id, kind);
    };
    // Set once the person types a number; from then on a budget switch no
    // longer replaces the defaults — overwriting typed values would be worse
    // than a stale form.
    const quotaTouched = useRef(false);

    // Reading the clock is a side effect, so it happens once in a lazy
    // initialiser rather than on every render. The dialog is remounted per
    // opening (see the `key` at the call sites), so once = per opening.
    const [defaultEnd] = useState(() => new Date(Date.now() + DEFAULT_TERM_DAYS * 24 * 60 * 60 * 1000));

    // The whole form is initialised HERE instead of by an effect that fired on
    // `opened` and wrote eight setStates. Remounting is what makes that correct:
    // "initial" and "for the node currently being edited" are the same moment.
    // A change request cannot take an end away — only move it — so a project
    // that has one keeps needing one.
    const openEndLocked = isChange && !!(node.pending?.termination_date || node.termination_date);
    // A new project's kind: the one asked for, else the first the preselected
    // budget offers; its budget: the one asked for, else the first offering it.
    const initialKind_ = isChange || isAdopt || catalog.length < 2 ? null
        : (initialKind ?? (budgetById(initialBudgetId) && budgetKinds(budgetById(initialBudgetId), resources)[0]) ?? catalog[0]);
    const initialParentId = isChange ? null
        : (initialBudgetId ?? [...myBudgets, ...requestable].find(b => offersKind(b, initialKind_))?.id ?? null);
    const form = useForm({
        initialValues: isAdopt
            ? {
                parentId: null,
                name: nodeTitle(node),
                reason: t('projects.adopt.reasonDefault', { name: openstackSide(node).external_name || nodeTitle(node) }),
                // What OpenStack grants it today, until someone decides otherwise.
                quota: withUnsetAsZero(offeredFor(null), node.limit),
                terminationDate: defaultEnd,
                authorizedUsers: node.authorized_users || [],
                adminScope: [],
            }
            : isChange
            ? {
                parentId: null,
                name: node.name || '',
                reason: node.reason || '',
                quota: withUnsetAsZero(offeredFor(null), node.pending?.limit || node.limit),
                terminationDate: (node.pending?.termination_date || node.termination_date)
                    ? endDate(node.pending?.termination_date || node.termination_date)
                    : null,
                authorizedUsers: node.pending?.authorized_users || node.authorized_users || [],
                adminScope: node.admin_scope || [],
            }
            : {
                kind: initialKind_,
                parentId: initialParentId,
                name: '',
                reason: '',
                // A budget that approves instantly starts filled with the most
                // it would grant, so the common case is one click — unless the
                // allowance is (partly) used up: then the defaults stay, capped
                // to what the budget can still give.
                quota: initialQuotaFor(initialParentId, initialKind_),
                terminationDate: withinBudget(defaultEnd, initialParentId),
                authorizedUsers: [],
                adminScope: [],
            },
        validate: (values) => ({
            // An import keeps its OpenStack name.
            name: !isAdopt && (values.name || '').trim().length < 3
                ? t('projects.projectForm.nameRequired') : null,
            reason: reasonError(values.reason, t('projects.projectForm.purposeRequired')),
            parentId: (!isChange && !values.parentId) ? t('projects.projectForm.budgetRequired') : null,
            terminationDate: (() => {
                const latest = latestEndOf(isChange ? node.parent_id : values.parentId);
                if (!values.terminationDate) {
                    return latest || openEndLocked ? t('projects.projectForm.endDateRequired') : null;
                }
                if (values.terminationDate <= new Date()) return t('projects.projectForm.endDateInPast');
                if (!latest || values.terminationDate <= latest.date) return null;
                return latest.term
                    ? t('projects.projectForm.endDateAfterTerm', { date: formatDate(latest.date), duration: formatTerm(t, latest.term) })
                    : t('projects.projectForm.endDateAfterBudget', { date: formatDate(latest.date) });
            })(),
            ...Object.fromEntries(
                Object.entries(validateQuota(t, offeredFor(values.parentId, values.kind), values.quota, { providerDefaults: true })).map(([id, msg]) => [`quota.${id}`, msg])),
        }),
    });

    const { kind, parentId, quota, terminationDate, authorizedUsers } = form.values;
    const selectedHeadroom = headroomFor(parentId);
    // The per-person notes below are about individual limits; a pool's
    // "headroom" is just the budget's free capacity, which the picker shows.
    const selectedIsPool = isPoolAutoApprove(budgetById(parentId));

    // What the button will do. An amended pending request stays a request, so
    // it has no outcome worth announcing.
    const outcomeBudget = budgetById(isChange ? node.parent_id : parentId) || null;
    // An adopted project always goes through approval; the note says so.
    const outcome = isAdopt ? null : isChange
        ? (node.status === 'pending' ? null : changeOutcome({
            node, budget: outcomeBudget, quota, terminationDate, resources, myProjects,
            manages: managedIds.has(node.parent_id),
        }))
        : requestOutcome({
            budget: outcomeBudget, manages: managedIds.has(parentId), quota, resources, myProjects,
        });

    const offered = offeredFor(parentId, kind);
    // For a new project: what the chosen budget still has free per quantity,
    // shown under each field, and the quantities asking for more than that —
    // the refusal names them instead of leaving the person to guess. A change
    // is left out: the project's own share is in the budget's use already.
    const newRoom = !isChange && outcomeBudget ? roomIn(outcomeBudget, offered) : null;
    const over = newRoom ? offered
        .filter(r => !isAvailability(r) && (quota?.[r.id] ?? 0) > (newRoom[r.id] ?? Infinity))
        .map(r => ({ ...r, asked: quota[r.id], free: newRoom[r.id] })) : [];
    const latestEnd = latestEndOf(isChange ? node.parent_id : parentId);

    // Picking a budget with auto-approve fills the resources with the most it
    // would grant on the spot. Any other budget refits the defaults to its room
    // while nobody has typed a number yet, and otherwise leaves them alone.
    const selectBudget = (id) => {
        form.setFieldValue('parentId', id);
        form.clearFieldError('parentId');
        // An import keeps what OpenStack grants it; the budget only bounds it.
        const headroom = isAdopt ? null : usableHeadroomFor(id, form.values.kind);
        if (headroom) form.setFieldValue('quota', headroom);
        else if (!isAdopt && !quotaTouched.current) form.setFieldValue('quota', initialQuotaFor(id, form.values.kind));
        // A budget that ends sooner pulls the date in with it.
        const date = withinBudget(form.values.terminationDate, id);
        if (date !== form.values.terminationDate) form.setFieldValue('terminationDate', date);
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
        const nextDate = values.terminationDate?.getTime() ?? null;
        return (resources || []).some(r => (values.quota[r.id] ?? 0) !== (baseLimit[r.id] ?? 0))
            || (baseDate ? endDate(baseDate).getTime() : null) !== nextDate
            || JSON.stringify(baseUsers) !== JSON.stringify(values.authorizedUsers)
            || values.reason.trim() !== (node.reason || '').trim();
    };

    // One resources tab per kind where the project has several, so everything about one area sits together. The first tab also carries what concerns the whole project (shares from other budgets).
    const resourceTabKinds = (() => {
        const ks = catalog.length < 2 ? [] : PROJECT_KINDS.filter(k => offered.some(r => kindOfResource(r) === k));
        return ks.length > 1 ? ks : [ks[0] ?? null];
    })();
    const resourceTabValue = (kind) => (kind && resourceTabKinds.length > 1 ? `${TAB_RESOURCES}-${kind}` : TAB_RESOURCES);
    const firstResourceTab = resourceTabValue(resourceTabKinds[0]);
    const resourceById = Object.fromEntries((resources || []).map(r => [r.id, r]));
    const fieldsByTab = {
        [TAB_DETAILS]: (k) => ['name', 'reason', 'parentId', 'terminationDate'].includes(k),
        ...Object.fromEntries(resourceTabKinds.map(kind => [resourceTabValue(kind),
            (k) => k.startsWith('quota.') && (!kind || kindOfResource(resourceById[k.slice(6)]) === kind)])),
    };
    const tabHasError = (tab) => tabFlag(fieldsByTab, tab, form.errors);

    const save = useNodeMutation({
        onDone,
        onClose,
        mutationFn: async (values) => {
            // No end only where nothing bounds the project (see latestEndOf).
            const iso = endDay(values.terminationDate);
            if (isAdopt) {
                return api.adopt(node.id, {
                    new_parent_id: values.parentId,
                    owner: ownerEmail,
                    reason: values.reason,
                    limit: values.quota,
                    termination_date: iso,
                    authorized_users: values.authorizedUsers,
                });
            }
            if (!isChange) {
                return api.createNode({
                    parent_id: values.parentId,
                    kind: 'project',
                    name: values.name.trim(),
                    reason: values.reason,
                    limit: values.quota,
                    termination_date: iso,
                    authorized_users: values.authorizedUsers,
                    admin_scope: values.adminScope,
                });
            }
            let result;
            if (workspaces.changed) await workspaces.save();
            // A rename and the admins take effect immediately and on their own —
            // neither costs anything, and dragging them through the approval
            // cycle would park the project in change_pending until a manager
            // gets around to it.
            const direct = {};
            if (values.name.trim() !== (node.name || '')) direct.name = values.name.trim();
            if (JSON.stringify(values.adminScope) !== JSON.stringify(node.admin_scope || [])) direct.admin_scope = values.adminScope;
            if (Object.keys(direct).length > 0) {
                result = await api.updateNode(node.id, direct);
            }
            // Handing over and moving act at once too, before a change request
            // so that one is decided where the project now is.
            if (ownerChanged) result = await api.transferOwner(node.id, personEmail(newOwner));
            if (parentChanged) result = await api.move(node.id, newParent);
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
            const attributes = withAttributes && attrs.changed();
            if (attributes) result = await api.setAttributes(node.id, attributes);
            if (alloc.changed) result = await api.setAllocation(node.id, alloc.payload());
            return result;
        },
    });

    // Jump to the problem instead of leaving the button looking broken: the
    // offending field is usually on a tab the user is not looking at.
    const handleInvalid = (errs) => {
        const bad = tabWithError(fieldsByTab, errs);
        if (bad) setActiveTab(bad);
    };

    // What the members get depends on what the project is: a role in OpenStack,
    // the workspaces and the LLM pool of the AI service, or both. The role also
    // decides the workspaces' shared folder: reader only reads it.
    const memberKinds = kindsFor(kind);
    const withAi = isLab(memberKinds);
    const aiOnly = withAi && !memberKinds.includes('cloud');
    const accessKey = aiOnly ? 'accessAiaas' : withAi ? 'accessBoth' : 'access';
    const adminsHintKey = aiOnly ? 'adminsHintAiaas' : withAi ? 'adminsHintBoth' : 'adminsHint';

    const detailsTab = (
        <Stack>
            {isAdopt && (
                <>
                    <Alert color={COLOR.outside} variant="light" p="xs">{t('projects.adopt.note')}</Alert>
                    <PersonInput
                        autoFocus
                        label={t('projects.adopt.owner')}
                        description={t('projects.adopt.ownerHint')}
                        placeholder={t('projects.adopt.ownerPlaceholder')}
                        required
                        value={owner}
                        error={ownerError}
                        onChange={(v) => { setOwner(v); setOwnerError(null); }}
                    />
                </>
            )}
            {!isChange && (
                // Budgets they manage → the project is created active at once;
                // budgets they may request under → it awaits approval, or is
                // approved on the spot where auto-approve covers it.
                <BudgetSelect
                    label={t('projects.projectForm.budget')}
                    description={t('projects.projectForm.budgetHint')}
                    placeholder={t('projects.projectForm.budgetPlaceholder')}
                    emptyDescription={catalog.length > 1 && [...(myBudgets || []), ...(requestable || [])].length > 0
                        ? t('projects.kind.noBudget') : t('projects.projectForm.budgetNone')}
                    groups={[
                        { label: t('projects.projectForm.budgetsManaged'), budgets: (myBudgets || []).filter(b => offersKind(b, isAdopt ? 'cloud' : kind)) },
                        {
                            label: isAdopt ? t('projects.adopt.budgetsOwnerCanRequest') : t('projects.projectForm.budgetsRequestable'),
                            budgets: (requestable || []).filter(b => !managedIds.has(b.id) && offersKind(b, isAdopt ? 'cloud' : kind)),
                        },
                    ]}
                    markInstant
                    value={parentId}
                    onChange={selectBudget}
                    error={form.errors.parentId}
                />
            )}

            {/* A budget for structure only hands out the limit above it; a
                project there is fine, but rarely what was meant. */}
            {!isChange && budgetById(parentId)?.inherits_limit && (
                <Alert variant="light" color={COLOR.info} p="xs">
                    <Text size="xs">{budgetById(parentId).parent_name
                        ? t('projects.projectForm.inheritingBudget', { name: budgetById(parentId).parent_name })
                        : t('projects.projectForm.inheritingBudgetAbove')}</Text>
                </Alert>
            )}

            {/* Say why the numbers on the next tab just changed by themselves.
                What happens beyond them — a manager, or a refusal — and a share
                that is used up are the note under the form's business. */}
            {!isChange && !isAdopt && !selectedIsPool && usableHeadroomFor(parentId) && (
                <Text size="xs" c={COLOR.positive}>
                    {t('projects.projectForm.prefilled', { amount: resourceSummaryText(resources, selectedHeadroom) })}
                </Text>
            )}

            <TextInput
                label={t('projects.projectForm.name')}
                description={aiOnly ? t('projects.projectForm.nameHintAiaas') : t('projects.projectForm.nameHint')}
                placeholder={t('projects.projectForm.namePlaceholder')}
                required={!isAdopt}
                disabled={isAdopt}
                // A new project starts with its name; an existing one is
                // looked at first, so nothing takes the focus there.
                data-autofocus={(!isChange && !isAdopt) || undefined}
                {...form.getInputProps('name')}
            />

            <ReasonField
                label={t('projects.projectForm.purpose')}
                description={t('projects.projectForm.purposeHint')}
                placeholder={t('projects.projectForm.purposePlaceholder')}
                required
                {...form.getInputProps('reason')}
            />

            <TerminationDatePicker
                value={terminationDate}
                maxDate={latestEnd?.date ?? null}
                maxHint={latestEnd?.term
                    ? t('projects.endDate.atMostTerm', { date: formatDate(latestEnd.date), duration: formatTerm(t, latestEnd.term) })
                    : undefined}
                optional={!latestEnd && !openEndLocked}
                optionalHint={t('projects.endDate.setEndDateHintProject')}
                error={form.errors.terminationDate}
                onChange={(d) => { form.setFieldValue('terminationDate', d); form.clearFieldError('terminationDate'); }}
            />

            {/* A manager's: they act at once when saved, not as a request. */}
            {restructure && (
                <>
                    <PersonInput
                        label={t('projects.fact.owner')}
                        description={t('projects.projectForm.ownerHint')}
                        placeholder={t('projects.transferOwner.newOwnerPlaceholder')}
                        required
                        value={newOwner}
                        error={newOwnerError}
                        onChange={(v) => { setNewOwner(v); setNewOwnerError(null); }}
                    />
                    <BudgetSelect
                        label={t('projects.projectForm.budget')}
                        description={t('projects.projectForm.moveHint')}
                        budgets={withCurrentParent(node, moveTargets)}
                        value={newParent}
                        onChange={setNewParent}
                    />
                </>
            )}
        </Stack>
    );

    // Resources the project already consumes in OpenStack that the new figures
    // would fall below. OpenStack accepts such a quota silently — the servers
    // keep running, only new ones are refused — so nothing tells the requester
    // afterwards. Only resources OpenStack actually measures appear in
    // in_use, so an absent entry means "unknown", not "zero".
    // Compared with everything the project would hold — its allocations from
    // further up stay, so they count against what is in use too.
    const inUseNow = measuredUse(node);
    const overcommitted = useMemo(() => {
        const inUse = inUseNow;
        if (!inUse) return [];
        const total = effectiveLimit(node, quota);
        return (resources || [])
            .filter(r => typeof inUse[r.id] === 'number' && (total[r.id] ?? 0) < inUse[r.id])
            .map(r => ({ ...r, used: inUse[r.id], requested: total[r.id] ?? 0 }));
    }, [node, inUseNow, resources, quota]);

    const resourcesTab = (kind, first) => (
        <Stack>
            {first && isChange && hasAllocations(node) && (
                <Alert color={COLOR.info} variant="light" p="xs" icon={<Gift size="16" />}>
                    <Text size="xs">
                        {t('projects.allocation.ownShareOnly', {
                            list: node.allocations.map(a => `${a.budget_name || a.budget_id}: ${resourceSummaryText(resources, a.limit)}`).join(' · '),
                        })}
                    </Text>
                </Alert>
            )}
            {first && overcommitted.length > 0 && (
                <Alert color={COLOR.negative} variant="light" title={t('projects.projectForm.belowInUseTitle')}>
                    <Stack gap="4">
                        <Text size="sm">
                            {t('projects.projectForm.belowInUse')}
                        </Text>
                        {/* A table, not a sentence per resource: three headings
                            carry what four spliced fragments used to. */}
                        <Table withRowBorders={false} verticalSpacing={2} p={0}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('projects.changes.resource')}</Table.Th>
                                    <Table.Th>{t('projects.projectForm.requested')}</Table.Th>
                                    <Table.Th>{t('projects.fact.inUse')}</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {overcommitted.map(r => (
                                    <Table.Tr key={r.id}>
                                        <Table.Td>{resourceLabel(t, r)}</Table.Td>
                                        <Table.Td>{r.requested}</Table.Td>
                                        <Table.Td>{r.used}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Stack>
                </Alert>
            )}
            {/* What the project gets from its budget, and what a change of it needs. How a Lab/KI project uses that inside is a tab of its own (TAB_WORKSPACES), applied at once. */}
            <ResourceSection title={t('projects.resourceSections.quota')} hint={t(isChange ? 'projects.resourceSections.quotaHintChange' : 'projects.resourceSections.quotaHintNew')}>
                <QuotaInputs
                    providerDefaults
                    resources={kind ? offered.filter(r => kindOfResource(r) === kind) : offered}
                    value={quota}
                    headroom={newRoom}
                    usage={inUseNow || openstackSide(node).sync_errors
                        ? { inUse: inUseNow, grantUse: inUseNow ? openstackSide(node).grant_use : undefined, total: inUseNow ? effectiveLimit(node, quota) : undefined, syncErrors: openstackSide(node).sync_errors }
                        : null}
                    errors={Object.fromEntries((resources || []).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                    onChange={(id, v) => {
                        quotaTouched.current = true;
                        form.setFieldValue(`quota.${id}`, v);
                        form.clearFieldError(`quota.${id}`);
                    }}
                />
                {/* LLM: the recommended values, and a warning while the entered ones leave the project without access (no tokens) or with rates too low to use. Never a block: a budget may set low values on purpose. */}
                <LlmLimitHints recommend
                    resources={(kind ? offered.filter(r => kindOfResource(r) === kind) : offered).filter(r => kindOfResource(r) === 'llm')}
                    limit={isChange ? effectiveLimit(node, quota) : quota} />
                {first && isChange && <AllocationSection node={node} resources={resources} draft={alloc} />}
            </ResourceSection>
        </Stack>
    );

    // Two separate things, so two separate boxes of the same make: who gets
    // into the project in OpenStack, and who administers it here with the
    // owner. Access first — it is what most people come to this tab for.
    const membersTab = (
        <Stack gap="md">
            <Paper withBorder radius="md" p="md">
                <MemberRoleEditor
                    label={t(`projects.projectForm.${accessKey}`)}
                    description={t(`projects.projectForm.${accessKey}Hint`)}
                    members={authorizedUsers}
                    onChange={(members) => form.setFieldValue('authorizedUsers', members)}
                    roles={roles || []}
                    kinds={memberKinds}
                    emptyMessage={t('projects.projectForm.membersEmpty')}
                />
            </Paper>
            {(isChange || isAdopt) && <ExternalGroups node={node} removable={isChange} />}
            {/* Adopting names the owner; admins are added afterwards, like
                for any project. */}
            {!isAdopt && <Paper withBorder radius="md" p="md">
                <TokenListEditor
                    label={t('projects.projectForm.admins')}
                    description={t(`projects.projectForm.${adminsHintKey}`)}
                    tokens={form.values.adminScope}
                    onChange={(tokens) => form.setFieldValue('adminScope', tokens)}
                    listAs="rows"
                    emptyMessage={t('projects.projectForm.adminsEmpty')}
                />
            </Paper>}
        </Stack>
    );

    return (
        <FormModal
            opened={opened}
            // Every tabbed form is as wide: narrower, a member's row breaks
            // around its role picker and the tabs wrap.
            size={DIALOG_SIZE}
            onClose={onClose}
            title={isAdopt ? t('projects.adopt.title', { name: nodeTitle(node) })
                : isChange
                ? t('projects.inspect.titleProject', { name: nodeTitle(node) })
                : kind ? t(`projects.kind.newTitle_${kind}`) : t('projects.projectForm.titleNew')}
            onSubmit={form.onSubmit(values => {
                if (isAdopt) {
                    const problem = isEmail(t('projects.adopt.ownerRequired'))(ownerEmail);
                    if (problem) { setOwnerError(problem); return setActiveTab(TAB_DETAILS); }
                }
                if (ownerChanged && isEmail(t('projects.transferOwner.newOwnerRequired'))(personEmail(newOwner))) {
                    setNewOwnerError(t('projects.transferOwner.newOwnerRequired'));
                    return setActiveTab(TAB_DETAILS);
                }
                if (isChange && !alloc.validate()) return setActiveTab(firstResourceTab);
                if (withAttributes && !attrs.validate()) return setActiveTab(TAB_ATTRIBUTES);
                save.mutate(values);
            }, handleInvalid)}
            submitting={save.isPending}
            submitDisabled={outcome === 'blocked'}
            submitError={attrs.error || (save.error && formatError(save.error))}
            submitColor={isAdopt ? COLOR.outside : undefined}
            // What the button will do, beside it.
            note={<OutcomeNote
                over={over}
                outcome={outcome}
                isChange={isChange}
                budget={outcomeBudget}
                hasPolicy={!!outcomeBudget?.auto_approve && !managedIds.has(outcomeBudget?.id)}
            />}
            submitLabel={isAdopt ? t('projects.actions.adopt') : isChange
                ? (node?.status === 'pending' ? t('projects.projectForm.submitUpdateRequest')
                    : outcome === 'instant' ? t('projects.forms.saveChanges') : t('projects.projectForm.submitChangeRequest'))
                : (outcome === 'approval' ? t('projects.forms.submitRequest') : t('projects.projectForm.submitNew'))}
        >
            <FormTabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { value: TAB_DETAILS, label: t('projects.actions.details'), hasError: tabHasError(TAB_DETAILS) || !!newOwnerError, content: detailsTab },
                    ...resourceTabKinds.map((kind, i) => ({
                        value: resourceTabValue(kind),
                        label: resourceTabKinds.length > 1 ? t(`projects.kind.${kind}`) : t('projects.fact.resources'),
                        hasError: tabHasError(resourceTabValue(kind)) || (i === 0 && !!alloc.error),
                        content: resourcesTab(kind, i === 0),
                    })),
                    // Lab/KI: how the quotas are used inside the project — the AI service's part, saved with the rest but at once.
                    ...(workspaces.available ? [{
                        value: TAB_WORKSPACES, label: t('projects.resourceSections.workspaces'),
                        content: (
                            <ResourceSection hint={t('projects.resourceSections.workspacesHint')}>
                                <WorkspaceSettingsPanel draft={workspaces} />
                            </ResourceSection>
                        ),
                    }] : []),
                    { value: TAB_MEMBERS, label: t('projects.fact.members'), content: membersTab },
                    // Set by the budget's managers; its owner and admins see them.
                    ...(withAttributes ? [{ value: TAB_ATTRIBUTES, label: t('projects.attributes.tab'), hasError: !!attrs.error,
                        content: <AttributesEditor node={node} groups={attrs.groups} onChange={attrs.onChange} /> }]
                        : isChange && hasAttributes(node) ? [{ value: TAB_ATTRIBUTES, label: t('projects.attributes.tab'),
                            content: <AttributesView node={node} /> }] : []),
                    ...(isChange ? nodeExtraTabs(t, node, resources, activeTab) : []),
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
                    label={t('projects.changes.proposed')}
                    separated
                />
            )}
        </FormModal>
    );
}

// ResourceSection heads a tab's content: what it is about and how a change of it takes effect. No box — the tab already is one. Without a title only the hint, where the tab's name says it already.
function ResourceSection({ title, hint, children }) {
    return (
        <Stack gap="sm">
            <div>
                {title && <Text fw={600}>{title}</Text>}
                <Text size="sm" c="dimmed">{hint}</Text>
            </div>
            {children}
        </Stack>
    );
}
