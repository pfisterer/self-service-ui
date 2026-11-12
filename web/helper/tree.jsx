import { Fragment, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '@mantine/hooks';
import { ActionIcon, Box, CloseButton, Group, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import './tree.css';

// One level of the tree is indented this far (as levelOffset in the budget tree, which uses Mantine's Tree).
export const TREE_INDENT = 20;

// The tree of a master-detail page (helper/master-detail.jsx), knowing nothing of what it shows: groups (groups/browser.jsx, branches loaded as they open) and DNS zones (dyndns/zones.jsx, all at once through ItemTree). Rows are flat siblings in one role="tree"; their depth is aria-level and the indentation. The keyboard works as in a file tree: up and down move, right opens or goes in, left closes or goes to the parent, Enter and Space select, Home and End jump.

// useTreeExpansion: which branches are open, remembered per browser under storageKey; expandAll and collapseAll open or close the branches given, allOpen tells whether all of them are open. A branch is named by its path; `defaultOpen` says how a branch starts (true or false for all, or a function of the path for a tree whose branches start differently, such as a section closed at first) and what is stored are the branches flipped from that. Closing a branch that starts closed forgets the open ones below it ("<path>/…"), as a source's subtree in the groups browser.
export function useTreeExpansion({ storageKey, defaultOpen = false }) {
    const [flipped, setFlipped] = useLocalStorage({ key: storageKey, defaultValue: [], getInitialValueInEffect: false });
    const startsOpen = (path) => (typeof defaultOpen === 'function' ? !!defaultOpen(path) : defaultOpen);
    const set = new Set(flipped);
    const isOpen = (path) => startsOpen(path) !== set.has(path);
    const toggle = (path) => setFlipped(prev => {
        if (prev.includes(path)) return startsOpen(path) ? prev.filter(p => p !== path) : prev.filter(p => p !== path && !p.startsWith(`${path}/`));
        return [...prev, path];
    });
    // Opens every path given (the way down to a revealed or selected node).
    const expand = (paths) => setFlipped(prev => {
        const closedAtFirst = paths.filter(p => !startsOpen(p));
        return [...new Set([...prev.filter(p => !(paths.includes(p) && startsOpen(p))), ...closedAtFirst])];
    });
    // Opens or closes every branch of `paths` at once (the expand-all/collapse-all toggle beside a tree's filter); branches not named keep their state.
    const setAll = (paths, open) => setFlipped(prev => [...new Set([...prev.filter(p => !paths.includes(p)), ...paths.filter(p => startsOpen(p) !== open)])]);
    const expandAll = (paths) => setAll(paths, true);
    const collapseAll = (paths) => setAll(paths, false);
    const allOpen = (paths) => paths.length > 0 && paths.every(isOpen);
    return { isOpen, toggle, expand, expandAll, collapseAll, allOpen };
}

const itemsOf = (el) => [...(el?.closest('[role="tree"]')?.querySelectorAll('[role="treeitem"]') ?? [])];

function focusItem(items, to) {
    if (!to) return;
    for (const it of items) it.tabIndex = it === to ? 0 : -1;
    to.focus();
    to.scrollIntoView?.({ block: 'nearest' });
}

// Tree: the container. Exactly one row is reachable with Tab — the selected one, or else the first — and the arrows move from there.
export function Tree({ label, children, ...props }) {
    const ref = useRef(null);
    useEffect(() => {
        const items = [...(ref.current?.querySelectorAll('[role="treeitem"]') ?? [])];
        if (items.length && !items.some(it => it.tabIndex === 0)) items[0].tabIndex = 0;
    });
    const onKeyDown = (e) => {
        if (e.target.getAttribute?.('role') !== 'treeitem') return;
        const items = itemsOf(e.target);
        const i = items.indexOf(e.target);
        const to = { ArrowDown: items[i + 1], ArrowUp: items[i - 1], Home: items[0], End: items.at(-1) }[e.key];
        if (!to) return;
        e.preventDefault();
        focusItem(items, to);
    };
    return <Box ref={ref} role="tree" aria-label={label} onKeyDown={onKeyDown} {...props}>{children}</Box>;
}

// TreeRow: one line. The arrow opens and closes; the line itself does onClick (select, or open where a node has nothing to show). `label` is shortened to one line, or with `wrap` breaks over as many as it needs and is never cut; `strong` sets it bold; `title` (the long form) shows as its tooltip, `sub` is a second line. `lines` draws the guide lines of a nested row as Mantine's Tree withLines does in the budget tree: a gray vertical line per level from the parent down to its last child and a short tick to the row (aligned with its first line); `{ through, last }` says for the levels above, outermost first, whether their line passes this row (an ancestor with a sibling still below), and whether the row is the last of its siblings, where its own line ends. `badge` and `count` sit at the end, `action` is always shown, `hoverAction` only on hover, focus and selection. `muted` dims the label (a node that only groups others, or one not in use), `caption` sets it as a small dimmed caption (a header over rows), `mt` gives the row space above; a row with `selectable={false}` is never selected (no aria-selected), its onClick then is usually onToggle.
export function TreeRow({ rowRef, depth = 0, open, openable, onToggle, onClick, selected, selectable = true, muted, strong, wrap, caption, mt, lines, icon, label, title, sub, count, badge, action, hoverAction }) {
    const { t } = useTranslation();
    const onKeyDown = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (openable && !open) onToggle();
            else if (openable) {
                const items = itemsOf(e.currentTarget);
                focusItem(items, items[items.indexOf(e.currentTarget) + 1]);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (openable && open) onToggle();
            else {
                const items = itemsOf(e.currentTarget);
                const parent = items.slice(0, items.indexOf(e.currentTarget)).reverse().find(it => Number(it.getAttribute('aria-level')) === depth);
                focusItem(items, parent);
            }
        }
    };
    const text = caption
        ? <Text size="xs" truncate fw={600} c="dimmed" lts="0.04em">{label}</Text>
        : <Text size="sm" truncate={!wrap} fw={strong || selected ? 600 : 400} c={muted ? 'dimmed' : undefined} style={wrap ? { overflowWrap: 'anywhere' } : undefined}>{label}</Text>;
    return (
        <Group ref={rowRef} className="tree-row" role="treeitem" aria-level={depth + 1} aria-selected={selectable ? !!selected : undefined} aria-expanded={openable ? !!open : undefined}
            tabIndex={selectable && selected ? 0 : -1} onKeyDown={onKeyDown}
            gap={4} wrap="nowrap" pl={depth * TREE_INDENT} pr={6} py={3} mt={mt} onClick={onClick}
            style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)' }}>
            {lines && <TreeLines depth={depth} {...lines} />}
            {openable
                ? (
                    <UnstyledButton tabIndex={-1} aria-label={t(open ? 'projects.tree.collapse' : 'projects.tree.expand')}
                        onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ display: 'flex' }}>
                        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }} />
                    </UnstyledButton>
                )
                : <Box w={14} style={{ flexShrink: 0 }} />}
            {icon && <Box c="dimmed" style={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>}
            <Box style={{ flex: 1, minWidth: 0 }}>
                {title ? <Tooltip label={title} openDelay={400} multiline maw={360} style={{ overflowWrap: 'anywhere' }}>{text}</Tooltip> : text}
                {sub && <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{sub}</Text>}
            </Box>
            {badge}
            {count != null && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{count}</Text>}
            {hoverAction && <Box className="tree-row-hover-action" onClick={(e) => e.stopPropagation()}>{hoverAction}</Box>}
            {action}
        </Group>
    );
}

// TreeLines: the guide lines of one row (see TreeRow's `lines`). The line of a level runs half an indent left of where that level's rows begin, as in Mantine's Tree.
function TreeLines({ depth, through = [], last }) {
    const column = (level) => level * TREE_INDENT - TREE_INDENT / 2;
    const first = depth - through.length;
    return (
        <>
            {through.map((on, i) => on && <span key={i} className="tree-line" aria-hidden style={{ left: column(first + i) }} />)}
            <span className="tree-line" data-last={last || undefined} aria-hidden style={{ left: column(depth) }} />
            <span className="tree-line-tick" aria-hidden style={{ left: column(depth), width: TREE_INDENT / 2 }} />
        </>
    );
}

// TreeFilter: the search box above a tree; Escape and the x clear it (onClear, by default emptying it). With `onToggleAll`, a small button beside it opens every branch, or closes them all where `allOpen` (as beside the budget tree's search), hidden while the filter shows its matches open anyway.
export function TreeFilter({ value, onChange, onClear, label, clearLabel, allOpen, onToggleAll, ...props }) {
    const { t } = useTranslation();
    const clear = onClear ?? (() => onChange(''));
    const input = (
        <TextInput leftSection={<Search size={14} />} value={value} placeholder={label} aria-label={label}
            onChange={e => onChange(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Escape' && clear()}
            rightSection={value ? <CloseButton size="sm" aria-label={clearLabel} onClick={clear} /> : null} {...props} />
    );
    if (!onToggleAll) return input;
    const toggleLabel = t(allOpen ? 'projects.tree.collapseAll' : 'projects.tree.expandAll');
    return (
        <Group gap="xs" wrap="nowrap">
            <Box style={{ flex: 1 }}>{input}</Box>
            {!value.trim() && (
                <Tooltip label={toggleLabel}>
                    <ActionIcon size="sm" variant={allOpen ? 'light' : 'subtle'} color="gray" aria-label={toggleLabel} aria-pressed={!!allOpen} onClick={onToggleAll}>
                        {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
}

// filterTree: the ids to show for a filter — every item that matches and the way down to it.
export function filterTree(roots, getId, getChildren, matches) {
    const keep = new Set();
    const walk = (item, seen) => {
        const id = getId(item);
        if (seen.has(id)) return false;
        let hit = matches(item);
        for (const child of getChildren(item)) {
            if (walk(child, new Set([...seen, id]))) hit = true;
        }
        if (hit) keep.add(id);
        return hit;
    };
    for (const r of roots) walk(r, new Set());
    return keep;
}

// TreeSection: a top-level header that only opens and closes the rows below it (`children`, one level deeper), never selected: the data sources in the groups browser, the kinds of zones on the zones page. `count` and `badge` sit at its end as in a row; `muted` dims its label, `caption` sets it as a small caption, for headers that should stay quiet beside the rows they hold, `mt` gives it space above.
export function TreeSection({ label, icon, count, badge, title, muted, caption, mt, open, openable = true, onToggle, children }) {
    return (
        <>
            <TreeRow depth={0} open={open} openable={openable} onToggle={onToggle} onClick={() => openable && onToggle()} selectable={false}
                icon={icon} label={label} title={title} muted={muted} caption={caption} mt={mt} count={count} badge={badge} />
            {open && children}
        </>
    );
}

// ItemTree: a tree of data that is all there (roots and getChildren). With `withLines`, guide lines join every item below the roots to its parent (TreeRow's `lines`); roots and section headers have none. `row(item, {depth, selected, open})` returns the TreeRow props that depend on the item (icon, label, title, muted, strong, wrap, sub, badge, count, action, hoverAction). Items for which `isSelectable` says no (by default all are selectable) only group the ones below: a click opens and closes them. With a `query`, only the items `matches` and their way down are shown, all open, and `noMatch` when there is none.
// Instead of `roots`, `sections` ([{ id, label, icon, count, title, muted, caption, roots }]) puts the roots under TreeSection headers, opened and closed through isOpen and toggle like the items (so their ids must not collide with the items'). Sections without roots are left out, and a lone section shows its rows without a header unless `loneSectionHeader` (where the header says something about its rows, such as the domain the zones below lie in). With a query, only sections with a match are shown, open.
export function ItemTree({ label, roots, sections, loneSectionHeader = false, withLines = false, getId, getChildren, row, selectedId, onSelect, isSelectable = () => true, isOpen, toggle, query, matches, noMatch }) {
    const filled = sections?.filter(s => s.roots.length > 0);
    const all = filled ? filled.flatMap(s => s.roots) : roots;
    const visible = query ? filterTree(all, getId, getChildren, (it) => matches(it, query)) : null;
    const shown = (item, seen) => !seen.has(getId(item)) && (!visible || visible.has(getId(item)));
    // `lines` is null for a root, else what its TreeRow draws.
    const render = (item, depth, seen, lines = null) => {
        const id = getId(item);
        if (!shown(item, seen)) return null;
        const children = getChildren(item);
        const openable = !visible && children.length > 0;
        const open = visible ? true : isOpen(id);
        const selectable = isSelectable(item);
        const selected = selectable && id === selectedId;
        const inner = new Set([...seen, id]);
        return (
            <Fragment key={id}>
                <TreeRow depth={depth} open={open} openable={openable} onToggle={() => toggle(id)} onClick={selectable ? () => onSelect(item) : () => openable && toggle(id)} selected={selected} selectable={selectable}
                    lines={withLines ? lines : null} {...row(item, { depth, selected, open })} />
                {open && children.filter(child => shown(child, inner)).map((child, i, list) => render(child, depth + 1, inner, { through: lines ? [...lines.through, !lines.last] : [], last: i === list.length - 1 }))}
            </Fragment>
        );
    };
    if (visible && visible.size === 0) return <Text size="sm" c="dimmed" p="xs">{noMatch}</Text>;
    if (!filled || filled.length < (loneSectionHeader ? 1 : 2)) return <Tree label={label}>{all.map(r => render(r, 0, new Set()))}</Tree>;
    return (
        <Tree label={label}>
            {filled.filter(s => !visible || s.roots.some(r => visible.has(getId(r)))).map((s, i) => (
                <TreeSection key={s.id} label={s.label} icon={s.icon} count={s.count} title={s.title} muted={s.muted} caption={s.caption} mt={s.caption && i > 0 ? 'sm' : undefined}
                    open={visible ? true : isOpen(s.id)} openable={!visible} onToggle={() => toggle(s.id)}>
                    {s.roots.map(r => render(r, 1, new Set()))}
                </TreeSection>
            ))}
        </Tree>
    );
}
