import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { Route, Switch, Link, useRoute, useLocation } from 'wouter-preact';
import { Delayed } from '/helper/delayed.js';
import { useClient } from '/providers/client.js';
import { ShowKeys } from '/dyndns/zones/keys.js';
import { ExternalDnsConfig } from '/dyndns/zones/external-dns.js';
import { DnsUpdateCommand } from '/dyndns/zones/dns-update-cmd.js';
import { DnsRecordsList } from '/dyndns/zones/dns-record-list.js';


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

    if (loading) return html`<${Delayed}><p>Loading zones...</p><//>`;
    if (error) return html`<a onClick=${() => setReloadTrigger(!reloadTrigger)}>Retry Load</a>`;

    return html`
        <section class="mt-5">
            <div class="container">
            <h1 class="title is-3">Zone Management</h1>
            
            <div class="mb-5">
                <nav class="panel">
                    <p class="panel-heading">
                        Available Zones (${zones.length})
                    </p>
                    ${zones.map(zone => html`
                        <${Link} 
                            to=${"/zone/" + zone.name} 
                            class="panel-block ${activeZoneName === zone.name ? 'has-background-grey-light has-text-white-ter' : ''}"
                        >
                            <span class="panel-icon">
                                <i class="fas fa-globe"></i>
                            </span>
                            ${zone.name}
                        <//> 
                    `)}
                    ${zones.length === 0 && html`
                        <div class="panel-block">
                            No zones available.
                        </div>
                    `}
                </nav>
            </div>

            <${Switch}>
                <!-- Show the currently selected zone -->
                <${Route} path="/zone/:name" nest>
                    ${param => {
            const zone = zones.find(z => z.name === param.name)
            return zone ?
                html`<${AvailableDomain} zone=${zone} onChange=${() => setReloadTrigger(!reloadTrigger)} />` :
                html`<${RouteNotFound}>`
        }

        }
                <//>

                <!-- Redirect to the first zone if available -->
                <${Route} path="/">
                    ${() => zones.length > 0 ? (navigate(`/zone/${zones[0].name}`, { replace: true }), null) : html`
                        <div class="content has-text-centered p-6">
                                <h3 class="subtitle is-5">⬆️ Select a zone above to manage its DNS records.</h3>
                        </div>
                    `}  
                <//>

                <//>
            </div>
        </section>
    `;
}

// ----------------------------------------
// Available Domain List
// ----------------------------------------
function AvailableDomain({ zone, onChange }) {
    let response;

    if (zone.already_taken_by_someone_else) {
        response = html`<div class="panel-block has-text-danger">This zone is already taken by someone else.</div>`
    } else if (zone.exists) {
        response = html`<${ActiveDomain} zone=${zone.name} onChange=${onChange} />`
    } else {
        response = html`<div class="panel-block"><${ActivateZone} zone=${zone.name} onChange=${onChange} /></div>`
    }

    return html`
        <nav class="panel">
            <div class="panel-heading">Zone: ${zone.name}</div>
            ${response}
        </nav>
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

    if (loading) return html`<${Delayed}><p>Activating zone ${zone}...</p><//>`;
    if (error)
        return html`
            <div class="block">
                <pre>${error.message}</pre>
                <button class="button" onClick=${() => window.location.reload()}>Refresh</button>
            </div>
        `;

    return html`<button class="button" onClick=${activate}>Activate</button>`;
}


// ----------------------------------------
// Active Domain Tabs
// ----------------------------------------
function ActiveDomain({ zone: zoneName, onChange }) {
    const [zone, setZone] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState("Loading zone details...");
    const [currentLocation] = useLocation()
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

    if (loading) return html`<${Delayed}><p>${message}</p><//>`;
    if (error) return html`<p class="has-text-danger">${error.message}</p>`;
    if (!zone || !zone.zoneData) return html`<p class="has-text-danger">Zone data corrupted.</p>`;

    return html`
        <div class="active-domain-wrapper">
            <p class="panel-tabs">
                ${tabs.map(({ name, path }) => html`<${Link} to=${path} class=${path === currentLocation ? "is-active" : ""}>${name} <//>`)}
            </p>

            <${Switch}>
                <${Route} path="/">
                    ${html`
                        <div class="panel-block">
                            <button class="button is-danger" onClick=${handleDeleteClick}>Delete Zone</button>
                        </div>
                        <div class="panel-block">
                            <${DnsRecordsList} zone=${zone.zoneData.zone} tsigKey=${zone.zoneData.zone_keys[0]} />
                        </div>
                    `}
                <//>
                
                <${Route} path="/keys">
                    ${html`<${ShowKeys} zone=${zone.zoneData} />`}
                <//>

                <${Route} path="/update">
                    ${html`<${DnsUpdateCommand} zone=${zone.zoneData} />`}
                <//>

                <${Route} path="/config">
                    ${html`<${ExternalDnsConfig} externalDnsValuesYaml=${zone.externalDnsValuesYaml} externalDnsSecretYaml=${zone.externalDnsSecretYaml} zone=${zone.zoneData} />`}
                <//>
                
                <${Route}>
                    <div class="panel-block has-text-danger">Tab not found.</div>
                <//>
            <//>
        </div>
    `;
}

function RouteNotFound() {
    return html`
        <section class="mt-3">
            <div class="container">
                <h3 class="title is-4 has-text-danger">❌ Zone Not Found</h3>
                <p>The zone specified in the URL could not be located in your account.</p>
            </div>
        </section>
    `
}
