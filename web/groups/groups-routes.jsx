import { Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useGroupsMe } from '/groups/use-groups-me.jsx';
import { GroupsList } from '/groups/list.jsx';
import { GroupDetail } from '/groups/detail.jsx';

// The section exists in every deployment with a groupsBaseUrl; whether a person has anything to do here is the role provider's answer (use-groups-me.jsx). Somebody who maintains no group and reaches the section by URL is told so instead of shown a page of 403s.
export function GroupsSection() {
    const { t } = useTranslation();
    const { query, visible } = useGroupsMe();

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    if (!visible) {
        return (
            <Container size="md" py="md">
                <Alert color="gray" variant="light" title={t('groups.noAccess.title')}>{t('groups.noAccess.text')}</Alert>
            </Container>
        );
    }
    return (
        <Switch>
            <Route path="/" component={GroupsList} />
            <Route path="/:id" component={GroupDetail} />
        </Switch>
    );
}
