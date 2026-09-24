import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { Stack, Paper, Text, Anchor, Group, ThemeIcon } from '@mantine/core';
import { KeyRound } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { TabIntro } from './tab-intro.jsx';

// ----------------------------------------
// Show Keys
// ----------------------------------------
export function ShowKeys({ zone }) {
    const { t } = useTranslation();
    const { zone_keys } = zone;

    return (
        <Stack gap="lg">
            <TabIntro title={t('dyndns.keys.title', { zone: zone.zone })}>
                <Trans i18nKey="dyndns.keys.intro" components={{
                    1: <ExternalLink href="https://en.wikipedia.org/wiki/TSIG" />,
                    2: <code />,
                    3: <ExternalLink href="https://en.wikipedia.org/wiki/Dynamic_DNS" />,
                    4: <ExternalLink href="https://datatracker.ietf.org/doc/html/rfc2136" />,
                    5: <b />,
                }} />
                <br /><br />
                {t('dyndns.keys.count', { keys: zone_keys.length })}
            </TabIntro>

            {zone_keys.map((key, index) => (
                <Paper key={key.keyname || index} withBorder radius="md" p="md">
                    <Group gap="xs" mb="sm">
                        <ThemeIcon variant="light" radius="md" color="blue"><KeyRound size="16" /></ThemeIcon>
                        <Text fw={600}>{t('dyndns.keys.keyHeading', { number: index + 1 })}</Text>
                    </Group>
                    <Stack gap="sm">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>{t('dyndns.keys.fieldZone')}</Text>
                            <CodeBlock code={zone.zone} language="plaintext" />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>{t('dyndns.keys.fieldAlgorithm')}</Text>
                            <CodeBlock code={key.algorithm} language="plaintext" />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>{t('dyndns.keys.fieldKeyName')}</Text>
                            <CodeBlock code={key.keyname} />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" mb={4}>{t('dyndns.keys.fieldSecret')}</Text>
                            <CodeBlock code={key.key} />
                        </div>
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}
