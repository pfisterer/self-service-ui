import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { CodeBlock } from '/helper/codeblock.js';
import { useDynDnsConfig } from '/providers/dyndns-config.js';

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
        name: zone.zone,
        type: "A",
        ttl: 60,
        value: "127.1.2.3"
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    return html`
        <div class="panel-block is-block">
            <div class="box" style="max-width:95%;">
                <div class="columns is-multiline">
                    <!-- Name -->
                    <div class="column is-half">
                        <label class="label">Name</label>
                        <input class="input" type="text" name="name" value=${form.name} onInput=${handleChange} /> </div>

                    <!-- Type -->
                    <div class="column is-one-quarter">
                        <label class="label">Type</label>
                        <div class="select is-fullwidth">
                            <select name="type" value=${form.type} onInput=${handleChange}>
                                <option>A</option>
                                <option>AAAA</option>
                                <option>CNAME</option>
                                <option>TXT</option>
                                <option>MX</option>
                            </select>
                        </div>
                    </div>

                    <!-- TTL -->
                    <div class="column is-one-quarter">
                        <label class="label">TTL</label>
                        <input class="input" type="number" name="ttl" min="0" value=${form.ttl} onInput=${handleChange} />
                    </div>

                    <!-- Value -->
                    <div class="column is-full">
                        <label class="label">Value</label>
                        <input class="input" type="text" name="value" value=${form.value} onInput=${handleChange} />
                    </div>
                </div>

                ${zone.zone_keys.map(key => html`
                    <h3 class="subtitle">Keyname: ${key.keyname}</h3>
                    <${CodeBlock} code=${generateNsUpdate({ name: form.name, type: form.type, ttl: Number(form.ttl), value: form.value }, zone.zone, key, dynDnsConfig)} /> 
                `)}

            </div>
        </div>
    `;
}
