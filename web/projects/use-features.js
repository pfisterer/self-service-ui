import { useProjectConfig } from './projects.jsx';
import { featureOpen } from './feature-gates.js';
import { useCloudStatus } from './cloud-status.jsx';

export { featureOpen };

// Feature gates: a new feature is shown to a small group first (e.g. on production) before everyone sees it. The API (os-mgt-api GET /v1/config, features) decides per person from their groups; the portal only hides what is closed. Hiding, not protection: the API behind a feature stays open, as it is meant to (documented in os-mgt-api, ARCHITECTURE §7.3).
//
// useFeature is featureOpen for the config of the section (ProjectConfigContext). Known gates: estimator ("Schätzen" in the request dialog), assistant (the portal assistant).
export function useFeature(name) {
    return featureOpen(useProjectConfig(), name);
}

// useUiV2 says whether the new layout is on for the viewer (gate ui-v2, opt-in, read once with the header's status).
export function useUiV2() {
    return useCloudStatus().uiV2;
}
