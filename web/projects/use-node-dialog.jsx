import { useState } from 'react';

// useNodeDialog holds "which dialog is open, for which node" for a view.
// Cards report (action, node) via onAction; the view renders ONE instance of
// each dialog and drives it from this state.
//
//   const dlg = useNodeDialog();
//   <ProjectCard onAction={dlg.open} … />
//   <RejectModal opened={dlg.is('reject')} node={dlg.node} onClose={dlg.close} … />
export function useNodeDialog() {
    const [state, setState] = useState(null); // { action, node } | null

    return {
        node: state?.node ?? null,
        open: (action, node) => setState({ action, node }),
        close: () => setState(null),
        is: (action) => state?.action === action,
    };
}
