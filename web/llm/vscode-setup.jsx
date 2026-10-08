import { Trans, useTranslation } from 'react-i18next';
import { Code, List, Text } from '@mantine/core';
import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { VSCODE_DOCS, vscodeModels } from '/llm/tools.js';

// The steps for VS Code's built-in Copilot Chat with a custom endpoint, plus
// the model entries to paste. Shown right after a key was created, where the
// key is still on screen.
export function VscodeSetup({ apiUrl }) {
    const { t } = useTranslation();
    const models = vscodeModels(apiUrl, {
        code: t('llm.vscode.names.code'), chat: t('llm.vscode.names.chat'), fast: t('llm.vscode.names.fast'),
    });
    const b = { 1: <b />, 2: <Code />, 3: <Code /> };

    return (
        <>
            <Text size="sm" fw={600} mt="lg">{t('llm.vscode.title')}</Text>
            <Text size="xs" c="dimmed">{t('llm.vscode.scope')}</Text>
            <List type="ordered" size="sm" spacing={4} mt="xs">
                {['palette', 'add', 'json', 'select'].map(k => (
                    <List.Item key={k}><Trans i18nKey={`llm.vscode.steps.${k}`} components={b} /></List.Item>
                ))}
            </List>
            <Text size="xs" c="dimmed" mt="xs">
                <Trans i18nKey="llm.vscode.keepIds" components={{ 2: <Code /> }} />
                {' '}<ExternalLink href={VSCODE_DOCS} size="xs">{t('llm.vscode.docs')}</ExternalLink>
            </Text>
            <CodeBlock language="json" code={models} />
        </>
    );
}
