import { Alert, Button, Group, Loader } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Delayed } from '/helper/delayed.jsx';
import { CONFLICT, formatError } from '/helper/api-error.js';
import { useErrorModal } from '/providers/error-modal.jsx';

// The two states every list view has to render before it can render anything,
// so that they look and behave the same everywhere. Each view used to spell
// both out, and they had drifted: some showed a bare "Retry Load" button with
// no message, others an alert with no way to retry.

export function Loading({ size = 'lg' }) {
    // Delayed: a fetch that answers in 80ms should not flash a spinner.
    return <Delayed><Loader size={size} /></Delayed>;
}

/**
 * LoadError shows why a query failed and offers to run it again.
 * `query` is the object returned by useQuery.
 */
export function LoadError({ query, title = 'Could not load' }) {
    return (
        <Alert icon={<AlertCircle size="16" />} title={title} color="red">
            <Group justify="space-between" wrap="nowrap" align="center">
                <span>{formatError(query.error)}</span>
                <Button size="xs" variant="light" onClick={() => query.refetch()} loading={query.isFetching}>
                    Try again
                </Button>
            </Group>
        </Alert>
    );
}

/**
 * useApiMutation wires a write to the two things every write here needs: the
 * shared error dialog, and invalidating the queries whose answer the write just
 * changed. `invalidates` is a list of query keys.
 *
 * Views used to do this by hand — a try/catch around the call plus a `reload`
 * callback threaded down through props to tell a sibling component to refetch.
 *
 * `reportErrors`:
 *   'modal'  (default) — failures open the shared error dialog. Right for a
 *             write triggered from a page, where there is no obvious place to
 *             put the message.
 *   'inline' — the caller renders `mutation.error` itself. Right inside a
 *             dialog: stacking an error modal on top of the form the user is
 *             still looking at hides the fields they need to correct.
 *
 * A 409 never follows `reportErrors`. It does not mean the input was wrong, so
 * showing it inline next to the fields invites the user to "fix" something that
 * was never broken — the request simply lost a race against someone else's
 * decision. It is handled here for every write at once: refresh what the write
 * would have changed, tell the user in the shared dialog, and let `onConflict`
 * dismiss whatever form they were looking at.
 */
export function useApiMutation({ mutationFn, invalidates = [], onSuccess, onError, onConflict, reportErrors = 'modal' }) {
    const queryClient = useQueryClient();
    const { showError } = useErrorModal();

    const invalidateAll = () =>
        Promise.all(invalidates.map(key => queryClient.invalidateQueries({ queryKey: key })));

    return useMutation({
        mutationFn,
        onSuccess: async (data, variables, context) => {
            await invalidateAll();
            await onSuccess?.(data, variables, context);
        },
        onError: async (error, variables, context) => {
            if (error?.status === CONFLICT) {
                await invalidateAll();
                onConflict?.(error, variables, context);
                showError(`${formatError(error)} — the view has been refreshed.`);
                return;
            }
            if (onError) onError(error, variables, context);
            else if (reportErrors === 'modal') showError(formatError(error));
        },
    });
}
