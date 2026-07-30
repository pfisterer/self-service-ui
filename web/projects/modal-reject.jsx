import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { formatError, nodeTitle, ownerEmail } from './util-project.jsx';

// RejectModal declines a pending request or discards a pending change.
// Rejecting a CHANGE does not harm the project — it simply stays as it was.
export function RejectModal({ opened, onClose, onDone, node }) {
    const api = useNodesApi();
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const isChange = node?.status === 'change_pending';

    useEffect(() => {
        if (!opened) return;
        setReason('');
        setError('');
    }, [opened, node?.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason || reason.trim().length < 5) {
            setError('Please give a reason (at least 5 characters) — the requester will see it.');
            return;
        }
        setSubmitting(true);
        try {
            const result = await api.reject(node.id, reason);
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
        <Modal opened={opened} onClose={onClose} size="md"
            title={isChange ? 'Decline change request' : 'Reject request'}>
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Paper p="md" withBorder>
                        <Stack gap="xs">
                            <Text size="sm" fw={600}>{nodeTitle(node)}</Text>
                            {ownerEmail(node) && <Text size="sm" c="dimmed">Requested by: {ownerEmail(node)}</Text>}
                        </Stack>
                    </Paper>

                    {isChange && (
                        <Alert color="blue" variant="light" p="xs">
                            Only the proposed change is discarded — the project keeps running
                            with its current resources.
                        </Alert>
                    )}

                    <Textarea
                        label="Reason"
                        required
                        value={reason}
                        onChange={e => { setReason(e.target.value); setError(''); }}
                        error={error}
                        placeholder="Explain the decision…"
                        rows={3}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" color="red" loading={submitting}>
                            {isChange ? 'Decline change' : 'Reject'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
