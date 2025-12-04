import { html } from 'htm/preact';

export function Footer({ title, version }) {
    return html`
        <footer class="footer has-background-white-bis py-4 mt-5">
            <div class="content has-text-centered is-size-7 has-text-grey-dark">
                <!-- Top Line: Project Name and Version -->
                <p class="mb-1">
                    ${title} — Version ${version}
                </p>
                
                <p class="mb-0">
                    <a href="https://github.com/pfisterer/self-service-ui">Source Code</a> 
                    <span class="has-text-grey-dark mx-2">|</span>
                    <a href="https://dennis-pfisterer.de">© Dennis Pfisterer, DHBW</a>
                </p>
            </div>
        </footer>
    `;
}
