import { useState } from 'react';
import { Button, Box } from '@mantine/core';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import bash from 'highlight.js/lib/languages/bash';
import ini from 'highlight.js/lib/languages/ini';
import plaintext from 'highlight.js/lib/languages/plaintext';
import './codeblock.css';

hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('plaintext', plaintext);

export function CodeBlock({ code, language }) {
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

    // Clicking the block copies it — the button sits at the far right and is a
    // long way from a short value. Selecting text keeps working: a click that
    // ends a selection (drag, double-click) leaves that selection in place, and
    // copying then would both fight the user and overwrite what they were about
    // to copy themselves. So a click only counts when nothing is selected.
    const handleSurfaceClick = () => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim()) return;
        copyToClipboard(code);
    };

    // XSS: `highlighted` is injected via dangerouslySetInnerHTML
    // That is safe ONLY because highlight.js HTML-escapes
    // its input, so untrusted `code` (zone names, TSIG key material) cannot break
    // out. Keep it that way: never pass pre-highlighted HTML in as `code`, never
    // register a raw/unescaped language, and don't swap highlight.js for a library
    // that emits unescaped markup. (`ignoreIllegals` only affects parsing, not
    // escaping, so it's fine.)
    // Syntax highlight: use the given language, otherwise auto-detect between the
    // two we register (YAML manifests and shell commands are all we display).
    const highlighted = language
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(code, ['yaml', 'bash']).value;

    return (
        <Box
            className="codeblock-surface"
            pos="relative"
            p="sm"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleSurfaceClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    copyToClipboard(code);
                }
            }}
            role="button"
            tabIndex={0}
            title={copied ? 'Copied' : 'Click to copy'}
            style={{ cursor: 'pointer' }}
        >
            <pre style={{
                margin: 0,
                padding: 0,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                fontSize: '0.85em',
                lineHeight: 1.4,
                width: '100%',
                maxWidth: '100%',
                paddingRight: '80px',
            }}>
                <code className="hljs" style={{ wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>

            <Button
                size="xs"
                variant={copied ? 'filled' : 'default'}
                color={copied ? 'green' : 'gray'}
                pos="absolute"
                top={5}
                right={5}
                style={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out',
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
                // The surface below copies too; without this the click would run
                // both handlers.
                onClick={(e) => { e.stopPropagation(); copyToClipboard(code); }}
                title="Copy code"
                leftSection={copied ? <Check size="14" /> : <Copy size="14" />}
            >
                {copied ? 'Copied' : 'Copy'}
            </Button>
        </Box>
    );
}

export default CodeBlock;
