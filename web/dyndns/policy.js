import { useState, useEffect, useMemo } from 'preact/hooks';
import { html } from 'htm/preact';
import { useClient } from '/providers/client.js';
import { Delayed } from '/helper/delayed.js';
import { Trash2, Edit, Plus, Search, X } from 'lucide-preact';
import { Container, Title, Text, Button, Group, Stack, TextInput, SimpleGrid, Card, Modal, Alert, Loader, ActionIcon, Paper } from '@mantine/core';
import { AlertCircle } from 'lucide-preact';

// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const { client, sdk } = useClient('dyndns');
    const [rules, setRules] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [reloadTrigger, setReloadTrigger] = useState(true);
    const [editingRule, setEditingRule] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [isEditAllowed, setIsEditAllowed] = useState(false);

    // Fetch rules on load and when reloadTrigger changes
    useEffect(() => {
        if (!sdk || !client)
            return;

        (async () => {
            try {
                setLoading(true);
                setError(null);

                const res = (await sdk.getV1PoliciesRules({ client })).data;

                console.log("Fetched DNS Policy Rules:", res);
                if (res && Array.isArray(res.rules)) {
                    setRules(res.rules);
                } else {
                    throw new Error("Invalid response format: 'rules' array missing.");
                }

                setIsEditAllowed(!!res.edit_allowed);

            } catch (e) {
                // If the error object has a 'message' (standard error) or 'detail' (common API error)
                const errorMessage = e.message || e.detail || JSON.stringify(e);
                setError(new Error(errorMessage));
            } finally {
                setLoading(false);
            }
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

    // Render loading and errors
    if (loading || !client)
        return html`<${Delayed}><${Loader} size="lg" /><//>`;

    if (error)
        return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${error.message}<//>`;

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
    const [deleteLoading, setDeleteLoading] = useState(null);

    const handleDelete = async (ruleId) => {
        setDeleteLoading(ruleId);
        try {
            await sdk.deleteV1PoliciesRulesById({ client, path: { id: ruleId } });
            onDeleteSuccess();
        } catch (e) {
            // Handle error response from SDK request
            const errorMessage = e.message || e.detail || JSON.stringify(e);
            alert(`Error deleting rule: ${errorMessage}`);
        } finally {
            setDeleteLoading(null);
        }
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

        try {
            const body = {
                zone_pattern: rule.zone_pattern,
                zone_soa: rule.zone_soa,
                target_user_filter: rule.target_user_filter,
                description: rule.description || undefined,
            };

            if (isEditMode) {
                await sdk.putV1PoliciesRulesById({ client, path: { id: rule.id }, body: body });
                setMessage(html`<${Alert} title="Success" color="green">✅ Rule updated!</>`);
            } else {
                await sdk.postV1PoliciesRules({ client, body: body });
                setMessage(html`<${Alert} title="Success" color="green">✅ Rule created!</>`);
            }
            setTimeout(() => onFormSuccess(), 700);
        } catch (e) {
            const errorMessage = e.message || e.detail || JSON.stringify(e);
            setMessage(html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${errorMessage}</>`);
        } finally {
            setLoading(false);
        }
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

// --- Validation Helpers (Moved to use the provided functions) ---
// I've kept your original validation functions here for completeness, 
// though the component assumes they are provided by useDnsPolicyClient.

// Allow RFC-compliant domain labels with '%u' as part of labels (e.g., student-%u.users.example.com). No wildcards or TLD as %u.
function isValidZonePattern(value) {
    if (!value) return false;
    let s = value.replaceAll('%u', 'A').trim();
    if (s.length === 0 || s.length > 253) return false;
    const parts = s.split('.');
    if (parts.length < 2) return false;

    // Helper function to check if a character is alphanumeric (A-Z, a-z, 0-9)
    function isAlphaNum(ch) { return /[A-Za-z0-9]/.test(ch); }

    //Validates a single DNS-style label, allowing the custom '%u' sequence.
    function isValidLabel(label) {
        // Check length constraints
        if (label.length < 1 || label.length > 63) {
            return false;
        }

        // Allowed characters: alphanumeric and hyphen (test with regex)
        if (!/^[A-Za-z0-9-]+$/.test(label)) {
            return false;
        }

        // Must start and end with alphanumeric character
        if (!isAlphaNum(label[0]) || !isAlphaNum(label[label.length - 1])) {
            return false;
        }

        return true;
    };

    // Label Validation Loop
    for (const label of parts) {
        if (!isValidLabel(label))
            return false;
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

    // Helper function to check if a character is alphanumeric (A-Z, a-z, 0-9)
    function isAlphaNum(ch) { return /[A-Za-z0-9]/.test(ch); }

    // Validate each label
    for (const label of parts) {
        if (label.length < 1 || label.length > 63) return false;
        if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
        if (!isAlphaNum(label[0]) || !isAlphaNum(label[label.length - 1])) return false;
    }

    return true;
}



/**
 * Validates a new zone pattern against system policies
 */
function validateZonePattern(pattern) {
    if (!pattern || pattern.trim().length === 0) {
        throw new Error("Zone pattern cannot be empty");
    }

    if (!/^[a-zA-Z0-9._%-]+$/.test(pattern)) {
        throw new Error("Zone pattern contains invalid characters");
    }

    if (pattern.length > 253) {
        throw new Error("Zone pattern is too long (max. 253 characters)");
    }

    return true;
}

/**
 * Validates user filter
 */
function validateUserFilter(filter) {
    if (!filter || filter.trim().length === 0) {
        throw new Error("User filter cannot be empty");
    }

    // Must be either *@domain or complete email
    if (!filter.includes('@')) {
        throw new Error("User filter must be an email address or *@domain");
    }

    return true;
}
