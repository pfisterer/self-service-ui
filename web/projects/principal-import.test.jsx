// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
import { PrincipalImportModal } from './modal-principal-import.jsx';

// The whole path from pasted text to what the form receives: the preview has to
// leave out what is already on the list, and a role the input does not name has
// to be chosen before anything is handed over.

function renderModal(props) {
    return renderView(<PrincipalImportModal onClose={() => {}} onImport={() => {}} {...props} />);
}

const paste = (text) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
};

describe('PrincipalImportModal', () => {
    afterEach(cleanup);

    it('imports only once every entry that cannot be added is removed', () => {
        const onImport = vi.fn();
        renderModal({ onImport, existing: ['user:b@dhbw.de'] });

        paste('A <a@dhbw.de>; b@dhbw.de; group:wwi23seb; kaputt; a@dhbw.de');
        const submit = screen.getByRole('button', { name: 'Add 2 Entries' });
        expect(submit.disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Remove 3 Entries That Cannot Be Added' }));
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);

        expect(onImport).toHaveBeenCalledWith([{ token: 'user:a@dhbw.de' }, { token: 'group:wwi23seb' }]);
    });

    it('removes single rows, and the duplicate of a removed row becomes new', () => {
        const onImport = vi.fn();
        renderModal({ onImport });

        paste('a@dhbw.de\nb@dhbw.de\na@dhbw.de');
        fireEvent.click(screen.getAllByRole('button', { name: 'Remove user:a@dhbw.de' })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Add 2 Entries' }));

        expect(onImport).toHaveBeenCalledWith([{ token: 'user:b@dhbw.de' }, { token: 'user:a@dhbw.de' }]);
    });

    it('takes roles from the CSV and holds back rows without one', () => {
        const onImport = vi.fn();
        renderModal({ onImport, roles: ['member', 'reader'] });

        paste('E-Mail;Rolle\na@dhbw.de;Reader\nb@dhbw.de;Dozent');
        const submit = screen.getByRole('button', { name: 'Add 2 Entries' });
        expect(submit.disabled).toBe(true);

        expect(screen.queryByText('“Dozent” is not a known role')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Only Rows without a Role' }));
        // Once the row has a role, the complaint about the file's value is moot.
        expect(screen.queryByText('“Dozent” is not a known role')).toBeNull();
        fireEvent.click(submit);

        expect(onImport).toHaveBeenCalledWith([
            { token: 'user:a@dhbw.de', role: 'reader' },
            { token: 'user:b@dhbw.de', role: 'member' },
        ]);
    });
});
