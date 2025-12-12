import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

export function CodeBlock({ code }) {
    const [buttonText, setButtonText] = useState('Copy');

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setButtonText('Copied to Clipboard');
            setTimeout(() => setButtonText('Copy'), 2000);
        } catch (err) {
            console.error('Could not copy text: ', err);
        }
    };

    const blockStyles = `
        .code-container {
            position: relative; 
            width: 100%; 
            max-width: 100%;
            padding: 0.5em 0.75em; /* Minimales Padding */
            background-color: #f5f5f5;
        }
        
        /* 1. Standardmäßig unsichtbar und sanfte Transition */
        .copy-button {
            position: absolute;
            top: 5px; 
            right: 5px; 
            z-index: 10;
            opacity: 0; /* START: Unsichtbar */
            transition: opacity 0.3s ease-in-out; /* Sanfter Übergang */
        }

        /* 2. Bei Hover über den Container wird der Button sichtbar */
        .code-container:hover .copy-button {
            opacity: 1; 
        }

        .code-container pre {
            margin: 0 !important; 
            padding: 0 !important; 
            white-space: pre-wrap; 
            word-wrap: break-word; 
            overflow-wrap: break-word;
            font-size: 0.85em; 
            line-height: 1.3;
            width: 100%;
            max-width: 100%;
        }

        .code-container pre code {
            word-break: break-all; /* Ensures single long strings break */
        }
    `;

    return html`
        <style>${blockStyles}</style>
        
        <div class="code-container">
            <pre><code>${code}</code></pre>
            
            <button class="button is-small is-light copy-button has-background-danger" 
                    onClick=${() => copyToClipboard(code)} 
                    title="Copy code">
                ${buttonText}
            </button>
        </div>
    `;
};

export default CodeBlock;