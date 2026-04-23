import { useState, useEffect, useMemo } from 'preact/hooks';
import { html } from 'htm/preact';
import { useClient } from '/providers/client.js';
import { useErrorModal } from '/providers/error-modal.js';
import { Delayed } from '/helper/delayed.js';
import { Trash2, Edit, Plus, Search, X, AlertCircle } from 'lucide-preact';
import { Container, Title, Text, Button, Group, Stack, TextInput, SimpleGrid, Card, Modal, Alert, Loader, ActionIcon, Paper } from '@mantine/core';

const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [rules, setRules] = useState([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reloadTrigger, setReloadTrigger] = useState(true);
    const [editingRule, setEditingRule] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [isEditAllowed, setIsEditAllowed] = useState(false);

    // Fetch rules on load and when reloadTrigger changes
    useEffect(() => {
        (async () => {
            setLoading(true);
            setLoadFailed(false);
            const fullRes = await sdk.listPolicyRules({ client });
            const err = sdkError(fullRes);
            if (err) {
                showError(err);
                setLoadFailed(true);
                setLoading(false);
                return;
            }
            const res = fullRes.data;
            if (!res || !Array.isArray(res.rules)) {
                showError("Invalid response format: 'rules' array missing.");
                setLoadFailed(true);
                setLoading(false);
                return;
            }
            setRules(res.rules);
            setIsEditAllowed(!!res.edit_allowed);
            setLoading(false);
        })();
    }, [sdk, reloadTrigger]);

    // Handle successful create/edit/delete
    const handleSuccess = () => {
        setEditingRule(null);
        setIsModalOpen(false);
        setReloadTrigger(p => !p);
    }

    // Filter rules based on search term (and remember the filtered list until rules or search term changes)
    const filteredRules = useMemo(() => {
        return rules.filter(rule => {
            const searchTerm = searchFilter.toLowerCase();
            return (
                rule.zone_pattern.toLowerCase().includes(searchTerm) ||
                rule.target_user_filter.toLowerCase().includes(searchTerm) ||
                (rule.zone_soa && rule.zone_soa.toLowerCase().includes(searchTerm)) ||
                (rule.description && rule.description.toLowerCase().includes(searchTerm))
            );
        });
    }, [rules, searchFilter]);

    if (loading)
        return html`<${Delayed}><${Loader} size="lg" /><//>`;

    if (loadFailed)
        return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">Failed to load rules. See the error dialog for details.<//>`;

    // Use the flag retrieved from the API response
    const isSuperAdmin = isEditAllowed;

    return html`
        <${Container} fluid py="md" px="xl">
            <${Stack} gap="lg">
                <${Group} justify="space-between" align="flex-start">
                    <div>
                        <${Title} order=${2}>DNS Policy Management<//>
                        <${Text} size="sm" c="dimmed" mt="xs">
                            ${isSuperAdmin
            ? 'Manage who may create which zones. Policy changes apply to new zones. Existing zones stay as they are, so plan any follow-up updates.'
            : 'Read-only view of the DNS access rules that are currently active.'}
                        <//>
                    </div>

                    ${isSuperAdmin && html`
                        <${Button} leftSection=${html`<${Plus} size="16" />`} onClick=${() => setIsModalOpen(true)}>
                            New Rule
                        <//>
                    `}
                <//>

                <${RuleFilter}
                    searchFilter=${searchFilter}
                    onSearchChange=${setSearchFilter}
                    filteredCount=${filteredRules.length}
                    totalCount=${rules.length}
                />
                
                <${RuleList} rules=${filteredRules} isSuperAdmin=${isSuperAdmin} 
                    onEdit=${(rule) => { setEditingRule(rule); setIsModalOpen(true); }}
                    onDeleteSuccess=${handleSuccess}
                />

                ${isModalOpen && html`
                    <${RuleFormModal} ruleToEdit=${editingRule}
                        onFormSuccess=${handleSuccess}
                        onClose=${() => { setIsModalOpen(false); setEditingRule(null); }}
                    />
                `}
            <//>
        <//>
    `;
}

// --- Rule Filter Component ---
function RuleFilter({ searchFilter, onSearchChange, filteredCount, totalCount }) {
    return html`
        <${TextInput}
            placeholder="Search by zone pattern, user filter, or description..."
            value=${searchFilter}
            onChange=${(e) => onSearchChange(e.target.value)}
            leftSection=${html`<${Search} size="16" />`}
            rightSection=${searchFilter && html`
                <${ActionIcon} variant="subtle" onClick=${() => onSearchChange('')}>
                    <${X} size="16" />
                <//>
            `}
            description=${`Showing ${filteredCount} of ${totalCount} rules`}
        />
    `;
}

// --- Rule List Component ---
function RuleList({ rules, isSuperAdmin, onEdit, onDeleteSuccess }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [deleteLoading, setDeleteLoading] = useState(null);

    const handleDelete = async (ruleId) => {
        setDeleteLoading(ruleId);
        const res = await sdk.deletePolicyRule({ client, path: { id: ruleId } });
        const err = sdkError(res);
        if (err) { showError(`Error deleting rule: ${err}`); } else { onDeleteSuccess(); }
        setDeleteLoading(null);
    }

    if (rules.length === 0) {
        return html`
            <${Paper} p="xl" withBorder>
                <${Stack} align="center" gap="sm">
                    <${Text} size="lg" c="dimmed">📭 No rules found.<//>
                    ${isSuperAdmin && html`<${Text} size="sm" c="dimmed">Create the first rule to grant users access to DNS zones.<//>"`}
                <//>
            <//>
        `;
    }

    return html`
        <${SimpleGrid} cols=${{ base: 1, sm: 2, lg: 3 }}>
            ${rules.map(rule => html`
                <${SingleRule}
                    rule=${rule}
                    isSuperAdmin=${isSuperAdmin}
                    isDeleting=${deleteLoading === rule.id}
                    onEdit=${() => onEdit(rule)}
                    onDelete=${() => handleDelete(rule.id)}
                />
            `)}
        <//>
    `;
}

// --- Single Rule Component ---
function SingleRule({ rule, isSuperAdmin, isDeleting, onEdit, onDelete }) {
    return html`
        <${Card} shadow="sm" padding="md" radius="md" withBorder>
            <${Stack} gap="sm">
                <${Group} justify="space-between" align="flex-start">
                    <div style=${{ flexGrow: 1 }}>
                        <${Text} size="xs" c="dimmed" tt="uppercase">Zone Pattern<//>
                        <${Text} fw=${600} size="sm" mt="4">
                            <code style=${{ fontSize: '0.85em' }}>${rule.zone_pattern}</code>
                        <//>
                    </div>
                    ${isSuperAdmin && html`
                        <${Group} gap="4">
                            <${ActionIcon} size="sm" variant="light" color="blue" onClick=${onEdit} title="Edit">
                                <${Edit} size="16" />
                            <//>
                            <${ActionIcon} size="sm" variant="light" color="red" onClick=${onDelete} loading=${isDeleting} disabled=${isDeleting} title="Delete">
                                <${Trash2} size="16" />
                            <//>
                        <//>
                    `}
                <//>

                <div>
                    <${Text} size="xs" c="dimmed" tt="uppercase">Zone SOA<//>
                    <${Text} size="xs" mt="4"><code style=${{ fontSize: '0.85em' }}>${rule.zone_soa}</code><//>
                </div>

                <div>
                    <${Text} size="xs" c="dimmed" tt="uppercase">Applies To<//>
                    <${Text} size="xs" mt="4"><code style=${{ fontSize: '0.85em' }}>${rule.target_user_filter}</code><//>
                </div>

                ${rule.description && html`
                    <div>
                        <${Text} size="xs" c="dimmed" tt="uppercase">Description<//>
                        <${Text} size="xs" mt="4">${rule.description}<//>
                    </div>
                `}
            <//>
        <//>
    `;
}

// --- Rule Form Modal ---
function RuleFormModal({ ruleToEdit, onFormSuccess, onClose }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const isEditMode = ruleToEdit !== null;

    const initialRuleState = {
        zone_pattern: '',
        zone_soa: '',
        target_user_filter: '',
        description: '',
        ...(ruleToEdit || {})
    };

    const [rule, setRule] = useState(initialRuleState);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [zoneValid, setZoneValid] = useState(isValidZonePattern(initialRuleState.zone_pattern));
    const [zoneSoaValid, setZoneSoaValid] = useState(isValidDnsName(initialRuleState.zone_soa));
    const [userFilterValid, setUserFilterValid] = useState(isValidUserFilter(initialRuleState.target_user_filter));

    useEffect(() => {
        if (ruleToEdit) {
            setRule(ruleToEdit);
            setMessage(null);
            setZoneValid(isValidZonePattern(ruleToEdit.zone_pattern || ''));
            setZoneSoaValid(isValidDnsName(ruleToEdit.zone_soa || ''));
            setUserFilterValid(isValidUserFilter(ruleToEdit.target_user_filter || ''));
        } else {
            setRule(initialRuleState);
            setZoneValid(isValidZonePattern(initialRuleState.zone_pattern || ''));
            setZoneSoaValid(isValidDnsName(initialRuleState.zone_soa || ''));
            setUserFilterValid(isValidUserFilter(initialRuleState.target_user_filter || ''));
        }
    }, [ruleToEdit]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setRule(prev => ({
            ...prev,
            [name]: value
        }));
        if (name === 'zone_pattern') {
            setZoneValid(isValidZonePattern(value));
        } else if (name === 'zone_soa') {
            setZoneSoaValid(isValidDnsName(value));
        } else if (name === 'target_user_filter') {
            setUserFilterValid(isValidUserFilter(value));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (!isValidZonePattern(rule.zone_pattern) || !isValidDnsName(rule.zone_soa) || !isValidUserFilter(rule.target_user_filter)) {
            setMessage(html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Validation Error" color="red">Please ensure Zone Pattern, Zone SOA, and User Filter are all valid.</>`);
            setLoading(false);
            return;
        }

        const body = {
            zone_pattern: rule.zone_pattern,
            zone_soa: rule.zone_soa,
            target_user_filter: rule.target_user_filter,
            description: rule.description || undefined,
        };
        const res = isEditMode
            ? await sdk.updatePolicyRule({ client, path: { id: rule.id }, body })
            : await sdk.createPolicyRule({ client, body });
        const err = sdkError(res);
        if (err) {
            showError(err);
        } else {
            setMessage(html`<${Alert} title="Success" color="green">${isEditMode ? '✅ Rule updated!' : '✅ Rule created!'}</>`);
            setTimeout(() => onFormSuccess(), 700);
        }
        setLoading(false);
    };

    return html`
        <${Modal} opened=${true} onClose=${onClose} title=${isEditMode ? '✏️ Edit Rule' : '➕ Create New Rule'} size="lg">
            <${Stack} gap="md">
                ${message}

                <form onSubmit=${handleSubmit}>
                    <${Stack} gap="md">
                        <${TextInput}
                            label="Zone (Name or Pattern)"
                            name="zone_pattern"
                            value=${rule.zone_pattern}
                            onChange=${handleChange}
                            required
                            placeholder="e.g. projekt1.example.com or %u.users.example.com"
                            description="%u.users.example.com = %u will be replaced with username"
                            error=${!zoneValid && "Enter a valid domain. Allowed: '%u' as a full label (not the TLD). Wildcards are not permitted."}
                        />

                        <${TextInput}
                            label="Zone SOA"
                            name="zone_soa"
                            value=${rule.zone_soa}
                            onChange=${handleChange}
                            required
                            placeholder="e.g. users.example.com"
                            description="The authoritative zone for this nameserver (e.g., users.example.com)"
                            error=${!zoneSoaValid && "Enter a valid DNS domain name."}
                        />

                        <${TextInput}
                            label="User Filter"
                            name="target_user_filter"
                            value=${rule.target_user_filter}
                            onChange=${handleChange}
                            required
                            placeholder="e.g. *@example.com or alice@example.com"
                            description="*@example.com = All users with @example.com | alice@example.com = Only this specific user"
                            error=${!userFilterValid && "Enter a valid user filter. Allowed: '*@example.com' or 'alice@example.com'."}
                        />

                        <${TextInput}
                            label="Description (optional)"
                            name="description"
                            value=${rule.description || ''}
                            onChange=${handleChange}
                            placeholder="e.g. Project zone for student group A"
                        />

                        <${Group} justify="flex-end" mt="md">
                            <${Button} variant="default" onClick=${onClose}>Cancel<//>
                            <${Button} 
                                type="submit"
                                loading=${loading}
                                disabled=${!zoneValid || !zoneSoaValid || !userFilterValid}>
                                ${isEditMode ? "Save Changes" : "Create Rule"}
                            <//>
                        <//>
                    <//>
                </form>
            <//>
        <//>
    `;
}

// --- Validation Helpers ---

function isAlphaNum(ch) { return /[A-Za-z0-9]/.test(ch); }

// Allow RFC-compliant domain labels with '%u' as part of labels (e.g., student-%u.users.example.com). No wildcards or TLD as %u.
function isValidZonePattern(value) {
    if (!value) return false;
    let s = value.replaceAll('%u', 'A').trim();
    if (s.length === 0 || s.length > 253) return false;
    const parts = s.split('.');
    if (parts.length < 2) return false;

    function isValidLabel(label) {
        if (label.length < 1 || label.length > 63) return false;
        if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
        if (!isAlphaNum(label[0]) || !isAlphaNum(label[label.length - 1])) return false;
        return true;
    }

    for (const label of parts) {
        if (!isValidLabel(label)) return false;
    }

    return true;
}

// Validate email or wildcard email pattern: *@domain.com, user@domain.com, or *user@domain.com
function isValidUserFilter(value) {
    if (!value) return false;
    const emailRegex = /^(\*[a-zA-Z0-9._-]*|[a-zA-Z0-9._-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(value);
}

// Validate DNS name (standard domain without special patterns)
function isValidDnsName(value) {
    if (!value || value.trim().length === 0) return false;
    const trimmed = value.trim();
    if (trimmed.length > 253) return false;

    const parts = trimmed.split('.');
    if (parts.length < 2) return false;

    for (const label of parts) {
        if (label.length < 1 || label.length > 63) return false;
        if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
        if (!isAlphaNum(label[0]) || !isAlphaNum(label[label.length - 1])) return false;
    }

    return true;
}
