// Which sections this deployment has. One image serves every environment, so
// this is runtime configuration, read once from the config.js the container
// writes at start.
//
// It used to be implicit: no cloudResourcesBaseUrl meant the API client failed
// to load, which meant no /projects route and no status queries. The client is
// a build-time dependency now and always exists, so the absence of a URL has to
// be stated as a fact rather than inferred from a failure.
export const cloudProjectsEnabled = Boolean(window?.appconfig?.cloudResourcesBaseUrl);
