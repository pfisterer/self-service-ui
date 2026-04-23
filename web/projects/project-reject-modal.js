import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Button, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core';

export function ProjectRejectModal({ request, opened, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!reason || reason.trim().length < 5) {
            setError('Please provide a reason (at least 5 characters)');
            return;
        }
        onSubmit(reason);
    };

    return html`
        <${Modal} opened=${opened} onClose=${onClose} title="Reject Project Request" size="md">
            <form onSubmit=${handleSubmit}>
                <${Stack}>
                    <${Paper} p="md" withBorder>
                        <${Stack} gap="xs">
                            <${Text} size="sm" fw=${600}>Requester: ${(request.requester_tokens ?? []).join(', ')}<//>
                            <${Text} size="sm" c="dimmed">Reason: ${request.reason}<//>
                        <//>
                    <//>

                    <div>
                        <${Textarea}
                            label="Rejection Reason"
                            required
                            value=${reason}
                            onChange=${e => { setReason(e.target.value); setError(''); }}
                            error=${error}
                            placeholder="Explain why this request is being rejected..."
                            description="Please provide at least 5 characters"
                            rows=${3}
                        />
                    </div>

                    <${Group} justify="flex-end" mt="md">
                        <${Button} variant="default" type="button" onClick=${onClose}>Cancel<//>
                        <${Button} type="submit" color="red">Reject<//>
                    <//>
                <//>
            </form>
        <//>
    `;
}
