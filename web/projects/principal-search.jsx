import { PrincipalTokenAutocomplete } from '/helper/principal-token-autocomplete.jsx';
import { useNodesApi } from './api-nodes.jsx';

// The shared token field, searching through openstack-management-api.
export function ProjectsPrincipalAutocomplete(props) {
    const api = useNodesApi();
    return <PrincipalTokenAutocomplete search={api?.searchPrincipalDetails} searchKey={['projects', 'principals']} {...props} />;
}
