// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { SubzoneModal } from '/dyndns/zones.jsx';

afterEach(cleanup);

const parent = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';

function type(value) {
    fireEvent.change(screen.getByLabelText(i18n.t('dyndns.subzone.labelField')), { target: { value } });
}

describe('creating a subzone (todo d3)', () => {
    it('allows a long subzone: a wildcard certificate without commonName works for it', () => {
        renderView(<SubzoneModal parent={parent} onClose={() => {}} onCreated={() => {}} />);
        type('data-eng-wdski24a-longer');
        expect(screen.getByRole('button', { name: i18n.t('dyndns.subzone.submit') }).disabled).toBe(false);
    });

    it('blocks a label over 63 characters', () => {
        renderView(<SubzoneModal parent={parent} onClose={() => {}} onCreated={() => {}} />);
        type('a'.repeat(64));
        expect(screen.getByText(i18n.t('helper.dnsValidation.labelTooLong', { length: 64 }))).toBeTruthy();
        expect(screen.getByRole('button', { name: i18n.t('dyndns.subzone.submit') }).disabled).toBe(true);
    });
});
