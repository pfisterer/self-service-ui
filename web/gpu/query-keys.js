// The cached server state of the GPU section (see dyndns/query-keys.js for why keys are arrays).
export const gpuKeys = {
    environments: () => ['gpu', 'environments'],
    log: (id) => ['gpu', 'environments', id, 'log'],
    servers: () => ['gpu', 'servers'],
};
