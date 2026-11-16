import { useTranslation } from 'react-i18next';
import { Alert, NumberInput, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import { HardDrive } from 'lucide-react';

// StoragePanel sets the limits inside a workspace project's volume and who writes its shared folder (llm-management-api workspace/quotas.go): a member's home (0 = automatic, twice the fair share), the shared folder ~/dhbw/project (0 = no limit of its own), and whether every member or only the managers write there. The project's storage stays the hard bound; group limits are in the groups tab. Saved with the rest of the settings, carried out within a few minutes.
export function StoragePanel({ draft }) {
    const { t } = useTranslation();
    const p = draft.value;
    const set = (k, v) => draft.update(cur => ({ ...cur, [k]: v }));
    const total = p.storage_gb ?? 0;
    if (!(total > 0)) {
        return <Alert color="gray" icon={<HardDrive size={16} />}>{t('gpu.projects.storageLimits.noStorage')}</Alert>;
    }
    const gb = (v) => Math.max(0, Math.min(total, Math.floor(Number(v) || 0)));
    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">{t('gpu.projects.storageLimits.intro', { gb: total })}</Text>
            <Paper withBorder radius="md" p="md">
                <Text size="sm" fw={700} mb="xs">{t('gpu.projects.storageLimits.sharedTitle')}</Text>
                <SegmentedControl size="xs" value={p.shared_write || 'all'} onChange={v => set('shared_write', v)}
                    data={[{ value: 'all', label: t('gpu.projects.storageLimits.writeAll') }, { value: 'managers', label: t('gpu.projects.storageLimits.writeManagers') }]} />
                <Text size="xs" c="dimmed" mt={6}>{t('gpu.projects.storageLimits.writeHint')}</Text>
                <NumberInput mt="sm" w={260} min={0} max={total} suffix=" GB" label={t('gpu.projects.storageLimits.sharedGb')} description={t('gpu.projects.storageLimits.sharedGbHint')}
                    value={p.storage_project_gb || 0} onChange={v => set('storage_project_gb', gb(v))} />
            </Paper>
            <Paper withBorder radius="md" p="md">
                <Text size="sm" fw={700} mb="xs">{t('gpu.projects.storageLimits.homeTitle')}</Text>
                <NumberInput w={260} min={0} max={total} suffix=" GB" label={t('gpu.projects.storageLimits.homeGb')} description={t('gpu.projects.storageLimits.homeGbHint')}
                    value={p.storage_home_gb || 0} onChange={v => set('storage_home_gb', gb(v))} />
            </Paper>
            <Text size="xs" c="dimmed">{t('gpu.projects.storageLimits.hint')}</Text>
        </Stack>
    );
}
