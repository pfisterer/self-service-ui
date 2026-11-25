import { useProjectConfig } from './projects.jsx';

// Feature gates: a new feature is shown to a small group first (e.g. on production) before everyone sees it. The API (os-mgt-api GET /v1/config, features) decides per person from their groups; the portal only hides what is closed. Hiding, not protection: the API behind a feature stays open, as it is meant to (documented in os-mgt-api, ARCHITECTURE §7.3).
//
// featureOpen reads a config: a gate the config does not name is open (an older API without gates, or a gate no environment restricts), only an explicit false closes it.
export function featureOpen(config, name) {
    return config?.features?.[name] !== false;
}

// useFeature is featureOpen for the config of the section (ProjectConfigContext). Known gates: estimator ("Schätzen" in the request dialog), assistant (the portal assistant).
export function useFeature(name) {
    return featureOpen(useProjectConfig(), name);
}
