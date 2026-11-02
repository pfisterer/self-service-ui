// The cached server state of the GPU section (see dyndns/query-keys.js for why keys are arrays).
export const gpuKeys = {
    servers: () => ['gpu', 'servers'],
    progress: (name) => ['gpu', 'servers', name, 'progress'],
    startOptions: () => ['gpu', 'start-options'],
    usage: (scope, period) => ['gpu', 'usage', scope, period.from, period.to],
    projects: (all) => ['gpu', 'projects', all ? 'all' : 'mine'],
    catalog: () => ['gpu', 'catalog'],
    storage: () => ['gpu', 'storage'],
    fleet: () => ['gpu', 'fleet'],
    // Without a project the own jobs, which is also the prefix of every project's list (invalidating it refreshes them all).
    jobs: (project) => (project ? ['gpu', 'jobs', project] : ['gpu', 'jobs']),
    job: (id) => ['gpu', 'job', id],
    jobLog: (id) => ['gpu', 'job', id, 'log'],
    gpuHours: (scope, period) => ['gpu', 'gpu-hours', scope, period.from, period.to],
};
