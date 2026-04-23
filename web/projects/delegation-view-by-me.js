import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Plus } from 'lucide-preact';
import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useClient } from '../providers/client.js';
import { useAuth } from '/providers/auth.js';
import { useErrorModal } from '/providers/error-modal.js';
import { DelegationCard } from './delegation-card.js';
import { DelegationModal } from './delegation-modal.js';
import { getAuthUserEmail, normalizeArrayResponse, useAsyncRefresh } from './util-project.js';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function ManageDelegationsView() {
    const { client, sdk } = useClient('projects');
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const [delegations, setDelegations] = useState([]);
    const [parentDelegations, setParentDelegations] = useState([]);
    const [editingDelegation, setEditingDelegation] = useState(null);
    const [userTokens, setUserTokens] = useState([]);
    const userEmail = getAuthUserEmail(user);

    const { refresh } = useAsyncRefresh(async () => {
        const [madeByMeRes, toMeRes] = await Promise.all([
            sdk.listDelegationsMadeByMe({ client }),
            sdk.listDelegationsToMe({ client }),
        ]);
        if (madeByMeRes?.error) throw new Error(sdkError(madeByMeRes));
        if (toMeRes?.error) throw new Error(sdkError(toMeRes));
        setDelegations(normalizeArrayResponse(madeByMeRes));
        setParentDelegations(normalizeArrayResponse(toMeRes));

        try {
            const res = await sdk.listMyGroups({ client });
            const tokens = res?.tokens || res?.data?.tokens || [];
            setUserTokens(tokens.map(token => ({ id: token, name: token })));
        } catch {
            setUserTokens([]);
        }
    }, showError);

    useEffect(() => { refresh(); }, [client, sdk, userEmail]);

    const handleCreateOrUpdateDelegation = async (data, parentGroupId) => {
        let res;
        if (editingDelegation?.id) {
            res = await sdk.updateDelegation({ client, path: { id: editingDelegation.id }, body: data, headers: { 'Content-Type': 'application/json' } });
        } else {
            res = await sdk.createDelegation({
                client,
                headers: { 'Content-Type': 'application/json' },
                body: { ...data, parent_id: parentGroupId, quota: { limit: data.quota.limit } }
            });
        }
        const err = sdkError(res);
        if (err) { showError(err); return; }
        setEditingDelegation(null);
        refresh();
    };

    const handleDeleteDelegation = async (delegation) => {
        const res = await sdk.deleteDelegation({ client, path: { id: delegation.id } });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        setEditingDelegation(null);
        refresh();
    };

    return html`
        <${Stack}>

            <${Group} mb="md" justify="space-between">
                <${Text} c="dimmed">
                    Manage delegations that fall under your jurisdiction. Create delegations to delegate resources to others.
                <//>

                <${Button} size="xs" leftSection=${html`<${Plus} size="14"/>`} onClick=${() => setEditingDelegation({})}>
                    New Delegation
                <//>
            <//>

            <${SimpleGrid} cols=${{ base: 1, md: 2 }}>
                ${delegations.map(delegation => html`
                    <${DelegationCard}
                        key=${delegation.id}
                        delegation=${delegation}
                        onEdit=${() => setEditingDelegation(delegation)}
                        onDelete=${() => handleDeleteDelegation(delegation)}
                        knownDelegations=${[...delegations, ...parentDelegations]}
                    />
                `)}
            <//>

            <${DelegationModal}
                initialData=${editingDelegation}
                parents=${userTokens}
                opened=${editingDelegation != null}
                onClose=${() => setEditingDelegation(null)}
                onSubmit=${handleCreateOrUpdateDelegation}
            />
        <//>
    `;
}
