import { useState } from 'react';
import { Alert, Button, Code, Group, Paper, Stack, Text, Textarea, UnstyledButton } from '@mantine/core';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { useProjectConfig } from './projects.jsx';
import { featureOpen } from './use-features.js';
import { formatError } from '/helper/api-error.js';
import { SafeMarkdown } from '/helper/safe-markdown.jsx';

// The portal assistant, stage 1 (read only; docs/portal-assistant.md in os-mgt-api): a question in one's own words, answered by the platform's model from what the read tools return as the signed-in person. Shown only where /v1/config says it is set up and its feature gate assistant is open for the person (on production first only for a small group). The answer is rendered as a small safe Markdown subset (SafeMarkdown: paragraphs, lists, bold, italics, inline code), as React text nodes and never as HTML, without links or images: it may quote names and reasons other people wrote, and a rendered link or image would be a way out for them. The tool calls it rests on are listed under it. The conversation lives only in this component; the service keeps none.

// HISTORY_TURNS is how many earlier turns go along with a question (the service takes at most 6).
const HISTORY_TURNS = 6;

export function AssistantPanel() {
    const config = useProjectConfig();
    if (!config?.assistant || !featureOpen(config, 'assistant')) return null;
    return <AssistantBox />;
}

export function AssistantBox() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState('');
    const [turns, setTurns] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const ask = async () => {
        const q = question.trim();
        if (!q || busy) return;
        setBusy(true);
        setError(null);
        try {
            const history = turns.flatMap((x) => [{ role: 'user', content: x.question }, { role: 'assistant', content: x.answer.answer }]).slice(-HISTORY_TURNS);
            const answer = await api.askAssistant({ question: q, history });
            setTurns((prev) => [...prev, { question: q, answer }]);
            setQuestion('');
        } catch (err) {
            setError(formatError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper withBorder p="sm" mb="md">
            <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ width: '100%' }}>
                <Group gap="xs">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Sparkles size={16} />
                    <Text fw={500}>{t('projects.assistant.title')}</Text>
                    <Text size="xs" c="dimmed">{t('projects.assistant.readOnly')}</Text>
                </Group>
            </UnstyledButton>
            {open && (
                <Stack gap="sm" mt="sm">
                    <Text size="xs" c="dimmed">{t('projects.assistant.hint')}</Text>
                    {turns.map((x, i) => <AssistantTurn key={i} question={x.question} answer={x.answer} />)}
                    {error && <Alert color="red" variant="light">{error}</Alert>}
                    <Textarea
                        autosize
                        minRows={2}
                        maxLength={2000}
                        label={t('projects.assistant.question')}
                        placeholder={t('projects.assistant.placeholder')}
                        value={question}
                        onChange={(e) => setQuestion(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask();
                        }}
                    />
                    <Group justify="space-between">
                        {turns.length > 0
                            ? <Button variant="subtle" size="xs" onClick={() => { setTurns([]); setError(null); }}>{t('projects.assistant.clear')}</Button>
                            : <span />}
                        <Button size="xs" onClick={ask} loading={busy} disabled={!question.trim()}>{t('projects.assistant.ask')}</Button>
                    </Group>
                </Stack>
            )}
        </Paper>
    );
}

function AssistantTurn({ question, answer }) {
    const { t } = useTranslation();
    const [showCalls, setShowCalls] = useState(false);
    const calls = answer.tool_calls ?? [];
    return (
        <Stack gap={4}>
            <Text size="sm" fw={500} style={{ whiteSpace: 'pre-wrap' }}>{question}</Text>
            <SafeMarkdown text={answer.answer} data-testid="assistant-answer" />
            {answer.stopped && <Text size="xs" c="orange">{t(`projects.assistant.stopped.${answer.stopped}`, { defaultValue: t('projects.assistant.stopped.other') })}</Text>}
            {calls.length > 0 && (
                <>
                    <UnstyledButton onClick={() => setShowCalls((s) => !s)} aria-expanded={showCalls}>
                        <Text size="xs" c="dimmed">{t('projects.assistant.basis', { count: calls.length })}</Text>
                    </UnstyledButton>
                    {showCalls && (
                        <Stack gap={4}>
                            {calls.map((c, i) => (
                                <div key={i}>
                                    <Text size="xs">
                                        <Code>{c.name}</Code> {JSON.stringify(c.arguments ?? {})} {c.ok ? '' : `– ${t('projects.assistant.callFailed')}${c.error ? `: ${c.error}` : ''}`}
                                    </Text>
                                    {c.ok && c.result && <Code block style={{ maxHeight: 160, overflow: 'auto', fontSize: 11 }}>{c.result}</Code>}
                                </div>
                            ))}
                        </Stack>
                    )}
                </>
            )}
        </Stack>
    );
}
