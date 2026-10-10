// How JupyterHub's profile slugs read in the UI (the hub's profileList in gpu-aas). Unknown slugs are shown as they are.
export function profileLabel(slug, t) {
    const known = ['cpu', 'git-cpu', 'git-gpu', 'pytorch', 'tensorflow', 'cpu-gpukernel'];
    return known.includes(slug) ? t(`gpu.profiles.${slug}`) : (slug || '—');
}

export function usesGpu(slug) {
    return ['git-gpu', 'pytorch', 'tensorflow'].includes(slug);
}
