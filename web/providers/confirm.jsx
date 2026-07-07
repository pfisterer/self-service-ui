import { useState, useCallback, useContext, useRef, createContext } from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { Trash2 } from 'lucide-react';

// Imperative confirmation dialog, mirroring ErrorModalProvider. `useConfirm()`
// returns an async function: `if (await confirm({...})) { /* do it */ }`.
// One shared Modal instance for the whole app, so every destructive action gets
// the same look and behaviour without each call site rendering its own modal.
//
// Options:
//   title        dialog title (default "Are you sure?")
//   message      string OR a React node (for a richer body, e.g. an Alert)
//   confirmLabel red confirm button label (default "Delete")
//   cancelLabel  cancel button label (default "Cancel")
const ConfirmContext = createContext({ confirm: async () => false });

export function useConfirm() {
    return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({ children }) {
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
                title={opts?.title ?? 'Are you sure?'}
                centered
                size="md"
            >
                {opts && (
                    <Stack gap="lg">
                        {typeof opts.message === 'string' || opts.message == null
                            ? <Text size="sm">{opts.message ?? 'This action cannot be undone.'}</Text>
                            : opts.message}
                        <Group justify="flex-end" gap="sm">
                            {/* Cancel is autofocused so a stray Enter never confirms a delete. */}
                            <Button variant="default" onClick={() => answer(false)} data-autofocus>
                                {opts.cancelLabel ?? 'Cancel'}
                            </Button>
                            <Button color="red" leftSection={<Trash2 size="16" />} onClick={() => answer(true)}>
                                {opts.confirmLabel ?? 'Delete'}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </ConfirmContext.Provider>
    );
}
