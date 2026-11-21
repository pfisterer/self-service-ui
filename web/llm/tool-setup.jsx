import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { ActionIcon, Button, Code, CopyButton, Group, List, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { Check, Copy, Download } from 'lucide-react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { KEY_PLACEHOLDER, STABLE_MODELS, TOOLS, VSCODE_DOCS, aliasModels, grantedModels, limitsFrom, limitsOfUsable, oneModel, toolConfigs, vscodeModels, vscodeName } from '/llm/tools.js';
import { DEFAULT_API_URL, curlExample } from '/llm/usable-models.js';

// Hands a configuration file to the browser as a download; nothing leaves the page.
function save(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// The text of a hint: for a single model (`model`) its own wording where the general one speaks of agent or of several models, else the general one.
const hintKey = (key, model) => (model ? [key.replace(/^(llm\.\w+\.\w+)\./, '$1Model.'), key] : key);

// The steps for VS Code's built-in Copilot Chat with a custom endpoint, plus the model entries to paste; with `model`, the entry of that one name.
function VscodeSetup({ apiUrl, limits, granted, model }) {
    const { t } = useTranslation();
    const names = {
        code: t('llm.vscode.names.code'), agent: t('llm.vscode.names.agent'), chat: t('llm.vscode.names.chat'), fast: t('llm.vscode.names.fast'),
    };
    const models = vscodeModels(apiUrl, names, limits, granted, model);
    const b = { 1: <b />, 2: <Code />, 3: <Code /> };
    const ids = model ? [model] : [...STABLE_MODELS, ...granted];

    return (
        <>
            <Text size="xs" c="dimmed">{t('llm.vscode.scope')}</Text>
            <List type="ordered" size="sm" spacing={4} mt="xs">
                {['palette', 'add', 'json', 'select'].map(k => (
                    <List.Item key={k}><Trans i18nKey={hintKey(`llm.vscode.steps.${k}`, model)} components={b} values={{ name: model && vscodeName(names, model) }} /></List.Item>
                ))}
            </List>
            <Text size="xs" c="dimmed" mt="xs">
                <Trans i18nKey="llm.vscode.keepIds" components={{ 2: <Code /> }} values={{ ids: ids.join(', ') }} />
                {' '}<ExternalLink href={VSCODE_DOCS} size="xs">{t('llm.vscode.docs')}</ExternalLink>
            </Text>
            <CodeBlock language="json" code={models} />
        </>
    );
}

// One agent's ready-made file with the key filled in: where it goes, the file itself (copy or download) and, for Codex and Zed, the variable it reads the key from.
function ConfigSetup({ config, model }) {
    const { t } = useTranslation();
    const docs = TOOLS.find(tool => tool.id === config.id)?.url;
    return (
        <>
            <Text size="xs" c="dimmed">
                <Trans i18nKey={hintKey(`llm.tools.hint.${config.id}`, model)} components={{ 1: <Code fz="xs" /> }} values={{ path: config.path, model }} />
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

// A value with a button that copies it, for the fields of Cline and Roo Code.
function Copyable({ value }) {
    const { t } = useTranslation();
    return (
        <Group gap={4} wrap="nowrap">
            <Code style={{ wordBreak: 'break-all' }}>{value}</Code>
            <CopyButton value={value} timeout={1500}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? t('llm.tools.copied') : t('llm.tools.copy')} withArrow>
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy} aria-label={t('llm.tools.copy')}>{copied ? <Check size={14} /> : <Copy size={14} />}</ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        </Group>
    );
}

// The tools that read no file (Cline, Roo Code): the fields of their provider "OpenAI Compatible" with copy buttons, then the other models with their limits for further profiles.
function FieldsSetup({ config, model }) {
    const { t } = useTranslation();
    const docs = TOOLS.find(tool => tool.id === config.id)?.url;
    return (
        <>
            <Text size="xs" c="dimmed">
                <Trans i18nKey={hintKey(`llm.tools.hint.${config.id}`, model)} components={{ 1: <b /> }} values={{ model }} />
                {docs && <>{' '}<ExternalLink href={docs} size="xs">{t('llm.tools.docs')}</ExternalLink></>}
            </Text>
            <Table withRowBorders={false} verticalSpacing={4} mt="xs" maw={720}>
                <Table.Tbody>
                    {config.fields.map(f => (
                        <Table.Tr key={f.key}>
                            <Table.Td w={200}><Text size="sm">{t(`llm.tools.fields.${f.key}`)}</Text></Table.Td>
                            <Table.Td><Copyable value={f.value} /></Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt="xs">{t('llm.tools.fieldsRest')}</Text>
            {config.models.length > 1 && <>
            <Text size="xs" c="dimmed" mt="sm">{t('llm.tools.otherModels')}</Text>
            <Table verticalSpacing={2} mt={4} maw={520}>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th><Text size="xs">{t('llm.tools.fields.modelId')}</Text></Table.Th>
                        <Table.Th><Text size="xs">{t('llm.tools.fields.contextWindow')}</Text></Table.Th>
                        <Table.Th><Text size="xs">{t('llm.tools.fields.maxOutput')}</Text></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {config.models.map(m => (
                        <Table.Tr key={m.id}>
                            <Table.Td><Copyable value={m.id} /></Table.Td>
                            <Table.Td><Text size="sm">{m.context}</Text></Table.Td>
                            <Table.Td><Text size="sm">{m.output}</Text></Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            </>}
        </>
    );
}

// The tabs with one setup per tool: VS Code, the ready-made files and the fields, and with `curl` a plain call at the end. `models` and `model` come from aliasModels and oneModel; `model` also switches the hints to a single name.
function ToolTabs({ apiUrl, apiKey, limits, granted = [], model, curl }) {
    const { t } = useTranslation();
    const configs = toolConfigs(apiUrl, apiKey, limits, granted, model ? oneModel(model) : aliasModels(granted));
    return (
        <Tabs defaultValue="vscode" keepMounted={false}>
            <Tabs.List>
                <Tabs.Tab value="vscode">{t('llm.vscode.tab')}</Tabs.Tab>
                {configs.map(c => <Tabs.Tab key={c.id} value={c.id}>{c.name}</Tabs.Tab>)}
                {curl && <Tabs.Tab value="curl">curl</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="vscode" pt="xs"><VscodeSetup apiUrl={apiUrl} limits={limits} granted={granted} model={model} /></Tabs.Panel>
            {configs.map(c => <Tabs.Panel key={c.id} value={c.id} pt="xs">{c.fields ? <FieldsSetup config={c} model={model} /> : <ConfigSetup config={c} model={model} />}</Tabs.Panel>)}
            {curl && (
                <Tabs.Panel value="curl" pt="xs">
                    <Text size="xs" c="dimmed">{t('llm.tools.curlHint')}</Text>
                    <CodeBlock language="bash" code={curl} />
                </Tabs.Panel>
            )}
        </Tabs>
    );
}

// The setup of the tools right after a key was created, where the key is still on screen: VS Code's model entries, ready-made files for the coding agents and the fields for those that read none, each with the context sizes the service names for the aliases (getModelAliases), so a tool shortens its history itself instead of the backend cutting it off.
export function ToolSetup({ apiUrl, apiKey }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const aliases = useQuery({ queryKey: llmKeys.aliases(), queryFn: () => api.getModelAliases() });

    return (
        <>
            <Text size="sm" fw={600} mt="lg">{t('llm.tools.title')}</Text>
            <Text size="xs" c="dimmed" mb="xs">{t('llm.tools.intro')}</Text>
            <ToolTabs apiUrl={apiUrl} apiKey={apiKey} limits={limitsFrom(aliases.data)} granted={grantedModels(aliases.data)} />
        </>
    );
}

// The same setup for one usable name (the list of available models, getUsableModels): every tool on that name with the limits all its deployments take, the key as KEY_PLACEHOLDER since none is on screen, and a curl call.
export function ModelToolSetup({ apiUrl: given, entry }) {
    const apiUrl = given || DEFAULT_API_URL;
    return (
        <>
            <Text size="xs" c="dimmed" mb="xs"><Trans i18nKey="llm.tools.introModel" components={{ 1: <Code fz="xs" /> }} values={{ model: entry.name, key: KEY_PLACEHOLDER }} /></Text>
            <ToolTabs apiUrl={apiUrl} apiKey={KEY_PLACEHOLDER} limits={limitsOfUsable(entry)} model={entry.name} curl={curlExample(apiUrl, entry.name)} />
        </>
    );
}
