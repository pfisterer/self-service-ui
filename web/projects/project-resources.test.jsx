// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import { ProjectResources } from './component-project-resources.jsx';

// A measured project shows what it uses of what it holds, and for each
// availability whether anything uses it — including one used without being
// granted, the state in which the reconciler tries to take it away.

const resources = [
    { id: 'cores', name: 'Cores' },
    { id: 'ipv4', name: 'IPv4', kind: 'bool', grant_type: 'network' },
    { id: 'gpu', name: 'GPU', kind: 'bool', grant_type: 'flavor' },
    { id: 'img', name: 'Image', kind: 'bool', grant_type: 'image' },
];

function renderIt(node, quota) {
    return render(
        <MantineProvider>
            <ProjectResources node={node} resources={resources} quota={quota} />
        </MantineProvider>,
    );
}

describe('ProjectResources', () => {
    afterEach(cleanup);

    it('draws a bar per quantity and the VMs, and counts what uses an availability', () => {
        const { container } = renderIt(
            { os_in_use: { cores: 12 }, os_servers: 2, os_server_limit: 25, os_grant_use: { ipv4: 2, gpu: 0, img: 1 } },
            { cores: 25, ipv4: 1, gpu: 1, img: 0 },
        );
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(2);
        expect(screen.getByText('12 / 25')).toBeTruthy();
        expect(screen.getByText('IPv4 · 2')).toBeTruthy();
        expect(screen.getByText('GPU')).toBeTruthy();
        // Not granted, but in use: shown, so it is not missed.
        expect(screen.getByText('Image · 1')).toBeTruthy();
    });

    it('is the plain summary before the first measurement', () => {
        const { container } = renderIt({}, { cores: 4, ipv4: 1 });
        expect(container.querySelectorAll('[role="progressbar"]').length).toBe(0);
    });
});
