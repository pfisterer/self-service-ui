// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultV2Sort } from './component-budget-projects.jsx';
import { barFigures, isEmptyRow, sectionOf } from './component-budget-sections.jsx';

const CORES = { id: 'cores' };
const CPU_H = { id: 'ws-vcpu-hours', provider: 'aiaas', area: 'workspaces', window: '30d' };
const TOKENS = { id: 'llm-mtokens', provider: 'aiaas', area: 'llm' };
const GPU = { id: 'ws-gpu-hours-mannheim-large', provider: 'aiaas', area: 'workspaces' };
const NET = { id: 'dhbw-ipv4', kind: 'bool' };

describe('defaultV2Sort', () => {
    it('starts with the biggest user of the kind\'s first quantity', () => {
        expect(defaultV2Sort([NET, CORES, CPU_H, TOKENS], 'cloud')).toEqual({ key: 'used:cores', order: 'desc' });
        expect(defaultV2Sort([NET, CORES, CPU_H, TOKENS], 'workspaces')).toEqual({ key: 'used:ws-vcpu-hours', order: 'desc' });
        expect(defaultV2Sort([NET, CORES, CPU_H, TOKENS], 'llm')).toEqual({ key: 'used:llm-mtokens', order: 'desc' });
    });

    it('falls back to the name without a quantity', () => {
        expect(defaultV2Sort([NET], 'cloud')).toEqual({ key: 'name', order: 'asc' });
    });
});

describe('budget sections', () => {
    it('sorts the resources into Cloud, Workspaces, GPU, Sprachmodelle and Freigaben', () => {
        expect([CORES, CPU_H, GPU, TOKENS, NET].map(sectionOf)).toEqual(['cloud', 'workspaces', 'gpu', 'llm', 'free']);
    });

    it('reads used and handed out from the rollup, and knows an empty row', () => {
        const node = { limit: { cores: 100, ram: 0 }, usage: { approved: { limit: { cores: 40 } }, released: { limit: { cores: 2 } } }, subtree_in_use: { cores: 30 } };
        expect(barFigures(node, CORES)).toMatchObject({ limit: 100, approved: 42, retired: 2, used: 30 });
        expect(isEmptyRow(node, CORES)).toBe(false);
        expect(isEmptyRow(node, { id: 'ram' })).toBe(true);
    });
});
