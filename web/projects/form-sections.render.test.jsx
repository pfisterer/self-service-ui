// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// FormSections, the navigation of the project dialog: groups with their entries on the left, the active entry's content on the right, every content mounted.

const { FormSections } = await import('/projects/component-form-modal.jsx');

function Sections({ errorIn = null, initial = 'details' }) {
    const [value, setValue] = useState(initial);
    return (
        <>
            <FormSections value={value} onChange={setValue} header={<span>the header</span>} groups={[
                { key: 'project', label: 'Projekt', items: [
                    { value: 'details', label: 'Details', hasError: errorIn === 'details', content: <p>details content</p> },
                    { value: 'members', label: 'Mitglieder', changed: true, content: <p>members content</p> },
                ] },
                { key: 'quotas', label: 'Kontingente', mark: 'approval', items: [{ value: 'resources', label: 'Ressourcen', content: <p>quota content</p> }] },
                { key: 'workspaces', label: 'Workspaces', mark: 'instant', items: [] },
            ]} />
            {/* What a dialog's submit does with a failed field: jump to its entry. */}
            <button type="button" onClick={() => errorIn && setValue(errorIn)}>submit</button>
        </>
    );
}

afterEach(() => cleanup());

describe('FormSections', () => {
    it('shows the groups with their entries and the header, an empty group not at all', () => {
        renderView(<Sections />);
        expect(screen.getByText('the header')).toBeTruthy();
        expect(screen.getByText('Projekt')).toBeTruthy();
        expect(screen.getByText('Kontingente')).toBeTruthy();
        expect(screen.queryByText('Workspaces')).toBeNull();
        expect(screen.getAllByRole('tab').map(x => x.textContent)).toEqual(['Details', 'Mitglieder', 'Ressourcen']);
        // The group's mark says how its changes take effect.
        expect(screen.getByLabelText(i18n.t('formSections.markApproval'))).toBeTruthy();
    });

    it('switches the content and keeps the others mounted', () => {
        renderView(<Sections />);
        expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('details content')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: 'Ressourcen' }));
        expect(screen.getByRole('tab', { name: 'Ressourcen' }).getAttribute('aria-selected')).toBe('true');
        const panels = screen.getAllByRole('tabpanel', { hidden: true });
        expect(panels).toHaveLength(3);
        expect(panels.filter(p => p.style.display !== 'none').map(p => p.textContent)).toEqual(['quota content']);
    });

    it('marks the entry with an error and jumps there', () => {
        renderView(<Sections errorIn="details" initial="resources" />);
        const details = screen.getByRole('tab', { name: /Details/ });
        expect(within(details).getByText('!')).toBeTruthy();
        expect(within(screen.getByRole('tab', { name: 'Ressourcen' })).queryByText('!')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'submit' }));
        expect(details.getAttribute('aria-selected')).toBe('true');
    });
});
