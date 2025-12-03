import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';

export function Delayed({ waitMs = 1000, children }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShow(true), waitMs);
        return () => clearTimeout(timer);
    }, [waitMs]);

    if (!show) return null;

    return html`
        <div class="delayed-fade">
            <style>
                .delayed-fade {
                    opacity: 0;
                    animation: delayedFadeIn 0.2s forwards ease-out;
                }
                @keyframes delayedFadeIn {
                    to { opacity: 1; }
                }
            </style>
            ${children}
        </div>
    `;
}
