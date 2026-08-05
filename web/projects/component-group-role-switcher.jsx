import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Group, Loader, Paper, Text, TextInput } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '../providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useProjectConfig } from './projects.jsx';

// How many identity chips the panel ever shows at once. This bar sits on top of
// every /projects page, so it must not grow with the directory.
const MAX_PICKS = 10;

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function GroupRoleSwitcher() {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [identities, setIdentities] = useState([]);
    const [query, setQuery] = useState('');
    const projectConfig = useProjectConfig();

    const refreshState = async () => {
        setLoading(true);
        const res = await sdk.getRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); } else { setState(res?.data || {}); }
        setLoading(false);
    };

    // Full-identity impersonation (root admins only). Suggestions come from the
    // same principal search that fills every token field — there is no separate
    // "assumable identities" list, because it would expose exactly the same
    // addresses behind a second door. Consequence: an empty query yields nothing
    // (the API does not hand out people without something to match on), so the
    // chips appear as soon as you type. One over MAX_PICKS is requested so "there
    // are more" can be stated without asking for a count.
    const fetchIdentities = async (q) => {
        if (!state?.allowed || !q) {
            setIdentities([]);
            return;
        }
        const res = await sdk.searchPrincipals({ client, query: { q, limit: MAX_PICKS + 1 } });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        setIdentities((res?.data?.users || []).map(email => ({ email, label: email })));
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

    const submitQuery = () => {
        if (submitTarget) impersonate(submitTarget);
    };

    useEffect(() => {
        refreshState();
    }, [client]);

    // Debounced so typing does not fire one directory search per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => fetchIdentities(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [state?.allowed, query]);

    const selectedGroup = useMemo(() => state?.override_group_token || null, [state]);
    const impersonatedUser = useMemo(() => state?.impersonated_user || null, [state]);

    // Quick-pick impersonation targets, deduped by email: what the principal
    // search found merged with the mock dev users (populated only when the API
    // runs with dummy auth, i.e. localhost — those are fictional, so they may be
    // listed without a query). Both click through to impersonate() — one
    // mechanism, so dev and prod behave identically.
    const quickPicks = useMemo(() => {
        const byEmail = new Map();
        for (const id of identities) {
            if (id?.email) byEmail.set(id.email.toLowerCase(), { email: id.email, label: id.label || id.email });
        }
        const devUsers = Array.isArray(projectConfig?.dummyDevUsers) ? projectConfig.dummyDevUsers : [];
        for (const email of devUsers) {
            const key = String(email).toLowerCase();
            if (email && !byEmail.has(key)) byEmail.set(key, { email, label: email });
        }
        return [...byEmail.values()].sort((a, b) => a.label.localeCompare(b.label));
    }, [identities, projectConfig?.dummyDevUsers]);

    // The server already narrowed the identities; only the locally configured dev
    // users still need filtering. Never more than MAX_PICKS chips on screen.
    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return quickPicks;
        return quickPicks.filter((p) =>
            p.email.toLowerCase().includes(q) || p.label.toLowerCase().includes(q));
    }, [quickPicks, query]);

    const shown = matches.slice(0, MAX_PICKS);
    const hasMore = matches.length > shown.length;

    // What Enter / "Become" acts on: anything with an "@" is taken literally (that
    // is how you reach a student, who is a pattern member and never listed), and a
    // search that narrowed down to exactly one person becomes that person.
    const typed = query.trim();
    const submitTarget = typed.includes('@') ? typed
        : (matches.length === 1 ? matches[0].email : null);

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
                The field searches the known identities AND doubles as free text for
                anyone who is not listed. */}
            <div style={{ marginTop: 7 }}>
                <Group gap={6} align="center" wrap="nowrap" style={{ maxWidth: 400 }}>
                    <TextInput
                        value={query}
                        onInput={(event) => setQuery(event.currentTarget.value || '')}
                        onKeyDown={(event) => { if (event.key === 'Enter') submitQuery(); }}
                        placeholder="Search a user, or type any email…"
                        size="xs"
                        style={{ flex: 1 }}
                        disabled={updating}
                    />
                    <Button size="compact-xs" variant="light" color="grape" onClick={submitQuery} disabled={updating || !submitTarget}>
                        Become
                    </Button>
                    {updating ? <Loader size="xs" /> : null}
                </Group>

                {(
                    <Group gap={8} align="center" wrap="wrap" mt={6}>
                        {shown.map((qp) => {
                            const isActive = qp.email === impersonatedUser;
                            return (
                                <Badge
                                    key={qp.email}
                                    variant={isActive ? 'filled' : 'light'}
                                    color="grape"
                                    size="sm"
                                    onClick={() => !updating && !isActive && impersonate(qp.email)}
                                    style={{ textTransform: 'none', cursor: updating ? 'wait' : 'pointer' }}
                                    title={qp.email}
                                >
                                    {qp.label}
                                </Badge>
                            );
                        })}
                        {matches.length === 0 && (
                            <Text size="xs" c="dimmed">
                                {query.trim()
                                    ? 'No match — type a full email to become someone anyway.'
                                    : 'Type part of an address to find someone.'}
                            </Text>
                        )}
                        {hasMore && (
                            <Text size="xs" c="dimmed">
                                more matches — keep typing to narrow it down.
                            </Text>
                        )}
                    </Group>
                )}
            </div>

        </Paper>
    );
}
