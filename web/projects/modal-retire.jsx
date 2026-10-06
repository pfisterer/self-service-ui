import { useState } from 'react';
import { Checkbox, List, Text, TextInput } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { useProjectConfig } from './projects.jsx';
import { COLOR, deletesOnRequest, nodeTitle } from './util-project.jsx';

// RetireModal gives a project up (mode 'release') or deletes a released one for
// good (mode 'delete'). What follows depends on the deployment — archived or
// not, deleted when, still charged or not — so the dialog says exactly that,
// from the config, instead of one sentence that is wrong somewhere.
//
// Deleting cannot be undone and takes everything in the project with it, so it
// asks for the project's name, the way the agent tools do.
export function RetireModal({ opened, onClose, onDone, node, mode = 'release' }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const config = useProjectConfig();
    const retirement = config?.retirement ?? {};
    const [deleteNow, setDeleteNow] = useState(false);
    const [typed, setTyped] = useState('');

    const run = useApiMutation({
        mutationFn: () => mode === 'delete'
            ? api.requestDeletion(node.id)
            : api.release(node.id, { deleteNow }),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
        onConflict: () => { onDone?.(); onClose(); },
    });

    if (!node) return null;

    const immediately = retirement.delete === 'immediately';
    const offerDelete = mode === 'release' && deletesOnRequest(retirement) && !immediately;
    const deleting = mode === 'delete' || deleteNow || immediately;
    const name = node.name || node.id;
    const confirmed = !deleting || typed.trim() === name;

    const consequences = mode === 'delete' || deleteNow || immediately
        ? [t('projects.retire.deleteWhat'), t('projects.retire.deleteAfter')]
        : releaseConsequences(t, retirement);

    const submit = (e) => {
        e.preventDefault();
        if (confirmed) run.mutate();
    };

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="md"
            title={t(mode === 'delete' ? 'projects.retire.deleteTitle' : 'projects.retire.releaseTitle', { name: nodeTitle(node) })}
            onSubmit={submit}
            submitting={run.isPending}
            submitError={run.error && formatError(run.error)}
            submitLabel={t(deleting ? 'projects.actions.deleteForGood' : 'projects.actions.release')}
            submitColor={COLOR.negative}
            submitDisabled={!confirmed}
        >
            <List size="sm" spacing={4}>
                {consequences.map(c => <List.Item key={c}>{c}</List.Item>)}
            </List>
            <Text size="sm" fw={600}>{t('projects.retire.irreversible')}</Text>

            {offerDelete && (
                <Checkbox
                    label={t('projects.retire.deleteNow')}
                    description={t('projects.retire.deleteNowHint')}
                    checked={deleteNow}
                    onChange={(e) => setDeleteNow(e.currentTarget.checked)}
                />
            )}

            {deleting && (
                <TextInput
                    label={<Trans i18nKey="projects.retire.confirmName" values={{ name }}
                        components={{ 1: <Text span ff="monospace" fw={700} size="sm" /> }} />}
                    value={typed}
                    autoComplete="off"
                    data-autofocus
                    onChange={(e) => setTyped(e.currentTarget.value)}
                />
            )}
        </FormModal>
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
