import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '@mantine/hooks';
import { ActionIcon, Box, CloseButton, FlatTreeNode, Group, Loader, Text, TextInput, Tooltip, Tree as MantineTree, UnstyledButton, flattenTreeData, useTree } from '@mantine/core';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import './tree.css';

// The one tree of the master-detail pages (helper/master-detail.jsx): the budgets (projects/view-my-budgets.jsx, branches loaded page by page as they open), the groups (groups/browser.jsx, sources as sections, branches loaded as they open) and the DNS zones (dyndns/zones.jsx, all at once under caption headings). Built on Mantine's Tree in its flat form: useTree holds expansion, selection and the loading of a branch (onLoadChildren, with its spinner and error per row), flattenTreeData and FlatTreeNode give the rows, their guide lines (withLines), the arrow keys and the ARIA roles. What it adds is defined here once for all three: sections (header rows that only open and close, also as small captions), rows that are muted or not selectable, the paging row, a fixed column of signs at the right, a client-side filter, expansion remembered per browser with expand-all and collapse-all (useTreeExpansion, useExpandAll and TreeFilter), the selection compared with what the URL names, and the rows above a selected item opened once.
//
// A node is { id, value?, label, title?, sub?, icon?, muted?, badge?, count?, action?, section?, caption?, selectable?, children?, hasChildren?, loading?, error?, more? }:
// - id names the node's place (unique in the tree, the key of its expansion); value (by default the id) is what selectedId is compared with, so an item shown in several places (a group in two groups) is selected in all of them.
// - label is the line, shortened to fit, or with wrap set wrapped onto further lines at its dots and hyphens (DNS names); title its tooltip (the long form), sub a second line, icon before it; badge (signs) and count sit at the right end, action after them (a button that does not select the row); muted dims the label.
// - section: a header row (the groups' sources, the zones' domains) that is never selected and opens and closes by click, Enter and Space; caption sets it as a small dimmed caption with space above all but the first. The rows below a section hang from it with guide lines, like the children of a budget.
// - selectable false: a row that is never selected; a click opens and closes it.
// - children are the loaded children; hasChildren says there are children not loaded yet (the row has an arrow, and opening it calls onLoadChildren); loading and error are the page's own state of loading them (a spinner instead of the arrow, a warning sign).
// - more: the paging row at the end of a list, { onLoad?, loaded?, total? }: with onLoad a "show more" button (loaded/total beside it), else only its label, dimmed.

// One level is indented this far (Mantine's levelOffset, as the budget tree always had).
const TREE_INDENT = 20;

const noop = () => {};
const valueOf = (node) => node.value ?? node.id;
const isBranch = (node) => !node.more && ((node.children?.length ?? 0) > 0 || !!node.hasChildren);
const isSelectable = (node) => !node.section && !node.more && node.selectable !== false;

// indexNodes: every node by id, with its level (1 for the top) and its parent's id.
function indexNodes(nodes) {
    const byId = new Map();
    const walk = (list, level, parentId) => {
        for (const node of list ?? []) {
            if (byId.has(node.id)) continue;
            byId.set(node.id, { node, level, parentId });
            walk(node.children, level + 1, node.id);
        }
    };
    walk(nodes, 1, null);
    return byId;
}

function ancestorsOf(index, id) {
    const out = [];
    for (let p = index.get(id)?.parentId; p != null; p = index.get(p)?.parentId) out.push(p);
    return out;
}

// useTreeExpansion: which branches are open, remembered per browser under storageKey. `defaultOpen` says how a branch starts (true or false for all, or a function of its id, such as the budget tree's first level), and what is stored are the branches flipped from that, so a tree whose branches start open stores the ones closed by hand and the other way round. Closing a branch keeps what is open below it, for when it opens again. Beside the branches it remembers whether expand-all is on (useExpandAll); closing a branch by hand ends it.
export function useTreeExpansion({ storageKey, defaultOpen = false }) {
    const [flipped, setFlipped] = useLocalStorage({ key: storageKey, defaultValue: [], getInitialValueInEffect: false });
    const [allMode, setAllMode] = useLocalStorage({ key: `${storageKey}.all`, defaultValue: false, getInitialValueInEffect: false });
    const startsOpen = (id) => (typeof defaultOpen === 'function' ? !!defaultOpen(id) : !!defaultOpen);
    const set = new Set(flipped);
    const isOpen = (id) => startsOpen(id) !== set.has(id);
    const setOpen = (ids, open) => setFlipped(prev => {
        const next = new Set(prev);
        for (const id of ids) {
            if (startsOpen(id) !== open) next.add(id);
            else next.delete(id);
        }
        return [...next];
    });
    const open = (id) => setOpen([id], true);
    const close = (id) => {
        setOpen([id], false);
        setAllMode(false);
    };
    return {
        isOpen, open, close,
        // The ids stored open (in a tree whose branches start closed: every branch opened, also those below a closed one).
        opened: flipped.filter(isOpen),
        toggle: (id) => (isOpen(id) ? close(id) : open(id)),
        // Opens every id given (the way down to a revealed or linked item), whether its node is loaded or not.
        expand: (ids) => setOpen(ids, true),
        // For useExpandAll.
        startsOpen, setOpen, setFlipped, allMode, setAllMode,
    };
}

// useExpandAll: the expand-all and collapse-all toggle beside a tree's filter (TreeFilter's expandAll), over the branches among `nodes` (the tree's nodes as far as loaded). Expand-all is a mode, remembered: while it is on, a branch that arrives later (loaded as its parent opened) opens too, so a tree that loads lazily opens level by level. Collapse-all closes every branch but the ones `keepOpen` names (the budget tree keeps its first level open). `allOpen` is whether the mode is on or every branch is open (and collapse-all would close one).
export function useExpandAll(expansion, nodes, { keepOpen } = {}) {
    const { isOpen, startsOpen, setOpen, setFlipped, allMode, setAllMode } = expansion;
    const index = useMemo(() => indexNodes(nodes), [nodes]);
    const branches = [...index.values()].filter(e => isBranch(e.node)).map(e => e.node.id);
    // Pressed while the mode is on, or while every branch is open and collapsing would close one (not where only branches kept open are known).
    const allOpen = allMode || (branches.some(id => !keepOpen?.(id)) && branches.every(isOpen));

    // While the mode is on, every branch seen for the first time opens; each only once, so one closed again by hand is not reopened by the next pass.
    const seen = useRef(new Set());
    useEffect(() => {
        if (!allMode) {
            seen.current.clear();
            return;
        }
        const fresh = branches.filter(id => !seen.current.has(id));
        fresh.forEach(id => seen.current.add(id));
        const closed = fresh.filter(id => !isOpen(id));
        if (closed.length) setOpen(closed, true);
    }, [allMode, index]); // eslint-disable-line react-hooks/exhaustive-deps -- the mode and the nodes known say when to run; isOpen and setOpen are new every render

    const toggle = () => {
        if (allOpen) {
            setAllMode(false);
            // Every known branch closes but those kept open; of the branches not loaded only the ones stored closed stay stored.
            setFlipped(prev => {
                const next = prev.filter(id => !index.has(id) && startsOpen(id));
                for (const id of branches) if (startsOpen(id) !== !!keepOpen?.(id)) next.push(id);
                return [...new Set(next)];
            });
        } else {
            setAllMode(true);
            setOpen(branches, true);
        }
    };
    return { allOpen, toggle };
}

// filterTree: the ids to show for a filter — every node that matches and the way down to it.
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

// toTreeData: the nodes in Mantine's shape, only those `visible` lets through where a filter is set. An empty list of children stays undefined: Mantine reads an array as "has children", and [] would give an arrow that opens nothing.
function toTreeData(nodes, visible) {
    const map = (list) => (list ?? []).filter(n => !visible || visible.has(n.id)).map(n => {
        const children = map(n.children);
        return { value: n.id, label: n.id, hasChildren: !visible && !!n.hasChildren, children: children.length ? children : undefined, nodeProps: { node: n } };
    });
    return map(nodes);
}

// NavTree: the tree itself. `expansion` comes from useTreeExpansion (without one, as for a flat list of search results, nothing opens). A click on a row selects it (onSelect with the node) and, with `openOnSelect`, opens it where it is closed, never closes it; the arrow opens and closes. Keys as in a file tree: up and down move, right opens or goes in, left closes or goes to the parent, Enter and Space select (open and close a section, load the next page on a paging row), Home and End jump; Tab reaches the selected row, or else the first. With a `query`, only the nodes `matches` and their way down are shown, all open, and `noMatch` where there is none. A selected item whose rows above are closed (a link, a reload) has them opened, once per item selected, and is scrolled to, as is the row `scrollTo` names.
export function NavTree({ label, nodes, expansion, selectedId, onSelect = noop, openOnSelect = false, withLines = false, onLoadChildren, query = '', matches, noMatch, empty, scrollTo }) {
    const rootRef = useRef(null);
    const q = query.trim();
    const filtering = !!q && !!matches;
    const index = useMemo(() => indexNodes(nodes), [nodes]);
    const visible = useMemo(() => (filtering ? filterTree(nodes ?? [], n => n.id, n => n.children ?? [], n => matches(n, q)) : null), [nodes, filtering, q]); // eslint-disable-line react-hooks/exhaustive-deps -- matches is a function of the page, the query decides
    const data = useMemo(() => toTreeData(nodes, visible), [nodes, visible]);

    const expandedState = {};
    for (const { node } of index.values()) if (isBranch(node)) expandedState[node.id] = filtering || !!expansion?.isOpen(node.id);
    const selectedState = selectedId == null ? [] : [...index.values()].filter(e => isSelectable(e.node) && valueOf(e.node) === selectedId).map(e => e.node.id);
    const tree = useTree({
        expandedState,
        selectedState,
        onExpandedStateChange: noop,
        onSelectedStateChange: noop,
        onNodeExpand: (id) => !filtering && index.has(id) && isBranch(index.get(id).node) && expansion?.open(id),
        onNodeCollapse: (id) => !filtering && expansion?.close(id),
        onLoadChildren,
    });
    // The controller learns the data (for loading a branch as it opens) when its shape changes; not on every render, where a page builds its nodes anew.
    const shape = data.length + ':' + [...index.values()].map(e => `${e.node.id}${e.node.hasChildren ? '+' : ''}${e.node.children?.length ?? ''}`).join('|') + (visible ? `?${visible.size}` : '');
    useEffect(() => {
        tree.initialize(data);
    }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps -- the shape says when; the controller and the data are new every render

    // Rows: Mantine's flat rows, with guide lines from a section to its rows too, as from a budget to its children: without them a row below a section that has no children of its own (no arrow) hung in the air.
    const flat = flattenTreeData(data, expandedState);

    // Selected and linked: open the rows above it, once per item selected, and scroll it into view.
    const revealed = useRef(null);
    const scrollTarget = useRef(null);
    useEffect(() => {
        if (!expansion || filtering || selectedId == null || revealed.current === selectedId) return;
        const hits = [...index.values()].filter(e => isSelectable(e.node) && valueOf(e.node) === selectedId);
        if (hits.length === 0) return;
        revealed.current = selectedId;
        if (hits.some(e => ancestorsOf(index, e.node.id).every(id => expansion.isOpen(id)))) return;
        const closed = ancestorsOf(index, hits[0].node.id).filter(id => !expansion.isOpen(id));
        expansion.expand(closed);
        scrollTarget.current = hits[0].node.id;
    });
    useEffect(() => {
        if (scrollTo != null) scrollTarget.current = scrollTo;
    }, [scrollTo]);

    // What Mantine's flat row leaves out: aria-level (a flat tree has no nesting to tell it), and no aria-selected on a row that is never selected. And the scroll to a revealed row once it is there.
    useLayoutEffect(() => {
        for (const el of rootRef.current?.querySelectorAll('[role="treeitem"]') ?? []) {
            el.setAttribute('aria-level', el.dataset.level);
            const node = index.get(el.dataset.value)?.node;
            if (node && !isSelectable(node)) el.removeAttribute('aria-selected');
            if (scrollTarget.current != null && el.dataset.value === scrollTarget.current) {
                scrollTarget.current = null;
                el.scrollIntoView?.({ block: 'nearest' });
            }
        }
    });

    const toggle = (id) => tree.toggleExpanded(id);
    // A click, Enter or Space on a row.
    const activate = (node) => {
        if (node.more) node.more.onLoad?.();
        else if (!isSelectable(node)) {
            if (isBranch(node) && !filtering) toggle(node.id);
        } else {
            onSelect(node);
            if (openOnSelect && !filtering && isBranch(node) && !expandedState[node.id]) tree.expand(node.id);
        }
    };
    const items = () => [...(rootRef.current?.querySelectorAll('[role="treeitem"]') ?? [])];
    const focus = (el) => {
        if (!el) return;
        el.setAttribute('data-focus-ring', 'true');
        el.focus();
    };
    const onKeyDown = (e) => {
        if (e.target.getAttribute?.('role') !== 'treeitem') return;
        if (e.key === 'Enter' || e.key === ' ') {
            const node = index.get(e.target.dataset.value)?.node;
            if (!node) return;
            e.preventDefault();
            activate(node);
        } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            focus(e.key === 'Home' ? items()[0] : items().at(-1));
        }
    };

    if (filtering && visible.size === 0) return <Text size="sm" c="dimmed" p="xs">{noMatch}</Text>;
    if (!nodes?.length && empty) return empty;
    const tabbable = flat.find(it => selectedState.includes(it.node.value))?.node.value ?? flat[0]?.node.value;
    const firstCaption = flat.find(it => it.node.nodeProps.node.section && it.node.nodeProps.node.caption)?.node.value;
    const renderNode = (payload) => {
        const node = payload.node.nodeProps.node;
        return (
            <NavRow node={node} payload={payload} filtering={filtering} selected={payload.selected && isSelectable(node)}
                onClick={(e) => {
                    e.stopPropagation();
                    e.currentTarget.closest('[role="treeitem"]')?.focus();
                    activate(node);
                }}
                onToggle={() => toggle(node.id)} />
        );
    };
    return (
        <Box ref={rootRef} role="tree" aria-label={label} className={`${MantineTree.classes.root} nav-tree`} data-tree-root data-with-lines={withLines || undefined}
            style={{ '--level-offset': `${TREE_INDENT}px` }} onKeyDown={onKeyDown}>
            {flat.map(item => {
                const node = item.node.nodeProps.node;
                const spaced = node.section && node.caption && node.id !== firstCaption;
                return (
                    <FlatTreeNode key={item.node.value} node={item.node} level={item.level} parent={item.parent} hasChildren={item.hasChildren} expanded={item.expanded}
                        tree={tree} expandOnClick={false} expandOnSpace={false} renderNode={renderNode} linesPath={item.linesPath}
                        tabIndex={item.node.value === tabbable ? 0 : -1}
                        style={spaced ? { marginTop: 'var(--mantine-spacing-sm)' } : undefined} />
                );
            })}
        </Box>
    );
}

// breakable puts a line-break opportunity after every dot of a name (after a hyphen the browser breaks by itself), so a long DNS name wraps at its own joints and only a single overlong label breaks inside (overflowWrap anywhere).
function breakable(text) {
    if (typeof text !== 'string' || !text.includes('.')) return text;
    return text.split('.').flatMap((part, i, all) => (i < all.length - 1 ? [part, '.', <wbr key={i} />] : [part]));
}

// NavRow: one row's content inside Mantine's row (its label element, which carries the indentation).
function NavRow({ node, payload, filtering, selected, onClick, onToggle }) {
    const { t } = useTranslation();
    const { expanded, hasChildren, isLoading, loadError, elementProps } = payload;
    if (node.more) return <MoreRow node={node} elementProps={elementProps} />;
    const loading = isLoading || node.loading;
    const error = loadError || node.error;
    const label = node.wrap ? breakable(node.label) : node.label;
    const wrapProps = node.wrap ? { style: { overflowWrap: 'anywhere', flex: 1, minWidth: 0 } } : { truncate: true };
    const text = node.caption
        ? <Text size="xs" {...wrapProps} fw={600} c="dimmed" lts="0.04em">{label}</Text>
        : <Text size="sm" {...wrapProps} fw={selected ? 600 : 400} c={node.muted ? 'dimmed' : undefined}>{label}</Text>;
    return (
        <Group {...elementProps} className={`${elementProps.className} nav-tree-row`} data-selected={selected || undefined} gap={4} wrap="nowrap" pr={6} py={3} onClick={onClick}>
            {loading
                ? <Box w={14} style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}><Loader size={12} /></Box>
                : hasChildren && !filtering
                    ? (
                        <UnstyledButton tabIndex={-1} aria-label={t(expanded ? 'projects.tree.collapse' : 'projects.tree.expand')}
                            onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ display: 'flex', flexShrink: 0 }}>
                            <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }} />
                        </UnstyledButton>
                    )
                    : <Box w={14} style={{ flexShrink: 0 }} />}
            {node.icon && <Box c="dimmed" style={{ display: 'flex', flexShrink: 0 }}>{node.icon}</Box>}
            <Box style={{ flex: 1, minWidth: 0 }}>
                {node.title ? <Tooltip label={node.title} openDelay={400} multiline maw={360} style={{ overflowWrap: 'anywhere' }}>{text}</Tooltip> : text}
                {node.sub && <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{node.sub}</Text>}
            </Box>
            {/* A failed load stays on the row it belongs to instead of an error that loses the context. */}
            {error && (
                <Tooltip label={`${t('projects.tree.loadError')}: ${error.message ?? error}`}>
                    <AlertTriangle size={12} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            {node.badge}
            {node.count != null && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{node.count}</Text>}
            {node.action}
        </Group>
    );
}

// MoreRow: the last row of a list that has more than is shown. With onLoad it fetches the next page and says how much is still hidden (a page boundary that says nothing reads as the end of the list); without, it only says so.
function MoreRow({ node, elementProps }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const { onLoad, loaded, total } = node.more;
    const load = async (e) => {
        e.stopPropagation();
        e.currentTarget.closest('[role="treeitem"]')?.focus();
        if (loading || !onLoad) return;
        setLoading(true);
        try {
            await onLoad();
        } finally {
            setLoading(false);
        }
    };
    return (
        <Group {...elementProps} className={`${elementProps.className} nav-tree-row nav-tree-more`} gap={4} wrap="nowrap" pr={6} py={3} onClick={load}>
            <Box w={14} style={{ flexShrink: 0 }} />
            {onLoad
                ? (
                    <>
                        {loading ? <Loader size={12} /> : <ChevronDown size={14} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />}
                        <Text size="xs" c="blue" fw={500}>
                            {loading ? t('projects.actions.loading') : node.label}
                            {total != null && <Text span size="xs" c="dimmed" fw={400}>{` (${loaded}/${total})`}</Text>}
                        </Text>
                    </>
                )
                : <Text size="xs" c="dimmed">{node.label}</Text>}
        </Group>
    );
}

// TreeFilter: the search box above a tree; Escape and the x clear it (onClear, by default emptying it). With `expandAll` (useExpandAll), a small button beside it opens every branch, or closes them all where all are open, hidden while the box holds a search. `busy` shows a spinner in place of the magnifier (a search on the server under way); `placeholder` and the toggle's labels default to `label` and "Expand all"/"Collapse all".
export function TreeFilter({ value, onChange, onClear, label, placeholder, clearLabel, busy, expandAll, expandAllLabel, collapseAllLabel, size, ...props }) {
    const { t } = useTranslation();
    const clear = onClear ?? (() => onChange(''));
    const input = (
        <TextInput size={size} leftSection={busy ? <Loader size={12} /> : <Search size={14} />} value={value} placeholder={placeholder ?? label} aria-label={label}
            onChange={e => onChange(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Escape' && clear()}
            rightSection={value ? <CloseButton size={size === 'xs' ? 'xs' : 'sm'} aria-label={clearLabel} onClick={clear} /> : null} {...props} />
    );
    if (!expandAll) return input;
    const allOpen = expandAll.allOpen;
    const toggleLabel = allOpen ? (collapseAllLabel ?? t('projects.tree.collapseAll')) : (expandAllLabel ?? t('projects.tree.expandAll'));
    return (
        <Group gap="xs" wrap="nowrap">
            <Box style={{ flex: 1 }}>{input}</Box>
            {!value.trim() && (
                <Tooltip label={toggleLabel}>
                    <ActionIcon size="sm" variant={allOpen ? 'light' : 'subtle'} color="gray" aria-label={toggleLabel} aria-pressed={!!allOpen} onClick={() => expandAll.toggle()}>
                        {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
}
