import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Loader, Paper, Text, TextInput } from '@mantine/core';
import { Repeat, X } from 'lucide-react';
import { useClient } from '../providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useProjectConfig } from './projects.jsx';
import { COLOR } from './util-project.jsx';

// A dev build is where impersonation is the everyday workflow, so the panel
// stays open there. False in every `vite build` artifact (staging/prod).
const DEV_MODE = import.meta.env.DEV;

// How many identity chips the panel ever shows at once. This bar sits on top of
// every /projects page, so it must not grow with the directory.
const MAX_PICKS = 10;

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

// The panel and the button live in two different places — the panel spans the
// content, the button belongs in the top-right gutter next to a view's own
// header row — but they share one piece of state and, more to the point, one set
// of API calls. Mounting the component twice would query the role switch twice.
const RoleSwitchContext = createContext(null);

export function RoleSwitchProvider({ children }) {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [identities, setIdentities] = useState([]);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
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

    // Open when the user asked for it, when a switch is active (that state must
    // never be invisible), or always in a dev build.
    const isSwitched = Boolean(impersonatedUser || selectedGroup);
    const open = expanded || isSwitched || DEV_MODE;

    const clearOverride = async () => {
        setUpdating(true);
        const res = await sdk.clearRoleSwitch({ client });
        const err = sdkError(res);
        if (err) { showError(err); setUpdating(false); return; }
        window.location.reload();
    };

    // Everything the two consumers need, so neither owns state of its own. Both
    // draw nothing until the role switch is known to be available — for everyone
    // without the privilege that is forever, and they must not flash on the way.
    const value = {
        ready: !loading && Boolean(state?.enabled && state?.allowed),
        open,
        expand: () => setExpanded(true),
        collapse: () => setExpanded(false),
        canCollapse: !isSwitched && !DEV_MODE,
        isSwitched, impersonatedUser, selectedGroup,
        query, setQuery, submitQuery, submitTarget,
        shown, hasMore, matches, updating, impersonate, clearOverride,
    };

    return <RoleSwitchContext.Provider value={value}>{children}</RoleSwitchContext.Provider>;
}

// RoleSwitchButton is the collapsed state: one unobtrusive button, rendered by
// the caller wherever it should sit. Draws nothing while the panel is open.
export function RoleSwitchButton() {
    const ctx = useContext(RoleSwitchContext);
    if (!ctx?.ready || ctx.open) return null;
    return (
        <Button size="compact-xs" variant="subtle" color={COLOR.identity}
            leftSection={<Repeat size={13} />}
            onClick={ctx.expand}>
            Context switch
        </Button>
    );
}

// RoleSwitchPanel is the expanded state. Collapsed by default: a root admin
// looks at these pages all day and switches context rarely. It is forced open in
// a dev build, where becoming another user IS the workflow, and whenever a
// switch is ACTIVE — hiding the fact that you are currently someone else would
// be the one genuinely dangerous state.
export function RoleSwitchPanel() {
    const ctx = useContext(RoleSwitchContext);
    if (!ctx?.ready || !ctx.open) return null;
    const {
        impersonatedUser, selectedGroup, isSwitched, canCollapse, collapse,
        query, setQuery, submitQuery, submitTarget,
        shown, hasMore, matches, updating, impersonate, clearOverride,
    } = ctx;

    return (
        <Paper withBorder px="sm" py={6} mb="xs" radius="md"
            style={{ borderColor: 'var(--mantine-primary-color-filled)', background: 'linear-gradient(135deg, rgba(176, 0, 32, 0.05), rgba(176, 0, 32, 0.015))' }}>

            {/* Everything on one line: state, the search that doubles as free-text
                entry for anyone not listed, and the way out. */}
            <Group gap="xs" align="center" wrap="wrap">
                <Repeat size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />

                {impersonatedUser
                    ? <Badge color={COLOR.outside} variant="filled" size="sm" style={{ textTransform: 'none' }}>Acting as {impersonatedUser}</Badge>
                    : selectedGroup
                        ? <Badge color={COLOR.negative} variant="filled" size="sm" style={{ textTransform: 'none' }}>Acting as {selectedGroup}</Badge>
                        : <Text size="xs" c="dimmed" fw={600}>Become</Text>}

                <TextInput
                    value={query}
                    onInput={(event) => setQuery(event.currentTarget.value || '')}
                    onKeyDown={(event) => { if (event.key === 'Enter') submitQuery(); }}
                    placeholder="Search a user, or type any email…"
                    size="xs"
                    w={260}
                    disabled={updating}
                />
                <Button size="compact-xs" variant="light" color={COLOR.outside} onClick={submitQuery} disabled={updating || !submitTarget}>
                    Become
                </Button>
                {updating ? <Loader size="xs" /> : null}

                {shown.map((qp) => {
                    const isActive = qp.email === impersonatedUser;
                    return (
                        <Badge
                            key={qp.email}
                            variant={isActive ? 'filled' : 'light'}
                            color={COLOR.outside}
                            size="sm"
                            onClick={() => !updating && !isActive && impersonate(qp.email)}
                            style={{ textTransform: 'none', cursor: updating ? 'wait' : 'pointer' }}
                            title={qp.email}
                        >
                            {qp.label}
                        </Badge>
                    );
                })}
                {hasMore && <Text size="xs" c="dimmed">more matches — keep typing.</Text>}
                {query.trim() && matches.length === 0 && (
                    <Text size="xs" c="dimmed">No match — a full email works anyway.</Text>
                )}

                <Group gap={4} align="center" ml="auto" wrap="nowrap">
                    {isSwitched && (
                        <Button size="compact-xs" variant="subtle" color={COLOR.negative} disabled={updating} onClick={clearOverride}>
                            Reset
                        </Button>
                    )}
                    {/* No way to close while switched: the badge above is the only
                        thing telling you that you are not yourself right now. */}
                    {canCollapse && (
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={collapse} title="Close">
                            <X size={14} />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
        </Paper>
    );
}
