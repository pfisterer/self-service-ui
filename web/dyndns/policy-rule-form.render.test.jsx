// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

    it('accepts %l with any filter, groups and several domains included', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        type('dyndns.ruleForm.zoneLabel', '%l.users.dhbw.site');
        type('dyndns.ruleForm.soaLabel', 'users.dhbw.site');
        for (const filter of ['*@dhbw.de, *@cas.dhbw.de', 'group:wwi23seb#studierende', 'group:wwi23seb, *@dhbw.de']) {
            type('dyndns.ruleForm.userFilterLabel', filter);
            expect(screen.queryByText(i18n.t('dyndns.validation.userFilter'))).toBeNull();
            expect(submit().disabled).toBe(false);
        }
    });
});

describe('rule form: groups in the user filter', () => {
    const search = vi.fn(async () => [
        { token: 'group:wwi23seb#studierende', label: 'WWI23SEB', description: 'Kurs' },
        { token: 'user:student@dhbw.de' },
    ]);

    it('marks a malformed token and accepts a mix of addresses and groups', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        type('dyndns.ruleForm.zoneLabel', '%u.users.dhbw.site');
        type('dyndns.ruleForm.soaLabel', 'users.dhbw.site');
        type('dyndns.ruleForm.userFilterLabel', '*@dhbw.de, group:bad id');
        expect(screen.getByText(i18n.t('dyndns.validation.userFilter'))).toBeTruthy();
        expect(submit().disabled).toBe(true);
        type('dyndns.ruleForm.userFilterLabel', '*@dhbw.de, group:wwi23seb, user:max@dhbw.de');
        expect(screen.queryByText(i18n.t('dyndns.validation.userFilter'))).toBeNull();
        expect(submit().disabled).toBe(false);
    });

    it('adds a group picked from the directory to what was typed', async () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} principalSearch={search} />);
        type('dyndns.ruleForm.userFilterLabel', '*@dhbw.de');
        fireEvent.change(screen.getByPlaceholderText(i18n.t('dyndns.userFilter.pickPlaceholder')), { target: { value: 'wwi' } });
        fireEvent.click(await screen.findByText('group:wwi23seb#studierende'));
        await waitFor(() => expect(screen.getByLabelText(i18n.t('dyndns.ruleForm.userFilterLabel'), { exact: false }).value).toBe('*@dhbw.de, group:wwi23seb#studierende'));
    });

    it('without a directory says how to type a group', () => {
        renderView(<RuleFormModal ruleToEdit={null} isSuperAdmin={true} onFormSuccess={() => {}} onClose={() => {}} />);
        expect(screen.getByText(i18n.t('dyndns.userFilter.noDirectory'))).toBeTruthy();
        expect(screen.queryByPlaceholderText(i18n.t('dyndns.userFilter.pickPlaceholder'))).toBeNull();
    });

    it('the rule table shows one entry per item, a user token by its address', () => {
        const rule = { id: 1, zone_pattern: '%l.kurs.dhbw.site', zone_soa: 'kurs.dhbw.site', target_user_filter: 'group:wwi23seb#studierende, user:max@dhbw.de, *@dhbw.de', allow_subdomains: false, sharing_allowed: false };
        renderView(<RuleList rules={[rule]} isSuperAdmin={false} onEdit={() => {}} />);
        const entries = screen.getByTestId('filter-entries');
        expect(entries.textContent).toContain('group:wwi23seb#studierende');
        expect(entries.textContent).toContain('max@dhbw.de');
        expect(entries.textContent).not.toContain('user:max');
        expect(entries.textContent).toContain('*@dhbw.de');
    });

    it('the help text names the group forms, in German and English', () => {
        expect(i18n.getFixedT('de')('dyndns.ruleForm.userFilterDescription')).toContain('group:wwi23seb#studierende');
        expect(i18n.getFixedT('en')('dyndns.ruleForm.userFilterDescription')).toContain('group:wwi23seb#studierende');
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
