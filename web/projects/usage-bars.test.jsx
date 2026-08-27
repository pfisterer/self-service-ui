// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import { NodeUsageBars } from './component-common.jsx';

// A progress track needs a quantity to be a fraction OF, and an availability has
// none: a granted network is not "1 of 1 used", it is simply there. Drawn as a
// bar it reads as a full budget about to run out.

const resources = [
    { id: 'cores', name: 'Cores' },
    { id: 'dhbw-ipv4', name: 'DHBW IPv4', kind: 'bool' },
    { id: 'gpu-rtx6000', name: 'RTX 6000', kind: 'bool' },
];

function renderBars(node) {
    return render(
        <MantineProvider>
            <NodeUsageBars resources={resources} node={node} />
        </MantineProvider>,
    );
}

describe('NodeUsageBars', () => {
    afterEach(cleanup);

    it('draws a bar for the quantity and none for the availabilities', () => {
        const { container } = renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 1 },
            usage: { approved: { limit: { cores: 4 } } },
        });

        // Mantine's Progress renders a progressbar role per bar.
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(1);
    });

    it('names the granted availabilities', () => {
        renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 1 },
            usage: {},
        });

        expect(screen.getByText('DHBW IPv4')).toBeTruthy();
        expect(screen.getByText('RTX 6000')).toBeTruthy();
    });

    // A row of greyed-out badges for everything withheld says nothing and grows
    // with the catalogue.
    it('says nothing about the ones that were withheld', () => {
        renderBars({
            limit: { cores: 8, 'dhbw-ipv4': 1, 'gpu-rtx6000': 0 },
            usage: {},
        });

        expect(screen.getByText('DHBW IPv4')).toBeTruthy();
        expect(screen.queryByText('RTX 6000')).toBeNull();
    });
});
