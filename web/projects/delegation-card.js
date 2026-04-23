import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Shield } from 'lucide-preact';
import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import { GroupList, ProjectBar } from './component-common.js';
import { DelegationBreakdownModal } from './delegation-breakdown-modal.js';
import { useProjectConfig } from './projects.js';
import { formatDate, formatRelativeDate } from './util-project.js';

export function DelegationCard({ delegation, onEdit, onDelete, knownDelegations }) {
    const projectConfig = useProjectConfig();
    const [showBreakdown, setShowBreakdown] = useState(false);
    if (!projectConfig) return null;

    const createdDate = formatDate(delegation.created_at);
    const expiresText = delegation.end_date
        ? ` Expires ${formatRelativeDate(delegation.end_date)}.`
        : 'No expiration.';
    const isAllowance = delegation.delegation_strategy === 'allowance';
    const strategyLabel = isAllowance ? 'Allowance (Auto)' : 'Shared Pool';
    const hasUsage = Object.keys(delegation?.quota?.usage_by_status ?? {}).length > 0;

    const delegationText = delegation.can_delegate
        ? html`<${Badge} color="dark" variant="outline" leftSection=${html`<${Shield} size="12" />`}>Delegation allowed<//>`
        : html`<${Badge} color="gray" variant="outline">No further delegation<//>`;

    const usageByStatus = delegation?.quota?.usage_by_status;

    return html`
        <${Card} withBorder shadow="sm" radius="md">

            <!-- ---------------------------------------- -->
            <!-- Delegation Name, Strategy, and Description -->
            <!-- ---------------------------------------- -->
            <${Group} justify="space-between" mb="md">
                <${Text} fw=${700} size="lg">${delegation.name}<//>
                <${Group} gap="xs">
                    <${Badge} color="gray" variant="outline">Delegation Strategy: ${strategyLabel}<//>
                    ${delegationText}
                <//>
            <//>

            <!-- ---------------------------------------- -->
            <!-- Admin Scope -->
            <!-- ---------------------------------------- -->
            <${Stack} gap="sm" mb="md">
                <${Text} size="xs" fw=${600} c="dimmed" tt="uppercase">Admin Scope</${Text}>
                <${GroupList} items=${delegation.admin_scope} color="violet" emptyMessage="No admins configured"/>
            <//>

            <${Divider} mb="md" />

            <${Stack} gap="sm" mb="md">

            <!-- ---------------------------------------- -->
            <!-- Resource Usage or Per-User Limits -->
            <!-- ---------------------------------------- -->
                <${Text} size="xs" fw=${600} c="dimmed" tt="uppercase">
                    ${isAllowance ? 'Per-User Limits' : 'Resource Usage'}
                <//>

                ${(projectConfig?.projects || []).map(r => html`
                    <${ProjectBar} key=${r.id} resource=${r}
                        limit=${delegation?.quota?.limit?.[r.id] ?? 0}
                        approved=${usageByStatus?.approved?.quota?.[r.id] ?? 0}
                        changePending=${usageByStatus?.change_pending?.quota?.[r.id] ?? 0}
                    />
                `)}

                <${Divider} mb="md" />

            <!-- ---------------------------------------- -->
            <!-- Creation Info and Action Buttons -->
            <!-- ---------------------------------------- -->

                <${Text} size="xs" c="dimmed" mb=${onEdit ? 'md' : '0'}>
                    Created by ${delegation.created_by} on ${createdDate}.${expiresText}
                <//>

                <${Group} grow>
                    <${Button} size="sm" variant="light" color="blue"
                        disabled=${!hasUsage}
                        onClick=${() => setShowBreakdown(true)}
                    >
                        View Breakdown
                    <//>

                    ${onEdit && html`<${Button} size="sm" variant="light" onClick=${onEdit}>Edit<//>` }
                    ${onDelete && html`<${Button} size="sm" variant="light" color="red" onClick=${onDelete}>Delete<//>` }
                <//>
            <//>

        <//>

        <${DelegationBreakdownModal}
            delegation=${delegation}
            opened=${showBreakdown}
            onClose=${() => setShowBreakdown(false)}
            knownDelegations=${knownDelegations}
        />
    `;
}
