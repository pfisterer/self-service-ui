// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import '/i18n/index.js';
import { StartLog, StartNotice } from '/gpu/start.jsx';

const events = [{ progress: 0, message: 'Server requested' }, { progress: 40, message: 'Pulling image registry/x:1' }];
const renderLog = (props) => render(<MantineProvider><StartLog {...props} /></MantineProvider>);

afterEach(cleanup);

// The hub's event log of a start: folded away while it runs, opened by a click; open from the start when the start failed.
describe('StartLog', () => {
    it('is folded until asked for', () => {
        renderLog({ events, open: false });
        const toggle = screen.getByText(/Protokoll anzeigen|Show log/);
        fireEvent.click(toggle);
        expect(screen.getByText(/Pulling image registry\/x:1/)).toBeTruthy();
        expect(screen.getByText(/Protokoll ausblenden|Hide log/)).toBeTruthy();
    });
    it('is open when the start failed', () => {
        renderLog({ events, open: true });
        expect(screen.getByText(/Protokoll ausblenden|Hide log/)).toBeTruthy();
        expect(screen.getByText(/Server requested/)).toBeTruthy();
    });
    it('says when there is nothing yet', () => {
        renderLog({ events: [], open: true });
        expect(screen.getByText(/Noch keine Meldungen|No messages yet/)).toBeTruthy();
    });
});

// The hub's note on how the server ended last time (an eviction): shown above the log, without its prefix; nothing without one.
describe('StartNotice', () => {
    it('shows the hub\'s note on the last end', () => {
        render(<MantineProvider><StartNotice events={[...events, { progress: 0, message: 'Hinweis: Der Workspace wurde beendet: der lokale Speicher war voll.' }]} /></MantineProvider>);
        expect(screen.getByText(/Hinweis zum letzten Lauf|About the last run/)).toBeTruthy();
        expect(screen.getByText('Der Workspace wurde beendet: der lokale Speicher war voll.')).toBeTruthy();
    });
    it('shows nothing without one', () => {
        render(<MantineProvider><StartNotice events={events} /></MantineProvider>);
        expect(screen.queryByText(/Hinweis zum letzten Lauf|About the last run/)).toBeNull();
    });
});
