import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Button, Box } from '@mantine/core';
import { Copy, Check } from 'lucide-preact';

export function CodeBlock({ code }) {
    const [copied, setCopied] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Could not copy text: ', err);
        }
    };

    return html`
        <${Box} 
            pos="relative" 
            p="sm" 
            onMouseEnter=${() => setIsHovered(true)}
            onMouseLeave=${() => setIsHovered(false)}
            style=${{
            backgroundColor: '#f5f5f5',
            borderRadius: '4px'
        }}
        >
            <pre style=${{
            margin: 0,
            padding: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            fontSize: '0.85em',
            lineHeight: 1.3,
            width: '100%',
            maxWidth: '100%',
            paddingRight: '80px'
        }}>
                <code style=${{ wordBreak: 'break-all' }}>${code}</code>
            </pre>
            
            <${Button}
                size="xs"
                variant=${copied ? 'filled' : 'default'}
                color=${copied ? 'green' : 'gray'}
                pos="absolute"
                top=${5}
                right=${5}
                style=${{
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            '@media (max-width: 768px)': {
                opacity: 1
            }
        }}
                onClick=${() => copyToClipboard(code)}
                title="Copy code"
                leftSection=${copied ? html`<${Check} size="14" />` : html`<${Copy} size="14" />`}
            >
                ${copied ? 'Copied' : 'Copy'}
            <//>
        <//>
    `;
};

export default CodeBlock;