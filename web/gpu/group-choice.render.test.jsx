// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// The members' side of the group choice: the groups of a project with their places, one's own with its members, and joining, binding and asked first; there is no leaving.
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});

const { GroupChoices } = await import('/gpu/group-choice.jsx');

const PROJECTS = [
    { slug: 'kurs', name: 'Kurs ML', role: 'member', group_seats: [
        { id: '0000aaaa', name: 'gruppe-1', count: 2, max: 2, mine: false },
        { id: '0000bbbb', name: 'gruppe-2', count: 2, max: 2, mine: true, members: ['user:me@dhbw.de', 'user:x@dhbw.de'] },
        { id: '0000cccc', name: 'gruppe-3', count: 0, max: 2, mine: false },
    ] },
    { slug: 'frei', name: 'Freie Wahl', role: 'reader', group_seats: [{ id: '0000dddd', name: 'team-a', count: 3, max: 0, mine: false }] },
    { slug: 'leitung', name: 'Geleitet', role: 'manager', group_seats: [{ id: '0000eeee', name: 'nicht-hier', count: 0, max: 0, mine: false }] },
    { slug: 'zu', name: 'Geschlossen', role: 'member' },
];

beforeEach(() => {
    globalThis.__gpuApi = { joinGroup: vi.fn(async () => ({ group_seats: [] })) };
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('the group choice for members', () => {
    it('shows the open choices with places, the own group with its members, and joins and leaves', async () => {
        renderView(<GroupChoices projects={PROJECTS} />);
        expect(screen.getByText(/Kurs ML/)).toBeTruthy();
        expect(screen.getByText(/Freie Wahl/)).toBeTruthy();
        // A project the person manages, and one without an open choice, are not here.
        expect(screen.queryByText('nicht-hier')).toBeNull();
        expect(screen.queryByText(/Geschlossen/)).toBeNull();
        expect(screen.getByText(/(Eigene Gruppe|Own group)/)).toBeTruthy();
        expect(screen.getByText(/me@dhbw.de, x@dhbw.de/)).toBeTruthy();
        expect(screen.getAllByText(/2 (von|of) 2/).length).toBe(2);
        expect(screen.getByText(/^3 (Personen|people)$/)).toBeTruthy();
        // In a group already: the others cannot be joined before leaving it.
        const joins = screen.getAllByRole('button', { name: /^(Beitreten|Join)$/ });
        expect(joins.slice(0, 2).every(b => b.disabled)).toBe(true);
        expect(screen.queryByRole('button', { name: /^(Verlassen|Leave)$/ })).toBeNull();
        expect(screen.getAllByText(/(Die Wahl ist verbindlich|The choice is binding)/).length).toBe(2);
        // In the other project, nothing is chosen yet: join, after confirming; cancelling joins nothing.
        fireEvent.click(joins[2]);
        let dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/(Gruppe team-a beitreten|Join Group team-a)/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Abbrechen|Cancel)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(globalThis.__gpuApi.joinGroup).not.toHaveBeenCalled();
        fireEvent.click(joins[2]);
        dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/(nur durch die Verwaltenden|only the project’s managers)/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Beitreten|Join)$/ }));
        await waitFor(() => expect(globalThis.__gpuApi.joinGroup).toHaveBeenCalledWith('frei', '0000dddd'));
    });

    it('says why a join was refused', async () => {
        globalThis.__gpuApi.joinGroup = async () => { throw new Error('Gruppe „gruppe-3“ ist voll (2 Plätze).'); };
        renderView(<GroupChoices projects={[{ ...PROJECTS[0], group_seats: PROJECTS[0].group_seats.map(s => ({ ...s, mine: false })) }]} />);
        fireEvent.click(screen.getAllByRole('button', { name: /^(Beitreten|Join)$/ })[2]);
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^(Beitreten|Join)$/ }));
        expect(await screen.findByText(/ist voll/)).toBeTruthy();
    });
});
