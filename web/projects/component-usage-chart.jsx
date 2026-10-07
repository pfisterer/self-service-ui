import '@mantine/charts/styles.css';
import { BarChart } from '@mantine/charts';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

// DailyChart shows per day what ran: vCPU hours, and the cores reserved
// for the same day as hours, so idle reservation is visible at a glance.
export default function DailyChart({ days }) {
    const { t } = useTranslation();
    if (!days?.length) return null;
    const data = days.map(d => ({
        day: d.day.slice(5),
        used: Math.round(d.vcpu_hours * 10) / 10,
        reserved: Math.round(d.reserved_core_hours * 10) / 10,
    }));
    return (
        <Stack gap="2">
            <Text size="xs" c="dimmed">{t('projects.consumption.dailyVcpu')}</Text>
            <BarChart h={160} data={data} dataKey="day" withLegend
                legendProps={{ verticalAlign: 'bottom', height: 24 }}
                series={[
                    { name: 'used', label: t('projects.consumption.used'), color: 'blue.6' },
                    { name: 'reserved', label: t('projects.consumption.reserved'), color: 'gray.3' },
                ]}
                barChartProps={{ barGap: 0 }}
                gridAxis="y" tickLine="none" />
        </Stack>
    );
}
