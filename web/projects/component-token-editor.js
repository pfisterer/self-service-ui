import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Button, Group, Stack, Text } from '@mantine/core';
import { GroupTokenAutocomplete } from './component-group-token-autocomplete.js';

export function TokenEditor({ label, description, error, rules = [], onAddRule = () => { }, onRemoveRule = () => { }, emptyMessage = 'No entries yet.' }) {
    const [tokenInput, setTokenInput] = useState('');

    const addRule = () => {
        const token = tokenInput.trim();
        if (!token) return;
        onAddRule(token);
        setTokenInput('');
    };

    return html`
        <div>
            <${Text} fw=${600} mb=${description || error ? 'xs' : 'xs'}>${label}<//>
            ${description && html`<${Text} size="xs" c="dimmed" mb="xs">${description}<//>` }
            ${error && html`<${Text} size="xs" c="red" mb="xs">${error}<//>` }

            <${Stack} gap="sm">

                <!-- ------------------------------------------------------ -->
                <!-- Search and input box for adding new tokens -->
                <!-- ------------------------------------------------------ -->
                <${Group} align="flex-end" grow>
                    <${GroupTokenAutocomplete}
                        value=${tokenInput}
                        onChange=${setTokenInput}
                        onSelect=${val => setTokenInput(val)}
                        placeholder="e.g. group:cs-students"
                        disabled=${false}
                        limit=${10}
                    />

                    <${Button} onClick=${addRule} disabled=${!tokenInput.trim()}>Add<//>
                <//>

                <!-- ------------------------------------------------------ -->
                <!-- Display existing rules as badges with remove buttons -->
                <!-- ------------------------------------------------------ -->
                ${(rules || []).length === 0 ? html`
                    <${Text} size="xs" c="dimmed" fw=${500}>${emptyMessage}<//>
                    
                ` : html`

                    <${Stack} gap="xs">

                        ${(rules || []).map((rule) => html`
                            <${Group} justify="space-between" align="center" gap="xs" wrap="nowrap" 
                                style=${{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '6px 12px', background: '#fafbfc', width: '100%' }}>
                            
                                <${Text} style=${{ textTransform: 'none', wordBreak: 'break-all' }}>${rule}<//>

                                <${Button}  variant="subtle" color="red" size="xs" compact px=${4} style=${{ flex: '0 0 auto' }}
                                        onClick=${() => onRemoveRule(rule)}> x <//>
                            <//>
                        `)}

                    <//>
                `}

                
            <//>
        </div>
    `;
}
