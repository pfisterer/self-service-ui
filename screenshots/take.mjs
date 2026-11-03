// Screenshots of the UI for the guides on dhbw.cloud: starts the Vite dev server, answers every API call with the made-up data in fixtures.mjs (no real person, project or address) and writes one PNG per shot in shots.mjs. Run again whenever a view in a guide changes: `make screenshots OUT=<homepage>/frontend/public/img/anleitungen`.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ME, SHOWN_AS, answer } from './fixtures.mjs';
import { SHOTS } from './shots.mjs';

const PORT = 8094;
const BASE = `http://localhost:${PORT}`;
const out = path.resolve(process.argv[2] || 'screenshots/out');
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
mkdirSync(out, { recursive: true });

// The app's config as the container would write it, with all three APIs on this origin under /mock/, where the routes below answer them.
const CONFIG = `window.appconfig = ${JSON.stringify({
    dynamicZonesBaseUrl: `${BASE}/mock/dyndns/`,
    cloudResourcesBaseUrl: `${BASE}/mock/projects/`,
    llmBaseUrl: `${BASE}/mock/llm/`,
    cloudResourcesMcpUrl: '', dynamicZonesMcpUrl: '',
    acmeServer: 'https://certificates.dhbw.cloud',
    dummyAuth: true,
    oidc: { client_id: 'screenshots', issuer_url: '', end_session_url: '' },
})};`;

async function waitForServer() {
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(BASE)).ok) return;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Vite did not start');
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let failed = false;
try {
    await waitForServer();
    const browser = await chromium.launch();
    for (const shot of SHOTS) {
        if (only && !only.has(shot.name)) continue;
        const context = await browser.newContext({ viewport: shot.viewport ?? { width: 1100, height: 1000 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Berlin', colorScheme: 'light' });
        // A fixed day, so dates and remaining times read the same on every run.
        await context.addInitScript(() => {
            const fixed = new Date('2026-11-10T09:30:00+01:00').valueOf();
            const RealDate = Date;
            globalThis.Date = class extends RealDate {
                constructor(...a) { super(...(a.length ? a : [fixed])); }
                static now() { return fixed; }
            };
            try { localStorage.setItem('i18nextLng', 'de'); } catch { /* none */ }
        });
        const page = await context.newPage();
        await page.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: CONFIG }));
        await page.route(`${BASE}/mock/**`, async (r) => {
            const req = r.request();
            const url = new URL(req.url());
            const [, , api, ...rest] = url.pathname.split('/');
            const res = answer(api, req.method(), '/' + rest.join('/'), url.searchParams, shot);
            if (res === undefined) {
                console.warn(`  unanswered: ${req.method()} /${api}/${rest.join('/')}${url.search}`);
                return r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not in fixtures"}' });
            }
            return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
        });
        try {
            await page.goto(BASE + shot.path);
            if (shot.act) await shot.act(page);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(400);
            // The dev login's address, wherever it shows, reads as the made-up person.
            await page.evaluate(([from, to]) => {
                const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                for (let n = walk.nextNode(); n; n = walk.nextNode()) n.nodeValue = n.nodeValue.replaceAll(from, to);
            }, [ME, SHOWN_AS]);
            const file = path.join(out, `${shot.name}.png`);
            const options = { path: file, animations: 'disabled', caret: 'hide' };
            if (shot.clip) {
                // One element, with a margin of the page around it.
                await page.locator(shot.clip).first().screenshot({ ...options, style: '' });
            } else {
                // From the top (header and tabs, so one sees where it is) down to the end of the last element matching upTo (default: the page's content), not the empty rest.
                const boxes = await page.locator(shot.upTo ?? 'main .mantine-Paper-root, .mantine-Container-root > .mantine-Paper-root').evaluateAll(els => els.map(e => e.getBoundingClientRect().bottom + window.scrollY));
                const bottom = Math.max(...boxes, 200) + 24;
                await page.screenshot({ ...options, fullPage: true, clip: { x: 0, y: shot.from ?? 0, width: page.viewportSize().width, height: bottom - (shot.from ?? 0) } });
            }
            console.log(`${shot.name}.png`);
        } catch (e) {
            failed = true;
            console.error(`${shot.name}: ${e.message}`);
        }
        await context.close();
    }
    await browser.close();
} finally {
    vite.kill();
}
process.exit(failed ? 1 : 0);
