// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import i18n from '/i18n/index.js';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { AssistantPanel } from './component-assistant.jsx';

// The assistant panel: there only where /v1/config says the assistant is set up; a question goes out with the earlier turns, the answer is shown as plain text with the queries it rests on.

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});

beforeAll(async () => {
    await i18n.changeLanguage('de');
});

afterEach(() => {
    cleanup();
    delete globalThis.__testApi;
});

describe('AssistantPanel', () => {
    it('is not shown while the assistant is not set up', () => {
        globalThis.__testApi = {};
        renderView(<AssistantPanel />, { config: { resources: [] } });
        expect(screen.queryByText('Assistent')).toBeNull();
    });

    it('asks, shows the answer as text and the queries behind it, and sends the history along', async () => {
        const askAssistant = vi.fn()
            .mockResolvedValueOnce({ answer: 'Ein Projekt: <b>Kurs R</b>', tool_calls: [{ name: 'list_my_projects', arguments: {}, ok: true, result: '{"total":1}' }], stage: 'read_only' })
            .mockResolvedValueOnce({ answer: 'Es endet am 10.12.2026.', tool_calls: [], stopped: 'steps', stage: 'read_only' });
        globalThis.__testApi = { askAssistant };
        renderView(<AssistantPanel />, { config: { resources: [], assistant: 'read_only' } });

        fireEvent.click(screen.getByText('Assistent'));
        fireEvent.change(screen.getByLabelText('Frage'), { target: { value: 'Welche Projekte habe ich?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));

        // Plain text: markup in an answer is shown, not rendered.
        await waitFor(() => expect(screen.getByTestId('assistant-answer').textContent).toBe('Ein Projekt: <b>Kurs R</b>'));
        expect(askAssistant).toHaveBeenCalledWith({ question: 'Welche Projekte habe ich?', history: [] });
        fireEvent.click(screen.getByText('Grundlage: 1 Abfrage'));
        expect(screen.getByText('list_my_projects')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Frage'), { target: { value: 'Wann endet es?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));
        await waitFor(() => expect(screen.getByText('Es endet am 10.12.2026.')).toBeTruthy());
        expect(askAssistant).toHaveBeenLastCalledWith({
            question: 'Wann endet es?',
            history: [{ role: 'user', content: 'Welche Projekte habe ich?' }, { role: 'assistant', content: 'Ein Projekt: <b>Kurs R</b>' }],
        });
        expect(screen.getByText(/Höchstzahl an Schritten/)).toBeTruthy();
    });

    it('shows the service\'s error', async () => {
        globalThis.__testApi = { askAssistant: vi.fn().mockRejectedValue(new Error('Für diese Stunde sind alle Fragen an den Assistenten verbraucht.')) };
        renderView(<AssistantPanel />, { config: { resources: [], assistant: 'read_only' } });
        fireEvent.click(screen.getByText('Assistent'));
        fireEvent.change(screen.getByLabelText('Frage'), { target: { value: 'Hallo' } });
        fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));
        await waitFor(() => expect(screen.getByText(/alle Fragen an den Assistenten verbraucht/)).toBeTruthy());
    });
});
