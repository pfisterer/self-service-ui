// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
// The form and the validator both speak through i18next, so the instance has to
// exist before either is used; the assertions below are its English values.
import i18n from '/i18n/index.js';
import { QuotaInputs, defaultQuota, validateQuota } from './component-quota-inputs.jsx';

const t = (key, options) => i18n.t(key, options);

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
        expect(validateQuota(t, [ipv4], { 'dhbw-ipv4': 1 })).toEqual({});
        expect(validateQuota(t, [ipv4], { 'dhbw-ipv4': 0 })).toEqual({});
    });

    // A stored limit only carries the availabilities that were set; one missing
    // is not granted, not invalid. Flagging it blocked saving a budget whose
    // tab showed nothing wrong.
    it('treats a missing availability as not granted', () => {
        expect(validateQuota(t, [ipv4], {})).toEqual({});
        expect(validateQuota(t, [ipv4], { 'dhbw-ipv4': null })).toEqual({});
    });

    it('rejects anything else on an availability', () => {
        expect(validateQuota(t, [ipv4], { 'dhbw-ipv4': 2 })['dhbw-ipv4']).toBeTruthy();
        expect(validateQuota(t, [ipv4], { 'dhbw-ipv4': -1 })['dhbw-ipv4']).toBeTruthy();
    });

    it('still range-checks a quantity', () => {
        expect(validateQuota(t, [cores], { cores: 4 })).toEqual({});
        expect(validateQuota(t, [cores], { cores: 999 }).cores).toBeTruthy();
    });
});

describe('defaultQuota', () => {
    it('defaults an availability to withheld', () => {
        expect(defaultQuota([cores, ipv4])).toEqual({ cores: 4, 'dhbw-ipv4': 0 });
    });
});

// The share line under a quantity: what the entered value takes of what the
// budget being drawn from still has free.
describe('QuotaInputs headroom', () => {
    afterEach(cleanup);

    it('states the free amount and the share the value takes', () => {
        renderForm({ headroom: { cores: 16 } });

        expect(screen.getByText(/16 free in that budget · this takes 25%/)).toBeTruthy();
    });

    it('warns when the value exceeds what is free', () => {
        renderForm({ value: { cores: 20, 'dhbw-ipv4': 0 }, headroom: { cores: 16 } });

        expect(screen.getByText(/Exceeds the 16 still free/)).toBeTruthy();
    });

    it('stays silent without headroom, and for an uncapped budget', () => {
        renderForm({ headroom: { cores: Infinity } });

        expect(screen.queryByText(/free in that budget/)).toBeNull();
        expect(screen.queryByText(/Exceeds/)).toBeNull();
    });
});
