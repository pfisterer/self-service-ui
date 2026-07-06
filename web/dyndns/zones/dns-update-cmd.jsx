import { useState } from 'react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { Container, TextInput, Select, NumberInput, Grid, Stack, Title, Paper } from '@mantine/core';

// ----------------------------------------
// Shared NSUPDATE command generator
// ----------------------------------------
export function generateNsUpdate(record, zone, tsigKey, appConfig) {
    return [
        `# Create/Update record in DNS`,
        `nsupdate -y "${tsigKey.algorithm}:${tsigKey.keyname}:${tsigKey.key}" <<EOF`,
        `server ${appConfig.dns_server_address} ${appConfig.dns_server_port}`,
        `zone ${zone}`,
        `update delete ${record.name}.${zone}. IN ${record.type} ${record.value}`,
        `update add ${record.name}.${zone}. ${record.ttl} IN ${record.type} ${record.value}`,
        `send`,
        `EOF`,
        ``,
        `# Verify`,
        `dig @${appConfig.dns_server_address} -p ${appConfig.dns_server_port} ${record.name}.${zone}. ${record.type} +short`
    ].join('\n');
}


// ---------------------------------------- 
// DNS Update Command Component 
// ----------------------------------------
export function DnsUpdateCommand({ zone }) {
    const { config: dynDnsConfig } = useDynDnsConfig();

    // Local editable state for the form fields
    const [form, setForm] = useState({
        name: "testname",
        type: "A",
        ttl: 60,
        value: "127.1.2.3"
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    return (
        <Paper p="md" withBorder>
            <Stack gap="md">
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput label="Name" name="name" value={form.name} onChange={handleChange} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Select
                            label="Type"
                            name="type"
                            value={form.type}
                            onChange={(val) => setForm(prev => ({ ...prev, type: val }))}
                            data={['A', 'AAAA', 'CNAME', 'TXT', 'MX']}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <NumberInput label="TTL" name="ttl" min={0} value={form.ttl} onChange={(val) => setForm(prev => ({ ...prev, ttl: val }))} />
                    </Grid.Col>
                    <Grid.Col span={12}>
                        <TextInput label="Value" name="value" value={form.value} onChange={handleChange} />
                    </Grid.Col>
                </Grid>

                {zone.zone_keys.map(key => (
                    <Stack gap="sm">
                        <Title order={4}>Keyname: {key.keyname}</Title>
                        <CodeBlock code={generateNsUpdate({ name: form.name, type: form.type, ttl: Number(form.ttl), value: form.value }, zone.zone, key, dynDnsConfig)} />
                    </Stack>
                ))}
            </Stack>
        </Paper>
    );
}
