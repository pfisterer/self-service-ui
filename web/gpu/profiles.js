// How JupyterHub's profile slugs read in the UI (the hub's profileList in gpu-aas). Unknown slugs are shown as they are.
export function profileLabel(slug, t) {
    // The old ones stay readable in the usage history.
    const known = ['cpu', 'cpu-gpukernel', 'gpu', 'pytorch', 'tensorflow', 'project-gpu', 'free', 'free-gpu', 'git-cpu', 'git-gpu'];
    return known.includes(slug) ? t(`gpu.profiles.${slug}`) : (slug || '—');
}

export function usesGpu(slug) {
    return ['gpu', 'project-gpu', 'pytorch', 'tensorflow', 'free-gpu', 'git-gpu'].includes(slug);
}

// The guide to "CPU + GPU kernel" on the homepage, where a project on an image not built on one of our bases is pointed to.
export const SPLIT_GUIDE_URL = 'https://dhbw.cloud/anleitungen/cpu-gpu-kernel';
