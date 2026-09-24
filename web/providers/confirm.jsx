import { useState, useCallback, useContext, useRef, createContext } from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Imperative confirmation dialog, mirroring ErrorModalProvider. `useConfirm()`
// returns an async function: `if (await confirm({...})) { /* do it */ }`.
// One shared Modal instance for the whole app, so every destructive action gets
// the same look and behaviour without each call site rendering its own modal.
//
// Options, each falling back to a translated default (providers.confirm.*):
//   title        dialog title ("Are you sure?")
//   message      string OR a React node (for a richer body, e.g. an Alert)
//   confirmLabel red confirm button label ("Delete")
//   cancelLabel  cancel button label ("Cancel")
//   icon         confirm button icon (default trash — most confirms delete)
const ConfirmContext = createContext({ confirm: async () => false });

export function useConfirm() {
    return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({ children }) {
    const { t } = useTranslation();
    const [opts, setOpts] = useState(null);
    // Holds the pending Promise's resolve fn between opening and answering.
    const resolverRef = useRef(null);

    const confirm = useCallback((options = {}) => new Promise((resolve) => {
        resolverRef.current = resolve;
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
            <Modal
                opened={!!opts}
                onClose={() => answer(false)}
                title={opts?.title ?? t('providers.confirm.title')}
                centered
                size="md"
                // This confirm is often triggered from inside another Modal (e.g. the
                // Share-zone dialog's "Remove owner"). Mantine modals all default to
                // z-index 200, so without this the confirm renders *behind* its opener.
                // A higher z-index keeps the confirm (and its overlay) on top.
                zIndex={1000}
            >
                {opts && (
                    <Stack gap="lg">
                        {typeof opts.message === 'string' || opts.message == null
                            ? <Text size="sm">{opts.message ?? t('providers.confirm.message')}</Text>
                            : opts.message}
                        <Group justify="flex-end" gap="sm">
                            {/* Cancel is autofocused so a stray Enter never confirms a delete. */}
                            <Button variant="default" onClick={() => answer(false)} data-autofocus>
                                {opts.cancelLabel ?? t('providers.confirm.cancel')}
                            </Button>
                            <Button color="red" leftSection={opts.icon ?? <Trash2 size="16" />} onClick={() => answer(true)}>
                                {opts.confirmLabel ?? t('providers.confirm.confirm')}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </ConfirmContext.Provider>
    );
}
