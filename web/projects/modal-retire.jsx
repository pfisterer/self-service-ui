import { useState } from 'react';
import { Checkbox, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { formatError } from '/helper/api-error.js';
import { ConfirmModal } from '/providers/confirm.jsx';
import { useProjectConfig } from './projects.jsx';
import { deletesOnRequest, nodeTitle } from './util-project.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';

// RetireModal gives a project up (mode 'release') or deletes a released one for
// good (mode 'delete'). What follows depends on the deployment — archived or
// not, deleted when, still charged or not — so the dialog says exactly that,
// from the config, instead of one sentence that is wrong somewhere.
//
// It is the app's confirmation dialog (ConfirmModal) with one option inside;
// deleting cannot be undone and takes everything in the project with it, so it
// asks for the project's name, like every deletion here.
export function RetireModal({ opened, onClose, onDone, node, mode = 'release' }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const config = useProjectConfig();
    const retirement = config?.retirement ?? {};
    const [deleteNow, setDeleteNow] = useState(false);

    const run = useNodeMutation({
        onDone,
        onClose,
        mutationFn: () => mode === 'delete'
            ? api.requestDeletion(node.id)
            : api.release(node.id, { deleteNow }),
    });

    if (!node) return null;

    const immediately = retirement.delete === 'immediately';
    const offerDelete = mode === 'release' && deletesOnRequest(retirement) && !immediately;
    const deleting = mode === 'delete' || deleteNow || immediately;

    const consequences = deleting
        ? [t('projects.retire.deleteWhat'), t('projects.retire.deleteAfter')]
        : releaseConsequences(t, retirement);

    return (
        <ConfirmModal
            opened={opened}
            onCancel={onClose}
            onConfirm={() => run.mutate()}
            title={t(mode === 'delete' ? 'projects.retire.deleteTitle' : 'projects.retire.releaseTitle', { name: nodeTitle(node) })}
            message={<Text size="sm" fw={600}>{t('projects.retire.irreversible')}</Text>}
            consequences={consequences}
            severity="danger"
            typeToConfirm={deleting ? (node.name || node.id) : undefined}
            confirmLabel={t(deleting ? 'projects.actions.deleteForGood' : 'projects.actions.release')}
            busy={run.isPending}
            error={run.error && formatError(run.error)}
        >
            {offerDelete && (
                <Checkbox
                    label={t('projects.retire.deleteNow')}
                    description={t('projects.retire.deleteNowHint')}
                    checked={deleteNow}
                    onChange={(e) => setDeleteNow(e.currentTarget.checked)}
                />
            )}
        </ConfirmModal>
    );
}

// releaseConsequences: what releasing leads to here, one sentence per step.
function releaseConsequences(t, r) {
    const out = [];
    if (r.archive) {
        out.push(t('projects.retire.archive'));
        if (r.delete === 'after-grace') out.push(t('projects.retire.keptGrace', { count: r.deleteGraceDays || 30 }));
        else if (r.delete === 'on-request') out.push(t('projects.retire.keptOnRequest'));
        else out.push(t('projects.retire.keptForever'));
        out.push(t(r.chargeArchived ? 'projects.retire.chargeStorage' : 'projects.retire.chargeNothing'));
    } else {
        out.push(t('projects.retire.noArchive'));
        if (r.delete === 'after-grace') out.push(t('projects.retire.deletedAfter', { count: r.deleteGraceDays || 30 }));
        if (r.chargeReleased) out.push(t('projects.retire.chargeUntilGone'));
    }
    return out;
}
