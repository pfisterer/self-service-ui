import { useState } from 'react';

// useNodeDialog holds "which dialog is open, for which node" for a view.
// Cards report (action, node) via onAction; the view renders ONE instance of
// each dialog and drives it from this state.
//
//   const dlg = useNodeDialog();
//   <ProjectCard onAction={dlg.open} … />
//   <RejectModal key={dlg.key} opened={dlg.is('reject')} node={dlg.node} onClose={dlg.close} … />
//
// `key` is what resets a dialog's fields. Every one of these modals used to
// carry an effect that cleared its state on open — a setState in an effect
// body, and one more thing to forget when adding the next dialog. Keying on
// "which action, which node" makes React throw the old instance away instead.
export function useNodeDialog() {
    const [state, setState] = useState(null); // { action, node } | null

    return {
        node: state?.node ?? null,
        open: (action, node) => setState({ action, node }),
        close: () => setState(null),
        is: (action) => state?.action === action,
        key: state ? `${state.action}:${state.node?.id ?? ''}` : 'closed',
    };
}
