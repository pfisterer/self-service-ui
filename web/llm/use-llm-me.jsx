import { useQuery } from '@tanstack/react-query';
import { llmEnabled } from '/features.js';
import { useAuth } from '/providers/auth.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';

const RANK = { user: 1, 'fleet-admin': 2, admin: 3 };

// Who the caller is to the LLM service. The service decides — from the access
// rules — and this hook only reads the answer, so the navigation, the home page
// and the routes cannot disagree about it.
//
// A failed request counts as "no access" for the menu: offering a section that
// cannot load helps nobody. The section's own pages show the error instead.
export function useLlmMe() {
    const api = useLlmApi();
    const { user } = useAuth();

    const query = useQuery({
        queryKey: llmKeys.me(),
        queryFn: () => api.getMe(),
        enabled: llmEnabled && !!user,
        staleTime: 5 * 60 * 1000,
    });

    const me = query.data ?? null;
    const rank = RANK[me?.role] ?? 0;
    return {
        query,
        me,
        hasAccess: rank >= RANK.user,
        isFleetAdmin: rank >= RANK['fleet-admin'],
        isAdmin: rank >= RANK.admin,
    };
}
