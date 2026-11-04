import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Code, Group, List, Tabs, Text } from '@mantine/core';
import { Download } from 'lucide-react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { STABLE_MODELS, TOOLS, VSCODE_DOCS, grantedModels, limitsFrom, toolConfigs, vscodeModels } from '/llm/tools.js';

// Hands a configuration file to the browser as a download; nothing leaves the page.
function save(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// The steps for VS Code's built-in Copilot Chat with a custom endpoint, plus the model entries to paste.
function VscodeSetup({ apiUrl, limits, granted }) {
    const { t } = useTranslation();
    const models = vscodeModels(apiUrl, {
        code: t('llm.vscode.names.code'), agent: t('llm.vscode.names.agent'), chat: t('llm.vscode.names.chat'), fast: t('llm.vscode.names.fast'),
    }, limits, granted);
    const b = { 1: <b />, 2: <Code />, 3: <Code /> };

    return (
        <>
            <Text size="xs" c="dimmed">{t('llm.vscode.scope')}</Text>
            <List type="ordered" size="sm" spacing={4} mt="xs">
                {['palette', 'add', 'json', 'select'].map(k => (
                    <List.Item key={k}><Trans i18nKey={`llm.vscode.steps.${k}`} components={b} /></List.Item>
                ))}
            </List>
            <Text size="xs" c="dimmed" mt="xs">
                <Trans i18nKey="llm.vscode.keepIds" components={{ 2: <Code /> }} values={{ ids: [...STABLE_MODELS, ...granted].join(', ') }} />
                {' '}<ExternalLink href={VSCODE_DOCS} size="xs">{t('llm.vscode.docs')}</ExternalLink>
            </Text>
            <CodeBlock language="json" code={models} />
        </>
    );
}

// One agent's ready-made file with the key filled in: where it goes, the file itself (copy or download) and, for Codex, the variable it reads the key from.
function ConfigSetup({ config }) {
    const { t } = useTranslation();
    const docs = TOOLS.find(tool => tool.id === config.id)?.url;
    return (
        <>
            <Text size="xs" c="dimmed">
                <Trans i18nKey={`llm.tools.hint.${config.id}`} components={{ 1: <Code fz="xs" /> }} values={{ path: config.path }} />
                {docs && <>{' '}<ExternalLink href={docs} size="xs">{t('llm.tools.docs')}</ExternalLink></>}
            </Text>
            <CodeBlock language={config.language} code={config.code} />
            {config.env && (
                <>
                    <Text size="xs" c="dimmed" mt="xs">{t('llm.tools.env')}</Text>
                    <CodeBlock language="bash" code={config.env} />
                </>
            )}
            <Group justify="flex-end" mt={4}>
                <Button size="xs" variant="light" leftSection={<Download size={14} />} onClick={() => save(config.file, config.code)}>
                    {t('llm.tools.download', { file: config.file })}
                </Button>
            </Group>
        </>
    );
}

// The setup of the tools right after a key was created, where the key is still on screen: VS Code's model entries and ready-made files for the coding agents, each with the context sizes the service names for the aliases (getModelAliases), so a tool shortens its history itself instead of the backend cutting it off.
export function ToolSetup({ apiUrl, apiKey }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const aliases = useQuery({ queryKey: llmKeys.aliases(), queryFn: () => api.getModelAliases() });
    const limits = limitsFrom(aliases.data);
    const granted = grantedModels(aliases.data);
    const configs = toolConfigs(apiUrl, apiKey, limits, granted);

    return (
        <>
            <Text size="sm" fw={600} mt="lg">{t('llm.tools.title')}</Text>
            <Text size="xs" c="dimmed" mb="xs">{t('llm.tools.intro')}</Text>
            <Tabs defaultValue="vscode" keepMounted={false}>
                <Tabs.List>
                    <Tabs.Tab value="vscode">{t('llm.vscode.tab')}</Tabs.Tab>
                    {configs.map(c => <Tabs.Tab key={c.id} value={c.id}>{c.name}</Tabs.Tab>)}
                </Tabs.List>
                <Tabs.Panel value="vscode" pt="xs"><VscodeSetup apiUrl={apiUrl} limits={limits} granted={granted} /></Tabs.Panel>
                {configs.map(c => <Tabs.Panel key={c.id} value={c.id} pt="xs"><ConfigSetup config={c} /></Tabs.Panel>)}
            </Tabs>
        </>
    );
}
