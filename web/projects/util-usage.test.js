import { describe, expect, it } from 'vitest';
import { attributesKey, attributesLabel, groupAttributes, groupingExamples, groupPath, groupProjects, idleProject, periodRange, toCSV } from './util-usage.js';

describe('periodRange', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    it('ends yesterday and includes both days', () => {
        expect(periodRange('30', now)).toEqual({ from: '2026-09-07', to: '2026-10-06' });
    });
    it('reaches back to the creation for the lifetime', () => {
        expect(periodRange('lifetime', now, '2026-10-01T08:00:00Z')).toEqual({ from: '2026-10-01', to: '2026-10-06' });
    });
    it('caps the lifetime of an old or unknown project', () => {
        expect(periodRange('lifetime', now).from).toBe('2023-10-05');
    });
});

describe('groupProjects', () => {
    const path = (...ids) => ids.map(id => ({ id, name: id.toUpperCase() }));
    const projects = [
        { node_id: 'p1', project_name: 'a', budget_path: path('course', 'faculty', 'ma', 'root'), vcpu_hours: 10, reserved_core_hours: 40, value_eur: 1 },
        { node_id: 'p2', project_name: 'b', budget_path: path('faculty', 'ma', 'root'), vcpu_hours: 30, reserved_core_hours: 40, value_eur: 2 },
        { node_id: 'p3', project_name: 'c', budget_path: path('s', 'root'), vcpu_hours: 5, reserved_core_hours: 0 },
    ];
    it('sums by the level below the root', () => {
        const g = groupProjects(projects, 'level1');
        expect(g.map(x => [x.id, x.projects, x.vcpu_hours])).toEqual([['ma', 2, 40], ['s', 1, 5]]);
        // 40 of 80 reserved core hours, not the mean of 25 % and 75 %.
        expect(g[0].utilization.cores).toBe(0.5);
        expect(g[0].value_eur).toBe(3);
        expect(g[1].utilization.cores).toBeNull();
        expect(g[1].value_eur).toBeNull();
    });
    it('puts a project with a short path under its deepest budget', () => {
        expect(groupProjects(projects, 'level2').map(x => x.id)).toEqual(['faculty', 's']);
    });
    it('groups by the project\'s own budget', () => {
        expect(groupProjects(projects, 'budget').map(x => x.id)).toEqual(['faculty', 'course', 's']);
    });
    it('keeps the budgets above a group, top down and without the root', () => {
        const byBudget = Object.fromEntries(groupProjects(projects, 'budget').map(g => [g.id, g]));
        expect(byBudget.course.above).toEqual(['MA', 'FACULTY']);
        expect(byBudget.faculty.above).toEqual(['MA']);
        expect(groupProjects(projects, 'level1').find(g => g.id === 'ma').above).toEqual([]);
        expect(groupProjects(projects, 'project').find(g => g.id === 'p1').above).toEqual(['MA', 'FACULTY', 'COURSE']);
        expect(groupPath(byBudget.course)).toBe('MA / FACULTY / COURSE');
    });
    it('names examples of a level from the data, sorted', () => {
        expect(groupingExamples(projects, 'level1')).toEqual(['MA', 'S']);
        expect(groupingExamples(projects, 'level2', 1)).toEqual(['FACULTY']);
        expect(groupingExamples([], 'level1')).toEqual([]);
    });
});

describe('idleProject', () => {
    const days = Array.from({ length: 30 }, () => ({}));
    it('flags an active project that ran nothing for 30 days', () => {
        expect(idleProject({ days, server_hours: 0 }, { status: 'approved' })).toBe(true);
        expect(idleProject({ days, server_hours: 1 }, { status: 'approved' })).toBe(false);
        expect(idleProject({ days: days.slice(1), server_hours: 0 }, { status: 'approved' })).toBe(false);
        expect(idleProject({ days, server_hours: 0 }, { status: 'archived' })).toBe(false);
    });
});

describe('groupProjects IPv4', () => {
    it('sums the address days and their counted days', () => {
        const g = groupProjects([
            { node_id: 'a', budget_path: [{ id: 'b' }], public_ipv4_days: 3, ipv4_sampled_days: 2 },
            { node_id: 'c', budget_path: [{ id: 'b' }], public_ipv4_days: 1, ipv4_sampled_days: 2 },
        ], 'budget');
        expect([g[0].public_ipv4_days, g[0].ipv4_sampled_days]).toEqual([4, 4]);
    });
});

describe('toCSV', () => {
    it('quotes what needs it and rounds numbers', () => {
        const csv = toCSV([{ label: 'Name', value: r => r.n }, { label: 'h', value: r => r.h }],
            [{ n: 'Lab, "KI"', h: 1.23456 }, { n: 'x', h: null }]);
        expect(csv).toBe('Name,h\n"Lab, ""KI""",1.23\nx,\n');
    });
});

describe('groupProjects by attributes', () => {
    const a = { billing: { cost_center: '1' } };
    const b = { billing: { cost_center: '2' } };
    const projects = [
        { node_id: 'p1', project_name: 'P1', attributes: a, vcpu_hours: 20 },
        { node_id: 'p1', project_name: 'P1', attributes: b, vcpu_hours: 5 },
        { node_id: 'p2', project_name: 'P2', attributes: { billing: { cost_center: '1' } }, vcpu_hours: 1 },
        { node_id: 'p3', project_name: 'P3', vcpu_hours: 2 },
    ];

    it('keeps the parts of a project whose attributes changed apart', () => {
        const g = groupProjects(projects, 'project');
        expect(g.filter(x => x.name === 'P1').map(x => x.vcpu_hours)).toEqual([20, 5]);
        expect(groupAttributes(g.find(x => x.vcpu_hours === 5))).toBe('{"billing":{"cost_center":"2"}}');
    });

    it('sums by attribute set', () => {
        const g = groupProjects(projects, 'attributes');
        expect(g.map(x => [x.name, x.vcpu_hours])).toEqual([
            ['billing.cost_center=1', 21], ['billing.cost_center=2', 5], ['', 2],
        ]);
    });

    it('leaves the attributes of a mixed group empty', () => {
        const g = groupProjects([...projects.map(p => ({ ...p, budget_path: [{ id: 's' }, { id: 'root' }] }))], 'budget');
        expect(groupAttributes(g[0])).toBe('');
    });

    it('writes attributes canonically', () => {
        expect(attributesKey({ z: { b: '1', a: '2' }, a: {} })).toBe('{"a":{},"z":{"a":"2","b":"1"}}');
        expect(attributesKey({})).toBe('');
        expect(attributesLabel({ billing: { wbs: 'D', cost_center: '4' } })).toBe('billing.cost_center=4, billing.wbs=D');
    });
});
