import { useQuery } from '@tanstack/react-query';
import { useAuth } from '/providers/auth.jsx';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';

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

    return {
        hasPolicy: query.data
            ? (query.data.rules.length > 0 || !!query.data.edit_allowed)
            : query.isError,
    };
}
