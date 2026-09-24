import { useState, useCallback, useContext } from 'react';
import { createContext } from 'react';
import { Modal, Text, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const ErrorModalContext = createContext({ showError: () => {} });

export function useErrorModal() {
    return useContext(ErrorModalContext);
}

export function ErrorModalProvider({ children }) {
    const { t } = useTranslation();
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
                title={t('providers.errorModal.title')}
                centered
                size="sm"
                // Sit above any other open modal (e.g. an edit dialog whose save failed),
                // otherwise the error renders behind it and looks like nothing happened.
                zIndex={1000}
            >
                <Text size="sm">{error}</Text>
                <Group justify="flex-end" mt="md">
                    <Button onClick={() => setError(null)}>{t('providers.errorModal.close')}</Button>
                </Group>
            </Modal>
        </ErrorModalContext.Provider>
    );
}
