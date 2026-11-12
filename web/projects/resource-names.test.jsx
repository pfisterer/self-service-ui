// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import i18n from '/i18n/index.js';
import { gpuClassResource, resourceAmount, resourceHint, resourceLabel, resourceName, resourceShortName, resourceSummaryText, resourceUnitName, shortName } from './util-project.jsx';
import { QuotaInputs, gpuPools } from './component-quota-inputs.jsx';

// The catalogue arrives in English; the UI names a resource by its id where it has a translation, else by the server's text.
const de = i18n.getFixedT('de');
const en = i18n.getFixedT('en');

const cores = { id: 'cores', name: 'Cores', group: 'Compute', min: 0, max: 100000, message: '0 - 100000 cores' };
const ram = { id: 'ram', name: 'RAM', unit: 'GB', group: 'Compute', min: 1, max: 256000, message: '1 GB - 256 TB' };
const storage = { id: 'ws-storage-gb', name: 'Workspace storage', unit: 'GB', group: 'Workspaces', message: "disk space for the members' homes in the project and its shared folder together; deleted with the project" };
const tokens = { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', group: 'LLM', message: 'million tokens per 30 days' };
const network = { id: 'net-4711', name: 'Lab network', kind: 'bool', group: 'Networks', message: 'the network of the lab' };
const gpuClass = { pool: 'general', pool_name: 'General', tier: 'medium', tier_name: 'medium', products: 'NVIDIA-L40S-12Q' };
const gpus = { id: 'ws-gpus-general-medium', name: 'General · medium: GPUs at the same time', unit: 'GPU', group: 'Workspaces GPU', gpu_class: gpuClass, message: 'how many GPUs of the class General · medium the project may use at the same time' };
const gpuHours = { id: 'ws-gpu-hours-general-medium', name: 'General · medium: GPU hours', unit: 'GPU h', kind: 'window', window: '30d', group: 'Workspaces GPU', gpu_class: gpuClass, message: 'GPU hours per 30 days on GPUs of the class General · medium' };

describe('resourceName', () => {
    it('translates a known id', () => {
        expect(resourceName(de, cores)).toBe('Kerne');
        expect(resourceName(de, ram)).toBe('Arbeitsspeicher');
        expect(resourceName(de, storage)).toBe('Workspace-Speicher');
        expect(resourceName(en, storage)).toBe('Workspace storage');
    });

    it('keeps the server text for an unknown id, such as an availability root admins added', () => {
        expect(resourceName(de, network)).toBe('Lab network');
        expect(resourceName(de, { id: 'something-new', name: 'Something new' })).toBe('Something new');
        expect(resourceName(de, { id: 'odd.id:x', name: 'Odd' })).toBe('Odd');
        expect(resourceName(de, { id: 'no-name' })).toBe('no-name');
    });

    it('names a GPU class from its pool and tier with a translated suffix', () => {
        expect(resourceName(de, gpus)).toBe('General · medium: GPUs gleichzeitig');
        expect(resourceName(de, gpuHours)).toBe('General · medium: GPU-Stunden');
        expect(resourceName(en, gpus)).toBe('General · medium: GPUs at the same time');
        expect(resourceName(en, gpuHours)).toBe('General · medium: GPU hours');
    });

    it('keeps the server name of a GPU class without pool and tier names', () => {
        const old = { id: 'ws-gpus-l40s', name: 'L40S: GPUs at the same time' };
        expect(resourceName(de, old)).toBe('L40S: GPUs at the same time');
        expect(gpuClassResource(old)).toEqual({ kind: 'gpus', classId: 'l40s', name: '' });
        expect(gpuClassResource(cores)).toBeNull();
    });
});

describe('resourceHint', () => {
    it('translates a known hint, a range with the catalogue\'s own bounds', () => {
        expect(resourceHint(de, cores)).toBe('0 – 100000 Kerne');
        expect(resourceHint(en, cores)).toBe('0 - 100000 cores');
        expect(resourceHint(de, ram)).toBe('1 GB – 256 TB');
        expect(resourceHint(de, storage)).toMatch(/^Speicherplatz für die Homes/);
    });

    it('keeps the server text for an unknown id and says nothing where the server says nothing', () => {
        expect(resourceHint(de, network)).toBe('the network of the lab');
        expect(resourceHint(de, { id: 'cores', name: 'Cores' })).toBe('');
        expect(resourceHint(de, { ...cores, min: undefined })).toBe('0 - 100000 cores');
    });

    it('explains a GPU class in both languages', () => {
        expect(resourceHint(de, gpus)).toBe('wie viele GPUs der Klasse General · medium das Projekt gleichzeitig nutzen darf');
        expect(resourceHint(de, gpuHours)).toBe('GPU-Stunden pro 30 Tage auf GPUs der Klasse General · medium');
        expect(resourceHint(en, gpuHours)).toBe('GPU hours per 30 days on GPUs of the class General · medium');
    });
});

describe('units, labels and amounts', () => {
    it('translates a unit where the UI has one and keeps the others', () => {
        expect(resourceUnitName(de, tokens)).toBe('Mio. Tokens');
        expect(resourceUnitName(en, tokens)).toBe('M tokens');
        expect(resourceUnitName(de, ram)).toBe('GB');
        expect(resourceUnitName(de, cores)).toBe('');
    });

    it('puts name, unit and window together', () => {
        expect(resourceLabel(de, tokens)).toBe('LLM-Tokens (Mio. Tokens pro 30 Tage)');
        expect(resourceLabel(de, gpuHours)).toBe('General · medium: GPU-Stunden (GPU h pro 30 Tage)');
        expect(resourceAmount(de, ram, 16)).toBe('16 GB Arbeitsspeicher');
        expect(resourceAmount(de, network, 1)).toBe('Lab network');
        expect(resourceSummaryText(de, [cores, ram, network], { cores: 4, ram: 8, 'net-4711': 1 })).toBe('4 Kerne · 8 GB Arbeitsspeicher · Lab network');
    });
});

describe('resourceShortName', () => {
    it('uses the translated short form under a heading', () => {
        expect(resourceShortName(de, storage)).toBe('Speicher');
        expect(resourceShortName(en, storage)).toBe('Storage');
        expect(resourceShortName(de, { id: 'llm-tpm', name: 'LLM tokens per minute' })).toBe('Tokens pro Minute');
    });

    it('drops the area prefix of a name the UI does not know', () => {
        expect(resourceShortName(de, { id: 'llm-model-new', name: 'LLM: new model' })).toBe('New model');
        expect(shortName('Workspace-Speicher')).toBe('Speicher');
    });
});

describe('gpuPools', () => {
    it('reads pool and tier from the structured class, not from the name', () => {
        const pools = gpuPools([{ ...gpus, name: 'anything' }, { ...gpuHours, name: 'anything' }]);
        expect(pools.map(p => p.name)).toEqual(['General']);
        expect(pools[0].rows.map(r => r.name)).toEqual(['medium']);
        expect(pools[0].rows[0].gpus.id).toBe(gpus.id);
        expect(pools[0].rows[0].hours.id).toBe(gpuHours.id);
    });

    it('falls back to the class id when neither class data nor a name says more', () => {
        const pools = gpuPools([{ id: 'ws-gpus-l40s' }]);
        expect(pools[0].name).toBe('l40s');
        expect(pools[0].rows[0].name).toBe('l40s');
    });
});

describe('QuotaInputs in German', () => {
    afterEach(cleanup);

    it('names and explains the fields in German, an admin\'s availability as written', async () => {
        await i18n.changeLanguage('de');
        try {
            render(
                <MantineProvider>
                    <QuotaInputs resources={[cores, ram, storage, network]} value={{ cores: 4, ram: 8, 'ws-storage-gb': 10, 'net-4711': 0 }} onChange={() => {}} />
                </MantineProvider>,
            );
            expect(screen.getByText('Kerne')).toBeTruthy();
            expect(screen.getByText('0 – 100000 Kerne')).toBeTruthy();
            expect(screen.getByText(/^Arbeitsspeicher/)).toBeTruthy();
            // Under the Workspaces heading the short form.
            expect(screen.getByText('Speicher')).toBeTruthy();
            expect(screen.getByText('Lab network')).toBeTruthy();
            expect(screen.getByText('the network of the lab')).toBeTruthy();
            expect(screen.queryByText('Cores')).toBeNull();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
