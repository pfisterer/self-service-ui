// @vitest-environment jsdom
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { filterTree, NavTree, TreeFilter, useExpandAll, useTreeExpansion } from '/helper/tree.jsx';
import { MasterDetail } from '/helper/master-detail.jsx';
import i18n from '/i18n/index.js';

// The one tree of the master-detail pages, without any page's data: sections, guide lines, branches loaded as they open, the paging row, the filter, expand-all and collapse-all, the selection named from outside (the URL), what is remembered per browser, and the keyboard.

const leaf = (id, extra = {}) => ({ id, label: id, ...extra });
const NODES = [
    { id: 'fruit', label: 'fruit', children: [{ id: 'apple', label: 'apple', children: [leaf('boskoop')] }, leaf('pear', { badge: <span>shared</span> })] },
    { id: 'veg', label: 'veg', children: [leaf('leek')] },
];
const SECTIONS = [
    { id: 'section:now', label: 'Now', section: true, caption: true, children: NODES },
    { id: 'section:later', label: 'Later', section: true, caption: true, children: [leaf('cake')] },
];

function Harness({ nodes = NODES, defaultOpen = true, initial = null, withLines = false, openOnSelect = false, keepOpen, storageKey = 'test.tree' }) {
    const [selected, setSelected] = useState(initial);
    const [q, setQ] = useState('');
    const expansion = useTreeExpansion({ storageKey, defaultOpen });
    const expandAll = useExpandAll(expansion, nodes, { keepOpen });
    return (
        <MasterDetail
            scrollKey={selected}
            filter={<TreeFilter value={q} onChange={setQ} label="Filter" clearLabel="Clear" expandAll={expandAll} />}
            master={<NavTree label="Things" nodes={nodes} expansion={expansion} withLines={withLines} openOnSelect={openOnSelect} selectedId={selected} onSelect={n => setSelected(n.value ?? n.id)} query={q} matches={(n, s) => n.id.includes(s)} noMatch="Nothing" />}
            detail={<div data-testid="detail">{selected ?? 'none'}</div>} />
    );
}

const rows = () => screen.getAllByRole('treeitem').map(r => [r.querySelector('p').textContent, r.getAttribute('aria-level')]);
const labels = () => rows().map(r => r[0]);
const item = (name) => screen.getAllByRole('treeitem').find(r => r.querySelector('p')?.textContent === name);
const key = (el, k) => fireEvent.keyDown(el, { key: k, code: k === ' ' ? 'Space' : k });

beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('NavTree', () => {
    it('shows the nodes flat with their level, open and closed, and a badge at the end', () => {
        renderView(<Harness />);
        expect(screen.getByRole('tree', { name: 'Things' })).toBeTruthy();
        expect(rows()).toEqual([['fruit', '1'], ['apple', '2'], ['boskoop', '3'], ['pear', '2'], ['veg', '1'], ['leek', '2']]);
        expect(item('fruit').getAttribute('aria-expanded')).toBe('true');
        expect(item('pear').hasAttribute('aria-expanded')).toBe(false);
        expect(item('pear').textContent).toContain('shared');
    });

    it('selects on click, the detail follows, and Tab reaches the selected row', () => {
        renderView(<Harness />);
        fireEvent.click(screen.getByText('pear'));
        expect(screen.getByTestId('detail').textContent).toBe('pear');
        expect(item('pear').getAttribute('aria-selected')).toBe('true');
        expect(item('pear').tabIndex).toBe(0);
        expect(item('fruit').tabIndex).toBe(-1);
    });

    it('closes and opens a branch with its arrow, and a click on a row does not close it', () => {
        renderView(<Harness />);
        fireEvent.click(screen.getAllByRole('button', { name: i18n.t('projects.tree.collapse') })[0]);
        expect(screen.queryByText('apple')).toBeNull();
        expect(item('fruit').getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(screen.getAllByRole('button', { name: i18n.t('projects.tree.expand') })[0]);
        expect(screen.getByText('apple')).toBeTruthy();
        fireEvent.click(screen.getByText('fruit'));
        expect(screen.getByText('apple')).toBeTruthy();
    });

    it('opens a closed branch on select where asked to', () => {
        renderView(<Harness defaultOpen={false} openOnSelect />);
        expect(labels()).toEqual(['fruit', 'veg']);
        fireEvent.click(item('fruit').querySelector('p'));
        expect(labels()).toEqual(['fruit', 'apple', 'pear', 'veg']);
        fireEvent.click(item('fruit').querySelector('p'));
        expect(labels()).toEqual(['fruit', 'apple', 'pear', 'veg']);
    });

    it('remembers what was opened and closed per browser', () => {
        renderView(<Harness defaultOpen={false} />);
        fireEvent.click(screen.getAllByRole('button', { name: i18n.t('projects.tree.expand') })[0]);
        expect(JSON.parse(localStorage.getItem('test.tree'))).toEqual(['fruit']);
        cleanup();
        renderView(<Harness defaultOpen={false} />);
        expect(labels()).toEqual(['fruit', 'apple', 'pear', 'veg']);
    });

    it('moves with the keyboard: down, right opens and goes in, left closes and goes up, Enter and Space select, Home and End jump', () => {
        renderView(<Harness />);
        const fruit = item('fruit');
        expect(fruit.tabIndex).toBe(0);
        fruit.focus();
        key(fruit, 'ArrowDown');
        expect(document.activeElement).toBe(item('apple'));
        key(document.activeElement, 'ArrowLeft');
        expect(screen.queryByText('boskoop')).toBeNull();
        key(document.activeElement, 'ArrowRight');
        expect(screen.getByText('boskoop')).toBeTruthy();
        key(document.activeElement, 'ArrowRight');
        expect(document.activeElement).toBe(item('boskoop'));
        key(document.activeElement, 'ArrowLeft');
        expect(document.activeElement).toBe(item('apple'));
        key(document.activeElement, 'End');
        expect(document.activeElement).toBe(item('leek'));
        key(document.activeElement, 'Enter');
        expect(screen.getByTestId('detail').textContent).toBe('leek');
        key(document.activeElement, 'Home');
        expect(document.activeElement).toBe(item('fruit'));
        key(document.activeElement, ' ');
        expect(screen.getByTestId('detail').textContent).toBe('fruit');
    });

    it('filters to the matches and the way down to them, all open, Escape clears', () => {
        renderView(<Harness defaultOpen={false} />);
        const box = screen.getByLabelText('Filter');
        fireEvent.change(box, { target: { value: 'bosk' } });
        expect(labels()).toEqual(['fruit', 'apple', 'boskoop']);
        expect(screen.queryByRole('button', { name: i18n.t('projects.tree.expand') })).toBeNull();
        fireEvent.change(box, { target: { value: 'zzz' } });
        expect(screen.getByText('Nothing')).toBeTruthy();
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(box.value).toBe('');
        expect(labels()).toEqual(['fruit', 'veg']);
    });

    it('opens and closes everything with the button beside the filter, hidden while filtering', () => {
        renderView(<Harness defaultOpen={false} />);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        expect(labels()).toEqual(['fruit', 'apple', 'boskoop', 'pear', 'veg', 'leek']);
        const collapse = screen.getByRole('button', { name: i18n.t('projects.tree.collapseAll') });
        expect(collapse.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(collapse);
        expect(labels()).toEqual(['fruit', 'veg']);
        fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'lee' } });
        expect(screen.queryByRole('button', { name: i18n.t('projects.tree.expandAll') })).toBeNull();
    });

    it('keeps the branches keepOpen names open on collapse-all, and a branch closed by hand ends expand-all', () => {
        renderView(<Harness defaultOpen={(id) => id === 'fruit'} keepOpen={(id) => id === 'fruit'} />);
        expect(labels()).toEqual(['fruit', 'apple', 'pear', 'veg']);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        expect(labels()).toEqual(['fruit', 'apple', 'boskoop', 'pear', 'veg', 'leek']);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.collapseAll') }));
        expect(labels()).toEqual(['fruit', 'apple', 'pear', 'veg']);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        fireEvent.click(screen.getAllByRole('button', { name: i18n.t('projects.tree.collapse') }).at(-1));
        expect(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }).getAttribute('aria-pressed')).toBe('false');
    });

    it('opens the rows above an item selected from outside (a link), once, and scrolls it into view', () => {
        const scroll = vi.fn();
        Element.prototype.scrollIntoView = scroll;
        renderView(<Harness defaultOpen={false} initial="boskoop" />);
        expect(labels()).toEqual(['fruit', 'apple', 'boskoop', 'pear', 'veg']);
        expect(item('boskoop').getAttribute('aria-selected')).toBe('true');
        expect(scroll).toHaveBeenCalled();
        // Closed again by hand, it stays closed.
        fireEvent.click(screen.getAllByRole('button', { name: i18n.t('projects.tree.collapse') })[0]);
        expect(labels()).toEqual(['fruit', 'veg']);
        delete Element.prototype.scrollIntoView;
    });

    it('selects every place of an item shown in several, by its value', () => {
        const nodes = [{ id: 'a', label: 'a', children: [leaf('a/x', { value: 'x' })] }, { id: 'b', label: 'b', children: [leaf('b/x', { value: 'x', label: 'x2' })] }];
        renderView(<Harness nodes={nodes} initial="x" />);
        expect(screen.getAllByRole('treeitem').filter(r => r.getAttribute('aria-selected') === 'true').length).toBe(2);
    });
});

describe('NavTree with sections and lines', () => {
    it('puts the nodes under section headers that only open and close, never selected, captions spaced', () => {
        renderView(<Harness nodes={SECTIONS} defaultOpen={(id) => id !== 'section:later'} />);
        expect(rows()).toEqual([['Now', '1'], ['fruit', '2'], ['apple', '3'], ['boskoop', '4'], ['pear', '3'], ['veg', '2'], ['leek', '3'], ['Later', '1']]);
        expect(item('Now').hasAttribute('aria-selected')).toBe(false);
        expect(item('Later').style.marginTop).toBeTruthy();
        expect(item('Now').style.marginTop).toBe('');
        fireEvent.click(screen.getByText('Later'));
        expect(screen.getByText('cake')).toBeTruthy();
        expect(screen.getByTestId('detail').textContent).toBe('none');
        fireEvent.click(screen.getByText('Now'));
        expect(labels()).toEqual(['Now', 'Later', 'cake']);
        item('Now').focus();
        key(item('Now'), 'Enter');
        expect(labels()[1]).toBe('fruit');
        key(item('Now'), ' ');
        expect(labels()).toEqual(['Now', 'Later', 'cake']);
    });

    it('filters into the sections with a match, open', () => {
        renderView(<Harness nodes={SECTIONS} defaultOpen={false} />);
        fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'cak' } });
        expect(rows()).toEqual([['Later', '1'], ['cake', '2']]);
    });

    it('draws Mantine\'s guide lines below the nodes right under a section, through the levels whose line goes on', () => {
        renderView(<Harness nodes={SECTIONS} withLines />);
        expect(screen.getByRole('tree').hasAttribute('data-with-lines')).toBe(true);
        // Mantine's flat line markers: one per level below the second, the row's own marked closing where it is the last child.
        const lines = (name) => [...item(name).querySelectorAll('span[aria-hidden]')].map(l => [l.style.getPropertyValue('--flat-line-column'), l.classList.length > 1]);
        expect(lines('fruit')).toEqual([]);
        expect(item('fruit').style.getPropertyValue('--nav-tree-tick')).toBe('none');
        expect(lines('apple')).toEqual([['3', false]]);
        expect(lines('boskoop')).toEqual([['3', false], ['4', true]]);
        expect(lines('pear')).toEqual([['3', true]]);
        expect(item('apple').style.getPropertyValue('--nav-tree-tick')).toBe('');
    });
});

describe('NavTree loading as it opens', () => {
    function LazyHarness({ load }) {
        const [loaded, setLoaded] = useState({});
        const [extra, setExtra] = useState(0);
        const nodes = useMemo(() => [
            { id: 'root', label: 'root', hasChildren: true, children: loaded.root && [...loaded.root.slice(0, 2 + extra).map(id => ({ id, label: id })), ...(2 + extra < loaded.root.length ? [{ id: 'root::more', label: 'Show more', more: { loaded: 2 + extra, total: loaded.root.length, onLoad: async () => setExtra(e => e + 1) } }] : [])] },
        ], [loaded, extra]);
        const expansion = useTreeExpansion({ storageKey: 'test.lazy' });
        return <NavTree label="Lazy" nodes={nodes} expansion={expansion} withLines onLoadChildren={async (id) => { const kids = await load(id); setLoaded(p => ({ ...p, [id]: kids })); }} />;
    }

    it('loads a branch when it opens, then pages through it with the "show more" row', async () => {
        const load = vi.fn(async () => ['a', 'b', 'c']);
        renderView(<LazyHarness load={load} />);
        expect(labels()).toEqual(['root']);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expand') }));
        // The paging row says how much is shown of how many.
        await waitFor(() => expect(labels()).toEqual(['root', 'a', 'b', 'Show more (2/3)']));
        expect(load).toHaveBeenCalledWith('root');
        await act(async () => { fireEvent.click(item('Show more (2/3)').querySelector('p')); });
        expect(labels()).toEqual(['root', 'a', 'b', 'c']);
    });

    it('marks a branch that failed to load on its row', async () => {
        const load = vi.fn(async () => { throw new Error('boom'); });
        renderView(<LazyHarness load={load} />);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expand') }));
        await waitFor(() => expect(item('root').querySelector('svg.lucide-triangle-alert, svg.lucide-alert-triangle')).toBeTruthy());
    });
});

describe('filterTree', () => {
    it('keeps the matches and their ancestors', () => {
        expect([...filterTree(NODES, n => n.id, n => n.children ?? [], n => n.id === 'leek')].sort()).toEqual(['leek', 'veg']);
    });
});
