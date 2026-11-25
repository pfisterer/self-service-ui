// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import '/test/jsdom-stubs.js';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { MemberSummary } from './component-common.jsx';
import { nodeExtraTabs, TAB_HISTORY } from './modal-inspect.jsx';

// A project's member gets it from the API without the other members (viewer_relation member, members_hidden): the portal shows a count, no list and no history.
describe('member view of a project', () => {
    afterEach(cleanup);

    const project = { id: 'p1', kind: 'project', status: 'approved', owner: 'user:owner@example.org', limit: {} };
    const member = { ...project, viewer_relation: 'member', authorized_users: [{ token: 'user:student@example.org', role: 'member' }], members_hidden: 23 };

    it('counts the others instead of naming them', () => {
        renderView(<MemberSummary node={member} />);
        expect(screen.getByText(i18n.t('projects.memberView.others', { count: 23 }))).toBeTruthy();
        expect(screen.queryByText(/student@example.org/)).toBeNull();
    });

    it('says when nobody else has access', () => {
        renderView(<MemberSummary node={{ ...member, members_hidden: undefined }} />);
        expect(screen.getByText(i18n.t('projects.memberView.alone'))).toBeTruthy();
    });

    it('has no history tab for a member, but one for whoever sees it in full', () => {
        const t = i18n.t.bind(i18n);
        expect(nodeExtraTabs(t, member, [], null).map(tab => tab.value)).not.toContain(TAB_HISTORY);
        expect(nodeExtraTabs(t, { ...project, viewer_relation: 'owner' }, [], null).map(tab => tab.value)).toContain(TAB_HISTORY);
    });
});
