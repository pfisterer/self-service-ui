import { Redirect, Route, Switch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { cloudProjectsEnabled, dnsZonesEnabled, groupsEnabled, llmEnabled } from '/features.js';
import { useNav } from '/nav.jsx';
import { BudgetsSection } from '/projects/projects.jsx';
import { GroupsSection } from '/groups/groups-routes.jsx';
import { GpuManagement } from '/gpu/gpu-routes.jsx';
import { LlmManagement } from '/llm/llm-routes.jsx';
import { DnsAdministration } from '/dyndns/dyndns-routes.jsx';

// AdminSection (/admin, new layout only): "Verwaltung", what few people need, under one entry. The pages are the sections they always were, mounted below /admin (their routes are relative): the budgets with the root admin (/admin/budgets, /admin/budgets/admin), the groups, and of the AI service's sections the fleets and the models (/admin/workspaces/gpus, /admin/llm/fleet, /admin/llm/models), and the DNS zones' administration (/admin/dns/administration). Who may open what is still each section's decision, as before.
export function AdminSection() {
    return (
        <Switch>
            {cloudProjectsEnabled && <Route path="/budgets" component={BudgetsSection} nest />}
            {groupsEnabled && <Route path="/groups" component={GroupsSection} nest />}
            {llmEnabled && <Route path="/workspaces" component={GpuManagement} nest />}
            {llmEnabled && <Route path="/llm" component={LlmManagement} nest />}
            {dnsZonesEnabled && <Route path="/dns" component={DnsAdministration} nest />}
            <Route component={AdminStart} />
        </Switch>
    );
}

// AdminStart: /admin itself leads to the first entry the viewer has; without any, it says so.
function AdminStart() {
    const { t } = useTranslation();
    const { sections } = useNav();
    const admin = sections.find(s => s.id === 'admin');
    if (admin) return <Redirect to={`~${admin.href}`} replace />;
    return <Container size="md" py="md"><Alert color="gray" variant="light">{t('nav.v2.adminNothing')}</Alert></Container>;
}
