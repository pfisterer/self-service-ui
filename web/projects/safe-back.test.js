import { describe, expect, it } from 'vitest';
import { parseBackHosts, safeBack } from '/projects/safe-back.js';

const origin = 'https://self-service.dhbw.cloud';
const hosts = ['jupyter.gpu.services.dhbw.cloud', 'chat.llm.services.dhbw.cloud'];
const back = raw => safeBack(raw, { origin, hosts });

describe('safeBack', () => {
    it('keeps nothing without a value', () => {
        expect(back(null)).toBeNull();
        expect(back('')).toBeNull();
    });

    it('keeps addresses on this page\'s own origin, relative ones too', () => {
        expect(back('https://self-service.dhbw.cloud/llm/overview?x=1')).toBe('https://self-service.dhbw.cloud/llm/overview?x=1');
        expect(back('/workspaces/servers/start')).toBe('https://self-service.dhbw.cloud/workspaces/servers/start');
    });

    it('keeps https addresses on an allowed host', () => {
        expect(back('https://jupyter.gpu.services.dhbw.cloud/hub/home')).toBe('https://jupyter.gpu.services.dhbw.cloud/hub/home');
        expect(back('https://CHAT.llm.services.dhbw.cloud/c/new')).toBe('https://chat.llm.services.dhbw.cloud/c/new');
    });

    it('refuses other DHBW hosts that are not on the list', () => {
        expect(back('https://dhbw.cloud/')).toBeNull();
        expect(back('https://evil.dhbw.cloud/')).toBeNull();
        expect(back('https://x.jupyter.gpu.services.dhbw.cloud/')).toBeNull();
    });

    it('refuses look-alike hosts', () => {
        expect(back('https://evil-dhbw.cloud/')).toBeNull();
        expect(back('https://dhbw.cloud.evil.com/')).toBeNull();
        expect(back('https://jupyter.gpu.services.dhbw.cloud.evil.com/')).toBeNull();
        expect(back('https://evil-jupyter.gpu.services.dhbw.cloud/')).toBeNull();
    });

    it('refuses user info tricks', () => {
        expect(back('https://jupyter.gpu.services.dhbw.cloud@evil.com/')).toBeNull();
        expect(back('https://jupyter.gpu.services.dhbw.cloud:443@evil.com/')).toBeNull();
        expect(back('https://user:pw@jupyter.gpu.services.dhbw.cloud/')).toBeNull();
        expect(back('https://user@self-service.dhbw.cloud/')).toBeNull();
    });

    it('refuses script and data addresses', () => {
        expect(back('javascript:alert(1)')).toBeNull();
        expect(back('JavaScript:alert(1)')).toBeNull();
        expect(back(' javascript:alert(1)')).toBeNull();
        expect(back('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('refuses protocol-relative and backslash addresses to other hosts', () => {
        expect(back('//evil.com/')).toBeNull();
        expect(back('/\\evil.com/')).toBeNull();
        expect(back('\\\\evil.com/')).toBeNull();
    });

    it('refuses http, also on an allowed host, and other ports', () => {
        expect(back('http://evil.com/')).toBeNull();
        expect(back('http://jupyter.gpu.services.dhbw.cloud/')).toBeNull();
        expect(back('http://self-service.dhbw.cloud/')).toBeNull();
        expect(back('https://jupyter.gpu.services.dhbw.cloud:8443/')).toBeNull();
    });

    it('allows only this page with an empty list', () => {
        expect(safeBack('https://jupyter.gpu.services.dhbw.cloud/', { origin, hosts: [] })).toBeNull();
        expect(safeBack('/projects', { origin, hosts: [] })).toBe('https://self-service.dhbw.cloud/projects');
    });

    it('keeps http on its own origin in development', () => {
        expect(safeBack('http://localhost:8084/llm', { origin: 'http://localhost:8084', hosts })).toBe('http://localhost:8084/llm');
    });
});

describe('parseBackHosts', () => {
    it('splits, trims and lower-cases, dropping empty entries', () => {
        expect(parseBackHosts(' Jupyter.example , ,chat.example,')).toEqual(['jupyter.example', 'chat.example']);
        expect(parseBackHosts('')).toEqual([]);
        expect(parseBackHosts(undefined)).toEqual([]);
        expect(parseBackHosts(['A.example'])).toEqual(['a.example']);
    });
});
