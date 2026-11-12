import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalStorage } from '@mantine/hooks';
import { ActionIcon, Box, CloseButton, FlatTreeNode, Group, Loader, Text, TextInput, Tooltip, Tree as MantineTree, UnstyledButton, flattenTreeData, useTree } from '@mantine/core';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import './tree.css';
import { Fragment } from 'react';


// The one tree of the master-detail pages (helper/master-detail.jsx): the budgets (projects/view-my-budgets.jsx, branches loaded page by page as they open), the groups (groups/browser.jsx, sources as sections, branches loaded as they open) and the DNS zones (dyndns/zones.jsx, all at once under caption headings). Built on Mantine's Tree in its flat form: useTree holds expansion, selection and the loading of a branch (onLoadChildren, with its spinner and error per row), flattenTreeData and FlatTreeNode give the rows, their guide lines (withLines), the arrow keys and the ARIA roles. What it adds is defined here once for all three: sections (header rows that only open and close, also as small captions), rows that are muted or not selectable, the paging row, a fixed column of signs at the right, a client-side filter, expansion remembered per browser with expand-all and collapse-all (useTreeExpansion and TreeFilter), the selection compared with what the URL names, and the rows above a selected item opened once.
//
// A node is { id, value?, label, title?, sub?, icon?, muted?, badge?, count?, action?, section?, caption?, selectable?, children?, hasChildren?, loading?, error?, more? }:
// - id names the node's place (unique in the tree, the key of its expansion); value (by default the id) is what selectedId is compared with, so an item shown in several places (a group in two groups) is selected in all of them.
// - label is the line, shortened to fit; title its tooltip (the long form), sub a second line, icon before it; badge (signs) and count sit at the right end, action after them (a button that does not select the row); muted dims the label.
// - section: a header row (the groups' sources, the zones' domains) that is never selected and opens and closes by click, Enter and Space; caption sets it as a small dimmed caption with space above all but the first. The rows right below a section get no guide lines.
// - selectable false: a row that is never selected; a click opens and closes it.
// - children are the loaded children; hasChildren says there are children not loaded yet (the row has an arrow, and opening it calls onLoadChildren); loading and error are the page's own state of loading them (a spinner instead of the arrow, a warning sign).
// - more: the paging row at the end of a list, { onLoad?, loaded?, total? }: with onLoad a "show more" button (loaded/total beside it), else only its label, dimmed.

// One level is indented this far (Mantine's levelOffset, as the budget tree always had).
export const TREE_INDENT = 20;

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

    // Rows: Mantine's flat rows, the rows right below a section without guide lines.
    const underSection = (id) => !!index.get(ancestorsOf(index, id).at(-1))?.node.section;
    const flat = flattenTreeData(data, expandedState).map(item => {
        if (item.level < 2 || !underSection(item.node.value)) return item;
        return { ...item, linesPath: ['none', ...item.linesPath.slice(1)], noTick: item.level === 2 };
    });

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
                        style={{ ...(item.noTick ? { '--nav-tree-tick': 'none' } : {}), ...(spaced ? { marginTop: 'var(--mantine-spacing-sm)' } : {}) }} />
                );
            })}
        </Box>
    );
}

// NavRow: one row's content inside Mantine's row (its label element, which carries the indentation).
function NavRow({ node, payload, filtering, selected, onClick, onToggle }) {
    const { t } = useTranslation();
    const { expanded, hasChildren, isLoading, loadError, elementProps } = payload;
    if (node.more) return <MoreRow node={node} elementProps={elementProps} />;
    const loading = isLoading || node.loading;
    const error = loadError || node.error;
    const text = node.caption
        ? <Text size="xs" truncate fw={600} c="dimmed" lts="0.04em">{node.label}</Text>
        : <Text size="sm" truncate fw={selected ? 600 : 400} c={node.muted ? 'dimmed' : undefined}>{node.label}</Text>;
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

// ---- Legacy (removed once every tree is on NavTree) ----

// useTreeExpansion: which branches are open, remembered per browser under storageKey; expandAll and collapseAll open or close the branches given, allOpen tells whether all of them are open. A branch is named by its path; `defaultOpen` says how a branch starts (true or false for all, or a function of the path for a tree whose branches start differently, such as a section closed at first) and what is stored are the branches flipped from that. Closing a branch that starts closed forgets the open ones below it ("<path>/…"), as a source's subtree in the groups browser.
export function usePathExpansion({ storageKey, defaultOpen = false }) {
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
