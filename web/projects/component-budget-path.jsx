import { Text } from '@mantine/core';

// A budget's name alone is ambiguous: two budgets called "Vorlesung", one under
// "CAS" and one under "DHBW Mannheim", read the same. Wherever the portal names
// a budget, it names it by its path instead. The API attaches the paths
// (parent_path on every node, budget_path on every allocation): the budgets
// from below the root down to the one meant, root-most first, the root left out
// because every path starts there.

const SEP = ' › ';

// pathNames turns a path into names, falling back to `name` when there is none —
// a node directly under the root has an empty path, and an older API none at
// all.
export function pathNames(path, name) {
    const names = (path || []).map(p => p.name || p.id).filter(Boolean);
    return names.length ? names : (name ? [name] : []);
}

// budgetPathText is the path as one line, for option labels and other places
// that take a string.
export function budgetPathText(path, name, sep = SEP) {
    return pathNames(path, name).join(sep);
}

// budgetLabel names a budget node by its own place in the tree: the path to its
// parent plus itself.
export function budgetLabel(budget, sep = SEP) {
    if (!budget) return '';
    const own = budget.name || budget.id;
    return [...pathNames(budget.parent_path), own].filter(Boolean).join(sep);
}

// BudgetPath shows a path with the way to the budget dimmed, so its own name
// still stands out.
export function BudgetPath({ path, name, size = 'sm', inherit = false }) {
    const names = pathNames(path, name);
    if (!names.length) return null;
    const last = names[names.length - 1];
    const above = names.slice(0, -1);
    return (
        <Text span={inherit} size={size} inherit={inherit}>
            {above.length > 0 && (
                <Text span inherit c="dimmed">{above.join(SEP)}{SEP}</Text>
            )}
            {last}
        </Text>
    );
}
