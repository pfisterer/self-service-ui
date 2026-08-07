import { createContext, useContext, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ActionIcon, Badge, Button, Group, Loader, Paper, Text, TextInput } from '@mantine/core';
import { Repeat, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { COLOR } from './util-project.jsx';

// How many identity chips the panel ever shows at once. This bar sits on top of
// every /projects page, so it must not grow with the directory.
const MAX_PICKS = 10;


// The panel and the button live in two different places — the panel spans the
// content of a /projects page, the button sits at the right end of that
// section's nav bar, which the HEADER renders — but they share one piece of
// state and, more to the point, one set of API calls. Mounting the component
// twice would query the role switch twice. That split is why the provider is
// mounted above the shell (index.jsx) rather than inside the section.
const RoleSwitchContext = createContext(null);

export function RoleSwitchProvider({ children }) {
    const api = useNodesApi();
    const [query, setQuery] = useState('');
    const [debouncedQuery] = useDebouncedValue(query, 250);
    const [expanded, setExpanded] = useState(false);
    const [currentPath] = useLocation();

    // This provider sits above the whole shell now, but the role switch is a
    // cloud-section control: only that API knows about impersonation. So it
    // asks the section's questions only while the section is open, instead of
    // adding two requests to every page in the app.
    const inSection = currentPath === '/projects' || currentPath.startsWith('/projects/');

    // The dev users below come from /v1/config. Read through the query cache
    // rather than through ProjectConfigContext: this provider sits ABOVE the
    // /projects section now (the button lives in the section's nav bar, which
    // the header renders), so that context is out of scope here — and taking a
    // dependency on projects.jsx would pull every view into the eager bundle.
    // Same key as CloudProjectManagement, so it is the same cached response.
    const configQuery = useQuery({
        queryKey: projectKeys.config(),
        queryFn: () => api.getConfig(),
        enabled: !!api && inSection,
        retry: false,
    });
    const projectConfig = configQuery.data;

    const stateQuery = useQuery({
        queryKey: projectKeys.rootStatus().concat('role-switch'),
        queryFn: () => api.getRoleSwitch(),
        enabled: !!api && inSection,
    });
    const state = stateQuery.data;
    const loading = stateQuery.isPending;

    // Debounced through the cache key rather than a timer in an effect: typing
    // back to an earlier term is answered from the cache, and a slow response
    // for an old term cannot overwrite a newer one. One over MAX_PICKS is
    // requested so "there are more" can be stated without asking for a count.
    const identitiesQuery = useQuery({
        queryKey: ['projects', 'identities', debouncedQuery.trim()],
        queryFn: () => api.searchIdentities(debouncedQuery.trim(), MAX_PICKS + 1),
        enabled: !!api && !!state?.allowed && !!debouncedQuery.trim(),
    });
    const identitiesData = identitiesQuery.data;

    const impersonateMutation = useApiMutation({
        mutationFn: (email) => api.setRoleSwitch({ impersonate_user: email }),
        // A full reload is the point: every view has to re-read the world as the
        // impersonated user, so there is nothing worth invalidating first.
        onSuccess: () => window.location.reload(),
    });
    const clearMutation = useApiMutation({
        mutationFn: () => api.clearRoleSwitch(),
        onSuccess: () => window.location.reload(),
    });
    const updating = impersonateMutation.isPending || clearMutation.isPending;
    const impersonate = (email) => impersonateMutation.mutate(email);

    const submitQuery = () => {
        if (submitTarget) impersonate(submitTarget);
    };

    const selectedGroup = useMemo(() => state?.override_group_token || null, [state]);
    const impersonatedUser = useMemo(() => state?.impersonated_user || null, [state]);

    // Quick-pick impersonation targets, deduped by email: what the principal
    // search found merged with the mock dev users (populated only when the API
    // runs with dummy auth, i.e. localhost — those are fictional, so they may be
    // listed without a query). Both click through to impersonate() — one
    // mechanism, so dev and prod behave identically.
    // Not memoised: this merges at most a dozen entries, and the previous
    // useMemo could not be preserved by the compiler anyway.
    const quickPicks = (() => {
        const identities = state?.allowed ? (identitiesData ?? []) : [];
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
    })();

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

    // Open when the user asked for it, or when a switch is active — that state
    // must never be invisible. A dev build no longer forces it open: the button
    // now sits in the section's nav bar, always in the same place and one click
    // away, which is what forcing the panel open was compensating for.
    const isSwitched = Boolean(impersonatedUser || selectedGroup);
    const open = expanded || isSwitched;

    const clearOverride = () => clearMutation.mutate();

    // Everything the two consumers need, so neither owns state of its own. Both
    // draw nothing until the role switch is known to be available — for everyone
    // without the privilege that is forever, and they must not flash on the way.
    const value = {
        ready: !loading && Boolean(state?.enabled && state?.allowed),
        open,
        expand: () => setExpanded(true),
        collapse: () => setExpanded(false),
        // An ACTIVE switch may not be collapsed away; anything else may.
        canCollapse: !isSwitched,
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
