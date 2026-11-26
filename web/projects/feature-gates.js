// Pure helpers for the feature gates of GET /v1/config (features), without React, so cloud-status.jsx and use-features.js share them.

// UI_V2 is the gate of the new layout: navigation with at most five entries, one project page for every kind, the unified project card with its side panel, the budget detail in sections and "Was ich bekommen kann". Opt-in: a gate the config does not name stays closed, unlike the others (featureOpen), because the new layout replaces pages everyone uses. Configured in os-mgt-api, e.g. FEATURE_GATES={"ui-v2":["group:leiter-zwr"]}.
export const UI_V2 = 'ui-v2';

// featureOpen reads a config: a gate the config does not name is open (an older API without gates, or a gate no environment restricts), only an explicit false closes it.
export function featureOpen(config, name) {
    return config?.features?.[name] !== false;
}

// featureOn is the opt-in reading: only an explicit true opens the gate.
export function featureOn(config, name) {
    return config?.features?.[name] === true;
}
