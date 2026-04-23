import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { AlertCircle } from 'lucide-preact';
import { Notification, SimpleGrid, Stack, Text } from '@mantine/core';
import { useClient } from '../providers/client.js';
import { useAuth } from '/providers/auth.js';
import { useErrorModal } from '/providers/error-modal.js';
import { DelegationCard } from './delegation-card.js';
import { getAuthUserEmail, normalizeArrayResponse, useAsyncRefresh } from './util-project.js';

export function MyDelegationsView() {
    const { client, sdk } = useClient('projects');
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const userEmail = getAuthUserEmail(user);
    const [delegatedGroups, setDelegatedGroups] = useState([]);

    const { refresh } = useAsyncRefresh(async () => {
        const delegatedRes = await sdk.listDelegationsToMe({ client });
        setDelegatedGroups(normalizeArrayResponse(delegatedRes));
    }, showError);

    useEffect(() => { refresh(); }, [userEmail, client, sdk]);

    return html`
        <${Stack}>

            ${delegatedGroups.length === 0 && html`
                <${Notification} color="red" icon=${html`<${AlertCircle} size="18"/>`}>
                    No projects have been delegated to you yet.
                <//>
            `}

            ${delegatedGroups.length > 0 && html`
                <${Text} c="dimmed" mb="md">
                    Project groups where you can receive resources. These resources have been delegated to you.
                <//>

                <${SimpleGrid} cols=${{ base: 1, md: 2 }}>
                    ${delegatedGroups.map(group => html`
                        <${DelegationCard} key=${group.id} delegation=${group} knownDelegations=${delegatedGroups} />
                    `)}
                <//>
            `}
        <//>
    `;
}
