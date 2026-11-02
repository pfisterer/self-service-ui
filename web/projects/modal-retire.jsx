import { useState } from 'react';
import { Checkbox, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { formatError } from '/helper/api-error.js';
import { ConfirmModal } from '/providers/confirm.jsx';
import { useProjectConfig } from './projects.jsx';
import { deletesOnRequest, nodeTitle, projectKinds } from './util-project.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';

// RetireModal deletes a project (mode 'release'): it ends at once and is
// deleted for good after the grace period, or right away when asked — or
// deletes a project already on its way out for good right away (mode
// 'delete'). What follows depends on the deployment — archived or not,
// deleted when, still charged or not — so the dialog says exactly that, from
// the config, instead of one sentence that is wrong somewhere.
//
// It is the app's confirmation dialog (ConfirmModal) with one option inside;
// deleting right away cannot be undone and takes everything in the project
// with it, so it asks for the project's name, like every deletion here.
export function RetireModal({ opened, onClose, onDone, node, mode = 'release' }) {
    const { t, i18n } = useTranslation();
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

    // A workspaces or LLM project lives at the AI service instead of OpenStack; a project may have both. A project holding nothing is told the cloud's story, as before.
    const kinds = projectKinds(node, config?.resources);
    const cloud = kinds.length === 0 || kinds.includes('cloud');
    const lab = kinds.includes('workspaces');
    const llm = kinds.includes('llm');
    const consequences = deleting
        ? [cloud && t('projects.retire.deleteWhat'), lab && t('projects.retire.deleteWorkspaces'), llm && t('projects.retire.deleteKeys'), t('projects.retire.deleteAfter')].filter(Boolean)
        : releaseConsequences(t, i18n.language, retirement, { cloud, lab, llm });

    return (
        <ConfirmModal
            opened={opened}
            onCancel={onClose}
            onConfirm={() => run.mutate()}
            title={t(mode === 'delete' ? 'projects.retire.deleteTitle' : 'projects.retire.releaseTitle', { name: nodeTitle(node) })}
            message={<Text size="sm" fw={600}>{t(deleting ? 'projects.retire.irreversible' : 'projects.retire.noWayBack')}</Text>}
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

// releaseConsequences: what deleting a project leads to here, one sentence per
// step — it ends at once, what that means for each of its parts, when it is
// deleted for good, and what it costs its budget meanwhile.
export function releaseConsequences(t, language, r, { cloud, lab, llm }) {
    const out = [t('projects.retire.endsNow')];
    if (cloud) out.push(t(r.archive ? 'projects.retire.archive' : 'projects.retire.noArchive'));
    if (lab) out.push(t('projects.retire.endsWorkspaces'));
    if (llm) out.push(t('projects.retire.endsKeys'));

    // When each part goes for good: OpenStack by the reconciler's mode, the Lab/AI part by its own grace days.
    const cloudDays = r.delete === 'after-grace' ? (r.deleteGraceDays || 30) : 0;
    const labDays = r.aiaasDeleteGraceDays || 0;
    const parts = [cloud && 'cloud', lab && 'workspaces', llm && 'llm'].filter(Boolean);
    const timed = (p) => (p === 'cloud' ? cloudDays : labDays) > 0;
    if (parts.every(timed)) {
        const count = Math.max(...parts.map(p => (p === 'cloud' ? cloudDays : labDays)));
        out.push(t('projects.retire.deletedAfter', { count, what: listOf(language, parts.map(p => t(`projects.retire.what.${p}`))) }));
    } else {
        for (const p of parts) {
            const what = t(`projects.retire.what.${p}`);
            if (timed(p)) out.push(t('projects.retire.partDeletedAfter', { count: p === 'cloud' ? cloudDays : labDays, what }));
            else if (deletesOnRequest(r)) out.push(t('projects.retire.keptOnRequest', { what }));
            else out.push(t('projects.retire.keptForever', { what }));
        }
    }

    // The budget: a deleted project keeps holding it until it is gone for good (released is charged), an archived one only its storage; deleting it for good at once frees it.
    if (!cloud) out.push(t(r.chargeReleased ? 'projects.retire.chargeUntilGone' : 'projects.retire.chargeNothingNow'));
    else if (r.archive) out.push(t(r.chargeArchived ? 'projects.retire.chargeStorage' : 'projects.retire.chargeNothing'));
    else if (r.chargeReleased) out.push(t('projects.retire.chargeUntilGone'));
    return out;
}

// listOf joins names the way the language does ("a, b and c").
function listOf(language, items) {
    try {
        return new Intl.ListFormat(language, { type: 'conjunction' }).format(items);
    } catch {
        return items.join(', ');
    }
}
