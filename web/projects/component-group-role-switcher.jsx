import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Group, Loader, Paper, Text, TextInput } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '../providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function GroupRoleSwitcher() {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [identities, setIdentities] = useState([]);
    const [impersonateEmail, setImpersonateEmail] = useState('');

    const refreshState = async () => {
        setLoading(true);
        const res = await sdk.getRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); } else { setState(res?.data || {}); }
        setLoading(false);
    };

    // Full-identity impersonation (root admins only): fetch the assumable
    // identities and let the actor fully "become" one. Guarded so an older API
    // without the endpoint simply shows no identities instead of crashing.
    const fetchIdentities = async () => {
        if (!state?.allowed || typeof sdk.listRoleSwitchIdentities !== 'function') {
            setIdentities([]);
            return;
        }
        const res = await sdk.listRoleSwitchIdentities({ client });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        setIdentities(res?.data?.identities || []);
    };

    const impersonate = async (email) => {
        setUpdating(true);
        const res = await sdk.setRoleSwitch({
            client,
            body: { impersonate_user: email },
            headers: { 'Content-Type': 'application/json' },
        });
        const err = sdkError(res);
        if (err) { showError(err); setUpdating(false); return; }
        window.location.reload();
    };

    const submitImpersonateEmail = () => {
        const email = impersonateEmail.trim();
        if (email) impersonate(email);
    };

    useEffect(() => {
        refreshState();
    }, [client]);

    useEffect(() => {
        fetchIdentities();
    }, [state?.allowed]);

    const selectedGroup = useMemo(() => state?.override_group_token || null, [state]);
    const impersonatedUser = useMemo(() => state?.impersonated_user || null, [state]);

    const clearOverride = async () => {
        setUpdating(true);
        const res = await sdk.clearRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); setUpdating(false); return; }
        window.location.reload();
    };

    // This sits at the top of every /projects page and collapses to null for
    // non-privileged users; Delayed keeps it from flashing on fast loads.
    if (loading) {
        return (
            <Delayed>
                <Paper withBorder p="xs" mb="xs">
                    <Group gap="xs" align="center">
                        <Loader size="xs" />
                        <Text size="xs" fw={600}>Loading role switch options...</Text>
                    </Group>
                </Paper>
            </Delayed>
        );
    }

    if (!state?.enabled || !state?.allowed) {
        return null;
    }

    // Helper to render context switch badges
    function renderContextSwitchBadges() {
        if (impersonatedUser) {
            const badges = [
                { color: 'grape', variant: 'filled', label: 'Impersonating' },
                { color: 'grape', variant: 'outline', label: impersonatedUser }
            ];
            return <>{badges.map(b => <Badge key={b.label} color={b.color} variant={b.variant} size="sm" style={{ textTransform: 'none' }}>{b.label}</Badge>)}</>;
        }
        if (selectedGroup) {
            const badges = [
                { color: 'red', variant: 'filled', label: 'Override Active' },
                { color: 'red', variant: 'outline', label: selectedGroup }
            ];
            return <>{badges.map(b => <Badge key={b.label} color={b.color} variant={b.variant} size="sm" style={{ textTransform: 'none' }}>{b.label}</Badge>)}</>;
        }
        return <Badge color="gray" variant="light" size="sm" style={{ textTransform: 'none' }}>Original Role</Badge>;
    }

    return (
        <Paper withBorder px="sm" py={7} mb="xs" radius="md"
            style={{ borderColor: 'var(--mantine-primary-color-filled)', background: 'linear-gradient(135deg, rgba(176, 0, 32, 0.05), rgba(176, 0, 32, 0.015))' }}>

            <Group justify="space-between" align="center" gap="xs" wrap="wrap">
                <Group gap="xs" align="center" wrap="wrap">
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>Context Switch</Text>
                    {renderContextSwitchBadges()}
                </Group>
                <Button size="compact-xs" variant="subtle" color="red" disabled={updating || (!selectedGroup && !impersonatedUser)} onClick={clearOverride}>
                    Reset
                </Button>
            </Group>

            {/* One unified path (dev and prod): become any user via impersonation.
                Quick-pick badges on one row … */}
            <div style={{ marginTop: 7 }}>
                {identities.length > 0 && (
                    <Group gap={8} align="center" wrap="wrap" mb={6}>
                        <Text size="xs" c="dimmed" fw={600}>Become</Text>
                        {identities.map((ident) => {
                            const isActive = ident.email === impersonatedUser;
                            return (
                                <Badge
                                    key={ident.id || ident.email}
                                    variant={isActive ? 'filled' : 'light'}
                                    color="grape"
                                    size="sm"
                                    onClick={() => !updating && !isActive && impersonate(ident.email)}
                                    style={{ textTransform: 'none', cursor: updating ? 'wait' : 'pointer' }}
                                    title={ident.email}
                                >
                                    {ident.label || ident.email}
                                </Badge>
                            );
                        })}
                    </Group>
                )}
                {/* … and a clearly visible free-text field on its own (capped) row. It
                    reaches ANY user — incl. pattern-covered members (students) that are
                    not enumerable and never appear as a quick-pick badge above. */}
                <Group gap={6} align="center" wrap="nowrap" style={{ maxWidth: 400 }}>
                    <TextInput
                        value={impersonateEmail}
                        onInput={(event) => setImpersonateEmail(event.currentTarget.value || '')}
                        onKeyDown={(event) => { if (event.key === 'Enter') submitImpersonateEmail(); }}
                        placeholder="Type any email to become…"
                        type="email"
                        size="xs"
                        style={{ flex: 1 }}
                        disabled={updating}
                    />
                    <Button size="compact-xs" variant="light" color="grape" onClick={submitImpersonateEmail} disabled={updating || !impersonateEmail.trim()}>
                        Become
                    </Button>
                    {updating ? <Loader size="xs" /> : null}
                </Group>
            </div>

        </Paper>
    );
}
