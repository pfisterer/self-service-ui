import { html } from 'htm/preact';

export function Home() {
    return html`
        <div class="container">
            <div class="box">
                <h1 class="title">Welcome to dhbwCloud Self Service</h1>
                <p>Use the navigation bar to manage your DNS zones and API tokens.</p>
            </div>
        </div>
    `
}
