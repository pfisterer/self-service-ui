// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import { QuotaInputs, defaultQuota, validateQuota } from './component-quota-inputs.jsx';

// The form is where the two kinds have to look different, because the values do
// not: 1 is "one core" in one row and "granted" in the next.

const cores = { id: 'cores', name: 'Cores', group: 'Compute', min: 1, max: 64, default: 4 };
// min and max are 0 because that is what the API sends: ManagedProject carries
// them as plain ints with no omitempty, so an availability — which has no bounds
// to speak of — arrives as min:0, max:0. A fixture that left them out would let
// the generic range check pass by accident (1 > undefined is false) and prove
// nothing about the branch that handles this.
const ipv4 = { id: 'dhbw-ipv4', name: 'DHBW IPv4', kind: 'bool', group: 'Networks', min: 0, max: 0 };

function renderForm(props) {
    return render(
        <MantineProvider>
            <QuotaInputs resources={[cores, ipv4]} value={{ cores: 4, 'dhbw-ipv4': 0 }} onChange={() => {}} {...props} />
        </MantineProvider>,
    );
}

describe('QuotaInputs', () => {
    afterEach(cleanup);

    it('gives an availability a switch, not a number field', () => {
        const { container } = renderForm();

        const switches = container.querySelectorAll('input[type="checkbox"]');
        const numbers = container.querySelectorAll('input[inputmode="decimal"], input[type="text"][role="textbox"]');

        expect(switches.length).toBeGreaterThan(0);
        // The quantity keeps its own field; the availability must not have added
        // a second one.
        expect(screen.getByLabelText(/Cores/)).toBeTruthy();
        expect(numbers.length).toBeLessThanOrEqual(1);
    });

    it('reports 1 and 0 rather than true and false', () => {
        const seen = [];
        renderForm({ onChange: (id, v) => seen.push([id, v]) });

        fireEvent.click(screen.getByLabelText('DHBW IPv4'));

        expect(seen).toEqual([['dhbw-ipv4', 1]]);
    });

    it('shows the group headings', () => {
        renderForm();

        expect(screen.getByText('Compute')).toBeTruthy();
        expect(screen.getByText('Networks')).toBeTruthy();
    });

    // The root of the tree sees the whole catalogue; a delegated budget sees a
    // handful. The filter appears where it earns its place.
    it('offers no filter for a short list', () => {
        renderForm();

        expect(screen.queryByLabelText('Filter resources')).toBeNull();
    });

    it('offers a filter once the catalogue is long', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({
            id: `gpu-${i}`, name: `GPU ${i}`, kind: 'bool', group: 'GPU flavours',
        }));
        render(
            <MantineProvider>
                <QuotaInputs resources={many} value={{}} onChange={() => {}} />
            </MantineProvider>,
        );

        const filter = screen.getByLabelText('Filter resources');
        fireEvent.change(filter, { target: { value: 'gpu-11' } });

        expect(screen.getByText('GPU 11')).toBeTruthy();
        expect(screen.queryByText('GPU 12')).toBeNull();
    });
});

describe('validateQuota', () => {
    // The generic range check would read min:0, max:0 off an availability and
    // call every granted one invalid — the form would refuse to submit a value
    // the API accepts.
    it('accepts a granted availability although it has no bounds', () => {
        expect(validateQuota([ipv4], { 'dhbw-ipv4': 1 })).toEqual({});
        expect(validateQuota([ipv4], { 'dhbw-ipv4': 0 })).toEqual({});
    });

    it('rejects anything else on an availability', () => {
        expect(validateQuota([ipv4], { 'dhbw-ipv4': 2 })['dhbw-ipv4']).toBeTruthy();
        expect(validateQuota([ipv4], { 'dhbw-ipv4': -1 })['dhbw-ipv4']).toBeTruthy();
    });

    it('still range-checks a quantity', () => {
        expect(validateQuota([cores], { cores: 4 })).toEqual({});
        expect(validateQuota([cores], { cores: 999 }).cores).toBeTruthy();
    });
});

describe('defaultQuota', () => {
    it('defaults an availability to withheld', () => {
        expect(defaultQuota([cores, ipv4])).toEqual({ cores: 4, 'dhbw-ipv4': 0 });
    });
});
