import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Badge, Button, Group, Loader, Paper, Text, TextInput } from '@mantine/core';
import { useClient } from '../providers/client.js';
import { useErrorModal } from '/providers/error-modal.js';
import { useProjectConfig } from './projects.js';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function GroupRoleSwitcher() {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [groupResults, setGroupResults] = useState([]);
    const [searchingGroups, setSearchingGroups] = useState(false);
    const [updating, setUpdating] = useState(false);
    const projectConfig = useProjectConfig();

    const refreshState = async () => {
        setLoading(true);
        const res = await sdk.getRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); } else { setState(res?.data || {}); }
        setLoading(false);
    };

    const fetchGroups = async (queryText) => {
        if (!state?.allowed) return;
        setSearchingGroups(true);
        const query = queryText?.trim() || '';
        const res = await sdk.searchGroups({
            client,
            query: { q: query || undefined, limit: query ? 50 : 10 },
        });
        const err = sdkError(res);
        if (err) { showError(err); } else { setGroupResults(Array.isArray(res?.data) ? res.data : []); }
        setSearchingGroups(false);
    };

    const setTemporaryGroup = async (groupToken) => {
        const res = await sdk.setRoleSwitch({
            client,
            body: { group_token: groupToken },
            headers: { 'Content-Type': 'application/json' }
        });
        const err = sdkError(res);
        if (err) throw new Error(err);
        return res?.data || {};
    };

    useEffect(() => {
        refreshState();
    }, [client]);

    useEffect(() => {
        if (!state?.allowed) {
            setGroupResults([]);
            return;
        }
        fetchGroups(searchText);
    }, [state?.allowed, searchText]);

    const selectedGroup = useMemo(() => state?.override_group_token || null, [state]);

    const handleGroupSelect = async (groupToken) => {
        if (!groupToken || selectedGroup === groupToken) return;
        setUpdating(true);
        try {
            await setTemporaryGroup(groupToken);
            window.location.reload();
        } catch (err) {
            showError(err?.message || 'Unable to switch temporary group.');
            setUpdating(false);
        }
    };

    const clearOverride = async () => {
        setUpdating(true);
        const res = await sdk.clearRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); setUpdating(false); return; }
        window.location.reload();
    };

    // Handler for dev user badge click
    function handleDevUserClick(user) {
        const url = new URL(window.location.href);
        url.searchParams.set('dev_user', user);
        window.location.href = url.toString();
    }

    if (loading) {
        return html`
            <${Paper} withBorder p="xs" mb="xs">
                <${Group} gap="xs" align="center">
                    <${Loader} size="xs" />
                    <${Text} size="xs" fw=${600}>Loading role switch options...<//>
                <//>
            <//>
        `;
    }

    if (!state?.enabled || !state?.allowed) {
        return null;
    }

    // Helper to render context switch badges
    function renderContextSwitchBadges() {
        if (selectedGroup) {
            const badges = [
                { color: 'red', variant: 'filled', label: 'Override Active' },
                { color: 'red', variant: 'outline', label: selectedGroup }
            ];
            return html`${badges.map(b => html`<${Badge} color=${b.color} variant=${b.variant} size="sm" style=${{ textTransform: 'none' }}>${b.label}<//>`)}`;
        } else {
            return html`<${Badge} color="gray" variant="light" size="sm" style=${{ textTransform: 'none' }}>Original Role<//>`;
        }
    }

    return html`
        <${Paper} withBorder p="xs" mb="xs" radius="sm" 
            style=${{ borderColor: 'var(--mantine-primary-color-filled)', background: 'linear-gradient(135deg, rgba(176, 0, 32, 0.05), rgba(176, 0, 32, 0.015))' }}>

            <${Group} justify="space-between" align="center" gap="xs" wrap="wrap">

                <${Group} gap="xs" align="center" wrap="wrap">
                    <${Text} size="xs" fw=${700}>Context Switch<//>
                    ${renderContextSwitchBadges()}
                <//>

                <${Button} size="compact-xs" variant="light" color="red" disabled=${updating || !selectedGroup} onClick=${clearOverride} >
                    Reset
                <//>
            <//>

            <${Group} mt=${6} align="center" gap="xs" wrap="nowrap">
                ${Array.isArray(projectConfig?.dummyDevUsers) && projectConfig.dummyDevUsers.length > 0 && html`
                    <${Text} size="xs" c="dimmed" mr="xs">Dev Users:<//>
                    ${projectConfig.dummyDevUsers.map(user => html`<${Badge} key=${user} color="blue" variant="outline" size="sm" style=${{ cursor: 'pointer', textTransform: 'none' }} onClick=${() => handleDevUserClick(user)}>${user}<//>`)}
                `}
            <//>

            <${Group} mt=${6} align="center" gap="xs" wrap="nowrap">
            
            <${TextInput} value=${searchText} onInput=${(event) => setSearchText(event.currentTarget.value || '')} 
                placeholder="Search temporary group..." size="xs" style=${{ minWidth: '220px', flex: 1 }} disabled=${updating} />
                ${searchingGroups || updating ? html`<${Loader} size="xs" />` : null}
            <//>

            <div style=${{ marginTop: '6px' }}> <${Group} gap="xs" wrap="nowrap" style=${{ overflowX: 'auto', paddingBottom: '2px' }}>
                    ${groupResults.length === 0 && !searchingGroups
            ? html`<${Text} size="xs" c="dimmed">No groups found.<//>`
            : groupResults.map((groupToken) => {
                const isCurrent = groupToken === selectedGroup;
                return html`
                            <${Badge}
                                key=${groupToken}
                                variant=${isCurrent ? 'filled' : 'outline'}
                                color=${isCurrent ? 'red' : 'gray'}
                                size="sm"
                                onClick=${() => handleGroupSelect(groupToken)}
                                style=${{
                        textTransform: 'none',
                        cursor: updating ? 'wait' : 'pointer',
                        opacity: updating && !isCurrent ? 0.6 : 1,
                        flex: '0 0 auto'
                    }}
                            >
                                ${groupToken}
                            <//>
                        `;
            })}
                <//>
            </div>

        <//>
    `;
}
