import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { Box } from '@mantine/core';

export function Delayed({ waitMs = 1000, children }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShow(true), waitMs);
        return () => clearTimeout(timer);
    }, [waitMs]);

    if (!show) return null;

    return html`
        <${Box} style=${{
            opacity: 0,
            animation: 'delayedFadeIn 0.5s forwards ease-out',
            '@keyframes delayedFadeIn': {
                to: { opacity: 1 }
            }
        }}>
            <style>
                @keyframes delayedFadeIn {
                    to { opacity: 1; }
                }
            </style>
            ${children}
        <//>
    `;
}
