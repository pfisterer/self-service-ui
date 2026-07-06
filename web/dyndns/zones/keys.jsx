import { CodeBlock } from '/helper/codeblock.jsx';
import { Stack, Paper, Title, Table, Text } from '@mantine/core';

// ----------------------------------------
// Show Keys
// ----------------------------------------
export function ShowKeys({ zone }) {
    const { zone_keys } = zone;

    return (
        <Stack gap="md">
            <Text>
                This zone has {zone_keys.length} key{zone_keys.length !== 1 ? 's' : ''} configured.
            </Text>

            {zone_keys.map((key, index) => (
                <>
                    <Paper p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                        <Text fw={600}>Key #{index + 1}</Text>
                    </Paper>
                    <Stack gap="md">
                        <Table striped size="sm">
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Th>Keyname</Table.Th>
                                    <Table.Td><CodeBlock code={key.keyname} /></Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Algorithm</Table.Th>
                                    <Table.Td><CodeBlock code={key.algorithm} /></Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Key</Table.Th>
                                    <Table.Td><CodeBlock code={key.key} /></Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                    </Stack>
                </>
            ))}
        </Stack>
    );
}
