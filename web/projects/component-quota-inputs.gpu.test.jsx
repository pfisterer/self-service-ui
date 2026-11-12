import { describe, expect, it } from 'vitest';
import { gpuPools, quotaSections } from './component-quota-inputs.jsx';
import { shortName } from './util-project.jsx';

describe('gpuPools', () => {
    it('pairs the two resources of each GPU class and arranges the classes by pool, tiers in order', () => {
        const pools = gpuPools([
            { id: 'ws-gpu-hours-forschung-large', name: 'Forschung · large: GPU hours', gpu_class: { pool: 'forschung', pool_name: 'Forschung', tier: 'large', tier_name: 'large', products: 'NVIDIA-H100', lends: true } },
            { id: 'ws-gpu-hours-general-medium', name: 'General · medium: GPU hours', gpu_class: { pool: 'general', pool_name: 'General', tier: 'medium', tier_name: 'medium', products: 'NVIDIA-L40S-12Q' } },
            { id: 'ws-gpus-general-medium', name: 'General · medium: GPUs at the same time', gpu_class: { pool: 'general', pool_name: 'General', tier: 'medium', tier_name: 'medium', products: 'NVIDIA-L40S-12Q' } },
            { id: 'ws-gpus-general-small', name: 'General · small: GPUs at the same time', gpu_class: { pool: 'general', pool_name: 'General', tier: 'small', tier_name: 'small', products: 'NVIDIA-L4-3Q' } },
        ]);
        expect(pools.map(p => p.name)).toEqual(['General', 'Forschung']);
        expect(pools[0].rows.map(r => r.name)).toEqual(['small', 'medium']);
        expect(pools[0].rows[1].gpus.id).toBe('ws-gpus-general-medium');
        expect(pools[0].rows[1].hours.id).toBe('ws-gpu-hours-general-medium');
        expect(pools[0].rows[0].hours).toBeUndefined();
        expect(pools[1].products).toBe('H100');
        expect(pools[1].lends).toBe(true);
    });
    it('reads pool and tier from the name without class info', () => {
        const pools = gpuPools([{ id: 'ws-gpus-general-small', name: 'General · small: GPUs at the same time' }]);
        expect(pools[0].name).toBe('General');
        expect(pools[0].rows[0].name).toBe('small');
    });
    it('leaves other groups alone', () => {
        expect(gpuPools([{ id: 'ws-vcpu-hours' }])).toBeNull();
    });
});

describe('quotaSections', () => {
    it('puts Workspaces CPU and GPU into one section and keeps LLM apart', () => {
        const sections = quotaSections([
            ['Workspaces', [{ id: 'ws-vcpu-hours', group: 'Workspaces' }]],
            ['LLM', [{ id: 'llm-mtokens', group: 'LLM' }]],
            ['Workspaces GPU', [{ id: 'ws-gpus-general-small', group: 'Workspaces GPU' }]],
            ['Compute', [{ id: 'cores', group: 'Compute' }]],
        ]);
        expect(sections.map(s => s.title)).toEqual(['Workspaces', 'LLM', 'Compute']);
        expect(sections[0].parts.map(p => p.subtitle)).toEqual(['CPU', 'GPU']);
        expect(sections[1].parts[0].short).toBe(true);
        expect(sections[2].parts[0].short).toBe(false);
    });
    it('shortens names under their heading', () => {
        expect(shortName('Workspace CPU')).toBe('CPU');
        expect(shortName('LLM tokens per minute')).toBe('Tokens per minute');
        expect(shortName('LLM: every model directly')).toBe('Every model directly');
        expect(shortName('Workspace storage')).toBe('Storage');
    });
});
