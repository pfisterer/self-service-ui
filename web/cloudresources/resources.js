import { useState, useEffect, useMemo } from 'preact/hooks';
import { html } from 'htm/preact';
import { Route, Switch, useRoute, useLocation } from 'wouter-preact';
import { Plus, AlertCircle, Users, Database, ArrowRight, History, Shield, Calendar, FileText, Check, X, LogOut } from 'lucide-preact';
import { useDisclosure } from '@mantine/hooks';
import { DatePickerInput } from '@mantine/dates';
import { Container, Grid, Card, Badge, Group, Stack, Text, Button, Tabs, Modal, TextInput, NumberInput, Select, Textarea, Table, Notification, Loader, Progress, Box, SimpleGrid, Paper, Timeline, Divider, Checkbox } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

//-----------------------------------------
// --- Constants ---
//-----------------------------------------

const INFINITY = Number.MAX_SAFE_INTEGER;

//-----------------------------------------
// --- Data Store (Admingroups + Ledger) ---
//-----------------------------------------

const mockIdentityCatalog = [
    {
        id: 'mock_root',
        label: 'Mock Root Admin (root_uni)',
        email: 'root.admin@uni.example',
        tokens: ['user:root.admin@uni.example', 'group:root_uni']
    },
    {
        id: 'mock_cs_faculty',
        label: 'Mock Faculty (cs-faculty)',
        email: 'faculty@cs.example',
        tokens: ['user:faculty@cs.example', 'group:cs-faculty']
    },
    {
        id: 'mock_bio_faculty',
        label: 'Mock Faculty (bio-faculty)',
        email: 'faculty@bio.example',
        tokens: ['user:faculty@bio.example', 'group:bio-faculty']
    },
    {
        id: 'mock_student',
        label: 'Mock Student (cs-student)',
        email: 'student@cs.example',
        tokens: ['user:student@cs.example', 'group:cs-student']
    }
];

const mockStore = {
    admingroups: [
        {
            id: 'root_uni',
            name: 'University Root',
            parent_id: null,
            can_delegate: true,
            delegation_strategy: 'pool',
            membership_rules: {
                whitelist: ['group:root_uni'],
                blacklist: []
            },
            delegation_scope: {
                whitelist: ['group:root_uni'],
                blacklist: []
            },
            resources: {
                limit: { cores: INFINITY, ram: INFINITY, storage: INFINITY, gpu: INFINITY }
            },
            created_by: 'System',
            created_at: '2025-01-01T00:00:00Z',
            end_date: null
        },
        {
            id: 'dept_cs',
            name: 'Computer Science Dept',
            parent_id: 'root_uni',
            can_delegate: true,
            delegation_strategy: 'pool',
            membership_rules: {
                whitelist: ['group:cs-faculty', 'group:cs-staff'],
                blacklist: []
            },
            delegation_scope: {
                whitelist: ['group:cs-faculty', 'group:cs-staff'],
                blacklist: []
            },
            resources: {
                limit: { cores: 500, ram: 2000, storage: 5000, gpu: 50 }
            },
            created_by: 'root.admin@uni.example',
            created_at: '2025-06-15T10:30:00Z',
            end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 'dept_cs_students',
            name: 'CS Students (Small VM)',
            parent_id: 'dept_cs',
            can_delegate: false,
            delegation_strategy: 'allowance',
            membership_rules: {
                whitelist: ['group:cs-faculty', 'group:cs-staff'],
                blacklist: []
            },
            delegation_scope: {
                whitelist: ['group:cs-student'],
                blacklist: []
            },
            resources: {
                limit: { cores: 2, ram: 4, storage: 20, gpu: 0 }
            },
            created_by: 'root.admin@uni.example',
            created_at: '2025-09-01T09:00:00Z',
            end_date: null
        },
        {
            id: 'dept_bio',
            name: 'Biology Dept',
            parent_id: 'root_uni',
            can_delegate: true,
            delegation_strategy: 'pool',
            membership_rules: {
                whitelist: ['group:bio-faculty'],
                blacklist: []
            },
            delegation_scope: {
                whitelist: ['group:bio-faculty', 'group:bio-student'],
                blacklist: []
            },
            resources: {
                limit: { cores: 300, ram: 1000, storage: 3000, gpu: 20 }
            },
            created_by: 'root.admin@uni.example',
            created_at: '2025-07-20T14:15:00Z',
            end_date: null
        }
    ],

    requests: [
        {
            id: 'req_001',
            status: 'approved',
            requester: { tokens: ['user:faculty@cs.example', 'group:cs-faculty'] },
            resources: { cores: 4, ram: 16, storage: 100, gpu: 0 },
            reason: 'Faculty research sandbox',
            funded_by: 'dept_cs',
            pending: null,   // Null if no pending changes
            termination_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            authorized_users: [
                { token: 'user:faculty@cs.example', role: 'admin' },
                { token: 'group:cs-faculty', role: 'member' }
            ],
            history: [
                {
                    timestamp: '2026-01-20T10:00:00Z',
                    event: 'created',
                    actor: 'user:faculty@cs.example',
                    status_from: null,
                    status_to: 'pending',
                    quota_from: null,
                    quota_to: { cores: 4, ram: 16, storage: 100, gpu: 0 },
                    termination_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                    reason: 'Initial request for faculty research sandbox'
                },
                {
                    timestamp: '2026-01-21T09:00:00Z',
                    event: 'approved',
                    actor: 'admin:root.admin@uni.example',
                    group: 'dept_cs',
                    status_from: 'pending',
                    status_to: 'approved',  // Quota deducted from dept_cs
                    quota_from: null,
                    quota_to: null,
                    reason: 'Approved by root admin'
                }
            ]
        },
        {
            id: 'req_002',
            status: 'pending',
            requester: { tokens: ['user:student@cs.example', 'group:cs-student'] },
            resources: { cores: 2, ram: 8, storage: 50 },
            reason: 'Student course project',
            funded_by: null,
            pending: null,
            termination_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            authorized_users: [
                { token: 'user:student@cs.example', role: 'admin' }
            ],
            history: [
                {
                    timestamp: '2026-01-23T08:00:00Z',
                    event: 'created',
                    actor: 'user:student@cs.example',
                    status_from: null,
                    status_to: 'pending',
                    quota_from: null,
                    quota_to: { cores: 2, ram: 8, storage: 50 },
                    termination_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    reason: 'Student course project needs compute'
                }
            ]
        },
        {
            id: 'req_003',
            status: 'change_pending',
            requester: { tokens: ['user:faculty@cs.example', 'group:cs-faculty'] },
            resources: { cores: 8, ram: 32, storage: 200 },
            reason: 'Expanded faculty ML workload',
            funded_by: 'dept_cs',
            pending: {
                quota: { cores: 12, ram: 48, storage: 300 },
                termination_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                authorized_users: [
                    { token: 'user:faculty@cs.example', role: 'admin' },
                    { token: 'group:cs-faculty', role: 'member' },
                    { token: 'user:newuser@cs.example', role: 'reader' }
                ]
            },
            termination_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            authorized_users: [
                { token: 'user:faculty@cs.example', role: 'admin' },
                { token: 'group:cs-faculty', role: 'member' }
            ],
            history: [
                {
                    timestamp: '2026-01-15T10:00:00Z',
                    event: 'created',
                    actor: 'user:faculty@cs.example',
                    status_from: null,
                    status_to: 'pending',
                    quota_from: null,
                    quota_to: { cores: 8, ram: 32, storage: 200 },
                    termination_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                    reason: 'Initial ML workload request'
                },
                {
                    timestamp: '2026-01-16T14:00:00Z',
                    event: 'approved',
                    actor: 'admin:root.admin@uni.example',
                    group: 'dept_cs',
                    status_from: 'pending',
                    status_to: 'approved',
                    quota_from: null,
                    quota_to: null,
                    reason: 'Approved by root admin'
                },
                {
                    timestamp: '2026-01-25T11:30:00Z',
                    event: 'change_requested',
                    actor: 'user:faculty@cs.example',
                    status_from: 'approved',
                    status_to: 'change_pending',
                    quota_from: { cores: 8, ram: 32, storage: 200 },
                    quota_to: { cores: 12, ram: 48, storage: 300 },
                    termination_date_from: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                    termination_date_to: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                    reason: 'Need more resources for larger dataset'
                }
            ]
        }
    ]
};

//-----------------------------------------
// The Logic Engine (Runtime DAG) ---
//-----------------------------------------

const DAGLogic = {
    /**
     * Check if user tokens match a rule set (whitelist/blacklist)
     * Reusable for membership rules and delegation scopes
     * Updated: Now requires at least one token match if whitelist is present.
     * Empty whitelist = No one matches.
     * 
     * @param {Array<string>} userTokens - User's identity tokens
     * @param {Object} rules - Rule set { whitelist, blacklist }
     * @returns {boolean} true if user tokens match the rules
     */
    matchesRules: (userTokens, rules) => {
        const isWhitelisted = rules.whitelist.length > 0 &&
            userTokens.some(t => rules.whitelist.includes(t));

        const isBlacklisted = userTokens.some(t => rules.blacklist.includes(t));

        return isWhitelisted && !isBlacklisted;
    },

    /**
     * Finds all groups a user can administrate
     * @param {Array<string>} userTokens - User's identity tokens
     * @param {Array<Object>} admingroups - All available admingroups
     * @returns {Array<Object>} Groups where user has administrative access
     */
    getUserAdminGroups: (userTokens, admingroups) => {
        return admingroups.filter(group =>
            DAGLogic.matchesRules(userTokens, group.membership_rules)
        );
    },

    /**
     * Finds all requests the user can see/manage
     * User can manage a request if:
     * 1. User is an admin of a group, AND
     * 2. The request's requester fits within that group's delegation scope
     * 
     * @param {Array<string>} userTokens - User's identity tokens
     * @param {Array<Object>} admingroups - All available admingroups
     * @param {Array<Object>} requests - All requests in the ledger
     * @returns {Array<Object>} Requests the user can manage
     */
    getUserVisibleRequests: (userTokens, admingroups, requests) => {
        const myAdminGroups = DAGLogic.getUserAdminGroups(userTokens, admingroups);
        return requests.filter(req =>
            myAdminGroups.some(group =>
                DAGLogic.matchesRules(req.requester.tokens, group.delegation_scope)
            )
        );
    },

};

//-----------------------------------------
// --- Mock SDK (Transactions) ---
//-----------------------------------------

const mockSdk = {
    _currentUser: { email: null, tokens: [] },
    getCurrentUser: () => mockSdk._currentUser,
    setCurrentUser: (user) => {
        mockSdk._currentUser = {
            email: user?.email || null,
            tokens: Array.isArray(user?.tokens) ? user.tokens : []
        };
    },

    identitiesListMock: () => Promise.resolve({ data: mockIdentityCatalog }),

    resourceConfigGet: () => Promise.resolve({
        data: {
            resources: [
                { id: 'cores', name: 'Cores', default: 4, min: 1, max: 50, unit: '', message: '1-50 cores' },
                { id: 'ram_gb', name: 'RAM', default: 16, min: 1, max: 256, unit: 'GB', message: '1-256 GB' },
                { id: 'storage_gb', name: 'Storage', default: 100, min: 1, max: 1000, unit: 'GB', message: '1-1000 GB' },
                { id: 'gpus', name: 'GPUs', default: 0, min: 0, max: 10, unit: 'units', message: '0-10 GPUs' }
            ],
            strategies: ['pool', 'allowance'],
            roles: [
                { id: 'admin', name: 'Admin', description: 'Full administrative access', color: 'dark' },
                { id: 'member', name: 'Member', description: 'Standard member with resource access', color: 'gray' },
                { id: 'reader', name: 'Reader', description: 'Read-only access to resources', color: 'gray' },
                { id: 'operator', name: 'Operator', description: 'Can manage resource operations', color: 'gray' }
            ]
        }
    }),

    // --- READS ---
    /**
     * Helper to compute usage for a group from approved requests
     */
    _computeGroupUsage: async (group) => {
        const configRes = await mockSdk.resourceConfigGet();
        const resourceTypes = (configRes.data?.resources || []).map(r => r.id);

        const usage = {};
        const approvedRequests = mockStore.requests.filter(
            r => r.status === 'approved' && r.funded_by === group.id
        );

        // Initialize usage to 0 for all resource types
        resourceTypes.forEach(key => usage[key] = 0);

        // Sum up resources from approved requests
        approvedRequests.forEach(req => {
            Object.keys(req.resources).forEach(key => {
                if (usage[key] !== undefined) {
                    usage[key] += req.resources[key] || 0;
                }
            });
        });

        return {
            ...group,
            resources: {
                ...group.resources,
                usage
            }
        };
    },

    /**
     * Get resources delegated to user (where delegation_scope matches user)
     * These are resource groups where the user can receive resources
     */
    resourceListDelegatedToMe: async () => {
        const resolvedTokens = mockSdk._currentUser.tokens || [];
        if (resolvedTokens.length === 0) return Promise.resolve({ data: [] });

        // Get all groups where user's tokens match the delegation_scope
        const groups = mockStore.admingroups.filter(group =>
            DAGLogic.matchesRules(resolvedTokens, group.delegation_scope)
        );

        const groupsWithUsage = await Promise.all(groups.map(g => mockSdk._computeGroupUsage(g)));
        return { data: groupsWithUsage };
    },

    /**
     * Get resource requests, filtering by mode
     * @param {string} mode - 'manage' (requests user can approve) or 'mine' (user's own requests)
     */
    requestList: (mode = 'manage') => {
        const resolvedTokens = mockSdk._currentUser.tokens || [];
        if (resolvedTokens.length === 0) return Promise.resolve({ data: [] });

        if (mode === 'mine') {
            const myRequests = mockStore.requests.filter(r =>
                r.requester.tokens.some(t => resolvedTokens.includes(t))
            );
            return Promise.resolve({ data: myRequests });
        }

        // Default mode: 'manage' - requests user can approve
        const resolvedGroups = DAGLogic.getUserAdminGroups(resolvedTokens, mockStore.admingroups);
        if (resolvedGroups.length === 0) return Promise.resolve({ data: [] });

        const filtered = DAGLogic.getUserVisibleRequests(resolvedTokens, resolvedGroups, mockStore.requests);
        return Promise.resolve({ data: filtered });
    },

    /**
     * 1. Create a Request (pending state)
     * Request starts in "pending" state, awaiting approval.
     * No quota is deducted yet.
     */
    requestCreate: (payload) => {
        const tokens = mockSdk._currentUser.tokens || [];
        if (!tokens || tokens.length === 0) return Promise.reject("No current user");
        const actor = mockSdk._currentUser.email || 'system';

        const newReq = {
            id: `req_${Date.now()}`,
            status: 'pending',  // Initial state: awaiting approval
            requester: { tokens },
            resources: payload.resources,
            reason: payload.reason,
            funded_by: null,    // Not yet assigned to a funder
            pending: null,
            termination_date: payload.termination_date,
            authorized_users: payload.authorized_users || [],  // Add authorized users with roles
            history: [{
                timestamp: new Date().toISOString(),
                event: 'created',
                actor,
                status_from: null,
                status_to: 'pending',
                quota_from: null,
                quota_to: payload.resources,
                termination_date: payload.termination_date
            }]
        };

        const autoGroups = mockStore.admingroups.filter(g =>
            g.delegation_strategy === 'allowance' &&
            DAGLogic.matchesRules(tokens, g.delegation_scope)
        );

        let autoFunder = null;
        for (const group of autoGroups) {
            const fits = Object.keys(payload.resources).every(key =>
                (payload.resources[key] || 0) <= (group.resources.limit[key] || 0)
            );
            if (fits) {
                autoFunder = group;
                break;
            }
        }

        if (autoFunder) {
            newReq.status = 'approved';
            newReq.funded_by = autoFunder.id;
            newReq.history.push({
                timestamp: new Date().toISOString(),
                event: 'approved',
                actor: 'system:auto-approval',
                group: autoFunder.id,
                status_from: 'pending',
                status_to: 'approved',
                reason: 'Auto-approved (per-user allowance)'
            });
        }
        mockStore.requests.unshift(newReq);
        return Promise.resolve({ data: newReq });
    },

    /**
     * 2. Update Request (user requesting change)
     * Moves request to "change_pending" state.
     * Stores proposed new quota without applying it yet.
     */
    requestUpdate: (requestId, payload) => {
        const req = mockStore.requests.find(r => r.id === requestId);
        if (!req) return Promise.reject("Invalid ID");
        const actor = mockSdk._currentUser.email || 'system';

        const historyEntry = {
            timestamp: new Date().toISOString(),
            event: 'change_requested',
            actor,
            status_from: req.status,
            status_to: 'change_pending',
            quota_from: req.resources,
            quota_to: payload.resources
        };

        if (payload.termination_date && payload.termination_date !== req.termination_date) {
            historyEntry.termination_date_from = req.termination_date;
            historyEntry.termination_date_to = payload.termination_date;
        }

        // Track authorized_users changes
        if (payload.authorized_users !== undefined) {
            const authUsersChanged = JSON.stringify(req.authorized_users || []) !== JSON.stringify(payload.authorized_users);
            if (authUsersChanged) {
                historyEntry.authorized_users_from = req.authorized_users || [];
                historyEntry.authorized_users_to = payload.authorized_users;
            }
        }

        // Build pending object with all changes
        const pending = {
            quota: payload.resources,
            termination_date: payload.termination_date !== req.termination_date ? payload.termination_date : undefined,
            authorized_users: payload.authorized_users !== undefined ? payload.authorized_users : undefined
        };

        const updated = {
            ...req,
            pending,
            status: 'change_pending',
            history: [...(req.history || []), historyEntry]
        };

        mockStore.requests = mockStore.requests.map(r => r.id === requestId ? updated : r);
        return Promise.resolve(updated);
    },

    /**
     * 3. Approve Request (deduct from budget)
     * Transitions request from "pending" or "change_pending" to "approved".
     * Deducts the quota from the funder delegation's available resources.
     * This records which delegation is funding (managing) this request.
     */
    requestApprove: (requestId, delegationId, modifiedQuota = null) => {
        const req = mockStore.requests.find(r => r.id === requestId);
        const group = mockStore.admingroups.find(g => g.id === delegationId);

        if (!req || !group) return Promise.reject("Invalid ID");
        const actor = mockSdk._currentUser.email || 'system';

        const finalQuota = modifiedQuota || req.pending?.quota || req.resources;
        const finalTerminationDate = req.pending?.termination_date || req.termination_date;
        const finalAuthorizedUsers = req.pending?.authorized_users || req.authorized_users;
        const quotaChanged = modifiedQuota && Object.keys(modifiedQuota).some(key =>
            modifiedQuota[key] !== req.resources[key]
        );

        // No longer need to manually update usage - it's computed

        const historyEntry = {
            timestamp: new Date().toISOString(),
            event: 'approved',
            actor,
            group: delegationId,
            status_from: req.status,
            status_to: 'approved'
        };

        if (quotaChanged) {
            historyEntry.quota_from = req.resources;
            historyEntry.quota_to = finalQuota;
        } else if (req.pending?.quota) {
            historyEntry.quota_from = req.resources;
            historyEntry.quota_to = req.pending.quota;
        }

        if (req.pending?.termination_date && req.pending.termination_date !== req.termination_date) {
            historyEntry.termination_date_from = req.termination_date;
            historyEntry.termination_date_to = finalTerminationDate;
        }

        if (req.pending?.authorized_users) {
            historyEntry.authorized_users_from = req.authorized_users;
            historyEntry.authorized_users_to = finalAuthorizedUsers;
        }

        const updated = {
            ...req,
            status: 'approved',
            funded_by: delegationId,
            resources: finalQuota,
            termination_date: finalTerminationDate,
            authorized_users: finalAuthorizedUsers,
            pending: null,
            history: [...(req.history || []), historyEntry]
        };

        mockStore.requests = mockStore.requests.map(r => r.id === requestId ? updated : r);
        return Promise.resolve(updated);
    },

    /**
     * 4. Reject Request
     * Denies a pending request, removing it from the approval queue.
     * No quota is deducted.
     */
    requestReject: (requestId, reason = null) => {
        const req = mockStore.requests.find(r => r.id === requestId);
        if (!req) return Promise.reject("Invalid ID");
        const actor = mockSdk._currentUser.email || 'system';

        const historyEntry = {
            timestamp: new Date().toISOString(),
            event: 'rejected',
            actor,
            status_from: req.status,
            status_to: req.status === 'change_pending' ? 'change_rejected' : 'rejected'
        };

        if (reason) {
            historyEntry.reason = reason;
        }

        const updated = {
            ...req,
            status: req.status === 'change_pending' ? 'change_rejected' : 'rejected',
            pending: null,
            history: [...(req.history || []), historyEntry]
        };

        mockStore.requests = mockStore.requests.map(r => r.id === requestId ? updated : r);
        return Promise.resolve(updated);
    },

    /**
     * 5. Release Resource (refund budget)
     * Transitions request from "approved" to "released".
     * Refunds the quota back to the funder delegation's available resources.
     * This completes the resource lifecycle: pending → approved → released
     */
    requestRelease: (requestId) => {
        const req = mockStore.requests.find(r => r.id === requestId);
        if (!req || req.status !== 'approved') return Promise.reject("Cannot release");
        const actor = mockSdk._currentUser.email || 'system';

        const updated = {
            ...req,
            status: 'released',
            history: [...(req.history || []), {
                timestamp: new Date().toISOString(),
                event: 'released',
                actor,
                status_from: 'approved',
                status_to: 'released',
                quota_from: req.resources,
                quota_to: null
            }]
        };

        mockStore.requests = mockStore.requests.map(r => r.id === requestId ? updated : r);
        return Promise.resolve(updated);
    },

    /**
     * Get visible delegations for a user
     * Returns only direct children (parent_id matches one of user's admin groups)
     */
    delegationListVisible: async () => {
        const resolvedTokens = mockSdk._currentUser.tokens || [];
        const resolvedGroups = mockStore.admingroups;
        if (resolvedTokens.length === 0 || resolvedGroups.length === 0) {
            return { data: [] };
        }
        const myAdminGroups = DAGLogic.getUserAdminGroups(resolvedTokens, resolvedGroups);
        const myAdminGroupIds = myAdminGroups.map(g => g.id);
        const visible = resolvedGroups.filter(child =>
            child.parent_id && myAdminGroupIds.includes(child.parent_id)
        );

        const visibleWithUsage = await Promise.all(visible.map(g => mockSdk._computeGroupUsage(g)));
        return { data: visibleWithUsage };
    },

    /**
     * Get user's delegation groups (where membership_rules match user)
     * These are groups the user administers/manages
     */
    delegationListMine: async () => {
        const resolvedTokens = mockSdk._currentUser.tokens || [];
        if (resolvedTokens.length === 0) return { data: [] };
        const groups = DAGLogic.getUserAdminGroups(resolvedTokens, mockStore.admingroups);
        const groupsWithUsage = await Promise.all(groups.map(g => mockSdk._computeGroupUsage(g)));
        return { data: groupsWithUsage };
    },

    /**
     * Get potential delegations that can fund a request
     * Filters delegations where the request's requester fits within delegation scope
     */
    delegationFindFunders: (request, delegations) => {
        return delegations.filter(g =>
            DAGLogic.matchesRules(request.requester.tokens, g.delegation_scope)
        );
    },

    /**
     * 6. Create Delegation (Explicit Parent-Child Hierarchy)
     * 
     * When creating a new delegation, validate that the parent exists
     * and has delegation privileges.
     * 
     * @param {Object} payload - New delegation definition
     * @param {string} parentId - (Required) ID of parent delegation
     * @returns Promise with new delegation or validation error
     */
    delegationCreate: (payload, parentId = null) => {
        const actor = mockSdk._currentUser.email || 'system';

        if (!parentId) {
            return Promise.reject("Parent delegation ID is required");
        }

        const parent = mockStore.admingroups.find(g => g.id === parentId);
        if (!parent) return Promise.reject("Parent delegation not found");

        // Validate: parent must have can_delegate permission
        if (!parent.can_delegate) {
            return Promise.reject(
                `Parent delegation "${parent.name}" does not have delegation privileges. Cannot create sub-delegations.`
            );
        }

        const newGroup = {
            id: `group_${Date.now()}`,
            ...payload,
            parent_id: parentId,
            resources: {
                limit: payload.resources?.limit || { cores: 100, ram: 400, storage: 1000, gpu: 10 }
                // No usage field - computed dynamically
            },
            created_by: actor,
            created_at: new Date().toISOString(),
            end_date: payload.end_date || null
        };
        mockStore.admingroups.push(newGroup);
        return Promise.resolve({ data: newGroup });
    },

    delegationUpdate: (groupId, payload) => {
        const groupIndex = mockStore.admingroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return Promise.reject("Group not found");
        const actor = mockSdk._currentUser.email || 'system';
        const updated = {
            ...mockStore.admingroups[groupIndex],
            ...payload,
            updated_at: new Date().toISOString(),
            updated_by: actor
        };
        mockStore.admingroups[groupIndex] = updated;
        return Promise.resolve({ data: updated });
    },

    /**
     * Delete a delegation with validation
     * Deletes the delegation and all child delegations recursively
     * Any requests funded by delegations in the hierarchy are reset to have no funder
     */
    delegationDelete: (groupId) => {
        const group = mockStore.admingroups.find(g => g.id === groupId);
        if (!group) return Promise.reject("Group not found");

        // Collect all groups to delete (self + all descendants)
        const groupsToDelete = [groupId];
        const queue = [groupId];
        const seen = new Set([groupId]);

        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = mockStore.admingroups.filter(g => g.parent_id === currentId && !seen.has(g.id));
            children.forEach(child => {
                groupsToDelete.push(child.id);
                seen.add(child.id);
                queue.push(child.id);
            });
        }

        // Reset funder for any requests funded by groups being deleted
        const affectedRequests = mockStore.requests.filter(
            r => r.funded_by && groupsToDelete.includes(r.funded_by)
        );
        affectedRequests.forEach(req => {
            req.funded_by = null;
        });

        // Remove all groups in the hierarchy
        mockStore.admingroups = mockStore.admingroups.filter(g => !groupsToDelete.includes(g.id));
        return Promise.resolve({ data: { id: groupId, deleted: true, childrenDeleted: groupsToDelete.length - 1, affectedRequests: affectedRequests.length } });
    },

    /**
     * 7. Search Delegations
     * Search for delegations by name or ID
     */
    groupSearch: (searchText = '') => {
        const query = searchText.toLowerCase();
        const results = mockStore.admingroups.filter(g =>
            g.name.toLowerCase().includes(query) ||
            g.id.toLowerCase().includes(query)
        );
        return Promise.resolve({ data: results });
    }
};


//-----------------------------------------
// --- Main Application Component ---
//-----------------------------------------

export function CloudResourceManagement() {
    const [loading, setLoading] = useState(true);
    const [userTokens, setUserTokens] = useState([]);
    const [activeProfile, setActiveProfile] = useState(null);
    const [identities, setIdentities] = useState([]);
    const [activeIdentity, setActiveIdentity] = useState('mock_cs_faculty');
    const [_, navigate] = useLocation();

    // Routing Matchers
    const [matchResources] = useRoute("/resources");
    const [matchRequests] = useRoute("/requests");
    const [matchMyDelegations] = useRoute("/my-delegations");
    const [matchDelegations] = useRoute("/delegations");

    useEffect(() => {
        mockSdk.identitiesListMock()
            .then(res => {
                // Accept both legacy array responses and { data: [] } responses.
                const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                setIdentities(data);
                if (data.length > 0) {
                    setActiveIdentity(prev => prev || data[0].id);
                }
            })
            .catch(() => {
                setIdentities([]);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (identities.length === 0) return;
        const selected = identities.find(i => i.id === activeIdentity) || identities[0];
        mockSdk.setCurrentUser({ email: selected.email, tokens: selected.tokens });
        setUserTokens(selected.tokens);
        setActiveProfile({ email: selected.email });
        setLoading(false);
    }, [identities, activeIdentity]);

    if (loading) return html`<${Container} py="xl"><${Loader} size="xl" mx="auto" /><//>`;

    // Determine the active tab
    const activeSection = matchRequests ? 'requests' : matchMyDelegations ? 'my-delegations' : matchDelegations ? 'delegations' : 'resources';

    return html`
        <${Container} size="xl" py="md">
            <${Paper} withBorder p="sm" mb="md">
                <${Group} justify="space-between" align="flex-start">
                    <div>
                        <${Text} size="sm" fw=${600}>Acting as<//>
                        <${Text} size="xs" c="dimmed">${activeProfile?.email}<//>
                    </div>
                    <${Select}
                        size="xs"
                        data=${identities.map(i => ({ value: i.id, label: i.label }))}
                        value=${activeIdentity}
                        onChange=${(v) => setActiveIdentity(v || identities[0]?.id)}
                        w=${260}
                    />
                <//>
                <${TokenList} tokens=${userTokens} />
            <//>

            <${Tabs} value=${activeSection} onChange=${(val) => navigate(`/${val}`)} mb="lg">
                <${Tabs.List}>
                    <${Tabs.Tab} value="resources" leftSection=${html`<${Users} size="16" />`}>
                        My Resources
                    <//>
                    <${Tabs.Tab} value="requests" leftSection=${html`<${Shield} size="16"/>`}>
                        Manage Resource Requests
                    <//>
                    <${Tabs.Tab} value="my-delegations" leftSection=${html`<${Box} size="16"/>`}>
                        Resources Delegated To Me
                    <//>
                    <${Tabs.Tab} value="delegations" leftSection=${html`<${Database} size="16"/>`}>
                        Delegations I've Made
                    <//>
                <//>
            <//>
            <${Switch}>
                <${Route} path="/resources">
                    ${() => html`<${MyResourcesView} tokens=${userTokens} />`}
                <//>

                <${Route} path="/requests">
                    ${() => html`<${ManageRequestsView} tokens=${userTokens} />`}
                <//>
                
                <${Route} path="/my-delegations">
                    ${() => html`<${MyDelegationsView} tokens=${userTokens} />`}
                <//>
                
                <${Route} path="/delegations">
                    ${() => html`<${ManageDelegationsView} tokens=${userTokens} />`}
                <//>

                <${Route} path="/">
                    ${() => { navigate('/resources', { replace: true }); return null; }}
                <//>
            <//>
        <//>
    `;
}

//-----------------------------------------
// --- View Components (One per Tab) ---
//-----------------------------------------

function MyResourcesView({ tokens }) {
    const [requests, setRequests] = useState([]);
    const [resourceConfig, setResourceConfig] = useState(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);

    const refresh = () => {
        Promise.all([
            mockSdk.resourceConfigGet(),
            mockSdk.requestList('mine')
        ]).then(([cfgRes, reqRes]) => {
            setResourceConfig(cfgRes.data);
            setRequests(reqRes.data);
        });
    };

    useEffect(() => {
        refresh();
    }, [tokens]);

    const handleRelease = (reqId) => {
        mockSdk.requestRelease(reqId).then(refresh);
    };

    const handleCreate = (formData) => {
        mockSdk.requestCreate({
            resources: formData.resources,
            reason: formData.reason,
            termination_date: formData.termination_date
        }).then(() => {
            setShowNewModal(false);
            refresh();
        });
    };

    const handleUpdate = (formData) => {
        mockSdk.requestUpdate(editingRequest.id, {
            resources: formData.resources,
            reason: formData.reason,
            termination_date: formData.termination_date,
            authorized_users: formData.authorized_users
        }).then(() => {
            setEditingRequest(null);
            refresh();
        });
    };

    if (!resourceConfig) return html`<${Loader} />`;

    // Aggregate approved requests by funder
    const resourcesByFunder = useMemo(() => {
        const approved = requests.filter(r => r.status === 'approved');
        const byFunder = {};
        approved.forEach(req => {
            const funderId = req.funded_by || 'unknown';
            const funderName = funderId;  // Just use the ID as name for now
            if (!byFunder[funderName]) {
                byFunder[funderName] = {};
                resourceConfig.resources.forEach(r => { byFunder[funderName][r.id] = 0; });
            }
            Object.keys(req.resources).forEach(k => {
                byFunder[funderName][k] = (byFunder[funderName][k] || 0) + req.resources[k];
            });
        });
        return byFunder;
    }, [requests, resourceConfig]);

    const totals = useMemo(() => {
        const t = {};
        resourceConfig.resources.forEach(r => { t[r.id] = 0; });
        Object.values(resourcesByFunder).forEach(res => {
            Object.keys(res).forEach(k => { t[k] = (t[k] || 0) + res[k]; });
        });
        return t;
    }, [resourcesByFunder, resourceConfig]);


    return html`
        <${Stack}>
            ${Object.keys(resourcesByFunder).length > 0 && html`
                <${ResourceDelegationsTable}
                    resourceConfig=${resourceConfig}
                    resourcesByFunder=${resourcesByFunder}
                    totals=${totals}
                />
            `}
            
            ${Object.keys(resourcesByFunder).length === 0 && html`
                <${Text} c="dimmed" ta="center" py="xl">
                    No funded allocations yet.
                <//>
            `}

            <!-- My requests section -->
            <${Group} justify="space-between" align="center" mb="md"><${Text} fw=${600}>My Resource Requests</><${Button} size="xs" leftSection=${html`<${Plus} size="16"/>`} onClick=${() => setShowNewModal(true)}>Request Resources</><//>

            ${requests.length === 0 ? html`
                <${Text} c="dimmed" ta="center" py="xl">
                    No resource requests yet.
                <//>
            ` : html`
                <${SimpleGrid} cols=${{ base: 1, sm: 2 }}>
                    ${requests.map(req => html`
                        <${RequestCard} 
                            req=${req} 
                            config=${resourceConfig}
                            onRelease=${handleRelease}
                            onEdit=${(r) => setEditingRequest(r)}
                        />
                    `)}
                <//>
            `}

            ${showNewModal && html`
                <${RequestModal}
                    config=${resourceConfig}
                    opened=${true}
                    onClose=${() => setShowNewModal(false)}
                    onSubmit=${handleCreate}
                />
            `}

            ${editingRequest && html`
                <${RequestModal}
                    config=${resourceConfig}
                    initialData=${editingRequest}
                    opened=${true}
                    onClose=${() => setEditingRequest(null)}
                    onSubmit=${handleUpdate}
                />
            `}
        <//>
    `;
}

function ManageRequestsView({ tokens }) {
    const [myAdminGroups, setMyAdminGroups] = useState([]);
    const [requests, setRequests] = useState([]);
    const [resourceConfig, setResourceConfig] = useState(null);

    const refresh = async () => {
        const myGroupsRes = await mockSdk.delegationListMine();
        const reqsRes = await mockSdk.requestList();
        const cfgRes = await mockSdk.resourceConfigGet();
        setMyAdminGroups(myGroupsRes.data);

        // Sort by newest requests first
        const sortedRequests = (Array.isArray(reqsRes?.data) ? reqsRes.data : []).sort((a, b) => {
            const timeA = new Date(a?.history?.[0]?.timestamp || 0).getTime();
            const timeB = new Date(b?.history?.[0]?.timestamp || 0).getTime();
            return timeB - timeA;
        });

        setRequests(sortedRequests);
        setResourceConfig(cfgRes.data);
    };

    useEffect(() => {
        refresh();
    }, [tokens]);

    const handleApprove = (reqId, funderId) => {
        mockSdk.requestApprove(reqId, funderId).then(refresh);
    };

    const handleApproveWithEdit = (reqId, funderId, modifiedQuota) => {
        mockSdk.requestApprove(reqId, funderId, modifiedQuota).then(refresh);
    };

    const handleReject = (reqId, reason) => {
        mockSdk.requestReject(reqId, reason).then(refresh);
    };

    if (!resourceConfig) return html`<${Loader} />`;

    if (myAdminGroups.length === 0) {
        return html`<${Notification} color="red" icon=${html`<${AlertCircle} size="18"/>`}>
            You do not belong to any Admin Groups. You cannot manage requests.
        <//>`
    }

    if (requests.length === 0) return html`
        <${Text} c="dimmed" ta="center" py="xl">
            No pending requests matching your administrative groups.
        <//>
    `

    return html`
        <${Stack}>
            <${SimpleGrid} cols=${{ base: 1, md: 2, lg: 3 }}>
                ${requests.map(req => {
        const potentialFunders = mockSdk.delegationFindFunders(req, myAdminGroups);
        return html`
                        <${RequestCard} 
                            req=${req} 
                            config=${resourceConfig}
                            potentialFunders=${potentialFunders}
                            onApprove=${handleApprove}
                            onApproveWithEdit=${handleApproveWithEdit}
                            onReject=${handleReject}
                        />
                    `;
    })}
            <//>
        <//>
    `;
}

function MyDelegationsView({ tokens }) {
    const [delegatedGroups, setDelegatedGroups] = useState([]);

    const refresh = async () => {
        const delegatedRes = await mockSdk.resourceListDelegatedToMe();
        setDelegatedGroups(delegatedRes.data);
    };

    useEffect(() => refresh(), [tokens]);

    return html`
        <${Stack}>
            ${delegatedGroups.length === 0 && html`
                <${Notification} color="red" icon=${html`<${AlertCircle} size="18"/>`}>
                    No resource groups have been delegated to you yet.
                </>
            `}

            ${delegatedGroups.length > 0 && html`
                <${Text} c="dimmed" mb="md">
                    Resource groups where you can receive resources. These resources have been delegated to you.
                </>
            `}

            ${delegatedGroups.length > 0 && html`
                <${SimpleGrid} cols=${{ base: 1, md: 2 }}>
                    ${delegatedGroups.map(group => html`
                        <${AdminGroupCard} group=${group} />
                    `)}
                </>
            `}
        </>
    `;
}

function ManageDelegationsView({ tokens }) {
    const [myAdminGroups, setMyAdminGroups] = useState([]);
    const [delegations, setDelegations] = useState([]);
    const [showDelegationModal, setShowDelegationModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);

    const refresh = async () => {
        const myGroupsRes = await mockSdk.delegationListMine();
        const delegsRes = await mockSdk.delegationListVisible();
        setMyAdminGroups(myGroupsRes.data);
        setDelegations(delegsRes.data);
    };

    useEffect(() => refresh(), [tokens]);

    // Check if user has any groups with delegation privileges
    const canCreateDelegations = myAdminGroups.some(g => g.can_delegate);
    // Filter to only show groups that can delegate as parent options
    const delegatorGroups = myAdminGroups.filter(g => g.can_delegate);

    const handleCreateDelegation = (data, parentGroupId) => {
        if (editingGroup) {
            mockSdk.delegationUpdate(editingGroup.id, data).then(() => {
                setShowDelegationModal(false);
                setEditingGroup(null);
                refresh();
            });
        } else {
            // Create new delegation
            mockSdk.delegationCreate(data, parentGroupId).then(() => {
                setShowDelegationModal(false);
                setEditingGroup(null);
                refresh();
            });
        }
    };

    const handleEditGroup = (group) => {
        setEditingGroup(group);
        setShowDelegationModal(true);
    };

    const handleDeleteGroup = (group) => {
        mockSdk.delegationDelete(group.id)
            .then(() => refresh());
    };

    return html`
        <${Stack}>
            ${myAdminGroups.length === 0 && html`
                <${Notification} color="red" icon=${html`<${AlertCircle} size="18"/>`}>
                    You do not belong to any Admin Groups. You cannot manage delegations.
                <//>
            `}

            ${myAdminGroups.length > 0 && html`
                <${Group} mb="md" justify="space-between">
                    <${Text} c="dimmed">
                        Manage groups that fall under your jurisdiction. ${canCreateDelegations ? 'Create sub-groups to delegate authority.' : ''}
                    <//>
                    ${canCreateDelegations && html`
                        <${Button} size="xs" leftSection=${html`<${Plus} size="14"/>`} onClick=${() => { setEditingGroup(null); setShowDelegationModal(true); }}>
                            New Sub-Group
                        <//>
                    `}
                <//>
            `}

            ${!canCreateDelegations && myAdminGroups.length > 0 && html`
                <${Notification} color="orange" icon=${html`<${AlertCircle} size="18"/>`}>
                    None of your admin groups have delegation privileges. You cannot create sub-groups.
                <//>
            `}

            ${delegations.length === 0 && myAdminGroups.length > 0 ? html`
                <${Text} c="dimmed" ta="center" py="xl">
                    No delegated groups yet. Create a sub-group to delegate authority and resources.
                <//>
            ` : html`
                <${SimpleGrid} cols=${{ base: 1, md: 2 }}>
                    ${delegations.map(group => html`
                        <${AdminGroupCard} 
                            group=${group} 
                            onEdit=${() => handleEditGroup(group)} 
                            onDelete=${() => handleDeleteGroup(group)}
                        />
                    `)}
                <//>
            `}

            ${showDelegationModal && html`
                <${AdminGroupModal} 
                    parents=${delegatorGroups}
                    initialData=${editingGroup}
                    opened=${true} 
                    onClose=${() => { setShowDelegationModal(false); setEditingGroup(null); }}
                    onSubmit=${handleCreateDelegation}
                />
            `}
        <//>
    `;
}

//-----------------------------------------
// --- 3. Sub-Components (UI Bricks) ---
//-----------------------------------------


function RequestCard({ req, config, onRelease, onEdit, potentialFunders, onApprove, onApproveWithEdit, onReject }) {
    const [showHistory, { open, close }] = useDisclosure(false);
    const [showRejectModal, setShowRejectModal] = useState(false);

    // Use provided funders or empty array
    const funders = potentialFunders || [];

    const [selectedFunder, setSelectedFunder] = useState(null);

    // Keep selectedFunder in sync with funders
    useEffect(() => {
        if (funders.length > 0 && !selectedFunder) {
            setSelectedFunder(funders[0].id);
        } else if (funders.length === 0) {
            setSelectedFunder(null);
        }
    }, [funders]);

    const isApproved = req.status === 'approved';
    const isReleased = req.status === 'released';
    const isPending = req.status === 'pending';
    const isChangePending = req.status === 'change_pending';
    const isChangeRejected = req.status === 'change_rejected';
    const isRejected = req.status === 'rejected';
    const hasHistory = req.history && req.history.length > 0;
    const canEdit = (isApproved || isChangeRejected || isRejected) && !req.pending;
    const isAdminView = funders && funders.length > 0;
    const isPendingApproval = isPending || isChangePending;

    // Find the most recent rejection reason from history
    const rejectionEntry = hasHistory && (isRejected || isChangeRejected)
        ? [...req.history].reverse().find(h => h.event === 'rejected' || h.event === 'change_rejected')
        : null;
    const rejectionReason = rejectionEntry?.reason;

    const getStatusBadge = (status) => {
        switch (status) {
            case 'approved': return { color: 'dark', variant: 'filled' };
            case 'released': return { color: 'gray', variant: 'light' };
            case 'pending': return { color: 'gray', variant: 'outline' };
            case 'change_pending': return { color: 'gray', variant: 'outline' };
            case 'change_rejected': return { color: 'dark', variant: 'outline' };
            case 'rejected': return { color: 'dark', variant: 'outline' };
            default: return { color: 'gray', variant: 'light' };
        }
    };

    return html`
        <${Card} withBorder shadow="sm" radius="md" style=${{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <${Box} style=${{ flex: 1 }}>
                <${Group} justify="space-between" mb="xs">
                    <${Badge} color=${getStatusBadge(req.status).color} variant=${getStatusBadge(req.status).variant}>${req.status.replace(/_/g, ' ')}<//>
                    <${Text} size="xs" c="dimmed">${new Date(req.history[0].timestamp).toLocaleDateString()}<//>
                <//>
                
                <${Text} fw=${700} mb="xs">${req.reason}<//>

                <${TokenList} tokens=${req.requester?.tokens} label="Requester" />
                
                <${ResourceDisplay} config=${config} quota=${req.resources}  fundedBy=${isApproved ? req.funded_by : ''} label="Resources" />

                <${TerminationDatePicker} readOnly date=${req.termination_date} />

                <${RequestChangesDiff}
                    config=${config}
                    quotaFrom=${req.resources}
                    quotaTo=${req.pending?.quota}
                    dateFrom=${req.termination_date}
                    dateTo=${req.pending?.termination_date}
                    usersFrom=${req.authorized_users}
                    usersTo=${req.pending?.authorized_users}
                    roles=${config.roles}
                />

                ${rejectionReason && html`
                    <${Notification} color="red" icon=${html`<${X} size="18"/>`} mt="md" title="Rejection Reason">
                        ${rejectionReason}
                    <//>
                `}
            <//>

            <${Card.Section} withBorder inheritPadding py="xs" mt="auto">
                <${Group} grow>
                    <${Button} variant="light" size="xs" disabled=${!hasHistory} onClick=${open}>
                        <${History} size="16"/> History
                    <//>
                    ${canEdit && onEdit && html`
                        <${Button} variant="light" size="xs" onClick=${() => onEdit(req)}>
                            Edit
                        <//>
                    `}

                    ${(isApproved || isChangeRejected || isRejected) && onRelease && html`
                        <${Button} color="red" variant="light" size="xs" onClick=${() => onRelease(req.id)}>
                            Release
                        <//>
                    `}
                    
                    ${isAdminView && isPendingApproval && html`
                        <${Button} color="green" variant="light" size="xs" onClick=${() => onApprove(req.id, selectedFunder)}>
                            Approve
                        <//>
                        <${Button} color="red" variant="light" size="xs" onClick=${() => setShowRejectModal(true)}>
                            Reject
                        <//>
                    `}
                <//>
            <//>

            ${showHistory && html`<${RequestHistoryModal} opened=${showHistory} onClose=${close} request=${req} config=${config} />`}
            
            ${showRejectModal && html`
                <${AdminRejectModal}
                    request=${req}
                    opened=${true}
                    onClose=${() => setShowRejectModal(false)}
                    onSubmit=${(reason) => { onReject(req.id, reason); setShowRejectModal(false); }}
                />
            `}
        <//>
    `;
}

function ResourceDelegationsTable({ resourceConfig, resourcesByFunder, totals }) {
    if (!resourceConfig || !resourcesByFunder) return null;
    const funders = Object.entries(resourcesByFunder);

    return html`
        <${Text} fw=${600} mb="md">Resources Allocated To Me<//>

        <${Paper} withBorder>
            <${Table} striped highlightOnHover>
                <${Table.Thead}>
                    <${Table.Tr}>
                        <${Table.Th}>Funder<//>
                        ${resourceConfig.resources.map(r => html`
                            <${Table.Th} key=${r.id}>
                                ${r.name}${r.unit ? ` (${r.unit})` : ''}
                            <//>
                        `)}
                    <//>
                <//>
                <${Table.Tbody}>
                    ${funders.map(([funder, res]) => html`
                        <${Table.Tr} key=${funder}>
                            <${Table.Td}><${Text} fw=${500}>${funder}<//></${Table.Td}>
                            ${resourceConfig.resources.map(r => html`
                                <${Table.Td} key=${r.id}>${res[r.id] || 0}<//>
                            `)}
                        <//>
                    `)}
                    <${Table.Tr} style=${{ borderTop: '2px solid var(--mantine-color-gray-4)' }}>
                        <${Table.Td}><${Text} fw=${700}>Total<//></${Table.Td}>
                        ${resourceConfig.resources.map(r => html`
                            <${Table.Td} key=${r.id}>
                                <${Text} fw=${700}>${totals?.[r.id] ?? 0}<//>
                            <//>
                        `)}
                    <//>
                <//>
            <//>
        <//>
    `;
}

/**
 * Unified component to display all types of request changes (resources, dates, authorizations)
 * Returns null if there are no changes to display
 */
function RequestChangesDiff({ config, quotaFrom, quotaTo, dateFrom, dateTo, usersFrom, usersTo, roles, label = "Proposed Changes" }) {
    // Check what types of changes exist
    const hasQuotaChange = quotaFrom && quotaTo && config &&
        config.resources.some(r => (quotaFrom[r.id] ?? 0) !== (quotaTo[r.id] ?? 0));
    const hasDateChange = dateFrom && dateTo && new Date(dateFrom).getTime() !== new Date(dateTo).getTime();

    // Check for authorization changes
    // Only process if usersTo is explicitly provided (not undefined)
    const hasAuthData = usersTo !== undefined;
    const from = usersFrom || [];
    const to = usersTo || [];
    const fromMap = new Map(from.map(u => [u.token, u.role]));
    const toMap = new Map(to.map(u => [u.token, u.role]));
    const added = hasAuthData ? to.filter(u => !fromMap.has(u.token)) : [];
    const removed = hasAuthData ? from.filter(u => !toMap.has(u.token)) : [];
    const roleChanged = hasAuthData ? to.filter(u => fromMap.has(u.token) && fromMap.get(u.token) !== u.role) : [];
    const hasAuthorizationChanges = hasAuthData && (added.length > 0 || removed.length > 0 || roleChanged.length > 0);

    // Return null if no changes at all
    if (!hasQuotaChange && !hasDateChange && !hasAuthorizationChanges) return null;

    const diff = (id) => {
        const val1 = (quotaFrom?.[id] ?? 0);
        const val2 = (quotaTo?.[id] ?? 0);
        const d = val2 - val1;
        return { before: val1, after: val2, diff: d, color: d > 0 ? 'green' : d < 0 ? 'red' : 'gray' };
    };

    const formatDate = (d) => new Date(d).toLocaleDateString();

    const getResourceLabel = (resource) => {
        return resource.unit ? `${resource.name} (${resource.unit})` : resource.name;
    };

    const getRoleBadgeStyle = (roleId) => {
        // Use different variants to distinguish roles in a gray color scheme
        switch (roleId) {
            case 'admin': return { color: 'dark', variant: 'outline' };
            case 'member': return { color: 'gray', variant: 'outline' };
            case 'operator': return { color: 'gray', variant: 'outline' };
            case 'reader': return { color: 'gray', variant: 'outline' };
            default: return { color: 'gray', variant: 'outline' };
        }
    };

    const getRoleName = (roleId) => {
        const role = roles?.find(r => r.id === roleId);
        return role?.name || roleId;
    };

    return html`
        <${Box} mt="md">
            <${Text} fw=${600} mb="xs">${label}<//>
            
            ${(hasQuotaChange || hasDateChange) && html`
                <${Table} size="xs" mb=${hasAuthorizationChanges ? "md" : 0}>
                    <${Table.Thead}>
                        <${Table.Tr}>
                            <${Table.Th}>Resource<//>
                            <${Table.Th}>Before<//>
                            <${Table.Th}>After<//>
                            <${Table.Th}>Change<//>
                        <//>
                    <//>
                    <${Table.Tbody}>
                        ${hasQuotaChange && config.resources.map(r => {
        const d = diff(r.id);
        return html`
                                <${Table.Tr}>
                                    <${Table.Td}>${getResourceLabel(r)}<//>
                                    <${Table.Td}>${d.before}<//>
                                    <${Table.Td}>${d.after}<//>
                                    <${Table.Td} c=${d.color}>${d.diff > 0 ? '+' : ''}${d.diff}<//>
                                <//>
                            `;
    })}
                        ${hasDateChange && html`
                            <${Table.Tr}>
                                <${Table.Td}>Termination Date<//>
                                <${Table.Td}>${formatDate(dateFrom)}<//>
                                <${Table.Td}>${formatDate(dateTo)}<//>
                                <${Table.Td} c=${new Date(dateTo) - new Date(dateFrom) >= 0 ? 'green' : 'red'}>
                                    ${new Date(dateTo) > new Date(dateFrom) ? '+' : ''}${dayjs(dateTo).from(dayjs(dateFrom), true)}
                                <//>
                            <//>
                        `}
                    <//>
                <//>
            `}
            
            ${hasAuthorizationChanges && html`
                <${Stack} gap="xs">
                    ${added.length > 0 && html`
                        <${UserRoleBadgeList} users=${added} roles=${roles} label="Added:" /> 
                    `}
                    
                    ${removed.length > 0 && html`
                        <${UserRoleBadgeList} users=${removed} roles=${roles} variant="outline" colorOverride="gray" label="Removed:" labelColor="dimmed" /> 
                    `}
                    
                    ${roleChanged.length > 0 && html`
                        <div>
                            <${Text} size="xs" c="dimmed" fw=${600} mb="xs">Role Changed:<//>
                            <${Stack} gap="xs">
                                ${roleChanged.map(u => {
        const oldRole = fromMap.get(u.token);
        const oldStyle = getRoleBadgeStyle(oldRole);
        const newStyle = getRoleBadgeStyle(u.role);
        return html`
                                        <${Group} key=${u.token} gap="xs" align="center">
                                            <${Text} size="sm">${u.token}:<//>
                                            <${Badge} size="sm" variant=${oldStyle.variant} color=${oldStyle.color}>
                                                ${getRoleName(oldRole)}
                                            <//>
                                            <${Text} size="xs" c="dimmed">→<//>
                                            <${Badge} size="sm" variant=${newStyle.variant} color=${newStyle.color}>
                                                ${getRoleName(u.role)}
                                            <//>
                                        <//>
                                    `;
    })}
                            <//>
                        </div>
                    `}
                <//>
            `}
        <//>
    `;
}

function TerminationDatePicker({ value, date, onChange, error, readOnly = false, label = "Termination Date" }) {
    const currentDate = value || date;
    const [durationValue, setDurationValue] = useState(90);
    const [durationUnit, setDurationUnit] = useState('days');

    useEffect(() => {
        if (!currentDate) return;
        const now = new Date();
        const diffDays = Math.ceil((new Date(currentDate) - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 60) {
            setDurationValue(diffDays);
            setDurationUnit('days');
        } else if (diffDays < 365) {
            setDurationValue(Math.round(diffDays / 7));
            setDurationUnit('weeks');
        } else {
            setDurationValue(Math.round(diffDays / 30));
            setDurationUnit('months');
        }
    }, [currentDate]);

    const updateDateFromDuration = (val, unit) => {
        if (!val || val <= 0) return;
        const days = unit === 'weeks' ? val * 7 : unit === 'months' ? val * 30 : val;
        onChange?.(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
    };

    if (readOnly) {
        if (!currentDate) return null;
        return html`
            <${Text} mt="xs" mb="xs" size="xs" fw=${600}>${label}<//>
            <${Group} gap="xs" align="center">
                <${Badge} variant="outline" color="gray" leftSection=${html`<${Calendar} size="12" />`}>
                    Expires: ${new Date(currentDate).toLocaleDateString()} (${dayjs(currentDate).fromNow()})
                <//>
            <//>
        `;
    }

    return html`
        <${Stack} gap="xs">
            <${Group} gap="xs" align="center">
                <${Text} fw=${600}>${label}<//>
            <//>
            <${Group} gap="xs" align="flex-end">
                <${DatePickerInput}
                    size="xs"
                    label=${`Date ${currentDate && `(${dayjs(currentDate).fromNow()})`}`}
                    placeholder="Pick date"
                    value=${currentDate}
                    onChange=${onChange}
                    minDate=${new Date()}
                    error=${error}
                    leftSection=${html`<${Calendar} size="14" />`}
                    style=${{ flex: 1 }}
                />
                <${NumberInput}
                    size="xs"
                    label="Dur."
                    value=${durationValue}
                    onChange=${(v) => { setDurationValue(v); updateDateFromDuration(v, durationUnit); }}
                    min=${1}
                    max=${365}
                    w=${110}
                />
                <${Select}
                    size="xs"
                    label="Unit"
                    value=${durationUnit}
                    onChange=${(u) => { setDurationUnit(u); updateDateFromDuration(durationValue, u); }}
                    data=${[
            { value: 'days', label: 'Days' },
            { value: 'weeks', label: 'Weeks' },
            { value: 'months', label: 'Months' }
        ]}
                    w=${110}
                />
            <//>
        <//>
    `;
}

function ResourceDisplay({ config, quota, label = "Resources", fundedBy = "" }) {
    if (!quota || !config) return null;
    return html`
        <${Stack} gap="xs">
            <${Group} gap="xs" align="center">
                <${Text} size="xs" fw=${600}>${label}<//>
                ${fundedBy && html`<${Text} size="xs" c="dimmed">(funded by: ${fundedBy})<//>`}
            <//>
            <${Group} gap="xs">
                ${config.resources.map(r => {
        const value = quota[r.id] || 0;
        const displayValue = r.unit ? `${value} ${r.unit}` : value;
        return html`<${Badge} variant="outline" color="gray">${displayValue} ${r.name}<//>`;
    })}
            <//>
        <//>
    `;
}

/**
 * Reusable component to display a list of tokens as badges
 * @param {Array<string>} tokens - Array of token strings to display
 * @param {string} label - Optional label to display above the token list
 * @param {string} color - Badge color (default: 'gray')
 * @param {string} size - Badge size (default: 'sm')
 * @param {string} variant - Badge variant (default: 'outline')
 */
function TokenList({ tokens, label, color = 'gray', size = 'sm', variant = 'outline' }) {
    if (!tokens || tokens.length === 0) return null;

    return html`
        <${Box}>
            ${label && html`<${Text} size="xs" mb="xs" fw=${700}>${label}<//>`}
            <${Group} gap="xs" wrap="wrap">
                ${tokens.map(token => html`
                    <${Badge} 
                        key=${token} 
                        size=${size} 
                        variant=${variant} 
                        color=${color}
                        style=${{ textTransform: 'none' }}
                    >
                        ${token}
                    <//>
                `)}
            <//>
        <//>
    `;
}

/**
 * Reusable component to display a list of users with roles as badges
 * @param {Array<{token: string, role: string}>} users - Array of user-role objects
 * @param {Array} roles - Roles configuration for colors/names
 * @param {string} label - Optional label to display above the badge list
 * @param {string} labelColor - Color for the label text (e.g., 'green', 'red', 'orange')
 * @param {string} size - Badge size (default: 'sm')
 * @param {string} variant - Badge variant (override role color variant)
 * @param {string} colorOverride - Override role-based colors with single color
 */
function UserRoleBadgeList({ users, roles, label, labelColor, size = 'sm', variant, colorOverride }) {
    if (!users || users.length === 0) return null;

    const getRoleBadgeStyle = (roleId) => {
        if (colorOverride) return { color: colorOverride, variant: variant || 'outline' };

        // Use outline variant consistently across all roles
        switch (roleId) {
            case 'admin': return { color: 'dark', variant: variant || 'outline' };
            case 'member': return { color: 'gray', variant: variant || 'outline' };
            case 'operator': return { color: 'gray', variant: variant || 'outline' };
            case 'reader': return { color: 'gray', variant: variant || 'outline' };
            default: return { color: 'gray', variant: variant || 'outline' };
        }
    };

    const getRoleName = (roleId) => {
        const role = roles?.find(r => r.id === roleId);
        return role?.name || roleId;
    };

    return html`
        <div>
            ${label && html`<${Text} size="xs" c=${labelColor} fw=${600} mb="xs">${label}<//>`}
            <${Group} gap="xs" wrap="wrap">
                ${users.map(u => {
        const style = getRoleBadgeStyle(u.role);
        return html`
                    <${Badge} 
                        key=${u.token} 
                        size=${size} 
                        variant=${style.variant}
                        color=${style.color}
                        style=${{ textTransform: 'none' }}
                    >
                        ${u.token} (${getRoleName(u.role)})
                    <//>
                `;
    })}
            <//>
        </div>
    `;
}

/**
 * Reusable component to display a list of groups/patterns with icon and badges
 */
function GroupList({ items, label, icon: Icon, color, emptyMessage = null }) {
    const hasItems = items && items.length > 0;

    return html`
        <div>
            <${Group} gap="xs" align="center" mb="xs">
                <${Icon} size="14" color=${`var(--mantine-color-${color}-6)`} />
                <${Text} size="xs" fw=${500}>${label}<//>
            <//>
            ${hasItems ? html`
                <${Group} gap="xs" wrap="wrap">
                    ${items.map(item => html`
                        <${Badge} 
                            key=${item} 
                            size="sm" 
                            variant="outline" 
                            color=${color}
                            style=${{ textTransform: 'none' }}
                        >
                            ${item}
                        <//>
                    `)}
                <//>
            ` : emptyMessage && html`
                <${Badge} size="sm" variant="outline" color="gray" style=${{ textTransform: 'none' }}>
                    ${emptyMessage}
                <//>
            `}
        </div>
    `;
}

function AdminGroupCard({ group, onEdit, onDelete }) {
    const hasBlacklist = group.delegation_scope.blacklist.length > 0;
    const delegationStrategy = group.delegation_strategy || 'pool';
    const isAllowance = delegationStrategy === 'allowance';
    const strategyLabel = isAllowance ? 'Allowance (Auto)' : 'Shared Pool';

    return html`
        <${Card} withBorder shadow="sm" radius="md">
            <!-- Header -->
            <${Group} justify="space-between" mb="md">
                <${Text} fw=${700} size="lg">${group.name}<//>
                <${Group} gap="xs">
                    <${Badge} color="gray" variant=${isAllowance ? 'filled' : 'outline'}>${strategyLabel}<//>
                    ${group.can_delegate && html`<${Badge} color="dark" variant="outline" leftSection=${html`<${Shield} size="12" />`}>Delegation allowed<//>`}
                <//>
            <//>

            <!-- Delegation Scope -->
            <${Stack} gap="sm" mb="md">
                <${Text} size="xs" fw=${600} c="dimmed" tt="uppercase">Delegation Scope<//>
                
                <${GroupList} 
                    items=${group.delegation_scope.whitelist}
                    label="Whitelist"
                    icon=${Check}
                    color="green"
                    emptyMessage="Global (all groups)"
                />

                ${hasBlacklist && html`
                    <${GroupList} 
                        items=${group.delegation_scope.blacklist}
                        label="Blacklist"
                        icon=${X}
                        color="red"
                    />
                `}
            <//>

            <${Divider} mb="md" />

            <!-- Resource Usage -->
            <${Stack} gap="sm" mb="md">
                <${Text} size="xs" fw=${600} c="dimmed" tt="uppercase">
                    ${isAllowance ? 'Per-User Limits' : 'Resource Usage'}
                <//>
                ${Object.entries(group.resources.limit).map(([key, limit]) => {
        const usage = group.resources.usage[key] || 0;
        const isInfinite = limit === INFINITY;
        const pct = isInfinite ? 0 : (limit > 0 ? (usage / limit) * 100 : 0);
        const displayLimit = isInfinite ? '∞' : limit;
        return html`
                        <div key=${key}>
                            <${Group} justify="space-between" mb="xs">
                                <${Text} size="xs" fw=${500}>${key.charAt(0).toUpperCase() + key.slice(1)}<//>
                                ${isAllowance
                ? html`<${Text} size="xs" c="dimmed">Up to ${displayLimit} / user<//>`
                : html`<${Text} size="xs" c="dimmed">${usage} / ${displayLimit}<//>`}
                            <//>
                            ${!isAllowance && html`
                                <${Progress} 
                                    value=${pct} 
                                    color=${pct > 90 ? 'red' : pct > 70 ? 'yellow' : 'blue'} 
                                    size="sm"
                                />
                            `}
                        </div>
                    `;
    })}
            <//>

            <${Divider} mb="md" />

            <!-- Metadata -->
            <${Stack} gap="xs" mb=${onEdit ? "md" : "0"}>
                <${Group} gap="md" wrap="wrap">
                    <${Group} gap="xs">
                        <${Text} size="xs" c="dimmed">Created by<//>
                        <${Badge} size="xs" variant="dot" color="gray" style=${{ textTransform: 'none' }}>
                            ${group.created_by}
                        <//>
                    <//>
                    <${Group} gap="xs">
                        <${Calendar} size="12" color="var(--mantine-color-dimmed)" />
                        <${Text} size="xs" c="dimmed">${new Date(group.created_at).toLocaleDateString()}<//>
                    <//>
                <//>
                ${group.end_date && html`
                    <${Group} gap="xs" align="center">
                        <${Text} size="xs" c="dimmed">Expires:<//>
                        <${Badge} variant=${new Date(group.end_date) < new Date() ? 'filled' : 'outline'} size="xs" color="dark" leftSection=${html`<${Calendar} size="10" />`}>
                            ${new Date(group.end_date).toLocaleDateString()} (${dayjs(group.end_date).fromNow()})
                        </>
                    <//>
                `}
            <//>

            ${onEdit && html`
                <${Group} grow>
                    <${Button} fullWidth size="sm" variant="light" onClick=${onEdit}>
                        Edit Delegation
                    <//>
                    ${onDelete && html`
                        <${Button} size="sm" variant="light" color="red" onClick=${onDelete}>
                            Delete
                        <//>
                    `}
                <//>
            `}
        <//>
    `;
}

//-----------------------------------------
// --- 4. Modals ---
//-----------------------------------------

function RequestHistoryModal({ opened, onClose, request, config }) {
    const getEventLabel = (event) => {
        const labels = {
            'created': 'Request Created',
            'change_requested': 'Change Requested',
            'approved': 'Approved',
            'rejected': 'Rejected',
            'change_rejected': 'Change Rejected',
            'released': 'Released'
        };
        return labels[event] || event;
    };

    const getEventIcon = (event) => {
        switch (event) {
            case 'created': return FileText;
            case 'approved': return Check;
            case 'rejected': case 'change_rejected': return X;
            case 'released': return LogOut;
            case 'change_requested': return ArrowRight;
            default: return FileText;
        }
    };

    return html`
        <${Modal} opened=${opened} onClose=${onClose} title="History: ${request.reason}" size="lg">
            ${!request.history || request.history.length === 0 ? html`
                <${Notification} color="info" icon=${html`<${AlertCircle} size="18"/>`}>
                    No history available for this request.
                <//>
            ` : html`
                <${Timeline} active=${request.history.length} bulletSize="24" lineWidth="2">
                    ${request.history.slice().reverse().map(h => {
        const IconComponent = getEventIcon(h.event);
        return html`
                            <${Timeline.Item} bullet=${html`<${IconComponent} size="16" />`}>
                                <${Group} justify="space-between" mb="xs">
                                    <${Text} fw=${600}>${getEventLabel(h.event)}<//>
                                    <${Text} size="xs" c="dimmed">${new Date(h.timestamp).toLocaleString()}<//>
                                <//>
                                
                                <${Text} size="sm">Actor: ${h.actor}<//>
                                ${h.group && html`<${Text} size="sm">Group: ${h.group}<//>`}

                                ${h.status_from !== undefined && h.status_to && html`
                                    <${Box} mt="xs">
                                        <${Text} size="xs" fw=${600} mb="xs">Status:<//>
                                        <${Group} gap="xs">
                                            <${Badge} variant="outline" size="sm">${h.status_from || 'new'}<//>
                                            <${Text} size="xs" c="dimmed">→<//>
                                            <${Badge} variant="outline" size="sm">${h.status_to}<//>
                                        <//>
                                    <//>
                                `}
                                
                                <${RequestChangesDiff}
                                    config=${config}
                                    quotaFrom=${h.quota_from}
                                    quotaTo=${h.quota_to}
                                    dateFrom=${h.termination_date_from}
                                    dateTo=${h.termination_date_to}
                                    usersFrom=${h.authorized_users_from}
                                    usersTo=${h.authorized_users_to}
                                    roles=${config.roles}
                                    label="Changes"
                                />
                                
                                ${h.quota_to && !h.quota_from && html`
                                    <${ResourceDisplay} config=${config} quota=${h.quota_to} label="Initial Quota" />
                                `}

                                ${h.termination_date && !h.termination_date_from && html`
                                    <${Box} mt="xs">
                                        <${Text} size="xs" fw=${600} c="dimmed">Termination Date:<//>
                                        <${Text} size="sm">${new Date(h.termination_date).toLocaleDateString()} (${dayjs(h.termination_date).fromNow()})<//>
                                    <//>
                                `}
                                
                                ${h.reason && html`
                                    <${Box} mt="xs">
                                        <${Text} size="xs" fw=${600} c="dimmed">Reason:<//>
                                        <${Text} size="sm">${h.reason}<//>
                                    <//>
                                `}
                            <//>
                        `;
    })}
                <//>
            `}
        <//>
    `;
}

/**
 * Unified searchable selector component
 * Handles both simple item selection (groups) and items with additional properties (tokens with roles)
 * @param {string} label - Label for the section
 * @param {Array} selectedItems - Array of selected items (can be strings or objects)
 * @param {Function} onAdd - Callback when adding item (item, ...extraArgs)
 * @param {Function} onRemove - Callback when removing item (itemId/token)
 * @param {Array} searchResults - Search results to display
 * @param {boolean} isSearching - Loading state for search
 * @param {Function} onSearch - Search callback
 * @param {string} placeholder - Placeholder for search input
 * @param {string} searchDescription - Description under search input
 * @param {string} emptyMessage - Message when no items selected
 * @param {string} buttonLabel - Label for add button
 * @param {Function} renderItem - Optional custom renderer for selected items
 * @param {Function} renderSearchResult - Optional custom renderer for search results
 * @param {string} error - Error message
 * @param {boolean} isActive - Whether search results should show
 * @param {Function} onFocus - Focus callback
 */
function SearchableItemSelector({
    label,
    selectedItems,
    onAdd,
    onRemove,
    searchResults,
    isSearching,
    onSearch,
    placeholder = 'Search and add...',
    searchDescription = 'Type to search',
    emptyMessage = 'No items selected',
    buttonLabel = 'Add',
    renderItem,
    renderSearchResult,
    error,
    isActive = true,
    onFocus
}) {
    return html`
        <div>
            <${Text} fw=${600} mb="xs">${label}<//>
            <${Stack} gap="sm">
                <${TextInput}
                    placeholder=${placeholder}
                    onChange=${(e) => onSearch(e.target.value)}
                    onFocus=${onFocus}
                    description=${searchDescription}
                    rightSection=${isSearching && html`<${Loader} size="xs" />`}
                />
                
                ${searchResults.length > 0 && isActive && html`
                    <${Paper} p="sm" withBorder style=${{ maxHeight: '200px', overflowY: 'auto' }}>
                        <${Stack} gap="xs">
                            ${searchResults.map((item, idx) => renderSearchResult
        ? renderSearchResult(item, onAdd, buttonLabel)
        : html`
                                    <${Group} justify="space-between" key=${item.id || item}>
                                        <${Text} size="sm">${item.name || item}<//>
                                        <${Button} 
                                            size="xs" 
                                            variant="light"
                                            onClick=${() => onAdd(item)}
                                        >
                                            ${buttonLabel}
                                        <//>
                                    <//>
                                `
    )}
                        <//>
                    <//>
                `}

                ${selectedItems.length === 0 ? html`
                    <${Text} size="xs" c="dimmed" fw=${500}>${emptyMessage}<//>
                ` : renderItem ? html`
                    <${Stack} gap="xs">
                        ${selectedItems.map(item => renderItem(item, onRemove))}
                    <//>
                ` : html`
                    <${Group} gap="xs">
                        ${selectedItems.map(item => html`
                            <${Badge} 
                                key=${item}
                                rightSection=${html`<button 
                                    type="button"
                                    onClick=${() => onRemove(item)}
                                    style=${{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0', margin: '0', display: 'flex', alignItems: 'center' }}
                                >
                                    ×
                                </button>`}
                            >
                                ${item}
                            <//>
                        `)}
                    <//>
                `}
                ${error && html`<${Text} color="red" size="xs">${error}<//>`}
            <//>
        </div>
    `;
}

/**
 * TokenRoleEditor Component
 * Uses SearchableItemSelector with custom rendering for role selection
 */
function TokenRoleEditor({
    label,
    authorizedUsers,
    onAddToken,
    onRemoveToken,
    onRoleChange,
    searchResults,
    isSearching,
    onSearch,
    roles,
    defaultRole = 'member',
    error,
    emptyMessage = 'No authorized users',
    isActive = true,
    onFocus = null
}) {
    const renderSearchResult = (item, onAdd, buttonLabel) => html`
        <${Group} justify="space-between" key=${item}>
            <${Text} size="sm">${item}<//>
            <${Button} 
                size="xs" 
                variant="light"
                onClick=${() => onAdd(item, defaultRole)}
            >
                ${buttonLabel}
            <//>
        <//>
    `;

    const renderItem = (auth, onRemove) => html`
        <${Group} justify="space-between" key=${auth.token} align="center">
            <${Text} size="sm">${auth.token}<//>
            <${Group} gap="xs">
                <${Select}
                    size="xs"
                    value=${auth.role}
                    onChange=${(newRole) => onRoleChange(auth.token, newRole)}
                    data=${roles.map(r => ({ value: r.id, label: r.name }))}
                    w=${120}
                />
                <${Button}
                    size="xs"
                    color="red"
                    variant="light"
                    onClick=${() => onRemove(auth.token)}
                >
                    Remove
                <//>
            <//>
        <//>
    `;

    return html`
        <${SearchableItemSelector}
            label=${label}
            selectedItems=${authorizedUsers}
            onAdd=${onAddToken}
            onRemove=${onRemoveToken}
            searchResults=${searchResults}
            isSearching=${isSearching}
            onSearch=${onSearch}
            placeholder="Search and add users/groups..."
            searchDescription="Type to search for users or groups to authorize"
            emptyMessage=${emptyMessage}
            buttonLabel="Add"
            renderItem=${renderItem}
            renderSearchResult=${renderSearchResult}
            error=${error}
            isActive=${isActive}
            onFocus=${onFocus}
        />
    `;
}

function RequestModal({ config, opened, onClose, onSubmit, initialData }) {
    const isEdit = !!initialData;
    const [formData, setFormData] = useState({
        resources: {},
        reason: initialData?.reason || '',
        termination_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Default 90 days, not null
        authorized_users: initialData?.authorized_users ? [...initialData.authorized_users] : []
    });
    const [errors, setErrors] = useState({});
    const [durationValue, setDurationValue] = useState(90);
    const [durationUnit, setDurationUnit] = useState('days');
    const [tokenSearchResults, setTokenSearchResults] = useState([]);
    const [isSearchingTokens, setIsSearchingTokens] = useState(false);

    useEffect(() => {
        if (!config) return;
        const defaults = initialData
            ? { ...initialData.pending?.quota || initialData.resources }
            : Object.fromEntries(config.resources.map(r => [r.id, r.default]));

        const terminationDate = initialData?.pending?.termination_date || initialData?.termination_date
            ? new Date(initialData.pending?.termination_date || initialData.termination_date)
            : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 90 days

        const authorizedUsers = initialData?.pending?.authorized_users || initialData?.authorized_users || [];

        setFormData(current => ({
            ...current,
            resources: defaults,
            termination_date: terminationDate,
            authorized_users: [...authorizedUsers]
        }));

        // Calculate initial duration from date
        updateDurationFromDate(terminationDate);
    }, [config, initialData]);

    const updateDurationFromDate = (date) => {
        if (!date) return;
        const now = new Date();
        const diffMs = date - now;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 60) {
            setDurationValue(diffDays);
            setDurationUnit('days');
        } else if (diffDays < 365) {
            const weeks = Math.round(diffDays / 7);
            setDurationValue(weeks);
            setDurationUnit('weeks');
        } else {
            const months = Math.round(diffDays / 30);
            setDurationValue(months);
            setDurationUnit('months');
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.reason || formData.reason.trim().length < 5) {
            newErrors.reason = 'Please provide a reason (at least 5 characters)';
        }
        if (!formData.termination_date) {
            newErrors.termination_date = 'Please set a termination date';
        } else if (formData.termination_date <= new Date()) {
            newErrors.termination_date = 'Termination date must be in the future';
        }
        config.resources.forEach(r => {
            const val = formData.resources[r.id];
            if (val === null || val === undefined || val < r.min || val > r.max) {
                newErrors[r.id] = r.message;
            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSearchTokens = (query) => {
        if (!query || query.length === 0) {
            setTokenSearchResults([]);
            return;
        }
        setIsSearchingTokens(true);
        // Simulate search by filtering available identities and groups
        const allPossibleTokens = [
            ...mockIdentityCatalog.map(i => i.tokens).flat(),
            ...mockStore.admingroups.map(g => g.id)
        ];
        const filtered = allPossibleTokens.filter(token =>
            token.toLowerCase().includes(query.toLowerCase()) &&
            !formData.authorized_users.some(au => au.token === token)
        );
        setTimeout(() => {
            setTokenSearchResults(filtered);
            setIsSearchingTokens(false);
        }, 300);
    };

    const handleAddToken = (token, role = 'member') => {
        if (!formData.authorized_users.some(au => au.token === token)) {
            setFormData({
                ...formData,
                authorized_users: [...formData.authorized_users, { token, role }]
            });
        }
        setTokenSearchResults([]);
    };

    const handleRemoveToken = (token) => {
        setFormData({
            ...formData,
            authorized_users: formData.authorized_users.filter(au => au.token !== token)
        });
    };

    const handleRoleChange = (token, newRole) => {
        setFormData({
            ...formData,
            authorized_users: formData.authorized_users.map(au =>
                au.token === token ? { ...au, role: newRole } : au
            )
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        const termDate = formData.termination_date instanceof Date
            ? formData.termination_date
            : new Date(formData.termination_date);
        onSubmit({
            ...formData,
            termination_date: termDate.toISOString()
        });
    };

    const handleResourceChange = (id, value) => {
        setFormData({ ...formData, resources: { ...formData.resources, [id]: value } });
        if (errors[id]) setErrors({ ...errors, [id]: null });
    };

    return html`
    <${Modal} opened=${opened} onClose=${onClose} title=${isEdit ? 'Request Resource Change' : 'New Resource Request'} size="lg" >
        <form onSubmit=${handleSubmit}>
            <${Stack}>
                <div>
                    <${Text} fw=${600} mb="xs">Resources<//>
                    <${Grid}>
                        ${config.resources.map(r => html`
                                <${Grid.Col} span=${{ base: 12, sm: 4 }}>
                                    <${NumberInput}
                                        label=${r.name}
                                        min=${r.min}
                                        max=${r.max}
                                        value=${formData.resources[r.id]}
                                        onChange=${v => handleResourceChange(r.id, v)}
                                        error=${errors[r.id]}
                                        description=${r.message}
                                    />
                                <//>
                            `)}
                    <//>
                </div>

                <div>
                    <${TerminationDatePicker}
                        value=${formData.termination_date}
                        error=${errors.termination_date}
                        onChange=${(d) => {
            setFormData({ ...formData, termination_date: d });
            if (errors.termination_date) setErrors({ ...errors, termination_date: null });
        }}
                    />
                </div>

                ${isEdit && initialData.resources && html`
                        <${RequestChangesDiff}
                            config=${config}
                            quotaFrom=${initialData.resources}
                            quotaTo=${formData.resources}
                            dateFrom=${initialData.termination_date}
                            dateTo=${formData.termination_date}
                            usersFrom=${initialData.authorized_users}
                            usersTo=${formData.authorized_users}
                            roles=${config.roles}
                            label="Proposed Changes"
                        />
                    `}

                <${TokenRoleEditor}
                    label="Authorize Users/Groups"
                    authorizedUsers=${formData.authorized_users}
                    onAddToken=${handleAddToken}
                    onRemoveToken=${handleRemoveToken}
                    onRoleChange=${handleRoleChange}
                    searchResults=${tokenSearchResults}
                    isSearching=${isSearchingTokens}
                    onSearch=${handleSearchTokens}
                    roles=${config.roles || []}
                    defaultRole="member"
                    emptyMessage="No users authorized yet. Add at least one authorized user."
                />

                <div>
                    <${Textarea}
                        label="Reason"
                        required
                        value=${formData.reason}
                        onChange=${e => setFormData({ ...formData, reason: e.target.value })}
                        error=${errors.reason}
                        placeholder="Explain why you need these resources..."
                        description="Please provide at least 5 characters"
                        rows=${3}
                    />
                </div>

                <${Group} justify="flex-end" mt="md">
                    <${Button} variant="default" type="button" onClick=${onClose}>Cancel<//>
                    <${Button} type="submit">${isEdit ? 'Request Change' : 'Submit Request'}<//>
                <//>
            </form>
        <//>
    <//>
    `;
}

function AdminRejectModal({ request, opened, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!reason || reason.trim().length < 5) {
            setError('Please provide a reason (at least 5 characters)');
            return;
        }
        onSubmit(reason);
    };

    return html`
        <${Modal} opened=${opened} onClose=${onClose} title="Reject Resource Request" size="md">
            <form onSubmit=${handleSubmit}>
                <${Stack}>
                    <${Paper} p="md" withBorder>
                        <${Stack} gap="xs">
                            <${Text} size="sm" fw=${600}>Requester: ${request.requester.tokens.join(', ')}<//>
                            <${Text} size="sm" c="dimmed">Reason: ${request.reason}<//>
                        <//>
                    <//>

                    <div>
                        <${Textarea}
                            label="Rejection Reason"
                            required
                            value=${reason}
                            onChange=${e => { setReason(e.target.value); setError(''); }}
                            error=${error}
                            placeholder="Explain why this request is being rejected..."
                            description="Please provide at least 5 characters"
                            rows=${3}
                        />
                    </div>

                    <${Group} justify="flex-end" mt="md">
                        <${Button} variant="default" type="button" onClick=${onClose}>Cancel<//>
                        <${Button} type="submit" color="red">Reject<//>
                    <//>
                <//>
            </form>
        <//>
    `;
}

/**
 * GroupEditorSection Component
 * Uses SearchableItemSelector with custom rendering for group badges
 */
function GroupEditorSection({
    label,
    selectedGroups,
    onAddGroup,
    onRemoveGroup,
    searchResults,
    isSearching,
    onSearch,
    error,
    color = 'blue',
    buttonLabel = 'Add',
    emptyMessage = 'No groups selected',
    isActive = true,
    onFocus = null
}) {
    const renderSearchResult = (group, onAdd, btnLabel) => html`
        <${Group} justify="space-between" key=${group.id}>
            <${Text} size="sm">${group.name}<//>
            <${Button} 
                size="xs" 
                variant="light"
                onClick=${() => onAdd(group.id, group.name)}
            >
                ${btnLabel}
            <//>
        <//>
    `;

    const renderItem = (groupId, onRemove) => {
        const groupName = mockStore.admingroups.find(g => g.id === groupId)?.name || groupId;
        return html`
            <${Badge} 
                key=${groupId}
                color=${color}
                rightSection=${html`<${Group} spacing="xs" ml="xs" mr="0"><button 
                    type="button"
                    aria-label="Remove ${groupName}"
                    onClick=${() => onRemove(groupId)}
                    style=${{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0', margin: '0', display: 'flex', alignItems: 'center' }}
                >
                    ×
                </button></>`}
            >
                ${groupName}
            <//>
        `;
    };

    return html`
        <${SearchableItemSelector}
            label=${label}
            selectedItems=${selectedGroups}
            onAdd=${onAddGroup}
            onRemove=${onRemoveGroup}
            searchResults=${searchResults}
            isSearching=${isSearching}
            onSearch=${onSearch}
            placeholder="Search and add groups..."
            searchDescription=${buttonLabel === 'Add' ? 'Type to search for groups' : 'Type to search for groups to block'}
            emptyMessage=${emptyMessage}
            buttonLabel=${buttonLabel}
            renderItem=${renderItem}
            renderSearchResult=${renderSearchResult}
            error=${error}
            isActive=${isActive}
            onFocus=${onFocus}
        />
    `;
}

function AdminGroupModal({ parents, initialData, opened, onClose, onSubmit }) {
    const isEdit = !!initialData;
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        parentGroup: parents[0]?.id || '',
        can_delegate: initialData?.can_delegate ?? false,
        delegation_strategy: initialData?.delegation_strategy || 'pool',
        cores: initialData?.resources?.limit?.cores || 100,
        ram: initialData?.resources?.limit?.ram || 400,
        storage: initialData?.resources?.limit?.storage || 1000,
        gpu: initialData?.resources?.limit?.gpu || 10,
        end_date: initialData?.end_date ? new Date(initialData.end_date) : null
    });
    const [errors, setErrors] = useState({});

    // Groups management
    const [selectedGroups, setSelectedGroups] = useState(
        initialData?.delegation_scope?.whitelist || []
    );
    const [blockedGroups, setBlockedGroups] = useState(
        initialData?.delegation_scope?.blacklist || []
    );

    // Search state
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeSearchTab, setActiveSearchTab] = useState('whitelist'); // 'whitelist' or 'blacklist'

    const handleSearch = async (query, tab = 'whitelist') => {
        setSearchText(query);
        if (!query || query.trim().length === 0) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const res = await mockSdk.groupSearch(query);
            // Filter out already selected groups
            const selected = tab === 'whitelist' ? selectedGroups : blockedGroups;
            const filtered = res.data.filter(g => !selected.includes(g.id));
            setSearchResults(filtered);
        } finally {
            setIsSearching(false);
        }
    };

    const addGroup = (groupId, groupName, tab = 'whitelist') => {
        if (tab === 'whitelist') {
            if (!selectedGroups.includes(groupId)) {
                setSelectedGroups([...selectedGroups, groupId]);
            }
        } else {
            if (!blockedGroups.includes(groupId)) {
                setBlockedGroups([...blockedGroups, groupId]);
            }
        }
        setSearchText('');
        setSearchResults([]);
    };

    const removeGroup = (groupId, tab = 'whitelist') => {
        if (tab === 'whitelist') {
            setSelectedGroups(selectedGroups.filter(g => g !== groupId));
        } else {
            setBlockedGroups(blockedGroups.filter(g => g !== groupId));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.name || formData.name.trim().length < 3) {
            newErrors.name = 'Name must be at least 3 characters';
        }

        if (selectedGroups.length === 0) {
            newErrors.whitelist = 'At least one group must be in the whitelist';
        }

        if (!formData.parentGroup) {
            newErrors.parentGroup = 'Please select a parent group';
        }

        // Validate resource limits
        if (formData.cores < 1) newErrors.cores = 'Must be at least 1';
        if (formData.ram < 1) newErrors.ram = 'Must be at least 1';
        if (formData.storage < 1) newErrors.storage = 'Must be at least 1';
        if (formData.gpu < 0) newErrors.gpu = 'Cannot be negative';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const payload = {
            name: formData.name.trim(),
            can_delegate: formData.can_delegate,
            delegation_strategy: formData.delegation_strategy,
            membership_rules: {
                whitelist: selectedGroups,
                blacklist: blockedGroups
            },
            delegation_scope: {
                whitelist: selectedGroups,
                blacklist: blockedGroups
            },
            resources: {
                limit: {
                    cores: formData.cores,
                    ram: formData.ram,
                    storage: formData.storage,
                    gpu: formData.gpu
                }
            },
            end_date: formData.end_date ? formData.end_date.toISOString() : null
        };

        onSubmit(payload, formData.parentGroup);
    };

    return html`
        <${Modal} opened=${opened} onClose=${onClose} title=${isEdit ? 'Edit Admin Group' : 'Create Sub-Group'} size="lg">
            <form onSubmit=${handleSubmit}>
                <${Stack}>
                    <${TextInput}
                        label="Group Name"
                        required
                        value=${formData.name}
                        onChange=${(e) => setFormData({ ...formData, name: e.target.value })}
                        error=${errors.name}
                        placeholder="e.g., CS Research Group"
                        description="Choose a descriptive name"
                    />

                    <${Select}
                        label="Parent Group"
                        required
                        value=${formData.parentGroup}
                        onChange=${(v) => setFormData({ ...formData, parentGroup: v })}
                        data=${parents.map(p => ({ value: p.id, label: p.name }))}
                        error=${errors.parentGroup}
                        description="The parent group that will govern this sub-group"
                    />

                    <${Checkbox}
                        label="Can Delegate"
                        checked=${formData.can_delegate}
                        onChange=${(e) => setFormData({ ...formData, can_delegate: e.currentTarget.checked })}
                        description="Allow this group to create sub-groups and delegate resources"
                    />

                    <${Select}
                        label="Delegation Strategy"
                        value=${formData.delegation_strategy}
                        onChange=${(v) => setFormData({ ...formData, delegation_strategy: v || 'pool' })}
                        data=${[
            { value: 'pool', label: 'Shared Pool (manual approval)' },
            { value: 'allowance', label: 'Allowance (auto-approve per user)' }
        ]}
                    />

                    <${GroupEditorSection}
                        label="Whitelisted Groups"
                        selectedGroups=${selectedGroups}
                        onAddGroup=${(groupId, groupName) => addGroup(groupId, groupName, 'whitelist')}
                        onRemoveGroup=${(groupId) => removeGroup(groupId, 'whitelist')}
                        searchResults=${searchResults}
                        isSearching=${isSearching}
                        onSearch=${(query) => handleSearch(query, 'whitelist')}
                        error=${errors.whitelist}
                        color="blue"
                        buttonLabel="Add"
                        emptyMessage="No groups selected"
                        isActive=${activeSearchTab === 'whitelist'}
                        onFocus=${() => setActiveSearchTab('whitelist')}
                    />

                    <${GroupEditorSection}
                        label="Blacklisted Groups (Optional)"
                        selectedGroups=${blockedGroups}
                        onAddGroup=${(groupId, groupName) => addGroup(groupId, groupName, 'blacklist')}
                        onRemoveGroup=${(groupId) => removeGroup(groupId, 'blacklist')}
                        searchResults=${searchResults}
                        isSearching=${isSearching}
                        onSearch=${(query) => handleSearch(query, 'blacklist')}
                        error=${errors.blacklist}
                        color="red"
                        buttonLabel="Block"
                        emptyMessage="No groups blocked"
                        isActive=${activeSearchTab === 'blacklist'}
                        onFocus=${() => setActiveSearchTab('blacklist')}
                    />

                    <${TerminationDatePicker}
                        value=${formData.end_date}
                        onChange=${(d) => setFormData({ ...formData, end_date: d })}
                        label="End Date (Optional)"
                    />

                    <div>
                        <${Text} fw=${600} mb="xs">
                            ${formData.delegation_strategy === 'allowance' ? 'Limits Per User' : 'Total Group Budget'}
                        <//>
                        <${Grid}>
                            <${Grid.Col} span=${{ base: 12, sm: 6 }}>
                                <${NumberInput}
                                    label="Cores"
                                    min=${1}
                                    value=${formData.cores}
                                    onChange=${(v) => setFormData({ ...formData, cores: v })}
                                    error=${errors.cores}
                                />
                            <//>
                            <${Grid.Col} span=${{ base: 12, sm: 6 }}>
                                <${NumberInput}
                                    label="RAM (GB)"
                                    min=${1}
                                    value=${formData.ram}
                                    onChange=${(v) => setFormData({ ...formData, ram: v })}
                                    error=${errors.ram}
                                />
                            <//>
                            <${Grid.Col} span=${{ base: 12, sm: 6 }}>
                                <${NumberInput}
                                    label="Storage (GB)"
                                    min=${1}
                                    value=${formData.storage}
                                    onChange=${(v) => setFormData({ ...formData, storage: v })}
                                    error=${errors.storage}
                                />
                            <//>
                            <${Grid.Col} span=${{ base: 12, sm: 6 }}>
                                <${NumberInput}
                                    label="GPU (units)"
                                    min=${0}
                                    value=${formData.gpu}
                                    onChange=${(v) => setFormData({ ...formData, gpu: v })}
                                    error=${errors.gpu}
                                />
                            <//>
                        <//>
                    </div>

                    <${Group} justify="flex-end" mt="md">
                        <${Button} variant="default" type="button" onClick=${onClose}>Cancel<//>
                        <${Button} type="submit">
                            ${isEdit ? 'Save Changes' : 'Create Group'}
                        <//>
                    <//>
                <//>
            </form>
        <//>
    `;
}

