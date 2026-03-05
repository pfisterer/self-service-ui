import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { Route, Switch, Link, useRoute, useLocation } from 'wouter-preact';
import { Delayed } from '/helper/delayed.js';
import { useClient } from '/providers/client.js';
import { ShowKeys } from '/dyndns/zones/keys.js';
import { ExternalDnsConfig } from '/dyndns/zones/external-dns.js';
import { DnsUpdateCommand } from '/dyndns/zones/dns-update-cmd.js';
import { DnsRecordsList } from '/dyndns/zones/dns-record-list.js';
import { Container, Title, Paper, Stack, NavLink, Tabs, Button, Text, Loader, Alert, Group } from '@mantine/core';
import { AlertCircle, Globe } from 'lucide-preact';


// ----------------------------------------
// DynDnsZones
// ----------------------------------------
export function DynDnsZones() {
    const { client, sdk } = useClient('dyndns');
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadTrigger, setReloadTrigger] = useState(true);
    const [match, params] = useRoute("/zone/:name/*?");
    const activeZoneName = match ? params.name : null;
    const [_, navigate] = useLocation()

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await sdk.getV1Zones({ client });
                if (!res.data?.zones) throw new Error("Unable to load zones");
                if (!cancelled) setZones(res.data.zones);
            } catch (e) {
                if (!cancelled) setError(e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        //Add cleanup function to prevent state updates after unmount
        return () => { cancelled = true; };
    }, [client, reloadTrigger]);

    if (loading) return html`<${Delayed}><${Loader} size="lg" /><//>`;
    if (error) return html`<${Button} onClick=${() => setReloadTrigger(!reloadTrigger)}>Retry Load<//>`;

    return html`
        <${Container} size="xl" py="md">
            <${Stack} gap="lg">
                <${Title} order=${2}>Zone Management<//>
                
                <${Paper} shadow="sm" radius="md" withBorder>
                    <${Paper} p="md" withBorder style=${{ backgroundColor: '#f8f9fa' }}>
                        <${Text} fw=${600}>Available Zones (${zones.length})<//>
                    <//>
                    
                    <${Stack} gap=${0}>
                        ${zones.map(zone => html`
                            <${NavLink}
                                component=${Link}
                                to=${"/zone/" + zone.name}
                                label=${zone.name}
                                leftSection=${html`<${Globe} size="16" />`}
                                active=${activeZoneName === zone.name}
                            />
                        `)}
                        ${zones.length === 0 && html`
                            <${Text} p="md" c="dimmed">No zones available.<//>
                        `}
                    <//>
                <//>

                <${Switch}>
                    <${Route} path="/zone/:name" nest>
                        ${param => {
            const zone = zones.find(z => z.name === param.name)
            return zone ?
                html`<${AvailableDomain} zone=${zone} onChange=${() => setReloadTrigger(!reloadTrigger)} />` :
                html`<${RouteNotFound} />`
        }}
                    <//>

                    <${Route} path="/">
                        ${() => zones.length > 0 ? (navigate(`/zone/${zones[0].name}`, { replace: true }), null) : html`
                            <${Paper} p="xl" withBorder>
                                <${Text} ta="center" size="lg">⬆️ Select a zone above to manage its DNS records.<//>
                            <//>
                        `}  
                    <//>
                <//>
            <//>
        <//>
    `;
}

// ----------------------------------------
// Available Domain List
// ----------------------------------------
function AvailableDomain({ zone, onChange }) {
    let response;

    if (zone.already_taken_by_someone_else) {
        response = html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} color="red">This zone is already taken by someone else.</>`
    } else if (zone.exists) {
        response = html`<${ActiveDomain} zone=${zone.name} onChange=${onChange} />`
    } else {
        response = html`<${Paper} p="md"><${ActivateZone} zone=${zone.name} onChange=${onChange} /></>`
    }

    return html`
        <${Paper} shadow="sm" radius="md" withBorder>
            ${response}
        <//>
    `;
}

// ----------------------------------------
// Activate Zone
// ----------------------------------------
function ActivateZone({ zone, onChange }) {
    const { client, sdk } = useClient('dyndns');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function activate() {
        setLoading(true);
        setError(null);
        try {
            const res = await sdk.postV1ZonesByZone({ path: { zone }, client });
            if (res.response.status !== 201) throw new Error(res.response.statusText);
            onChange(zone);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return html`<${Delayed}><${Loader} size="sm" /><//>`;
    if (error)
        return html`
            <${Stack} gap="sm">
                <pre>${error.message}</pre>
                <${Button} onClick=${() => window.location.reload()}>Refresh<//>
            <//>
        `;

    return html`<${Button} onClick=${activate}>Activate<//>`;
}


// ----------------------------------------
// Active Domain Tabs
// ----------------------------------------
function ActiveDomain({ zone: zoneName, onChange }) {
    const [zone, setZone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState("Loading zone details...");
    const [currentLocation, navigate] = useLocation()
    const { client, sdk } = useClient('dyndns');

    const tabs = [
        { name: "Manage", path: "/" },
        { name: "Keys", path: "/keys" },
        { name: "DNS Update Command", path: "/update" },
        { name: "External DNS Config", path: "/config" }
    ];

    // Fetch zone data
    useEffect(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await sdk.getV1ZonesByZone({ path: { zone: zoneName }, client });
            if (!res.data) throw new Error(`Zone ${zoneName} not found`);
            setZone(res.data);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }, [client, zoneName, currentLocation]);

    async function handleDeleteClick() {
        try {
            setLoading(true);
            setMessage("Deleting zone...");
            const res = await sdk.deleteV1ZonesByZone({ path: { zone: zone.zoneData.zone }, client });
            if (res.response.status !== 204)
                throw new Error(res.response.statusText);
            onChange();
        } catch (e) { setError(e); } finally { setLoading(false); }
    }

    if (loading) return html`<${Delayed}><${Text}>${message}</><//>`;
    if (error) return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} color="red">${error.message}<//>`;
    if (!zone || !zone.zoneData) return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} color="red">Zone data corrupted.<//>`;

    const activeTab = tabs.find(t => currentLocation === t.path)?.name || "Manage";

    return html`
        <${Stack} gap="md">
            <${Paper} p="md" withBorder style=${{ backgroundColor: '#f8f9fa' }}>
                <${Group} justify="space-between" align="center">
                    <${Text} fw=${600}>Zone: ${zone.zoneData.zone}<//>
                    <${Button} color="red" size="sm" onClick=${handleDeleteClick}>Delete Zone<//>
                <//>
            <//>

            <${Tabs} value=${activeTab} onChange=${(val) => navigate(tabs.find(t => t.name === val)?.path || '/')}>
                <${Tabs.List}>
                    ${tabs.map(({ name }) => html`<${Tabs.Tab} value=${name}>${name}<//>`)}
                <//>
            <//>

            ${activeTab === "Manage" && html`
                <${DnsRecordsList} zone=${zone.zoneData.zone} tsigKey=${zone.zoneData.zone_keys[0]} />
            `}
            
            ${activeTab === "Keys" && html`
                <${ShowKeys} zone=${zone.zoneData} />
            `}

            ${activeTab === "DNS Update Command" && html`
                <${DnsUpdateCommand} zone=${zone.zoneData} />
            `}

            ${activeTab === "External DNS Config" && html`
                <${ExternalDnsConfig} externalDnsValuesYaml=${zone.externalDnsValuesYaml} externalDnsSecretYaml=${zone.externalDnsSecretYaml} zone=${zone.zoneData} />
            `}
        <//>
    `;
}

function RouteNotFound() {
    return html`
        <${Container} py="md">
            <${Alert} icon=${html`<${AlertCircle} size="16" />`} title="❌ Zone Not Found" color="red">
                The zone specified in the URL could not be located in your account.
            <//>
        <//>
    `
}
