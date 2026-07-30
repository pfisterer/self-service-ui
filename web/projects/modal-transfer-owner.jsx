import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { formatError, nodeTitle, ownerEmail } from './util-project.jsx';

// TransferOwnerModal hands a project to a new responsible person.
export function TransferOwnerModal({ opened, onClose, onDone, node }) {
    const api = useNodesApi();
    const [email, setEmail] = useState('');
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!opened) return;
        setEmail('');
        setError(null);
    }, [opened, node?.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !trimmed.includes('@')) {
            setError('Please enter the new owner’s email address');
            return;
        }
        setSubmitting(true);
        try {
            const result = await api.transferOwner(node.id, trimmed);
            onDone?.(result);
            onClose();
        } catch (err) {
            setError(formatError(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (!node) return null;

    return (
        <Modal opened={opened} onClose={onClose} size="md" title={`Transfer ownership: ${nodeTitle(node)}`}>
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Text size="sm" c="dimmed">
                        The owner is the person responsible for a project — they can edit it,
                        request changes and release it. Current owner: <b>{ownerEmail(node) || '—'}</b>
                    </Text>

                    <TextInput
                        label="New owner"
                        description="Email address of the person taking over."
                        placeholder="someone@dhbw.de"
                        required
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError(null); }}
                        error={error}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" loading={submitting}>Transfer</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
