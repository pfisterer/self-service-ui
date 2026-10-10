// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each GPU view render at all, with data in it? Same question as llm/views.render.test.jsx.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', gpu_tier: 'standard', jupyter_url: 'https://jupyter.example',
};

vi.mock('/llm/use-llm-me.jsx', () => ({
    useLlmMe: () => ({ query: { isPending: false, isError: false }, me: ME, hasAccess: true, isFleetAdmin: true, isAdmin: true }),
}));
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});

const ENVS = [
    { id: 2, owner: 'dennis.pfisterer@dhbw.de', name: 'Conda-Beispiel', git_url: 'https://github.com/binder-examples/conda', branch: 'main',
      commit: 'f00a783146e9c6a2ed9726f01fc09fbfbad2f89e', image: 'reg/envs/github-com-binder-examples-conda:f00a783146e9', status: 'building',
      created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
    { id: 1, owner: 'dennis.pfisterer@dhbw.de', name: 'requirements', git_url: 'https://github.com/binder-examples/requirements', branch: 'main',
      commit: '505a59f0430cb6414a4acbdd88803ce33c7fd953', image: 'reg/envs/github-com-binder-examples-requirements:505a59f0430c', status: 'ready',
      created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
    { id: 3, owner: 'dennis.pfisterer@dhbw.de', name: 'kaputt', git_url: 'https://github.com/o/kaputt', branch: 'main',
      commit: '0123456789abcdef0123456789abcdef01234567', image: 'reg/envs/github-com-o-kaputt:0123456789ab', status: 'failed',
      message: 'Build fehlgeschlagen, Details im Build-Log.', created_at: '2026-10-10T12:15:41Z', updated_at: '2026-10-10T12:15:41Z' },
];

const SERVERS = [
    { name: '', ready: true, url: 'https://jupyter.example/user/a/', profile: 'cpu-gpukernel' },
    { name: 'conda-beispiel-2', ready: false, pending: 'spawn', url: 'https://jupyter.example/user/a/conda-beispiel-2/', profile: 'git-gpu',
      image: 'reg/envs/github-com-binder-examples-conda:f00a783146e9' },
];

const { GpuEnvironments } = await import('/gpu/environments.jsx');
const { GpuServers } = await import('/gpu/servers.jsx');

let consoleErrors = [];
beforeEach(() => {
    globalThis.__gpuApi = {
        listEnvironments: async () => ENVS,
        listServers: async () => SERVERS,
        environmentLog: async () => 'log',
    };
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e =>
        /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the GPU views render', () => {
    it('Environments lists the environments with their status', async () => {
        renderView(<GpuEnvironments />);
        expect(await screen.findByText('Conda-Beispiel')).toBeTruthy();
        expect(screen.getByText('Build fehlgeschlagen, Details im Build-Log.')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Servers lists the servers', async () => {
        renderView(<GpuServers />);
        expect(await screen.findByText('conda-beispiel-2')).toBeTruthy();
        expectNoRenderFailure();
    });
});
