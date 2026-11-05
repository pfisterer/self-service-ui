// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NO_LLM, envsOf, llmChoice, llmDefault, startBody, startLink } from '/gpu/start.jsx';

const profiles = [{ slug: 'cpu' }, { slug: 'cpu-gpukernel', gpu: true }, { slug: 'gpu', gpu: true }];

describe('start page', () => {
    it('offers the profiles of the project, the split one only on our bases', () => {
        expect(envsOf({ profiles: ['gpu', 'cpu', 'cpu-gpukernel'], image_derived: true }, profiles).map(p => p.slug)).toEqual(['cpu', 'cpu-gpukernel', 'gpu']);
        expect(envsOf({ profiles: ['cpu', 'cpu-gpukernel'], image_derived: false }, profiles).map(p => p.slug)).toEqual(['cpu']);
        expect(envsOf(undefined, profiles)).toEqual([]);
    });
    it('puts the choice into the link and drops what was there', () => {
        expect(startLink('https://ui/workspaces/servers/start?project=old', { project: 'ml', env: 'gpu', gpuClass: 'general-medium' }))
            .toBe('https://ui/workspaces/servers/start?project=ml&env=gpu&gpu_class=general-medium');
        expect(startLink('https://ui/workspaces/servers/start', { project: 'ml', env: 'cpu', gpuClass: '' })).toBe('https://ui/workspaces/servers/start?project=ml&env=cpu');
        expect(startLink('https://ui/workspaces/servers/start', { project: 'ml', env: 'gpu', autostart: true })).toBe('https://ui/workspaces/servers/start?project=ml&env=gpu&autostart=1');
    });
    it('puts another LLM choice into the link', () => {
        expect(startLink('https://ui/workspaces/servers/start', { project: 'ml', env: 'cpu', llm: 'none' })).toBe('https://ui/workspaces/servers/start?project=ml&env=cpu&llm=none');
        expect(startLink('https://ui/workspaces/servers/start', { project: 'ml', env: 'cpu', llm: '' })).toBe('https://ui/workspaces/servers/start?project=ml&env=cpu');
    });
    it('preselects what the service names as default, a choice only when it is one of the person\'s', () => {
        const llm = [{ slug: 'a' }, { slug: 'b' }];
        expect(llmDefault({ slug: 'ws', llm_default: 'b' })).toBe('b');
        expect(llmDefault({ slug: 'ws' })).toBe(NO_LLM);
        expect(llmChoice('', { slug: 'ws', llm_default: 'a' }, llm)).toBe('a');
        expect(llmChoice('b', { slug: 'ws', llm_default: 'a' }, llm)).toBe('b');
        expect(llmChoice(NO_LLM, { slug: 'a', llm_default: 'a' }, llm)).toBe(NO_LLM);
        expect(llmChoice('fremd', { slug: 'a', llm_default: 'none' }, llm)).toBe(NO_LLM);
    });
    it('sends the default as empty, the service applies the project\'s rule; another choice explicitly', () => {
        expect(startBody({ slug: 'ws', llm_default: 'a' }, { slug: 'cpu' }, undefined, NO_LLM)).toEqual({ project: 'ws', profile: 'cpu', gpu_class: '', llm_project: 'none' });
        expect(startBody({ slug: 'ws', llm_default: 'a' }, { slug: 'cpu' }, undefined, 'a')).toEqual({ project: 'ws', profile: 'cpu', gpu_class: '', llm_project: '' });
        expect(startBody({ slug: 'ws', llm_default: 'none' }, { slug: 'gpu', gpu: true }, { id: 'l4' }, 'a')).toEqual({ project: 'ws', profile: 'gpu', gpu_class: 'l4', llm_project: 'a' });
    });
});
