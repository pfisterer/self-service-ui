// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
import { PrincipalTokenAutocomplete } from './principal-token-autocomplete.jsx';

// The two modes differ only in what happens after a pick: a list hands the
// token on and empties the field, a single-token form keeps it as the value.

const search = vi.fn(async () => [
    { token: 'group:wwi23seb', description: 'Kurs WWI23SEB' },
    { token: 'user:student@dhbw.de', description: null },
]);

function Harness({ single, onSelect }) {
    const [value, setValue] = useState('');
    return (
        <>
            <PrincipalTokenAutocomplete single={single} value={value} onChange={setValue} onSelect={onSelect}
                search={search} searchKey={['test', 'principals']} />
            <output data-testid="value">{value}</output>
        </>
    );
}

async function pick(text, option) {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
    // By text: in jsdom the dropdown counts as hidden, which findByRole skips.
    fireEvent.click(await screen.findByText(option));
}

describe('PrincipalTokenAutocomplete', () => {
    afterEach(cleanup);

    it('single: the picked token stays in the field', async () => {
        renderView(<Harness single />);
        await pick('wwi', 'group:wwi23seb');
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('group:wwi23seb'));
        expect(screen.getByRole('combobox').value).toBe('group:wwi23seb');
    });

    it('list: the picked token is handed on and the field emptied', async () => {
        const onSelect = vi.fn();
        renderView(<Harness onSelect={onSelect} />);
        await pick('stud', 'user:student@dhbw.de');
        expect(onSelect).toHaveBeenCalledWith('user:student@dhbw.de');
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe(''));
    });

    it('shows the description under a group', async () => {
        renderView(<Harness single />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'wwi' } });
        expect(await screen.findByText('Kurs WWI23SEB')).toBeTruthy();
    });

    it('searches only from 3 characters, with a hint below that, and asks for at most 10', async () => {
        search.mockClear();
        function Wide() {
            const [value, setValue] = useState('');
            return <PrincipalTokenAutocomplete value={value} onChange={setValue} limit={50} search={search} searchKey={['test', 'short']} />;
        }
        renderView(<Wide />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ww' } });
        expect(await screen.findByText('Enter at least 3 characters.')).toBeTruthy();
        expect(search).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'wwi' } });
        await waitFor(() => expect(search).toHaveBeenCalledWith('wwi', 10));
        expect(screen.queryByText('Enter at least 3 characters.')).toBeNull();
    });
});
