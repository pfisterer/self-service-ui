import { Fragment, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '@mantine/hooks';
import { Box, CloseButton, Group, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { ChevronRight, Search } from 'lucide-react';
import './tree.css';

// The tree of a master-detail page (helper/master-detail.jsx), knowing nothing of what it shows: groups (groups/browser.jsx, branches loaded as they open) and DNS zones (dyndns/zones.jsx, all at once through ItemTree). Rows are flat siblings in one role="tree"; their depth is aria-level and the indentation. The keyboard works as in a file tree: up and down move, right opens or goes in, left closes or goes to the parent, Enter and Space select, Home and End jump.

// useTreeExpansion: which branches are open, remembered per browser under storageKey. A branch is named by its path; with defaultOpen everything starts open and what is stored are the closed ones. Closing a branch of a tree that starts closed forgets the open ones below it ("<path>/…"), as a source's subtree in the groups browser.
export function useTreeExpansion({ storageKey, defaultOpen = false }) {
    const [flipped, setFlipped] = useLocalStorage({ key: storageKey, defaultValue: [], getInitialValueInEffect: false });
    const set = new Set(flipped);
    const isOpen = (path) => (defaultOpen ? !set.has(path) : set.has(path));
    const toggle = (path) => setFlipped(prev => {
        if (prev.includes(path)) return defaultOpen ? prev.filter(p => p !== path) : prev.filter(p => p !== path && !p.startsWith(`${path}/`));
        return [...prev, path];
    });
    // Opens every path given (the way down to a revealed or selected node).
    const expand = (paths) => setFlipped(prev => (defaultOpen ? prev.filter(p => !paths.includes(p)) : [...new Set([...prev, ...paths])]));
    return { isOpen, toggle, expand };
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

// TreeRow: one line. The arrow opens and closes; the line itself does onClick (select, or open where a node has nothing to show). `label` is shortened to one line, `title` (the long form) shows as its tooltip, `sub` is a second line. `badge` and `count` sit at the end, `action` is always shown, `hoverAction` only on hover, focus and selection. `muted` dims the label (a node that only groups others, or one not in use); a row with `selectable={false}` is never selected (no aria-selected), its onClick then is usually onToggle.
export function TreeRow({ rowRef, depth = 0, open, openable, onToggle, onClick, selected, selectable = true, muted, icon, label, title, sub, count, badge, action, hoverAction }) {
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
    const text = <Text size="sm" truncate fw={selected ? 600 : 400} c={muted ? 'dimmed' : undefined}>{label}</Text>;
    return (
        <Group ref={rowRef} className="tree-row" role="treeitem" aria-level={depth + 1} aria-selected={selectable ? !!selected : undefined} aria-expanded={openable ? !!open : undefined}
            tabIndex={selectable && selected ? 0 : -1} onKeyDown={onKeyDown}
            gap={4} wrap="nowrap" pl={depth * 18} pr={6} py={3} onClick={onClick}
            style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)' }}>
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

// TreeFilter: the search box above a tree; Escape and the x clear it (onClear, by default emptying it).
export function TreeFilter({ value, onChange, onClear, label, clearLabel, ...props }) {
    const clear = onClear ?? (() => onChange(''));
    return (
        <TextInput leftSection={<Search size={14} />} value={value} placeholder={label} aria-label={label}
            onChange={e => onChange(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Escape' && clear()}
            rightSection={value ? <CloseButton size="sm" aria-label={clearLabel} onClick={clear} /> : null} {...props} />
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

// ItemTree: a tree of data that is all there (roots and getChildren). `row(item, {depth, selected, open})` returns the TreeRow props that depend on the item (icon, label, title, muted, sub, badge, count, action, hoverAction). Items for which `isSelectable` says no (by default all are selectable) only group the ones below: a click opens and closes them. With a `query`, only the items `matches` and their way down are shown, all open, and `noMatch` when there is none.
export function ItemTree({ label, roots, getId, getChildren, row, selectedId, onSelect, isSelectable = () => true, isOpen, toggle, query, matches, noMatch }) {
    const visible = query ? filterTree(roots, getId, getChildren, (it) => matches(it, query)) : null;
    const render = (item, depth, seen) => {
        const id = getId(item);
        if (seen.has(id) || (visible && !visible.has(id))) return null;
        const children = getChildren(item);
        const openable = !visible && children.length > 0;
        const open = visible ? true : isOpen(id);
        const selectable = isSelectable(item);
        const selected = selectable && id === selectedId;
        const inner = new Set([...seen, id]);
        return (
            <Fragment key={id}>
                <TreeRow depth={depth} open={open} openable={openable} onToggle={() => toggle(id)} onClick={selectable ? () => onSelect(item) : () => openable && toggle(id)} selected={selected} selectable={selectable}
                    {...row(item, { depth, selected, open })} />
                {open && children.map(child => render(child, depth + 1, inner))}
            </Fragment>
        );
    };
    if (visible && visible.size === 0) return <Text size="sm" c="dimmed" p="xs">{noMatch}</Text>;
    return <Tree label={label}>{roots.map(r => render(r, 0, new Set()))}</Tree>;
}
