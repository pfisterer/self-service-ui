import { createContext, useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { cloudProjectsEnabled, dnsZonesEnabled, llmEnabled } from '/features.js';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from '/projects/api-nodes.jsx';
import { useDnsMeQuery } from '/dyndns/use-dns-me.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { actingAsAtLoad, storeActingAs } from '/providers/acting-as.js';

// Acting on behalf of another person: an admin, working on a ticket, sees and does what that person would — in every service at once. The browser sends the person's address as X-Act-As with every request (providers/client.jsx); each service checks on its own that the signed-in person is one of its admins, and refuses otherwise. Nothing is stored on a server: the choice lives in this tab (sessionStorage, providers/acting-as.js), so it ends with the tab and cannot linger unnoticed in another one. ?act_as=<email> in a link starts a tab acting for that person.
//
// Switching reloads the page: everything cached so far was the other person's.

function switchTo(email) {
    storeActingAs(email ? email.trim().toLowerCase() : null);
    window.location.reload();
}

// How many people the picker ever lists at once.
const MAX_PICKS = 8;

const ActAsContext = createContext({ actingAs: null, mayActAs: false, refused: [] });
export const useActAs = () => useContext(ActAsContext);

export function ActAsProvider({ children }) {
    const { user } = useAuth();
    const nodesApi = useNodesApi();
    const { query: llmQuery } = useLlmMe();
    const actingAs = actingAsAtLoad;

    // Each service answers for itself whether the signed-in person may act on behalf of others — a deployment may run any of them alone.
    const cloudQuery = useQuery({
        queryKey: ['act-as', 'cloud'],
        queryFn: () => nodesApi.getActAs(),
        enabled: cloudProjectsEnabled && !!nodesApi && !!user,
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
    const dnsQuery = useDnsMeQuery({ enabled: dnsZonesEnabled });
    const services = [
        cloudProjectsEnabled && { id: 'cloud', query: cloudQuery },
        dnsZonesEnabled && { id: 'dns', query: dnsQuery },
        llmEnabled && { id: 'llm', query: llmQuery },
    ].filter(Boolean);

    const mayActAs = services.some(s => s.query.data?.may_act_as);
    // A service whose admins do not include the signed-in person refuses every request while acting for somebody: say which, rather than leave its pages failing without a reason.
    const refused = actingAs
        ? services.filter(s => s.query.isError && [400, 403].includes(s.query.error?.status)).map(s => s.id)
        : [];

    // The people to pick from come from the cloud API's principal search (users by address only); without it, a full address is typed.
    const [query, setQuery] = useState('');
    const [debounced] = useDebouncedValue(query.trim(), 250);
    const searchQuery = useQuery({
        queryKey: ['act-as', 'search', debounced],
        queryFn: () => nodesApi.searchIdentities(debounced, MAX_PICKS + 1),
        enabled: !!nodesApi && mayActAs && debounced.length >= 3,
    });
    const found = (searchQuery.data ?? []).map(p => p.email).filter(e => e !== actingAs);
    const matches = found.slice(0, MAX_PICKS);
    const typed = query.trim();
    // Enter acts on a typed address as it is (that is how somebody covered only by a pattern rule is reached), or on the only match.
    const submitTarget = typed.includes('@') ? typed : (found.length === 1 ? found[0] : null);

    const value = {
        actingAs,
        mayActAs,
        refused,
        query, setQuery,
        matches, hasMore: found.length > matches.length, searching: searchQuery.isFetching,
        submitTarget,
        actAs: switchTo,
        stop: () => switchTo(null),
    };

    return <ActAsContext.Provider value={value}>{children}</ActAsContext.Provider>;
}
