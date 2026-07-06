import { useState, useEffect } from 'react';
import { Autocomplete, Loader } from '@mantine/core';
import { useClient } from '../providers/client.jsx';

/**
 * GroupTokenAutocomplete
 * Props:
 *   value: string
 *   onChange: (value: string) => void
 *   onSelect?: (value: string) => void
 *   placeholder?: string
 *   disabled?: boolean
 *   limit?: number
 */
export function GroupTokenAutocomplete({ value, onChange, onSelect, placeholder = 'e.g. group:cs-students', limit = 10 }) {
    const { sdk, client } = useClient('projects');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState(value || '');

    useEffect(() => {
        if (!search) {
            setData([]);
            return;
        }

        const fetchData = async () => {
            try {
                setLoading(true);
                try {
                    const res = await sdk.searchGroups({ client, query: { q: search, limit } });
                    setData(res?.data?.tokens || []);
                } catch (err) {
                    console.error('Error fetching group suggestions:', err);
                    setData([]);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [search, client, sdk, limit]);

    return (
        <Autocomplete
            placeholder={placeholder}
            value={value}
            data={data}
            clearable={true}
            onChange={(val) => { setSearch(val); onChange(val); }}
            onItemSubmit={(item) => { if (onSelect) onSelect(item); }}
            rightSection={loading ? <Loader size="xs" /> : null}
        />
    );

}
