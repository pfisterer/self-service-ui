import { useState, useCallback, useContext } from 'react';
import { createContext } from 'react';
import { Modal, Text, Button, Group } from '@mantine/core';

const ErrorModalContext = createContext({ showError: () => {} });

export function useErrorModal() {
    return useContext(ErrorModalContext);
}

export function ErrorModalProvider({ children }) {
    const [error, setError] = useState(null);

    const showError = useCallback((message) => {
        if (message) setError(String(message));
    }, []);

    return (
        <ErrorModalContext.Provider value={{ showError }}>
            {children}
            <Modal
                opened={!!error}
                onClose={() => setError(null)}
                title="Error"
                centered
                size="sm"
            >
                <Text size="sm">{error}</Text>
                <Group justify="flex-end" mt="md">
                    <Button onClick={() => setError(null)}>Close</Button>
                </Group>
            </Modal>
        </ErrorModalContext.Provider>
    );
}
