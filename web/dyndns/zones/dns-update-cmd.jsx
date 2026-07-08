import { useState } from 'react';
import { CodeBlock } from '/helper/codeblock.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { TextInput, Select, NumberInput, Grid, Stack, Title, Paper, Text, Anchor } from '@mantine/core';
import { TabIntro } from './tab-intro.jsx';
import { recordNameError, recordValueError } from '/helper/dns-validation.js';

// Nameserver to show in user-facing commands: the public NS hostname when the
// API advertises one, otherwise the raw server address.
export function nameserverFor(appConfig) {
    return appConfig?.advertised_nameserver || appConfig?.dns_server_address;
}

// ----------------------------------------
// Shared dig query-command generator
// ----------------------------------------
export function generateDig(record, zone, appConfig) {
    // Build the FQDN, treating '@' / empty name as the zone apex.
    const fqdn = (!record.name || record.name === '@') ? zone : `${record.name}.${zone}`;
    const fqdnDotted = fqdn.endsWith('.') ? fqdn : `${fqdn}.`;
    return `dig @${nameserverFor(appConfig)} -p ${appConfig.dns_server_port} ${fqdnDotted} ${record.type} +short`;
}

// ----------------------------------------
// Shared NSUPDATE command generator
// ----------------------------------------
export function generateNsUpdate(record, zone, tsigKey, appConfig) {
    return [
        `# Create/Update record in DNS`,
        `nsupdate -y "${tsigKey.algorithm}:${tsigKey.keyname}:${tsigKey.key}" <<EOF`,
        `server ${nameserverFor(appConfig)} ${appConfig.dns_server_port}`,
        `zone ${zone}`,
        `update delete ${record.name}.${zone}. IN ${record.type} ${record.value}`,
        `update add ${record.name}.${zone}. ${record.ttl} IN ${record.type} ${record.value}`,
        `send`,
        `EOF`,
        ``,
        `# Verify`,
        generateDig(record, zone, appConfig)
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
        <Stack gap="lg">
            <TabIntro title={`DNS update command for ${zone.zone}`}>
                Build an <code>nsupdate</code> command to create or update a record from the command line via{' '}
                <Anchor href="https://datatracker.ietf.org/doc/html/rfc2136" target="_blank">RFC&nbsp;2136</Anchor>{' '}
                (signed with this zone's TSIG key). Fill in the fields — the command updates below is updated live. Execute
                it in a shell to create or update the record, and verify it with <code>dig</code>.
            </TabIntro>

            <Paper withBorder radius="md" p="md">
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput label="Name" name="name" value={form.name} onChange={handleChange}
                            error={recordNameError(form.name)} />
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
                        <TextInput label="Value" name="value" value={form.value} onChange={handleChange}
                            error={form.value.trim() ? recordValueError(form.type, form.value) : null} />
                    </Grid.Col>
                </Grid>
            </Paper>

            {zone.zone_keys.map(key => (
                <Paper key={key.keyname} withBorder radius="md" p="md">
                    <Title order={5} mb="sm">Key: {key.keyname}</Title>
                    <CodeBlock code={generateNsUpdate({ name: form.name, type: form.type, ttl: Number(form.ttl), value: form.value }, zone.zone, key, dynDnsConfig)} />
                </Paper>
            ))}
        </Stack>
    );
}
