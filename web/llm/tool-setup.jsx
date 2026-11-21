import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { ActionIcon, Button, Code, CopyButton, Group, List, Modal, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { Check, Copy, Download, Wrench } from 'lucide-react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { KEY_PLACEHOLDER, TOOLS, VSCODE_DOCS, modelPlan, toolConfigs, vscodeModels, vscodeName } from '/llm/tools.js';
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

// The steps for VS Code's built-in Copilot Chat with a custom endpoint, plus an entry per usable name to paste.
function VscodeSetup({ apiUrl, plan }) {
    const { t } = useTranslation();
    const names = {
        code: t('llm.vscode.names.code'), agent: t('llm.vscode.names.agent'), chat: t('llm.vscode.names.chat'), fast: t('llm.vscode.names.fast'),
    };
    const models = vscodeModels(apiUrl, names, plan);
    const b = { 1: <b />, 2: <Code />, 3: <Code /> };

    return (
        <>
            <Text size="xs" c="dimmed">{t('llm.vscode.scope')}</Text>
            <List type="ordered" size="sm" spacing={4} mt="xs">
                {['palette', 'add', 'json', 'select'].map(k => (
                    <List.Item key={k}><Trans i18nKey={`llm.vscode.steps.${k}`} components={b} values={{ chat: vscodeName(names, plan.chat), agent: vscodeName(names, plan.agent) }} /></List.Item>
                ))}
            </List>
            <Text size="xs" c="dimmed" mt="xs">
                <Trans i18nKey="llm.vscode.keepIds" components={{ 2: <Code /> }} values={{ ids: plan.list.join(', ') }} />
                {' '}<ExternalLink href={VSCODE_DOCS} size="xs">{t('llm.vscode.docs')}</ExternalLink>
            </Text>
            <CodeBlock language="json" code={models} />
        </>
    );
}

// One agent's ready-made file with the key filled in: where it goes, the file itself (copy or download) and, for Codex and Zed, the variable it reads the key from.
function ConfigSetup({ config, plan }) {
    const { t } = useTranslation();
    const docs = TOOLS.find(tool => tool.id === config.id)?.url;
    return (
        <>
            <Text size="xs" c="dimmed">
                <Trans i18nKey={`llm.tools.hint.${config.id}`} components={{ 1: <Code fz="xs" /> }} values={{ path: config.path, agent: plan.agent, chat: plan.chat }} />
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

// The tools that read no file (Cline, Roo Code): the fields of their provider "OpenAI Compatible" with copy buttons, then every name with its limits for further profiles.
function FieldsSetup({ config, plan }) {
    const { t } = useTranslation();
    const docs = TOOLS.find(tool => tool.id === config.id)?.url;
    return (
        <>
            <Text size="xs" c="dimmed">
                <Trans i18nKey={`llm.tools.hint.${config.id}`} components={{ 1: <b /> }} values={{ agent: plan.agent }} />
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
        </>
    );
}

// The tabs with one setup per tool: VS Code, the ready-made files, the fields and a plain curl call, all from one plan (modelPlan).
function ToolTabs({ apiUrl, apiKey, plan }) {
    const { t } = useTranslation();
    const configs = toolConfigs(apiUrl, apiKey, plan);
    return (
        <Tabs defaultValue="vscode" keepMounted={false}>
            <Tabs.List>
                <Tabs.Tab value="vscode">{t('llm.vscode.tab')}</Tabs.Tab>
                {configs.map(c => <Tabs.Tab key={c.id} value={c.id}>{c.name}</Tabs.Tab>)}
                <Tabs.Tab value="curl">curl</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="vscode" pt="xs"><VscodeSetup apiUrl={apiUrl} plan={plan} /></Tabs.Panel>
            {configs.map(c => <Tabs.Panel key={c.id} value={c.id} pt="xs">{c.fields ? <FieldsSetup config={c} plan={plan} /> : <ConfigSetup config={c} plan={plan} />}</Tabs.Panel>)}
            <Tabs.Panel value="curl" pt="xs">
                <Text size="xs" c="dimmed">{t('llm.tools.curlHint')}</Text>
                <CodeBlock language="bash" code={curlExample(apiUrl, plan.chat)} />
            </Tabs.Panel>
        </Tabs>
    );
}

// The one place with the setup of the tools ("Werkzeuge einrichten", from the available models and from a new key): every name the person may use (getUsableModels) with its own context, so a tool shortens its history itself instead of the backend cutting it off. apiKey is the key just created, held only by the dialog that shows it; without one the files hold KEY_PLACEHOLDER.
export function ToolsDialog({ opened, onClose, apiUrl, apiKey }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const usable = useQuery({ queryKey: llmKeys.usable(), queryFn: () => api.getUsableModels(), enabled: opened });
    const url = apiUrl || DEFAULT_API_URL;
    const plan = usable.data ? modelPlan(usable.data) : null;
    return (
        <Modal opened={opened} onClose={onClose} title={t('llm.tools.setup')} size={900}>
            {usable.isPending && <Loading />}
            {usable.isError && <LoadError query={usable} />}
            {plan && (
                <>
                    <Text size="xs" c="dimmed">
                        <Trans i18nKey="llm.tools.intro" components={{ 1: <Code fz="xs" /> }} values={{ agent: plan.agent, chat: plan.chat }} />
                        {!plan.agentKnown && <>{' '}{t('llm.tools.noToolCalls')}</>}
                    </Text>
                    <Text size="xs" c="dimmed" mb="xs">
                        {apiKey ? t('llm.tools.withKey') : <Trans i18nKey="llm.tools.withPlaceholder" components={{ 1: <Code fz="xs" /> }} values={{ key: KEY_PLACEHOLDER }} />}
                    </Text>
                    <ToolTabs apiUrl={url} apiKey={apiKey || KEY_PLACEHOLDER} plan={plan} />
                </>
            )}
        </Modal>
    );
}

// The button that opens it.
export function ToolsButton({ apiUrl, apiKey, ...props }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button leftSection={<Wrench size={16} />} onClick={() => setOpen(true)} {...props}>{t('llm.tools.setup')}</Button>
            <ToolsDialog opened={open} onClose={() => setOpen(false)} apiUrl={apiUrl} apiKey={apiKey} />
        </>
    );
}
