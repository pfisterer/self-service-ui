import { useQuery } from '@tanstack/react-query';
import { groupsEnabled } from '/features.js';
import { useAuth } from '/providers/auth.jsx';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';

// Who the caller is to the role provider's group maintenance. The service decides and this hook only reads the answer, so the navigation and the routes cannot disagree: the section is offered to whoever maintains at least one group, and to admins.
//
// A failed request counts as "nothing to maintain" for the menu: offering a section that cannot load helps nobody. The section's own pages show the error instead.
export function useGroupsMe() {
    const api = useGroupsApi();
    const { user } = useAuth();

    const query = useQuery({
        queryKey: groupsKeys.me(),
        queryFn: () => api.getMe(),
        enabled: groupsEnabled && !!user,
        staleTime: 5 * 60 * 1000,
    });

    const me = query.data ?? null;
    return {
        query,
        me,
        visible: Boolean(me?.manages_any),
        isAdmin: Boolean(me?.admin),
        relations: me?.relations ?? ['member'],
        sourceName: me?.source_name ?? '',
    };
}
