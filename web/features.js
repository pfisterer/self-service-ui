// Which sections this deployment has. One image serves every environment, so
// this is runtime configuration, read once from the config.js the container
// writes at start.
//
// It used to be implicit: no cloudResourcesBaseUrl meant the API client failed
// to load, which meant no /projects route and no status queries. The client is
// a build-time dependency now and always exists, so the absence of a URL has to
// be stated as a fact rather than inferred from a failure.
export const cloudProjectsEnabled = Boolean(window?.appconfig?.cloudResourcesBaseUrl);

// The same statement for the other half. It used to be missing, and the DNS
// section was rendered unconditionally — harmless while every deployment ran
// dynamic-zones, wrong since the umbrella chart grew a `dynamic-zones.enabled`
// condition: a deployment without it would offer a section whose every request
// goes nowhere.
//
// Read from the configured URL, never from a failed request. "The API answered
// with an error" and "this deployment has no DNS" have to stay separate
// answers: inferring the second from the first would make a restarting backend
// look like a feature that was never installed, and quietly hide the tokens
// belonging to it.
export const dnsZonesEnabled = Boolean(window?.appconfig?.dynamicZonesBaseUrl);

// At least one API has to be there for a token to be issuable at all.
export const apiTokensEnabled = dnsZonesEnabled || cloudProjectsEnabled;
