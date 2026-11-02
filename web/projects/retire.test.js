// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '/test/jsdom-stubs.js';
import i18n from '/i18n/index.js';
import { releaseConsequences } from './modal-retire.jsx';
import { statusLabel } from './util-project.jsx';

const t = (key, opts) => i18n.t(key, { lng: 'de', ...opts });
const afterGrace = { archive: true, delete: 'after-grace', deleteGraceDays: 30, aiaasDeleteGraceDays: 30, chargeReleased: true, chargeArchived: false };

describe('releaseConsequences', () => {
    it('says the project ends now and names one day for everything it holds', () => {
        const out = releaseConsequences(t, 'de', afterGrace, { cloud: true, lab: true, llm: true });
        expect(out[0]).toBe(t('projects.retire.endsNow'));
        expect(out).toContain(t('projects.retire.deletedAfter', { count: 30, what: `${t('projects.retire.what.cloud')}, ${t('projects.retire.what.workspaces')} und ${t('projects.retire.what.llm')}` }));
        expect(out).toContain(t('projects.retire.chargeNothing'));
    });

    it('keeps a project without OpenStack in its budget until it is gone for good', () => {
        const out = releaseConsequences(t, 'de', afterGrace, { cloud: false, lab: false, llm: true });
        expect(out).toContain(t('projects.retire.endsKeys'));
        expect(out).toContain(t('projects.retire.chargeUntilGone'));
        expect(out.some(s => s.includes('OpenStack'))).toBe(false);
    });

    it('tells each part apart when only some go by themselves', () => {
        const out = releaseConsequences(t, 'de', { ...afterGrace, delete: 'on-request' }, { cloud: true, lab: true, llm: false });
        expect(out).toContain(t('projects.retire.keptOnRequest', { what: t('projects.retire.what.cloud') }));
        expect(out).toContain(t('projects.retire.partDeletedAfter', { count: 30, what: t('projects.retire.what.workspaces') }));
    });
});

describe('statusLabel', () => {
    it('dates a retired project, and only a retired one', () => {
        expect(statusLabel(t, 'released', false, '2026-12-01T00:00:00Z')).toContain('2026');
        expect(statusLabel(t, 'released')).toBe(t('projects.status.released.label'));
        expect(statusLabel(t, 'approved', false, '2026-12-01T00:00:00Z')).toBe(t('projects.status.approved.label'));
    });
});
