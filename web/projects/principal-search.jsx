import { Input } from '@mantine/core';
import { PrincipalTokenAutocomplete } from '/helper/principal-token-autocomplete.jsx';
import { useNodesApi } from './api-nodes.jsx';

// The shared token field, searching through openstack-management-api.
export function ProjectsPrincipalAutocomplete(props) {
    const api = useNodesApi();
    return <PrincipalTokenAutocomplete search={api?.searchPrincipalDetails} searchKey={['projects', 'principals']} {...props} />;
}

// personEmail is the address a person field holds: the field may carry the
// user: token picked from the directory or an address typed by hand.
export const personEmail = (value) => (value || '').trim().replace(/^user:/i, '');

// PersonInput names exactly one person — an owner. The same directory search
// as every member list, keeping the pick in the field.
export function PersonInput({ label, description, placeholder, value, onChange, error, required = false, autoFocus = false }) {
    return (
        <Input.Wrapper label={label} description={description} error={error} required={required}>
            <ProjectsPrincipalAutocomplete single value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} />
        </Input.Wrapper>
    );
}
