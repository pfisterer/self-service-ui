// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { RuleFormModal, RuleList } from '/dyndns/policy.jsx';

afterEach(cleanup);

function type(label, value) {
    fireEvent.change(screen.getByLabelText(i18n.t(label), { exact: false }), { target: { value } });
}

function submit() {
    return screen.getByRole('button', { name: i18n.t('dyndns.ruleForm.create') });
}

describe('rule form: the placeholders %u and %l', () => {
    it('explains both placeholders with an example, in German and English', () => {
        for (const lng of ['de', 'en']) {
            const help = i18n.getFixedT(lng)('dyndns.ruleForm.zoneDescription');
            expect(help).toContain('%u');
            expect(help).toContain('%l');
            expect(help).toContain('s252690-stma.users.dhbw.site');
        }
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        expect(screen.getByText(i18n.t('dyndns.ruleForm.zoneDescription'))).toBeTruthy();
    });

    it('refuses %l on a filter for several domains and accepts it for one', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        type('dyndns.ruleForm.zoneLabel', '%l.users.dhbw.site');
        type('dyndns.ruleForm.soaLabel', 'users.dhbw.site');
        type('dyndns.ruleForm.userFilterLabel', '*@dhbw.de, *@cas.dhbw.de');
        expect(screen.getByText(i18n.t('dyndns.ruleForm.localPartNeedsSingleDomain'))).toBeTruthy();
        expect(submit().disabled).toBe(true);

        type('dyndns.ruleForm.userFilterLabel', '*@cas.dhbw.de');
        expect(screen.queryByText(i18n.t('dyndns.ruleForm.localPartNeedsSingleDomain'))).toBeNull();
        expect(submit().disabled).toBe(false);
    });

    it('leaves %u rules for several domains alone', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        type('dyndns.ruleForm.zoneLabel', '%u.users.dhbw.site');
        type('dyndns.ruleForm.soaLabel', 'users.dhbw.site');
        type('dyndns.ruleForm.userFilterLabel', '*@dhbw.de, *@cas.dhbw.de');
        expect(screen.queryByText(i18n.t('dyndns.ruleForm.localPartNeedsSingleDomain'))).toBeNull();
        expect(submit().disabled).toBe(false);
    });
});

describe('deprecated rules', () => {
    const rule = (id, deprecated) => ({ id, zone_pattern: `%u${id}.users.dhbw.site`, zone_soa: 'users.dhbw.site', target_user_filter: '*@dhbw.de', allow_subdomains: true, sharing_allowed: false, deprecated });

    it('the form has a switch with a help text, off for a new rule and on for a deprecated one', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        const toggle = screen.getByRole('switch');
        expect(toggle.checked).toBe(false);
        expect(screen.getByText(i18n.t('dyndns.ruleForm.deprecatedDescription'))).toBeTruthy();
        fireEvent.click(toggle);
        expect(toggle.checked).toBe(true);
        cleanup();

        renderView(<RuleFormModal ruleToEdit={rule(1, true)} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        expect(screen.getByRole('switch').checked).toBe(true);
    });

    it('the rule table marks only deprecated rules', () => {
        renderView(<RuleList rules={[rule(1, true), rule(2, false)]} isSuperAdmin={true} onEdit={() => {}} />);
        expect(screen.getAllByText(i18n.t('dyndns.policy.deprecatedBadge'))).toHaveLength(1);
        expect(screen.getByText(i18n.t('dyndns.policy.deprecatedBadge')).closest('tr').textContent).toContain('%u1.users.dhbw.site');
    });

    it('the help text says what happens, in German and English', () => {
        expect(i18n.getFixedT('de')('dyndns.ruleForm.deprecatedDescription')).toContain('neue werden nicht mehr angeboten');
        expect(i18n.getFixedT('en')('dyndns.ruleForm.deprecatedDescription')).toContain('new ones are no longer offered');
    });
});
