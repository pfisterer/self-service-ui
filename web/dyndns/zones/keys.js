import { html } from 'htm/preact';
import { CodeBlock } from '/helper/codeblock.js';
import { Stack, Paper, Title, Table, Text } from '@mantine/core';

// ----------------------------------------
// Show Keys
// ----------------------------------------
export function ShowKeys({ zone }) {
    const { zone_keys } = zone;

    return html`
        <${Stack} gap="md">
            <${Text}>
                This zone has ${zone_keys.length} key${zone_keys.length !== 1 ? 's' : ''} configured.
            <//>

            ${zone_keys.map((key, index) => html`
                <${Paper} p="md" withBorder style=${{ backgroundColor: '#f8f9fa' }}>
                    <${Text} fw=${600}>Key #${index + 1}<//>
                <//>
                <${Stack} gap="md">
                    <${Table} striped size="sm">
                        <${Table.Tbody}>
                            <${Table.Tr}>
                                <${Table.Th}>Keyname<//>
                                <${Table.Td}><${CodeBlock} code=${key.keyname} /><//>
                            <//>
                            <${Table.Tr}>
                                <${Table.Th}>Algorithm<//>
                                <${Table.Td}><${CodeBlock} code=${key.algorithm} /><//>
                            <//>
                            <${Table.Tr}>
                                <${Table.Th}>Key<//>
                                <${Table.Td}><${CodeBlock} code=${key.key} /><//>
                            <//>
                        <//>
                    <//>
                <//>
            `)}
        <//>
    `;
}
