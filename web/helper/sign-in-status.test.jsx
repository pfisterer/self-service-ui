// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import '/i18n/index.js';
import { SignInOutageBanner } from './sign-in-status.jsx';

// The banner is the only thing that tells a person why a login fails while the
// identity provider is away. What matters is when it shows: only on an explicit
// "sign-in unavailable" from an API — never because an API itself is down or
// predates the field, which would put a false alarm on every page.

function answer(byUrl) {
    return vi.fn(async (url) => {
        const body = Object.entries(byUrl).find(([part]) => String(url).includes(part))?.[1];
        if (body === undefined) return { ok: false, json: async () => ({}) };
        if (body instanceof Error) throw body;
        return { ok: true, json: async () => body };
    });
}

const renderBanner = () => render(<MantineProvider><SignInOutageBanner /></MantineProvider>);

beforeEach(() => {
    window.appconfig = {
        cloudResourcesBaseUrl: 'https://projects.example.com/',
        dynamicZonesBaseUrl: 'https://zones.example.com/',
    };
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('SignInOutageBanner', () => {
    it('shows when an API reports that signing in does not work', async () => {
        vi.stubGlobal('fetch', answer({
            'projects.example.com': { auth: { sign_in_available: false } },
            'zones.example.com': { auth: { sign_in_available: true } },
        }));
        renderBanner();
        expect(await screen.findByText('Signing in is currently unavailable')).toBeTruthy();
    });

    it('stays away while both APIs report sign-in working', async () => {
        const fetch = answer({
            'projects.example.com': { auth: { sign_in_available: true } },
            'zones.example.com': { auth: { sign_in_available: true } },
        });
        vi.stubGlobal('fetch', fetch);
        renderBanner();
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('Signing in is currently unavailable')).toBeNull();
    });

    it('says nothing about sign-in when an API is itself unreachable or older', async () => {
        const fetch = answer({
            'projects.example.com': new Error('network down'),
            'zones.example.com': { auth: {} },
        });
        vi.stubGlobal('fetch', fetch);
        renderBanner();
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('Signing in is currently unavailable')).toBeNull();
    });
});
