// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { filterTree, ItemTree, TreeFilter, TreeRow, Tree, useTreeExpansion } from '/helper/tree.jsx';
import { MasterDetail } from '/helper/master-detail.jsx';
import i18n from '/i18n/index.js';

// The generic tree and master-detail layout, without any page's data: nesting, opening and closing, selection, the keyboard, the filter and the row actions.

const DATA = [
    { id: 'fruit', kids: [{ id: 'apple', kids: [{ id: 'boskoop', kids: [] }] }, { id: 'pear', kids: [] }] },
    { id: 'veg', kids: [{ id: 'leek', kids: [] }] },
];
const kids = (n) => n.kids;

function Harness({ defaultOpen = true, onAction = () => {}, initial = null }) {
    const [selected, setSelected] = useState(initial);
    const [q, setQ] = useState('');
    const { isOpen, toggle } = useTreeExpansion({ storageKey: 'test.tree', defaultOpen });
    return (
        <MasterDetail
            header={<h2>Header</h2>}
            scrollKey={selected}
            filter={<TreeFilter value={q} onChange={setQ} label="Filter" clearLabel="Clear" />}
            master={(
                <ItemTree label="Things" roots={DATA} getId={n => n.id} getChildren={kids} selectedId={selected} onSelect={n => setSelected(n.id)}
                    isOpen={isOpen} toggle={toggle} query={q} matches={(n, s) => n.id.includes(s)} noMatch="Nothing"
                    row={(n) => ({ label: n.id, title: `long ${n.id}`, badge: n.id === 'pear' ? <span>shared</span> : null, hoverAction: <button type="button" onClick={() => onAction(n.id)}>{`add under ${n.id}`}</button> })} />
            )}
            detail={<div data-testid="detail">{selected ?? 'none'}</div>} />
    );
}

const item = (name) => screen.getByRole('treeitem', { name: new RegExp(`^${name}`) });

beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('ItemTree in MasterDetail', () => {
    it('nests the items with their level and shows header, filter and detail', () => {
        renderView(<Harness />);
        expect(screen.getByRole('tree', { name: 'Things' })).toBeTruthy();
        expect(screen.getByText('Header')).toBeTruthy();
        expect(screen.getAllByRole('treeitem').map(r => [r.querySelector('p').textContent, r.getAttribute('aria-level')])).toEqual([
            ['fruit', '1'], ['apple', '2'], ['boskoop', '3'], ['pear', '2'], ['veg', '1'], ['leek', '2'],
        ]);
        expect(item('pear').textContent).toContain('shared');
        expect(screen.getByTestId('detail').textContent).toBe('none');
    });

    it('selects on click, and the detail follows', () => {
        renderView(<Harness />);
        fireEvent.click(screen.getByText('pear'));
        expect(screen.getByTestId('detail').textContent).toBe('pear');
        expect(item('pear').getAttribute('aria-selected')).toBe('true');
        expect(item('pear').tabIndex).toBe(0);
    });

    it('closes and opens a branch with its arrow', () => {
        renderView(<Harness />);
        fireEvent.click(screen.getAllByRole('button', { name: /Zuklappen|Collapse/ })[0]);
        expect(screen.queryByText('apple')).toBeNull();
        expect(item('fruit').getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(screen.getAllByRole('button', { name: /Aufklappen|Expand/ })[0]);
        expect(screen.getByText('apple')).toBeTruthy();
    });

    it('starts closed where asked to', () => {
        renderView(<Harness defaultOpen={false} />);
        expect(screen.getAllByRole('treeitem').length).toBe(2);
    });

    it('moves with the keyboard: down, right opens, left closes and goes up, Enter selects', () => {
        renderView(<Harness />);
        const fruit = item('fruit');
        expect(fruit.tabIndex).toBe(0);
        fruit.focus();
        fireEvent.keyDown(fruit, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(item('apple'));
        fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
        expect(screen.queryByText('boskoop')).toBeNull();
        fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
        expect(screen.getByText('boskoop')).toBeTruthy();
        fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(item('boskoop'));
        fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(item('apple'));
        fireEvent.keyDown(document.activeElement, { key: 'End' });
        expect(document.activeElement).toBe(item('leek'));
        fireEvent.keyDown(document.activeElement, { key: 'Enter' });
        expect(screen.getByTestId('detail').textContent).toBe('leek');
        fireEvent.keyDown(document.activeElement, { key: 'Home' });
        expect(document.activeElement).toBe(item('fruit'));
    });

    it('filters to the matches and the way down to them, Escape clears', () => {
        renderView(<Harness />);
        const box = screen.getByLabelText('Filter');
        fireEvent.change(box, { target: { value: 'bosk' } });
        expect(screen.getAllByRole('treeitem').map(r => r.textContent.split('add')[0])).toEqual(['fruit', 'apple', 'boskoop']);
        fireEvent.change(box, { target: { value: 'zzz' } });
        expect(screen.getByText('Nothing')).toBeTruthy();
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(box.value).toBe('');
        expect(screen.getAllByRole('treeitem').length).toBe(6);
    });

    it('runs a row action without selecting the row', () => {
        const onAction = vi.fn();
        renderView(<Harness onAction={onAction} />);
        fireEvent.click(screen.getByRole('button', { name: 'add under apple' }));
        expect(onAction).toHaveBeenCalledWith('apple');
        expect(screen.getByTestId('detail').textContent).toBe('none');
    });

    it('scrolls the detail into view on a phone when the selection changes', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({ media, matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        renderView(<Harness initial="fruit" />);
        expect(scroll).not.toHaveBeenCalled();
        act(() => { fireEvent.click(screen.getByText('pear')); });
        expect(scroll).toHaveBeenCalled();
        delete Element.prototype.scrollIntoView;
        vi.restoreAllMocks();
    });
});

function SectionHarness({ sections, loneSectionHeader }) {
    const [selected, setSelected] = useState(null);
    const [q, setQ] = useState('');
    const { isOpen, toggle } = useTreeExpansion({ storageKey: 'test.sections', defaultOpen: (path) => path !== 'section:later' });
    return (
        <>
            <TreeFilter value={q} onChange={setQ} label="Filter" clearLabel="Clear" />
            <ItemTree label="Things" withLines sections={sections} loneSectionHeader={loneSectionHeader} getId={n => n.id} getChildren={kids} selectedId={selected} onSelect={n => setSelected(n.id)}
                isOpen={isOpen} toggle={toggle} query={q} matches={(n, s) => n.id.includes(s)} noMatch="Nothing" row={(n) => ({ label: n.id })} />
        </>
    );
}
const SECTIONS = [
    { id: 'section:now', label: 'Now', count: 6, roots: DATA },
    { id: 'section:empty', label: 'Empty', roots: [] },
    { id: 'section:later', label: 'Later', count: 1, roots: [{ id: 'cake', kids: [] }] },
];
const levels = () => screen.getAllByRole('treeitem').map(r => [r.querySelector('p').textContent, r.getAttribute('aria-level')]);

describe('ItemTree with sections', () => {
    it('puts the roots under headers that open and close, leaves out empty sections and starts one closed where asked to', () => {
        renderView(<SectionHarness sections={SECTIONS} />);
        expect(levels()).toEqual([['Now', '1'], ['fruit', '2'], ['apple', '3'], ['boskoop', '4'], ['pear', '3'], ['veg', '2'], ['leek', '3'], ['Later', '1']]);
        expect(item('Now').hasAttribute('aria-selected')).toBe(false);
        fireEvent.click(screen.getByText('Later'));
        expect(screen.getByText('cake')).toBeTruthy();
        fireEvent.click(screen.getByText('Now'));
        expect(levels()).toEqual([['Now', '1'], ['Later', '1'], ['cake', '2']]);
    });

    it('shows a lone section without its header', () => {
        renderView(<SectionHarness sections={[SECTIONS[0], SECTIONS[1]]} />);
        expect(levels()[0]).toEqual(['fruit', '1']);
        expect(screen.queryByText('Now')).toBeNull();
    });

    it('opens and closes all branches with the button beside the filter, hidden while filtering', () => {
        function AllHarness() {
            const [q, setQ] = useState('');
            const { isOpen, toggle, expandAll, collapseAll, allOpen } = useTreeExpansion({ storageKey: 'test.all', defaultOpen: (path) => path !== 'section:later' });
            const branches = ['section:now', 'section:later', 'fruit', 'apple', 'veg'];
            return (
                <>
                    <TreeFilter value={q} onChange={setQ} label="Filter" clearLabel="Clear" allOpen={allOpen(branches)} onToggleAll={() => (allOpen(branches) ? collapseAll : expandAll)(branches)} />
                    <ItemTree label="Things" sections={SECTIONS} getId={n => n.id} getChildren={kids} onSelect={() => {}} isOpen={isOpen} toggle={toggle} query={q} matches={(n, s) => n.id.includes(s)} noMatch="Nothing" row={(n) => ({ label: n.id })} />
                </>
            );
        }
        renderView(<AllHarness />);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        expect(levels().map(l => l[0])).toEqual(['Now', 'fruit', 'apple', 'boskoop', 'pear', 'veg', 'leek', 'Later', 'cake']);
        const collapse = screen.getByRole('button', { name: i18n.t('projects.tree.collapseAll') });
        expect(collapse.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(collapse);
        expect(levels().map(l => l[0])).toEqual(['Now', 'Later']);
        fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'cak' } });
        expect(screen.queryByRole('button', { name: i18n.t('projects.tree.expandAll') })).toBeNull();
    });

    it('keeps the header of a lone section where asked to', () => {
        renderView(<SectionHarness sections={[SECTIONS[0], SECTIONS[1]]} loneSectionHeader />);
        expect(levels().slice(0, 2)).toEqual([['Now', '1'], ['fruit', '2']]);
    });

    it('filters into the sections with a match, open', () => {
        renderView(<SectionHarness sections={SECTIONS} />);
        fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'cak' } });
        expect(levels()).toEqual([['Later', '1'], ['cake', '2']]);
    });

    it('draws guide lines below the roots: through the levels whose line goes on, ending at the last child', () => {
        renderView(<SectionHarness sections={SECTIONS} />);
        const lines = (name) => [...item(name).querySelectorAll('.tree-line')].map(l => [l.style.left, l.hasAttribute('data-last')]);
        expect(item('fruit').querySelector('.tree-line')).toBeNull();
        expect(item('Now').querySelector('.tree-line')).toBeNull();
        // apple: not the last under fruit; boskoop: last under apple, with fruit's line passing (apple has pear below it).
        expect(lines('apple')).toEqual([['30px', false]]);
        expect(lines('boskoop')).toEqual([['30px', false], ['50px', true]]);
        expect(lines('pear')).toEqual([['30px', true]]);
        expect(item('pear').querySelectorAll('.tree-line-tick').length).toBe(1);
    });
});

describe('TreeRow and Tree by hand', () => {
    it('shows label, second line, count and an action always there', () => {
        const onClick = vi.fn();
        renderView(
            <Tree label="Hand">
                <TreeRow depth={1} label="group-a" sub="what and where" count={3} onClick={onClick} action={<span>always</span>} />
            </Tree>,
        );
        expect(screen.getByText('what and where')).toBeTruthy();
        expect(screen.getByText('always')).toBeTruthy();
        expect(screen.getByRole('treeitem').getAttribute('aria-level')).toBe('2');
        // The only row is the one Tab reaches.
        expect(screen.getByRole('treeitem').tabIndex).toBe(0);
        fireEvent.keyDown(screen.getByRole('treeitem'), { key: ' ' });
        expect(onClick).toHaveBeenCalled();
    });
});

describe('filterTree', () => {
    it('keeps the matches and their ancestors', () => {
        expect([...filterTree(DATA, n => n.id, kids, n => n.id === 'leek')].sort()).toEqual(['leek', 'veg']);
    });
});
