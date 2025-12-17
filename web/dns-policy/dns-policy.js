import { useState, useEffect, useMemo } from 'preact/hooks';
import { html } from 'htm/preact';
import { useClient } from '/providers/client.js';
import { Delayed } from '/helper/delayed.js';
import { Trash2, Edit } from 'lucide-preact';

// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const { client, sdk } = useClient('selfService');
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
        return html`<${Delayed}><p>Loading Policy Management data...</p><//>`;

    if (error)
        return html`<p class="has-text-danger">Error: ${error.message}</p>`;

    // Use the flag retrieved from the API response
    const isSuperAdmin = isEditAllowed;

    return html`
        <section class="section">
            <div class="container">
                <div class="columns is-vcentered mb-3">
                    <div class="column">
                        <h1 class="title is-3">DNS Policy Management</h1>

                        <p class="subtitle is-6 mt-4">
                            ${isSuperAdmin
            ? 'Manage who may create which zones. Policy changes apply to new zones. Existing zones stay as they are, so plan any follow-up updates.'
            : 'Read-only view of the DNS access rules that are currently active.'}
                        </p>
                    </div>

                    ${isSuperAdmin && html`
                        <div class="column is-narrow has-text-left has-text-right-tablet">
                            <button class="button is-primary" onClick=${() => setIsModalOpen(true)}>
                                <span class="icon is-small"> <span>➕</span> </span>
                                <span>New Rule</span>
                            </button>
                        </div>
                    `}
                </div>

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
            </div>
        </section>
    `;
}

// --- Rule Filter Component (No change) ---

function RuleFilter({ searchFilter, onSearchChange, filteredCount, totalCount }) {
    return html`
        <div class="mb-4">
            <div class="field">
                <label class="label">Filter Rules</label>
                <div class="control has-icons-right">
                    <input class="input" type="text" 
                        placeholder="Search by zone pattern, user filter, or description..." 
                        value=${searchFilter}
                        onInput=${(e) => onSearchChange(e.target.value)} />
                    ${searchFilter && html`
                        <span class="icon is-right is-clickable" onClick=${() => onSearchChange('')} style="cursor: pointer;">
                            <span>✕</span>
                        </span>
                    `}
                </div>
                <p class="help">Showing ${filteredCount} of ${totalCount} rules</p>
            </div>
        </div>
    `;
}

// --- Rule List Component (Uses SDK for delete) ---

function RuleList({ rules, isSuperAdmin, onEdit, onDeleteSuccess }) {
    const { client, sdk } = useClient('selfService');
    const [deleteLoading, setDeleteLoading] = useState(null);

    const handleDelete = async (ruleId) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
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
            <div class="box has-text-centered has-text-grey">
                <p class="is-size-5">📭 No rules found.</p>
                ${isSuperAdmin && html`<p class="mt-2">Create the first rule to grant users access to DNS zones.</p>`}
            </div>
        `;
    }

    return html`
        <div class="columns is-multiline">
            ${rules.map(rule => html`
                <${SingleRule}
                    rule=${rule}
                    isSuperAdmin=${isSuperAdmin}
                    isDeleting=${deleteLoading === rule.id}
                    onEdit=${() => onEdit(rule)}
                    onDelete=${() => handleDelete(rule.id)}
                />
            `)}
        </div>
    `;
}

// --- Single Rule Component (No change) ---

function SingleRule({ rule, isSuperAdmin, isDeleting, onEdit, onDelete }) {
    return html`
        <div class="column is-full-mobile is-half-tablet is-one-third-desktop">
            <div class="box" style="height: 100%; display: flex; flex-direction: column;">
                <div class="is-flex is-justify-content-space-between is-align-items-start mb-4">
                    <div style="flex-grow: 1;">
                        <p class="heading is-size-7 has-text-grey">Zone Pattern</p>
                        <p class="title is-5" style="margin-top: 0.25rem;">
                            <code>${rule.zone_pattern}</code>
                        </p>
                    </div>
                    ${isSuperAdmin && html`
                        <div class="buttons is-flex-wrap-nowrap ml-2">
                            <button class="button is-small is-info is-light" onClick=${onEdit} title="Edit">
                                <span class="icon is-small"> <${Edit} size="18" /> </span>
                            </button>
                            <button class="button is-small is-danger is-light ${isDeleting ? 'is-loading' : ''}" 
                                    onClick=${onDelete}
                                    disabled=${isDeleting}
                                    title="Delete">
                                <span class="icon is-small">
                                    <${Trash2} size="18" />
                                </span>
                            </button>
                        </div>
                    `}
                </div>

                <div class="mb-3">
                    <p class="heading is-size-7 has-text-grey">Zone SOA</p>
                    <p class="mt-1"><code>${rule.zone_soa}</code></p>
                </div>

                <div class="mb-3" style="flex-grow: 1;">
                    <p class="heading is-size-7 has-text-grey">Applies To</p>
                    <p class="mt-1"><code>${rule.target_user_filter}</code></p>
                </div>

                ${rule.description && html`
                    <div>
                        <p class="heading is-size-7 has-text-grey">Description</p>
                        <p class="mt-1 is-size-7">${rule.description}</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

// --- Rule Form Modal (Uses SDK for create and update) ---

function RuleFormModal({ ruleToEdit, onFormSuccess, onClose }) {
    const { client, sdk } = useClient('selfService');
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

        // Client-side validation check
        if (!isValidZonePattern(rule.zone_pattern) || !isValidDnsName(rule.zone_soa) || !isValidUserFilter(rule.target_user_filter)) {
            setMessage(html`<div class="notification is-danger is-light"><p>❌ Please ensure Zone Pattern, Zone SOA, and User Filter are all valid.</p></div>`);
            setLoading(false);
            return;
        }

        try {
            // Body matches the required `routes.PolicyRuleRequest` schema
            const body = {
                zone_pattern: rule.zone_pattern,
                zone_soa: rule.zone_soa,
                target_user_filter: rule.target_user_filter,
                // Only include description if it has a value, though the SDK will handle `undefined`
                description: rule.description || undefined,
            };

            if (isEditMode) {
                await sdk.putV1PoliciesRulesById({ client, path: { id: rule.id }, body: body });
                setMessage(html`<div class="notification is-success is-light"><p>✅ Rule updated!</p></div>`);
            } else {
                await sdk.postV1PoliciesRules({ client, body: body });
                setMessage(html`<div class="notification is-success is-light"><p>✅ Rule created!</p></div>`);
            }
            setTimeout(() => onFormSuccess(), 700);
        } catch (e) {
            const errorMessage = e.message || e.detail || JSON.stringify(e);
            setMessage(html`<div class="notification is-danger is-light"><p>❌ Error: ${errorMessage}</p></div>`);
        } finally {
            setLoading(false);
        }
    };

    return html`
        <div class="modal is-active">
            <div class="modal-background" onClick=${onClose}></div>
            <div class="modal-card">
                <header class="modal-card-head">
                    <p class="modal-card-title">${isEditMode ? '✏️ Edit Rule' : '➕ Create New Rule'}</p>
                    <button class="delete" onClick=${onClose}></button>
                </header>

                <section class="modal-card-body">
                    ${message}

                    <form onSubmit=${handleSubmit}>
                        <div class="field">
                            <label class="label">Zone (Name or Pattern)</label>
                            <div class="control">
                                <input class="input ${!zoneValid ? 'is-danger' : ''}" name="zone_pattern" type="text" 
                                    value=${rule.zone_pattern} onInput=${handleChange} required 
                                    placeholder="e.g. projekt1.example.com or %u.users.example.com" />
                            </div>
                            <p class="help">
                                <strong>%u.users.example.com</strong> = %u will be replaced with username
                            </p>
                            ${!zoneValid && html`<p class="help is-danger">Enter a valid domain. Allowed: '%u' as a full label (not the TLD). Wildcards are not permitted.</p>`}
                        </div>

                        <div class="field">
                            <label class="label">Zone SOA</label>
                            <div class="control">
                                <input class="input ${!zoneSoaValid ? 'is-danger' : ''}" name="zone_soa" type="text" 
                                    value=${rule.zone_soa} onInput=${handleChange} required 
                                    placeholder="e.g. users.example.com" />
                            </div>
                            <p class="help">
                                The authoritative zone for this nameserver (e.g., <strong>users.example.com</strong>)
                            </p>
                            ${!zoneSoaValid && html`<p class="help is-danger">Enter a valid DNS domain name.</p>`}
                        </div>

                        <div class="field">
                            <label class="label">User Filter</label>
                            <div class="control">
                                <input class="input ${!userFilterValid ? 'is-danger' : ''}" name="target_user_filter" type="text" 
                                    value=${rule.target_user_filter} onInput=${handleChange} required 
                                    placeholder="e.g. *@example.com or alice@example.com" />
                            </div>
                            ${!userFilterValid && html`<p class="help is-danger">Enter a valid user filter. Allowed: '*@example.com' or 'alice@example.com'.</p>`}
                            <p class="help">
                                <strong>*@example.com</strong> = All users with @example.com<br/>
                                <strong>alice@example.com</strong> = Only this specific user
                            </p>
                        </div>

                        <div class="field">
                            <label class="label">Description (optional)</label>
                            <div class="control">
                                <input class="input" name="description" type="text" 
                                    value=${rule.description || ''} onChange=${handleChange}
                                    placeholder="e.g. Project zone for student group A" />
                            </div>
                        </div>
                    </form>
                </section>

                <footer class="modal-card-foot">
                    <button class="button" onClick=${onClose}>Cancel</button>
                    <button class="button is-primary" 
                            onClick=${handleSubmit}
                            disabled=${loading || !zoneValid || !zoneSoaValid || !userFilterValid}>
                        ${loading ? html`<span class="icon"><span class="loader"></span></span>` : ''}
                        <span>${isEditMode ? "Save Changes" : "Create Rule"}</span>
                    </button>
                </footer>
            </div>
        </div>
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
