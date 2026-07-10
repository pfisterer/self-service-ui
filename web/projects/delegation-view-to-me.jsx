import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Loader, Notification, SimpleGrid, Stack, Text } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '../providers/client.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { DelegationCard } from './delegation-card.jsx';
import { getAuthUserEmail, normalizeArrayResponse, useAsyncRefresh } from './util-project.jsx';

export function MyDelegationsView() {
    const { client, sdk } = useClient('projects');
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const userEmail = getAuthUserEmail(user);
    const [delegatedGroups, setDelegatedGroups] = useState([]);

    const { loaded, refresh } = useAsyncRefresh(async () => {
        const delegatedRes = await sdk.listDelegationsToMe({ client });
        setDelegatedGroups(normalizeArrayResponse(delegatedRes));
    }, showError);

    useEffect(() => { refresh(); }, [userEmail, client, sdk]);

    // Loader on the initial load; avoids flashing the red "nothing delegated"
    // notification before the first fetch has resolved.
    if (!loaded) return (<Delayed><Loader /></Delayed>);

    return (
        <Stack>

            {delegatedGroups.length === 0 && (
                <Notification color="red" icon={<AlertCircle size="18"/>}>
                    No projects have been delegated to you yet.
                </Notification>
            )}

            {delegatedGroups.length > 0 && (
                <>
                <Text c="dimmed" mb="md">
                    Project groups where you can receive resources. These resources have been delegated to you.
                </Text>

                <SimpleGrid cols={{ base: 1, md: 2 }}>
                    {delegatedGroups.map(group => (
                        <DelegationCard key={group.id} delegation={group} knownDelegations={delegatedGroups} />
                    ))}
                </SimpleGrid>
                </>
            )}
        </Stack>
    );
}
