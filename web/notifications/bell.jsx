import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ActionIcon, Anchor, Badge, Box, Divider, Indicator, Popover, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { Bell, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { notificationsApi, notificationsKeys } from '/notifications/api.js';
import { formatDateTime } from '/format-date.js';
import { badgeLabel, countUnread, isUnread, newestAt, pollInterval, portalPath, readSeen, RECENT_LIMIT, writeSeen } from '/notifications/bell.js';

dayjs.extend(relativeTime);

// The bell in the header: how many notifications came since the list was last opened, and the latest ones a click away. The mail stays the channel that reaches somebody; the bell is for the person who is in the portal anyway. Nothing about it may get in the way: a service that does not answer leaves a bell without a number, no error dialog, since the page itself is not what failed.
//
// The rules (what counts as unread, when to ask) are in bell.js; enabled is decided by the header (bellEnabled).
export function NotificationBell({ person }) {
    const { t, i18n } = useTranslation();
    const lang = i18n.resolvedLanguage || 'de';
    const [, navigate] = useLocation();
    const [opened, setOpened] = useState(false);
    const [seenAt, setSeenAt] = useState(() => readSeen(person));
    // What counted as seen when the list was opened: the entries that were new stay marked while it is open, although opening has already moved seenAt past them.
    const [shownSince, setShownSince] = useState(null);

    // Same key and length as the list on the settings page, so the two share one answer. The interval is a function so the visibility is read at every tick, not once at render.
    const recent = useQuery({
        queryKey: notificationsKeys.recent(lang),
        queryFn: () => notificationsApi.getRecent(RECENT_LIMIT),
        refetchInterval: () => pollInterval(typeof document === 'undefined' ? 'visible' : document.visibilityState),
        // A failing service is retried by the next tick, not by a burst now.
        retry: false,
    });
    const items = recent.error ? [] : (recent.data ?? []);
    const unread = countUnread(items, seenAt);
    const label = badgeLabel(unread);

    const toggle = () => {
        if (opened) { setOpened(false); return; }
        setShownSince(seenAt);
        const newest = newestAt(items);
        if (newest) {
            writeSeen(person, newest);
            setSeenAt(newest);
        }
        setOpened(true);
    };
    const close = () => setOpened(false);

    const aria = label ? t('notifications.bell.labelUnread', { count: unread }) : t('notifications.bell.label');

    return (
        <Popover opened={opened} onChange={setOpened} position="bottom-end" width={360} shadow="md" withinPortal>
            <Popover.Target>
                <Indicator label={label} disabled={!label} size={16} offset={6} color="red" inline>
                    <ActionIcon variant="subtle" color="gray" size="lg" aria-label={aria} onClick={toggle}>
                        <Bell size={18} />
                    </ActionIcon>
                </Indicator>
            </Popover.Target>
            <Popover.Dropdown p={0}>
                <Box px="md" py="xs">
                    <Text fw={700} size="sm">{t('notifications.recent.title')}</Text>
                </Box>
                <Divider />
                <ScrollArea.Autosize mah={420}>
                    {recent.error ? (
                        <Text size="sm" c="dimmed" px="md" py="sm">{t('notifications.bell.unavailable')}</Text>
                    ) : items.length === 0 ? (
                        <Text size="sm" c="dimmed" px="md" py="sm">{recent.isLoading ? t('notifications.bell.loading') : t('notifications.recent.none')}</Text>
                    ) : (
                        <Stack gap={0}>
                            {items.map(n => <Entry key={n.id} n={n} fresh={isUnread(n, shownSince)} onOpen={close} />)}
                        </Stack>
                    )}
                </ScrollArea.Autosize>
                <Divider />
                <Box px="md" py="xs">
                    <Anchor size="sm" component="button" type="button" onClick={() => { close(); navigate('~/settings/notifications'); }}>
                        {t('notifications.bell.settings')}
                    </Anchor>
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
}

// One entry: its title, how long ago, and where it leads. A link into the portal navigates without reloading; one elsewhere opens a new tab.
function Entry({ n, fresh, onOpen }) {
    const { t } = useTranslation();
    const path = n.url ? portalPath(n.url) : null;
    const body = (
        <Box px="md" py="xs" style={{ borderLeft: `3px solid ${fresh ? 'var(--mantine-color-dhbw-6)' : 'transparent'}` }}>
            <Text size="sm" fw={fresh ? 600 : 400} lineClamp={2}>{n.title}</Text>
            <Text size="xs" c="dimmed" title={formatDateTime(n.created_at)}>
                {dayjs(n.created_at).fromNow()}
                {n.open && n.class === 'action' && <Badge ml={6} size="xs" variant="light" color="orange">{t('notifications.bell.open')}</Badge>}
                {n.url && !path && <ExternalLink size={11} style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
            </Text>
        </Box>
    );
    if (path) return <UnstyledButton component={Link} href={`~${path}`} onClick={onOpen} display="block">{body}</UnstyledButton>;
    if (n.url) return <UnstyledButton component="a" href={n.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} display="block">{body}</UnstyledButton>;
    return body;
}
