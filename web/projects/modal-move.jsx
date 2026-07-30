import { useEffect, useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { formatError, isBudget, nodeTitle } from './util-project.jsx';

// MoveModal reparents a node under another budget. The server checks that the
// mover manages BOTH sides and that the target has capacity.
export function MoveModal({ opened, onClose, onDone, node, targetBudgets }) {
    const api = useNodesApi();
    const [targetId, setTargetId] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // The node itself and its current parent are not meaningful targets.
    const targets = (targetBudgets || []).filter(b => b.id !== node?.id && b.id !== node?.parent_id);

    useEffect(() => {
        if (!opened) return;
        setTargetId(null);
        setError(null);
    }, [opened, node?.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetId) { setError('Please choose the destination budget'); return; }
        setSubmitting(true);
        try {
            const result = await api.move(node.id, targetId);
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
        <Modal opened={opened} onClose={onClose} size="md" title={`Move: ${nodeTitle(node)}`}>
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Text size="sm" c="dimmed">
                        The {isBudget(node) ? 'budget (including everything under it)' : 'project'} will
                        be funded by the destination budget from then on. You must manage both the
                        current and the new location, and the destination needs enough free capacity.
                    </Text>

                    <Select
                        label="Move to"
                        required
                        searchable
                        data={targets.map(b => ({ value: b.id, label: b.name || b.id }))}
                        value={targetId}
                        onChange={(v) => { setTargetId(v); setError(null); }}
                        error={error}
                        placeholder="Choose the destination budget"
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" loading={submitting}>Move</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
