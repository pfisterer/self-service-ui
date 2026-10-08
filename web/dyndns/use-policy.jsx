import { useQuery } from '@tanstack/react-query';
import { useAuth } from '/providers/auth.jsx';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { useZoneEventsQuery } from '/dyndns/zones/zone-events-banner.jsx';

// The policy rules, asked for in one place. Two callers share it — the DNS
// Policy page renders them, the header decides from the same response whether
// to offer the page at all — and sharing the query means sharing ONE request
// and one cache entry: opening the page shows what the header already knows,
// and a rule created there updates both.
export function usePolicyRulesQuery() {
    const api = useZonesApi();
    const { user } = useAuth();

    return useQuery({
        queryKey: dyndnsKeys.policyRules(),
        queryFn: async () => {
            const data = await api.listPolicyRules();
            if (!data || !Array.isArray(data.rules)) {
                throw new Error("Invalid response format: 'rules' array missing.");
            }
            return data;
        },
        enabled: !!api && !!user,
    });
}

// Has the DNS Policy page anything to say to this user? The response carries
// both halves of the answer: the rules they are allowed to see, and whether
// they may write any. Neither one means the page is a heading over an empty
// box — which is exactly what a student used to be sent to.
//
// While the answer is on its way the entry stays hidden (see nav.jsx). A
// FAILED lookup is the other way round: not knowing is no reason to hide the
// page from the admins who would have to go and fix it, and they land on the
// page's own error state rather than on a menu that pretends it is gone.
export function useDnsPolicyStatus() {
    const query = usePolicyRulesQuery();
    const isSuperAdmin = !!query.data?.is_super_admin;
    // Active zone events, for the dot in the navigation. The same query the
    // zone list and the admin tab read, so the dot and what they show agree.
    // The server scopes it: a super-admin gets every zone's events, everyone
    // else those of their own zones.
    const events = useZoneEventsQuery().data ?? [];

    return {
        hasPolicy: query.data
            ? (query.data.rules.length > 0 || !!query.data.edit_allowed)
            : query.isError,
        isSuperAdmin,
        // Where a problem is shown: on the admin's Zone Events tab, or in the
        // user's own zone list.
        adminEvents: isSuperAdmin ? events.length : 0,
        ownEvents: isSuperAdmin ? 0 : events.length,
    };
}
