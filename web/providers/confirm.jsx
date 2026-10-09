import { useState, useCallback, useContext, useRef, createContext } from 'react';
import { Modal, Text, Button, Group, List, Stack, TextInput } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

// The one confirmation dialog of the app. Two ways to use it:
//
//  - `useConfirm()` returns an async function for a plain yes/no:
//    `if (await confirm({...})) { /* do it */ }`. One shared instance.
//  - `<ConfirmModal>` for a confirmation that runs its action itself and shows
//    progress and errors in place (releasing a project, withdrawing a catalogue
//    entry), with extra content as children.
//
// Both look the same, so every "are you sure" in the app reads alike:
//   title         the question ("Delete budget “X”?")
//   message       string OR a React node
//   consequences  list of sentences: what will happen
//   severity      'danger' (red, trash icon — default), 'warning' (orange) or
//                 'neutral' (plain button, for undoing something harmless)
//   typeToConfirm a name the person has to type first — for what cannot be undone
//   confirmLabel / cancelLabel / icon
const SEVERITY = {
    danger: { color: 'red', icon: <Trash2 size="16" /> },
    warning: { color: 'orange', icon: null },
    neutral: { color: undefined, icon: null },
};

export function ConfirmModal({
    opened, onCancel, onConfirm, title, message, consequences, severity = 'danger',
    typeToConfirm, confirmLabel, cancelLabel, icon, busy = false, error, confirmDisabled = false,
    children,
}) {
    const { t } = useTranslation();
    const [typed, setTyped] = useState('');
    const style = SEVERITY[severity] ?? SEVERITY.danger;
    const typedOk = !typeToConfirm || typed.trim() === typeToConfirm;

    return (
        <Modal
            opened={opened}
            onClose={onCancel}
            title={title ?? t('providers.confirm.title')}
            centered
            size="md"
            // Often opened from inside another dialog; Mantine modals all
            // default to z-index 200, so without this it renders behind it.
            zIndex={1000}
        >
            <Stack gap="md">
                {/* Without a message of its own and without consequences to list,
                    the default warning; consequences say more than it does. */}
                {message == null
                    ? (!consequences?.length && <Text size="sm">{t('providers.confirm.message')}</Text>)
                    : typeof message === 'string' ? <Text size="sm">{message}</Text> : message}
                {consequences?.length > 0 && (
                    <List size="sm" spacing={4}>
                        {consequences.map(c => <List.Item key={c}>{c}</List.Item>)}
                    </List>
                )}
                {children}
                {typeToConfirm && (
                    <TextInput
                        label={<Trans i18nKey="providers.confirm.typeName" values={{ name: typeToConfirm }}
                            components={{ 1: <Text span ff="monospace" fw={700} size="sm" /> }} />}
                        value={typed}
                        autoComplete="off"
                        data-autofocus
                        onChange={(e) => setTyped(e.currentTarget.value)}
                    />
                )}
                {error && <Text c="red" size="sm">{error}</Text>}
                <Group justify="flex-end" gap="sm">
                    {/* Cancel is focused unless a name has to be typed, so a
                        stray Enter never confirms. */}
                    <Button variant="default" onClick={onCancel} data-autofocus={!typeToConfirm || undefined}>
                        {cancelLabel ?? t('providers.confirm.cancel')}
                    </Button>
                    <Button color={style.color} leftSection={icon ?? style.icon} loading={busy}
                        disabled={!typedOk || confirmDisabled} onClick={onConfirm}>
                        {confirmLabel ?? t('providers.confirm.confirm')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

const ConfirmContext = createContext({ confirm: async () => false });

export function useConfirm() {
    return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({ children }) {
    const [opts, setOpts] = useState(null);
    // Holds the pending Promise's resolve fn between opening and answering.
    const resolverRef = useRef(null);
    // A new key per question, so a typed name never carries over.
    const [round, setRound] = useState(0);

    const confirm = useCallback((options = {}) => new Promise((resolve) => {
        resolverRef.current = resolve;
        setRound(r => r + 1);
        setOpts(options);
    }), []);

    const answer = useCallback((result) => {
        setOpts(null);
        const resolve = resolverRef.current;
        resolverRef.current = null;
        resolve?.(result);
    }, []);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <ConfirmModal key={round} opened={!!opts} {...(opts || {})}
                onCancel={() => answer(false)} onConfirm={() => answer(true)} />
        </ConfirmContext.Provider>
    );
}
