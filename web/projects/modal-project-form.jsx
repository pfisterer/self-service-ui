import { useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Paper, SegmentedControl, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { ArrowUpCircle, Clock, Layers, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { formatError } from '/helper/api-error.js';
import { isEmail, useForm } from '@mantine/form';
import { formatTerm, NodeChangesDiff, NodeStatusBadge, TerminationDatePicker, TokenBadgeList } from './component-common.jsx';
import { formatDate } from '../format-date.js';
import { DIALOG_SIZE, FormModal, FormSections, tabHasError as tabFlag, tabWithError } from './component-form-modal.jsx';
import { QuotaInputs, validateQuota, withUnsetAsZero } from './component-quota-inputs.jsx';
import { MemberRoleEditor, TokenListEditor } from './component-token-list-editor.jsx';
import { BudgetSelect } from './component-budget-select.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { PersonInput, personEmail } from './principal-search.jsx';
import { AllocationList, useEndAllocation } from './component-allocations.jsx';
import { AllocationModal } from './modal-allocation.jsx';
import { SplitSection, nonZero, splitOutcome } from './component-split.jsx';
import { useWorkspaceSettings, workspaceSettingsItems } from '/gpu/workspace-settings.jsx';
import { ProjectId } from '/gpu/project-id.jsx';
import { withCurrentParent } from './component-budget-select.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { autoApproveHeadroom, budgetShortfall, canRaise, changeOutcome, COLOR, idsAbove, managesChainOf, projectNeed, raisePlan, nodeTitle, ownerEmail as nodeOwnerEmail, defaultsWithin, effectiveLimit, getAuthUserEmail, holdsProject, isAvailability, liveAllocations, payingBudgets, soleBudgetId, isPoolAutoApprove, latestProjectEnd, requestOutcome, resourceSummaryText, roomIn, visibleResources, measuredUse, openstackSide, resourceLabel, budgetKinds, catalogKinds, mostSpecificFirst, projectKinds, resourcesOfKinds, PROJECT_KINDS, kindOfResource, isLab, endDate, endDay, expiryTone, expiryValue } from './util-project.jsx';
import { nodeExtraTabs } from './modal-inspect.jsx';
import { useAuth } from '/providers/auth.jsx';
import { ExternalGroups } from './component-external-groups.jsx';
import { LlmLimitHints } from './component-llm-limits.jsx';
import { EstimatorSection } from './component-estimator.jsx';

const DEFAULT_TERM_DAYS = 90;

const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_MEMBERS = 'members';
const TAB_WORKSPACES = 'workspaces';
// The first of the workspace settings' entries, where a dialog opened on "workspaces" lands.
const TAB_WORKSPACES_FIRST = `${TAB_WORKSPACES}-environment`;

// OutcomeNote says, while the form is being filled in, what pressing the button
// will do — the one thing a requester cannot otherwise tell before it happened.
// workspacesChanged: the workspace settings were changed too; they apply at once, which the note adds where it does not say so for everything already (an approval, an amended request).
function OutcomeNote({ outcome, workspacesChanged = false, ...props }) {
    const { t } = useTranslation();
    const note = <OutcomeSentence outcome={outcome} {...props} />;
    if (!workspacesChanged || !(outcome === null || outcome === 'approval')) return note;
    return (
        <Stack gap={4}>
            {note}
            <Group gap={6} wrap="nowrap">
                <Zap size="14" color="var(--mantine-color-green-7)" style={{ flexShrink: 0 }} />
                <Text size="sm" c="green.8">{t('gpu.projects.settingsInstant')}</Text>
            </Group>
        </Stack>
    );
}

function OutcomeSentence({ outcome, isChange, budget, hasPolicy, over = [] }) {
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
                {t(isChange ? 'projects.projectForm.outcomeRefusedChange' : 'projects.projectForm.outcomeRefused')}
                {over.length > 0 && ` ${t('projects.projectForm.outcomeRefusedWhich', { list: over.map(r => t('projects.projectForm.overItem', { name: resourceLabel(t, r), asked: r.asked, free: r.free })).join(', ') })}`}
            </Text>
        );
    }
    if (outcome === 'direct' || outcome === 'instant') {
        const text = outcome === 'direct'
            ? t(isChange ? 'projects.projectForm.outcomeDirectChange' : 'projects.projectForm.outcomeDirect')
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

// RaiseBudgetOffer says which budget lacks room for the project (raisePlan's top-most step) and, where the viewer may raise it, offers to: in full on the resources tab, as the button alone beside the outcome note (compact). Every other limit stays text — whose the budget is to raise, a request on it to decide first, a budget above out of view.
function RaiseBudgetOffer({ plan, resources, chainComplete, onRaise, compact = false }) {
    const { t } = useTranslation();
    const top = plan?.[0];
    if (!top) return null;
    const amount = (q) => resourceSummaryText(t, resources, q);
    const name = nodeTitle(top.budget);
    const button = top.raisable && (
        <Button size={compact ? 'compact-sm' : 'xs'} variant="light" leftSection={<ArrowUpCircle size="14" />} onClick={() => onRaise(top)}>
            {t('projects.projectForm.raise.button', { name, amount: amount(top.short) })}
        </Button>
    );
    if (compact) return button || null;
    const lines = [];
    if (top.raisable) {
        lines.push(t('projects.projectForm.raise.missing', { name, amount: amount(top.short) }));
    } else {
        lines.push(top.ownShort || !top.child
            ? t('projects.projectForm.raise.parentFree', { name, amount: amount(top.short) })
            : t('projects.projectForm.raise.parentLimit', { name: nodeTitle(top.child), parent: name, amount: amount(top.short) }));
        if (top.reason === 'pending') lines.push(t('projects.projectForm.raise.pending', { name }));
        else if (top.reason === 'inherits') lines.push(t('projects.projectForm.raise.inherits', { name, parent: top.budget.parent_name || '…' }));
        else if (top.budget.parent_name) lines.push(t('projects.projectForm.raise.notManager', { parent: top.budget.parent_name }));
    }
    if (!chainComplete) lines.push(t('projects.projectForm.raise.aboveUnknown'));
    return (
        <Alert color={top.raisable ? COLOR.info : COLOR.attention} variant="light" p="xs" icon={<ArrowUpCircle size="16" />}>
            <Stack gap={6} align="flex-start">
                {lines.map(l => <Text key={l} size="xs">{l}</Text>)}
                {button}
            </Stack>
        </Alert>
    );
}

// ProjectFormModal creates a new project request or proposes changes to an
// existing project (mode is derived from `node`):
//   node == null  → create: budget picker + purpose + resources + members
//   node != null  → change: resources, end date and members are editable;
//                   pending projects are amended in place, active projects get
//                   a change request that a manager must approve — unless the
//                   viewer manages a budget above the project or the budget's
//                   auto-approve covers it: then it takes effect at once.
//
// initialBudgetId preselects the budget of a new project — set when the dialog
// is opened from a budget's own card.
//
// asManager: opened by a manager of one of the project's budgets. On an approved
// project they move it to another budget and hand it to another owner — fields
// of the Details tab that act at once, like the name. `moveTargets` are the
// budgets it may move to. Attributes (who pays for it) are no longer the
// project's: each paying budget sets them on its own allocation (the allocation
// dialog).
//
// A project consists of allocations, one per paying budget (allocation_leaves,
// 25.11.2026, revised the same day). Paid by one budget, the form changes that
// allocation as it always changed the project (the API forwards the change);
// paid by several, the Resources tab shows the total and the allocations, each
// changed on its own (AllocationModal) — what a budget pays follows that
// budget's rules. The end is the project's in both cases: every allocation runs
// until it, and a new end is asked of every paying budget (request-change on the
// project); it moves once all have agreed. A new
// project is either split over the budgets automatically (POST /v1/nodes/split,
// shown and changeable before it is sent) or paid by one budget picked here, as
// before; opened from a budget's card it is that budget.
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
//
// isRoot: the viewer is a root admin, who manages every budget's chain. Where the project's budget lacks room for what the form asks, someone who may raise it (a manager of a budget above it) gets the budget's dialog on top of this one, prefilled with the amount missing; onBudgetChanged runs after it saved, and this dialog keeps everything entered and looks again.
export function ProjectFormModal({ opened, onClose, onDone, onBudgetChanged, resources, roles, node = null, myBudgets = [], eligibleBudgets = [], myProjects = [], initialBudgetId = null, initialKind = null, asManager = false, moveTargets = [], adopt = false, initialTab, isRoot = false }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const queryClient = useQueryClient();
    // The budget being raised from here ({ budget, parent, add }), or null.
    const [raise, setRaise] = useState(null);
    // The estimator's dialog lies over this one while it is open (component-estimator.jsx); Escape is then its.
    const [estimating, setEstimating] = useState(false);
    const isAdopt = adopt && !!node;
    const isChange = !!node && !isAdopt;
    const { user } = useAuth();
    const userEmail = getAuthUserEmail(user);
    // The allocations of an existing project. Paid by one budget, the form edits that allocation (its waiting change first); paid by several, amounts are changed per allocation and the form shows the total, the end is the project's and asked of every paying budget.
    const live = isChange ? liveAllocations(node) : [];
    const multi = live.length > 1;
    const sole = live.length === 1 ? live[0] : null;
    const base = !isChange ? null : sole
        ? { limit: sole.pending?.limit || sole.limit, termination_date: sole.pending?.termination_date || sole.termination_date }
        : { limit: node.pending?.limit || node.limit, termination_date: node.pending?.termination_date || node.termination_date };
    // The one budget paying for the project, where there is one (a project has no parent of its own; paid by several, no single budget bounds the form).
    const homeId = isChange ? soleBudgetId(node) : null;
    // The allocation dialog over this one ({ initial }) and giving one back.
    const [allocDialog, setAllocDialog] = useState(null);
    const endAllocation = useEndAllocation();
    // The holders (owner, admins) manage every allocation; a budget's managers their own.
    const holder = isChange && holdsProject(node, userEmail);

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
    // Moving and handing over: a manager's, on an approved project.
    // Moving is a move of the project's only allocation (the API refuses it with several).
    const restructure = isChange && asManager && node.status === 'approved';
    const movable = restructure && !multi;
    const [newParent, setNewParent] = useState(homeId);
    const [newOwner, setNewOwner] = useState(() => nodeOwnerEmail(node) || '');
    const [newOwnerError, setNewOwnerError] = useState(null);
    const ownerChanged = restructure && personEmail(newOwner).toLowerCase() !== (nodeOwnerEmail(node) || '').toLowerCase();
    const parentChanged = movable && newParent && newParent !== homeId;
    // Lab/KI: how the project's workspaces are used — the AI service's part, in its own tab, saved with the rest and at once.
    const workspaces = useWorkspaceSettings(isChange && opened ? node?.id : null, isChange && opened);

    // "workspaces" was the tab of all workspace settings; they are entries of their own now.
    const [activeTab, setActiveTab] = useState(initialTab === TAB_WORKSPACES ? TAB_WORKSPACES_FIRST : (initialTab ?? TAB_DETAILS));


    // Auto-approve only ever applies to budgets you REQUEST under. On a budget
    // you manage the project is created approved outright, so its headroom is
    // not a limit for you — neither prefill the form with it nor talk about it.
    const managedIds = useMemo(() => new Set((myBudgets || []).map(b => b.id)), [myBudgets]);
    // Which resources a project may even ask for: only what the budget it hangs
    // under was delegated. Defined here rather than inline because validation
    // runs inside useForm, before the render has a chosen budget to look at —
    // and a form that validates a different set from the one it renders will
    // demand a value for a field nobody was shown.
    // A budget loaded fresh below (when it lacks room) wins over the lists' copy, which may be older than a raise made from here.
    const freshBudget = (id) => {
        const n = id ? queryClient.getQueryData(projectKeys.node(id)) : null;
        return n?.kind === 'budget' ? n : null;
    };
    const budgetById = (id) => freshBudget(id) ?? [...(myBudgets || []), ...(requestable || [])].find(b => b.id === id);
    // Whether the viewer manages the budget id or one above it: then a new project there is created at once, and a change of one takes effect at once.
    const managesChain = (id) => managesChainOf(budgetById(id) ?? (id ? { id } : null), managedIds, isRoot);
    // Nothing outlives the budget it draws from, and no project runs longer at
    // a time than the budget allows (see latestProjectEnd).
    const latestEndOf = (id) => latestProjectEnd(budgetById(id));
    // Paid by several budgets: the project may end no later than the earliest any of them grants (of those in view; the API checks the rest and refuses with the budget's name).
    const multiBound = (() => {
        if (!multi) return null;
        let bound = null;
        for (const a of live) {
            const l = latestEndOf(a.budget_id);
            if (l && (!bound || l.date < bound.date)) bound = l;
        }
        return bound;
    })();
    // Whether a picked end is later than the project's: what its budgets have to agree to.
    const endExtended = (d) => !!d && !!node?.termination_date && d.getTime() > endDate(node.termination_date).getTime();
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
    // The budgets a split may draw from: those the viewer manages or may request from that offer the kind, most specific first, each once.
    const splitCandidates = (kind) => {
        const seen = new Set();
        return [...(myBudgets || []), ...mostSpecificFirst(requestable || [])]
            .filter(b => b && b.status !== 'pending' && b.status !== 'rejected' && !seen.has(b.id) && seen.add(b.id) && offersKind(b, kind));
    };
    const offeredFor = (id, kind, split = false) => {
        // A change request has no budget picker — the project stays where it
        // is, so the scope is its PARENT budget: that is what a request could
        // draw from. The leaf itself is the fallback when the parent is not in
        // view (never the whole catalogue: offering an availability the budget
        // was never delegated reads as a promise the approval cannot keep).
        const budget = budgetById(isChange ? homeId : id) || (isChange ? node : null);
        // Split over budgets: whatever one of the budgets in reach offers.
        if (!isChange && !budget && split) {
            const cands = splitCandidates(kind);
            const ids = new Set(cands.flatMap(b => visibleResources(resources, b).map(r => r.id)));
            return resourcesOfKinds(cands.length ? (resources || []).filter(r => ids.has(r.id)) : resources, kindsFor(kind));
        }
        return resourcesOfKinds(budget ? visibleResources(resources, budget) : resources, kindsFor(kind));
    };
    // Only what the form offers goes into a new project: a cloud default left
    // in an AI project's request would make it a cloud project as well.
    const onlyOffered = (quota, id, kind, split = false) => {
        const ids = new Set(offeredFor(id, kind, split).map(r => r.id));
        return Object.fromEntries(Object.entries(quota || {}).filter(([rid]) => ids.has(rid)));
    };

    const headroomFor = (id) => managesChain(id)
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
    const openEndLocked = isChange && !!(base.termination_date || node.termination_date);
    // A new project's kind: the one asked for, else the first the preselected
    // budget offers; its budget: the one asked for, else the first offering it.
    const initialKind_ = isChange || isAdopt || catalog.length < 2 ? null
        : (initialKind ?? (budgetById(initialBudgetId) && budgetKinds(budgetById(initialBudgetId), resources)[0]) ?? catalog[0]);
    const initialParentId = isChange ? null
        : (initialBudgetId ?? [...myBudgets, ...mostSpecificFirst(requestable)].find(b => offersKind(b, initialKind_))?.id ?? null);
    // How a new project is paid for: split over the budgets in reach where there are several, by the one budget it was opened from, or by one picked.
    const initialFunding = isChange || isAdopt || initialBudgetId || splitCandidates(initialKind_).length < 2 ? 'single' : 'split';
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
                quota: withUnsetAsZero(offeredFor(null), multi ? node.limit : base.limit),
                terminationDate: (multi ? node.termination_date : base.termination_date)
                    ? endDate(multi ? node.termination_date : base.termination_date)
                    : null,
                authorizedUsers: node.pending?.authorized_users || node.authorized_users || [],
                adminScope: node.admin_scope || [],
            }
            : {
                kind: initialKind_,
                parentId: initialParentId,
                funding: initialFunding,
                startWhen: 'now',
                name: '',
                reason: '',
                // A budget that approves instantly starts filled with the most
                // it would grant, so the common case is one click — unless the
                // allowance is (partly) used up: then the defaults stay, capped
                // to what the budget can still give. Split over budgets, the
                // catalogue's defaults: the split says who grants what.
                quota: initialFunding === 'split'
                    ? onlyOffered(defaultsWithin(resources, null), null, initialKind_, true)
                    : initialQuotaFor(initialParentId, initialKind_),
                terminationDate: initialFunding === 'split' ? defaultEnd : withinBudget(defaultEnd, initialParentId),
                authorizedUsers: [],
                adminScope: [],
            },
        validate: (values) => ({
            // An import keeps its OpenStack name.
            name: !isAdopt && (values.name || '').trim().length < 3
                ? t('projects.projectForm.nameRequired') : null,
            reason: reasonError(values.reason, t('projects.projectForm.purposeRequired')),
            parentId: (!isChange && values.funding !== 'split' && !values.parentId) ? t('projects.projectForm.budgetRequired') : null,
            terminationDate: (() => {
                const latest = multi ? multiBound : latestEndOf(isChange ? homeId : values.funding === 'split' ? null : values.parentId);
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
                multi ? [] : Object.entries(validateQuota(t, offeredFor(values.funding === 'split' ? null : values.parentId, values.kind, values.funding === 'split'), values.quota, { providerDefaults: true })).map(([id, msg]) => [`quota.${id}`, msg])),
        }),
    });

    const { kind, quota, terminationDate, authorizedUsers } = form.values;
    // Split over budgets: no budget is picked, the split names them.
    const splitting = !isChange && !isAdopt && form.values.funding === 'split';
    const parentId = splitting ? null : form.values.parentId;
    const selectedHeadroom = headroomFor(parentId);
    // The per-person notes below are about individual limits; a pool's
    // "headroom" is just the budget's free capacity, which the picker shows.
    const selectedIsPool = isPoolAutoApprove(budgetById(parentId));

    // The project's budget. For a change the project's record names the budgets above it, should the budget itself not be in view.
    const projectBudgetId = isChange ? homeId : parentId;
    const offered = offeredFor(parentId, kind, splitting);
    const knownBudget = budgetById(projectBudgetId) || null;
    // Managing the budget or one above it is what the API asks of whoever creates a project directly or changes one at once — not only managing the budget itself (managing just the one above it showed "a manager decides").
    const manages = !isAdopt && managesChainOf(knownBudget ?? (isChange ? (homeId ? { id: homeId, parent_path: (sole?.budget_path || []).slice(0, -1) } : null) : (parentId ? { id: parentId } : null)), managedIds, isRoot);
    // An amended pending request stays a request, and an adopted project always goes through approval: neither applies anything now.
    const applies = !isAdopt && !(isChange && node.status === 'pending');

    // What the project needs the budgets to have free, and — while its budget lacks it and the viewer's change or project would apply at once — that budget loaded fresh with the ones above it, as far as the viewer may read them (a 403 leaves the rest unknown).
    const need = projectNeed({ isChange, node, quota, resources: offered });
    const lacking = Object.keys(need).length > 0
        && (!knownBudget || Object.keys(budgetShortfall(knownBudget, need, offered)).length > 0);
    const watchChain = opened && !!api && applies && manages && !!projectBudgetId && lacking && !multi;
    const budgetQuery = useQuery({
        queryKey: projectKeys.node(projectBudgetId),
        queryFn: () => api.getNode(projectBudgetId),
        enabled: watchChain,
        retry: false,
    });
    const projectBudget = (budgetQuery.data?.kind === 'budget' ? budgetQuery.data : null) ?? knownBudget;
    const aboveIds = projectBudget ? idsAbove(projectBudget) : [];
    const aboveQueries = useQueries({
        queries: aboveIds.map(id => ({ queryKey: projectKeys.node(id), queryFn: () => api.getNode(id), enabled: watchChain, retry: false })),
    });
    // The top budget is in no path: it is what the top-most one there hangs under.
    const topAbove = aboveQueries[aboveQueries.length - 1]?.data;
    const rootId = topAbove?.parent_id && !aboveIds.includes(topAbove.parent_id) ? topAbove.parent_id : null;
    const rootQuery = useQuery({
        queryKey: projectKeys.node(rootId),
        queryFn: () => api.getNode(rootId),
        enabled: watchChain && !!rootId,
        retry: false,
    });
    // The chain from the project's budget upward as far as it is known, and whether that reaches the top.
    const chain = [];
    let chainComplete = false;
    if (projectBudget) {
        chain.push(projectBudget);
        chainComplete = !projectBudget.parent_id;
        for (const q of [...aboveQueries, ...(rootId ? [rootQuery] : [])]) {
            if (chainComplete || !q.data) break;
            chain.push(q.data);
            chainComplete = !q.data.parent_id;
        }
    }
    const plan = applies && manages && projectBudget
        ? raisePlan(chain, need, offered, { canRaise: (b) => canRaise(b, managedIds, isRoot) })
        : [];

    // The split over budgets: asked for once the entered amounts rest for a moment, and changeable here (editedParts) — then it no longer follows the amounts.
    const askedTotal = nonZero(quota);
    const splitIds = splitting ? splitCandidates(kind).map(b => b.id) : [];
    const [splitParams] = useDebouncedValue(JSON.stringify({ limit: askedTotal, end: endDay(terminationDate), ids: splitIds }), 400);
    const splitQuery = useQuery({
        queryKey: projectKeys.split(splitParams),
        queryFn: () => {
            const p = JSON.parse(splitParams);
            return api.planSplit({ limit: p.limit, terminationDate: p.end, budgetIds: p.ids });
        },
        enabled: !!api && opened && splitting && Object.keys(JSON.parse(splitParams).limit).length > 0,
        retry: false,
        placeholderData: keepPreviousData,
    });
    const [editedParts, setEditedParts] = useState(null);
    const splitPlan = splitQuery.data ?? null;
    const parts = editedParts ?? splitPlan?.parts ?? [];

    // What the button will do.
    const outcomeBudget = projectBudget;
    const predicted = isAdopt ? null : isChange
        // Paid by several budgets the form changes members, name, admins and the end: a later end is asked of every paying budget, so it may wait; anything else applies at once.
        ? (multi ? (endExtended(terminationDate) ? 'approval' : 'instant') : node.status === 'pending' ? null : changeOutcome({
            node: sole ?? node, budget: outcomeBudget, quota, terminationDate, resources, myProjects, manages,
        }))
        : splitting ? (splitQuery.isFetching && !editedParts ? null : splitOutcome(parts, editedParts ? null : splitPlan?.unplaced, managesChain))
        : requestOutcome({
            budget: outcomeBudget, manages, quota, resources, myProjects,
        });
    // A budget above lacking room refuses what the project's own budget would allow.
    const outcome = predicted === 'direct' && plan.length > 0 ? 'refused' : predicted;

    // What the project's budget leaves for it per quantity, shown under each field, and the quantities asking for more than that — the refusal names them instead of leaving the person to guess. For an active project that is what it holds plus what the budget has free: its own share is in the budget's use already.
    const held = isChange && (node.status === 'approved' || node.status === 'change_pending') ? (node.limit || {}) : {};
    const budgetRoom = outcomeBudget ? roomIn(outcomeBudget, offered) : null;
    const newRoom = budgetRoom ? Object.fromEntries(Object.entries(budgetRoom).map(([id, free]) => [id, free + (held[id] ?? 0)])) : null;
    const over = newRoom ? offered
        .filter(r => !isAvailability(r) && (quota?.[r.id] ?? 0) > (newRoom[r.id] ?? Infinity))
        .map(r => ({ ...r, asked: quota[r.id], free: newRoom[r.id] })) : [];
    const openRaise = (step) => setRaise({ budget: step.budget, parent: step.parent, add: step.short });
    const latestEnd = multi ? multiBound : latestEndOf(isChange ? homeId : parentId);

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
    const resourcesChanged = (values) => {
        if (!isChange || multi) return false;
        const baseLimit = base.limit || {};
        const baseDate = base.termination_date;
        const nextDate = values.terminationDate?.getTime() ?? null;
        return (resources || []).some(r => (values.quota[r.id] ?? 0) !== (baseLimit[r.id] ?? 0))
            || (baseDate ? endDate(baseDate).getTime() : null) !== nextDate;
    };
    // Paid by several budgets the end is changed on its own (request-change on the project with the end alone): the API asks every paying budget for it.
    const projectEndChanged = (values) => {
        if (!isChange || !multi) return false;
        const from = node.termination_date ? endDate(node.termination_date).getTime() : null;
        return from !== (values.terminationDate?.getTime() ?? null);
    };
    const approvalFieldsChanged = (values) => {
        if (!isChange) return true;
        const baseUsers = node.pending?.authorized_users || node.authorized_users || [];
        return resourcesChanged(values)
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
    // A dialog opened on one kind's resources (resources-llm, "Modelle und Grenzen" of the side panel) lands on that kind's tab, and on the one resources tab where the project has no tab per kind: the caller cannot know how the dialog splits them.
    const shownTab = activeTab.startsWith(`${TAB_RESOURCES}-`) && !resourceTabKinds.map(resourceTabValue).includes(activeTab) ? firstResourceTab : activeTab;
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
            if (!isChange && values.funding === 'split') {
                // The split as shown: one allocation per part, each with the end its budget allows; the project starts as chosen.
                const allocations = parts
                    .map(p => ({ budget_id: p.budget_id, limit: nonZero(p.limit), termination_date: p.termination_date || iso || undefined }))
                    .filter(a => Object.keys(a.limit).length > 0);
                return api.createNode({
                    kind: 'project',
                    name: values.name.trim(),
                    reason: values.reason,
                    termination_date: iso,
                    authorized_users: values.authorizedUsers,
                    admin_scope: values.adminScope,
                    start_when: values.startWhen,
                    allocations,
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
            // Members apply at once; amounts and end are the only allocation's (the API forwards them to it), or — paid by several budgets — changed per allocation, never here.
            if (approvalFieldsChanged(values)) {
                result = await api.requestChange(node.id, {
                    ...(resourcesChanged(values) ? { limit: values.quota, termination_date: iso } : {}),
                    authorized_users: values.authorizedUsers,
                    reason: values.reason,
                });
            }
            // A new end of a project paid by several budgets: asked of each, applied where it shortens or the budget agrees by itself, else waiting for its managers. The allocations it goes on without keep their own end; is one left to carry the project's end, the change is that allocation's (the API would otherwise not tell them apart).
            if (projectEndChanged(values)) {
                const carriers = live.filter(a => !a.ends_alone);
                result = await api.requestChange(carriers.length === 1 ? carriers[0].id : node.id, { termination_date: iso });
            }
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
            {/* Split over the budgets in reach, or one budget picked: only a question where several budgets offer the kind. */}
            {!isChange && !isAdopt && (form.values.funding === 'split' || splitCandidates(kind).length > 1) && (
                <Stack gap={4}>
                    <Text size="sm" fw={500}>{t('projects.split.funding')}</Text>
                    <SegmentedControl
                        size="xs"
                        style={{ alignSelf: 'flex-start' }}
                        value={form.values.funding}
                        onChange={(v) => {
                            form.setFieldValue('funding', v);
                            form.clearFieldError('parentId');
                            setEditedParts(null);
                            if (v === 'single' && !form.values.parentId) selectBudget(splitCandidates(kind)[0]?.id ?? null);
                        }}
                        data={[
                            { value: 'split', label: t('projects.split.fundingSplit') },
                            { value: 'single', label: t('projects.split.fundingSingle') },
                        ]}
                    />
                    <Text size="xs" c="dimmed">{t(splitting ? 'projects.split.fundingSplitHint' : 'projects.split.fundingSingleHint')}</Text>
                </Stack>
            )}
            {!isChange && !splitting && (
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
                            budgets: mostSpecificFirst(requestable).filter(b => !managedIds.has(b.id) && offersKind(b, isAdopt ? 'cloud' : kind)),
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
                    {t('projects.projectForm.prefilled', { amount: resourceSummaryText(t, resources, selectedHeadroom) })}
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

            {/* The project's end, also paid by several budgets: every allocation runs until it. */}
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
            {multi && <Text size="xs" c="dimmed" mt={-8}>{t('projects.allocation.endAllBudgets')}</Text>}

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
                    {movable && (
                        <BudgetSelect
                            label={t('projects.projectForm.budget')}
                            description={t('projects.projectForm.moveHint')}
                            budgets={withCurrentParent({ ...node, parent_id: homeId, parent_name: sole?.budget_name, parent_path: sole?.budget_path }, moveTargets)}
                            value={newParent}
                            onChange={setNewParent}
                        />
                    )}
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
            {first && <RaiseBudgetOffer plan={plan} resources={resources} chainComplete={chainComplete} onRaise={openRaise} />}
            {/* Who pays for what. Paid by several budgets, the amounts below are the total and every allocation is changed on its own (decided 25.11.2026: each follows its budget's rules). */}
            {first && isChange && live.length > 0 && (
                <Paper withBorder radius="md" p="sm">
                    <Stack gap={6}>
                        <Group gap={6}>
                            <Layers size="14" />
                            <Text size="sm" fw={600}>{t('projects.fact.paidFrom')}</Text>
                        </Group>
                        {multi && <Text size="xs" c="dimmed">{t('projects.allocation.multiHint')}</Text>}
                        <AllocationList project={node} resources={resources} holder={holder}
                            managedIds={managedIds} isRoot={isRoot}
                            decide={false}
                            onAction={(action, subject, target) => {
                                if (action === 'allocations') return setAllocDialog({ initial: target });
                                if (action === 'allocation-end' || action === 'allocation-end-alone') {
                                    return endAllocation(subject, { holder, resources, atEnd: action === 'allocation-end-alone' }).then(ok => ok && onDone?.());
                                }
                            }} />
                    </Stack>
                </Paper>
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
            {/* The estimator: amounts computed from the intended use, taken into the fields below (still editable). The budget check only for a new project paid by one budget; a change or a split is checked by the outcome and the split below. */}
            {!isAdopt && !multi && (
                <EstimatorSection
                    onOpenChange={setEstimating}
                    kind={kind}
                    offered={kind ? offered.filter(r => kindOfResource(r) === kind) : offered}
                    budgetId={!isChange && !splitting ? parentId : null}
                    terminationDate={endDay(terminationDate)}
                    onApply={(take) => {
                        quotaTouched.current = true;
                        for (const [id, v] of Object.entries(take)) {
                            form.setFieldValue(`quota.${id}`, v);
                            form.clearFieldError(`quota.${id}`);
                        }
                    }}
                />
            )}
            {/* What the project gets from its budget, and what a change of it needs; the group "Quotas" names it already, so only the hint. How a Lab/KI project uses that inside is a group of entries of its own (workspaceSettingsItems), applied at once. */}
            <ResourceSection hint={t(isChange ? 'projects.resourceSections.quotaHintChange' : 'projects.resourceSections.quotaHintNew')}>
                <QuotaInputs
                    providerDefaults
                    disabled={multi}
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
            </ResourceSection>
            {/* A new project split over budgets: who pays what, changeable, and when it starts. */}
            {first && splitting && (
                <SplitSection
                    plan={splitPlan}
                    loading={splitQuery.isFetching}
                    error={splitQuery.error ? formatError(splitQuery.error) : null}
                    parts={parts}
                    edited={!!editedParts}
                    onChange={setEditedParts}
                    onReset={() => setEditedParts(null)}
                    candidates={splitCandidates(kind)}
                    resources={offered}
                    asked={askedTotal}
                    startWhen={form.values.startWhen}
                    onStartWhen={(v) => form.setFieldValue('startWhen', v)}
                    isManaged={managesChain}
                />
            )}
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

    // Which entries hold a change not saved yet: against what the form opened with (a pending request's figures for a pending project).
    const quotaChanged = (kind) => offered.some(r => (!kind || kindOfResource(r) === kind) && form.isDirty(`quota.${r.id}`));
    const detailsChanged = isChange && (['name', 'reason', 'terminationDate'].some(k => form.isDirty(k)) || ownerChanged || !!parentChanged);

    // Above the sections of an existing project: its state, its end, its budget and, for one the AI service knows, its id there (what the dhbw-cloud CLI takes as --project). A new one has its kind in the dialog's title and nothing else to show yet.
    const header = isChange ? (
        <Group gap="lg" rowGap={4} wrap="wrap" align="center">
            <NodeStatusBadge status={node.status} />
            {node.termination_date && (
                <Text size="xs" c="dimmed">
                    {t('projects.fact.validUntil')}:{' '}
                    <Text span inherit fw={500} c={expiryTone(node.termination_date) === 'gray' ? 'var(--mantine-color-text)' : `${expiryTone(node.termination_date)}.7`}>
                        {expiryValue(t, node.termination_date)}
                    </Text>
                </Text>
            )}
            {/* Every budget paying for it: a project has no single budget. */}
            {payingBudgets(node).length > 0 && (
                <Text size="xs" c="dimmed">
                    {t('projects.fact.paidFrom')}: <Text span inherit fw={500} c="var(--mantine-color-text)">{payingBudgets(node).map(b => b.name).join(', ')}</Text>
                </Text>
            )}
            <ProjectId slug={workspaces.project?.slug} />
        </Group>
    ) : null;

    // The budget's dialog for a raise is a sibling, not a child: a child's submit would bubble through the React tree into this form and save the project too.
    return (
        <>
        <FormModal
            opened={opened}
            // Every tabbed form is as wide: narrower, a member's row breaks
            // around its role picker and the tabs wrap.
            size={DIALOG_SIZE}
            onClose={onClose}
            // Escape belongs to the budget's dialog while it is open over this one.
            closeOnEscape={!raise && !estimating}
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
                // Split over budgets: something has to be placed, and nothing left that no budget takes.
                if (splitting && outcome === 'blocked') return setActiveTab(firstResourceTab);
                save.mutate(values);
            }, handleInvalid)}
            submitting={save.isPending}
            submitDisabled={outcome === 'blocked' || (splitting && (outcome === null || parts.length === 0))}
            submitError={(save.error && (save.error.stale && workspaces.available
                // The AI service's part changed meanwhile (another manager, a member choosing a group): its draft is loaded again, the dialog's other changes stay.
                ? <>{formatError(save.error)} <Button size="compact-xs" variant="light" onClick={async () => { save.reset(); await workspaces.reload(); }}>{t('gpu.projects.conflictReload')}</Button></>
                : formatError(save.error)))}
            submitColor={isAdopt ? COLOR.outside : undefined}
            // What the button will do, beside it.
            note={<Stack gap={6} align="flex-start">
                <OutcomeNote
                    over={over}
                    outcome={outcome}
                    workspacesChanged={workspaces.changed}
                    isChange={isChange}
                    budget={outcomeBudget}
                    hasPolicy={!!outcomeBudget?.auto_approve && !manages}
                />
                <RaiseBudgetOffer compact plan={plan} resources={resources} chainComplete={chainComplete} onRaise={openRaise} />
            </Stack>}
            submitLabel={isAdopt ? t('projects.actions.adopt') : isChange
                ? (node?.status === 'pending' ? t('projects.projectForm.submitUpdateRequest')
                    : ['instant', 'direct', 'refused'].includes(outcome) ? t('projects.forms.saveChanges') : t('projects.projectForm.submitChangeRequest'))
                : (outcome === 'approval' ? t('projects.forms.submitRequest') : t('projects.projectForm.submitNew'))}
        >
            <FormSections
                value={shownTab}
                onChange={setActiveTab}
                header={header}
                groups={[
                    {
                        key: 'project', label: t('formSections.groupProject'),
                        items: [
                            { value: TAB_DETAILS, label: t('projects.actions.details'), hasError: tabHasError(TAB_DETAILS) || !!newOwnerError || !!ownerError, changed: detailsChanged, content: detailsTab },
                            { value: TAB_MEMBERS, label: t('projects.fact.members'), changed: isChange && (form.isDirty('authorizedUsers') || form.isDirty('adminScope')), content: membersTab },
                            ...(isChange ? nodeExtraTabs(t, node, resources, activeTab) : []),
                        ],
                    },
                    {
                        // What the project gets from its budget: a change is granted at once or requested, depending on the budget.
                        key: 'quotas', label: t('projects.resourceSections.quota'), mark: 'approval',
                        items: resourceTabKinds.map((kind, i) => ({
                            value: resourceTabValue(kind),
                            label: resourceTabKinds.length > 1 ? t(`projects.kind.${kind}`) : t('projects.fact.resources'),
                            hasError: tabHasError(resourceTabValue(kind)),
                            changed: isChange && quotaChanged(kind),
                            content: resourcesTab(kind, i === 0),
                        })),
                    },
                    // Lab/KI: how the quotas are used inside the project — the AI service's part, saved with the rest but at once.
                    ...(workspaces.available ? [{
                        key: 'workspaces', label: t('projects.kind.workspaces'), mark: 'instant',
                        items: workspaceSettingsItems(t, workspaces),
                    }] : []),
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
        {/* One allocation changed, given back or another budget asked: a sibling for the same reason as the budget's dialog below. */}
        {allocDialog && (
            <AllocationModal
                key={`allocations:${allocDialog.initial ?? ''}`}
                opened
                onClose={() => setAllocDialog(null)}
                onDone={() => { setAllocDialog(null); onDone?.(); onClose?.(); }}
                project={node}
                initial={allocDialog.initial}
                resources={resources}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={myProjects}
                isRoot={isRoot}
                userEmail={userEmail}
            />
        )}
        {raise && (
            <BudgetFormModal
                key={`raise:${raise.budget.id}`}
                opened
                mode="edit"
                node={raise.budget}
                parent={raise.parent}
                resources={resources}
                raiseBy={raise.add}
                raiseFor={form.values.name.trim() || t('projects.projectForm.titleNew')}
                zIndex={300}
                onClose={() => setRaise(null)}
                onDone={() => onBudgetChanged?.()}
            />
        )}
        </>
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
