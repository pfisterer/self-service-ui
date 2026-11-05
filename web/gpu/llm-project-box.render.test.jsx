// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';

// The LLM project of a project's workspaces (default_llm_project): automatic, one of the editor's LLM projects, or without LLM; a value the editor does not have stays.

vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => ({ ...(await importOriginal()), useGpuApi: () => globalThis.__gpuApi }));
const { LlmProjectBox, llmProjectOptions } = await import('/gpu/workspace-settings.jsx');

afterEach(() => {
    cleanup();
    delete globalThis.__gpuApi;
});

const t = (k) => k;
const LLM = [{ slug: 'llm-kurs', name: 'LLM Kurs' }];

describe('LLM project of the workspaces', () => {
    it('offers automatic, the editor\'s LLM projects and none', () => {
        expect(llmProjectOptions(LLM, '', t).map(o => o.value)).toEqual(['auto', 'llm-kurs', 'none']);
    });
    it('keeps a set LLM project the editor does not have, by its short name', () => {
        expect(llmProjectOptions(LLM, 'fremd-llm', t)).toContainEqual({ value: 'fremd-llm', label: 'fremd-llm' });
        expect(llmProjectOptions(LLM, 'none', t).map(o => o.value)).toEqual(['auto', 'llm-kurs', 'none']);
    });
    it('says what each value means', () => {
        globalThis.__gpuApi = { startOptions: async () => ({ projects: [], profiles: [], llm_projects: LLM }) };
        for (const [value, hint] of [['', 'autoHint'], ['none', 'noneHint'], ['llm-kurs', 'projectHint']]) {
            renderView(<LlmProjectBox value={value} onChange={() => {}} />);
            expect(screen.getByText(i18n.t(`gpu.projects.llm.${hint}`))).toBeTruthy();
            cleanup();
        }
    });
});
