import { useTranslation } from 'react-i18next';
import { Badge, CloseButton, Group, Text, Tooltip } from '@mantine/core';
import { AtSign, User, Users } from 'lucide-react';

// What a token is, for the eye: a person by address, a group by id (with its role after "#"), a pattern as the rule it is. The token itself stays the tooltip, because it is what the API and the error messages speak.
export function tokenKind(token) {
    if (typeof token !== 'string') return 'unknown';
    if (token.startsWith('user:')) return 'user';
    if (token.startsWith('group:')) return 'group';
    if (token.startsWith('pattern:')) return 'pattern';
    return 'unknown';
}

export function tokenValue(token) {
    const i = typeof token === 'string' ? token.indexOf(':') : -1;
    return i < 0 ? (token ?? '') : token.slice(i + 1);
}

const ICON = { user: User, group: Users, pattern: AtSign };

// TokenText: one token as a line of text with its kind's icon.
export function TokenText({ token }) {
    const { t } = useTranslation();
    const kind = tokenKind(token);
    const Icon = ICON[kind];
    const value = tokenValue(token);
    return (
        <Tooltip label={token} openDelay={400}>
            <Group gap={6} wrap="nowrap" component="span">
                {Icon && <Icon size={14} aria-label={t(`groups.kind.${kind}`)} />}
                <Text span size="sm">{kind === 'pattern' ? t('groups.patternText', { pattern: value }) : value}</Text>
            </Group>
        </Tooltip>
    );
}

// TokenChips: a removable list of tokens, for a form that collects several.
export function TokenChips({ tokens, onRemove, ...props }) {
    if (!tokens?.length) return null;
    return (
        <Group gap={6} {...props}>
            {tokens.map(token => (
                <Badge key={token} variant="light" size="lg" tt="none" fw={400}
                    rightSection={onRemove && <CloseButton size="xs" onClick={() => onRemove(token)} aria-label={token} />}>
                    <TokenText token={token} />
                </Badge>
            ))}
        </Group>
    );
}
