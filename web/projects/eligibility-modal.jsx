import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ActionIcon, Badge, Button, Divider, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { TokenEditor } from './component-token-editor.jsx';
import { useClient } from '../providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { normalizeArrayResponse } from './util-project.jsx';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

// EligibilityRuleRow manages state for a single owner token.
// Rendered only after the parent has loaded data, so initial* props are stable.
function EligibilityRuleRow({ ownerToken, initialRequesters, initialIsSaved }) {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [requesters, setRequesters] = useState(initialRequesters);
    const [serverRequesters, setServerRequesters] = useState(initialRequesters);
    const [isSaved, setIsSaved] = useState(initialIsSaved);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const isDirty = requesters.length !== serverRequesters.length
        || requesters.some((v, i) => v !== serverRequesters[i]);

    const handleAdd = (token) => {
        if (!token || requesters.includes(token)) return;
        setRequesters([...requesters, token]);
    };

    const handleRemove = (token) => setRequesters(requesters.filter(r => r !== token));

    const handleSave = async () => {
        setSaving(true);
        const res = await sdk.setEligibilityRule({
            client,
            path: { token: ownerToken },
            body: { eligible_requesters: requesters },
            headers: { 'Content-Type': 'application/json' },
        });
        const err = sdkError(res);
        if (err) {
            showError('Failed to save rule for ' + ownerToken + ': ' + err);
        } else {
            setServerRequesters([...requesters]);
            setIsSaved(true);
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: 'Delete eligibility rule?',
            confirmLabel: 'Delete rule',
            message: `Remove the eligibility rule for ${ownerToken}? Requesters listed here will no longer be able to request resources funded from this token.`,
        });
        if (!ok) return;
        setDeleting(true);
        const res = await sdk.deleteEligibilityRule({ client, path: { token: ownerToken } });
        const err = sdkError(res);
        if (err) {
            showError('Failed to delete rule for ' + ownerToken + ': ' + err);
        } else {
            setRequesters([]);
            setServerRequesters([]);
            setIsSaved(false);
        }
        setDeleting(false);
    };

    return (
        <Stack gap="sm">

            <Group justify="space-between" align="center">
                <Badge
                    variant="light"
                    color={ownerToken.startsWith('user:') ? 'blue' : 'violet'}
                    style={{ textTransform: 'none', fontFamily: 'monospace' }}
                >
                    {ownerToken}
                </Badge>

                {isSaved && (
                    <ActionIcon
                        variant="subtle" color="red" size="sm"
                        loading={deleting}
                        onClick={handleDelete}
                        title="Delete rule"
                    >
                        <Trash2 size="14" />
                    </ActionIcon>
                )}
            </Group>

            <TokenEditor
                description="Tokens allowed to request resources funded from this token"
                rules={requesters}
                onAddRule={handleAdd}
                onRemoveRule={handleRemove}
                emptyMessage="No eligible requesters — no requests will appear for this token."
            />

            {isDirty && (
                <Group justify="flex-end">
                    <Button size="xs" loading={saving} onClick={handleSave}>Save</Button>
                </Group>
            )}

        </Stack>
    );
}

export function EligibilityModal({ opened, onClose }) {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [myTokens, setMyTokens] = useState([]);
    const [initialRules, setInitialRules] = useState({});
    const [initialSaved, setInitialSaved] = useState(new Set());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!opened) return;
        setLoading(true);

        (async () => {
            const [tokensRes, rulesRes] = await Promise.all([
                sdk.listMyGroups({ client }),
                sdk.listMyEligibilityRules({ client }),
            ]);
            const tokensErr = sdkError(tokensRes);
            const rulesErr = sdkError(rulesRes);
            if (tokensErr || rulesErr) {
                showError('Failed to load eligibility rules: ' + (tokensErr || rulesErr));
                setLoading(false);
                return;
            }

            const tokens = tokensRes?.tokens || tokensRes?.data?.tokens || [];
            const rules = normalizeArrayResponse(rulesRes);

            const ruleMap = Object.fromEntries(rules.map(r => [r.owner_token, r.eligible_requesters || []]));
            const savedSet = new Set(rules.map(r => r.owner_token));

            setMyTokens(tokens);
            setInitialRules(Object.fromEntries(tokens.map(t => [t, ruleMap[t] ?? []])));
            setInitialSaved(savedSet);
            setLoading(false);
        })();
    }, [opened, client, sdk]);

    return (
        <Modal opened={opened} onClose={onClose} title="Manage Eligibility Rules" size="lg">
            <Stack>

                <Text size="sm" c="dimmed">
                    Define which tokens may request resources funded from each of your tokens.
                    Only requests from eligible tokens will appear in "Manage Project Requests".
                </Text>

                {loading && (
                    <Group justify="center" py="xl">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading...</Text>
                    </Group>
                )}

                {!loading && myTokens.length === 0 && (
                    <Text c="dimmed" ta="center" py="xl">No tokens found for your account.</Text>
                )}

                {!loading && myTokens.map((token, i) => (
                    <React.Fragment key={token}>
                    {i > 0 && <Divider />}
                    <EligibilityRuleRow
                        ownerToken={token}
                        initialRequesters={initialRules[token] ?? []}
                        initialIsSaved={initialSaved.has(token)}
                    />
                    </React.Fragment>
                ))}

                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={onClose}>Close</Button>
                </Group>

            </Stack>
        </Modal>
    );
}
