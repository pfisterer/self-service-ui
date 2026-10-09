import { useApiMutation } from '/helper/query-state.jsx';
import { projectKeys } from './query-keys.js';

// useNodeMutation is the mutation every dialog of this section runs on submit:
// the node lists refresh, errors show inside the dialog, and both a success and
// a conflict (409 — the dialog acted on a node that has moved on; nothing to
// correct here) close it and let the refreshed view speak.
//
// onSuccess runs before the dialog closes, for work that belongs to the result.
export function useNodeMutation({ mutationFn, onDone, onClose, onSuccess }) {
    return useApiMutation({
        mutationFn,
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: async (result, variables, context) => {
            await onSuccess?.(result, variables, context);
            onDone?.(result);
            onClose?.();
        },
        onConflict: () => { onDone?.(); onClose?.(); },
    });
}
