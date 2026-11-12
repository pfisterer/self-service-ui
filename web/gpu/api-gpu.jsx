import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { allPages, asPage } from '/helper/pages.js';
import { upload } from '/helper/upload.js';
import { useClient } from '/providers/client.jsx';
// The GPU part lives in llm-management-api (same service, same client and base
// URL as the LLM section), under /v1/gpu. Named imports, as in llm/api-llm.jsx:
// an operation missing from the client fails the build, not the browser.
import {
    deleteGpuPool, deleteWorkspaceProject, getGpuFleet, getMyWorkspaceUsage, getGpuHours, putGpuNode, putGpuPool, getProjectImageLog, getWorkspaceCatalog, getWorkspaceStorage, getWorkspaceUsage,
    getGpuServerProgress, getGpuStartOptions, listGpuServers, listWorkspaceProjects, startGpuServer, rebuildProjectImage, stopGpuServer, updateProjectImage, updateWorkspaceProject,
    deleteProjectCredential, listProjectCredentials, setProjectCredential,
    cancelGpuJob, downloadGpuJobFile, getGpuJob, getGpuJobLog, listGpuJobFiles, listGpuJobs, submitGpuJob,
} from '@dhbw-cloud/llm-client';

function unwrap(res) {
    if (apiErrorMessage(res)) throw apiError(res);
    return res?.data;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useGpuApi() {
    const client = useClient('llm');

    return useMemo(() => {
        const call = async (op, opts = {}) => unwrap(await op({ client, ...opts }));
        return {
            // The lists of the AI service are paged ({ items, total, limit, offset }); where a screen needs a whole list, allPages loads every page.
            listServers: () => allPages((page) => call(listGpuServers, { query: page })),
            // Starting from the self-service UI: what the person's projects allow, and the start (project, profile, gpu_class).
            startOptions: () => call(getGpuStartOptions),
            startServer: (body) => call(startGpuServer, { body, headers: JSON_HEADERS }),
            // The default server has no name; the API calls it "-".
            stopServer: (name) => call(stopGpuServer, { path: { name: name || '-' } }),
            // How far a start got: the hub's event log, and ready or failed with the reason.
            serverProgress: (name) => call(getGpuServerProgress, { path: { name: name || '-' } }),
            // Workspace usage (W1): own rows for everyone with access, all rows for admins. period = { from, to }.
            myWorkspaceUsage: (period) => call(getMyWorkspaceUsage, { query: period }),
            workspaceUsage: (period, project) => call(getWorkspaceUsage, { query: project ? { ...period, project } : period }),
            // Projects (W2): own projects, or all for admins.
            listProjects: (all) => allPages((page) => call(listWorkspaceProjects, { query: all ? { all: true, ...page } : page })),
            catalog: () => call(getWorkspaceCatalog),
            updateProject: (p) => call(updateWorkspaceProject, { path: { slug: p.slug }, body: p, headers: JSON_HEADERS }),
            deleteProject: (slug) => call(deleteWorkspaceProject, { path: { slug } }),
            // The project image from Git (docs/bauplan.md 10.12): build again, and the build's log.
            rebuildProjectImage: (slug) => call(rebuildProjectImage, { path: { slug } }),
            // A finished image runs at its digest; this takes the newer one its tag points at now (image_update).
            updateProjectImage: (slug) => call(updateProjectImage, { path: { slug } }),
            // A project's access to private repositories and registries: per host the user name, never the token. Setting one answers with the new list.
            listCredentials: (slug) => allPages((page) => call(listProjectCredentials, { path: { slug }, query: page })),
            setCredential: (slug, body) => call(setProjectCredential, { path: { slug }, body, headers: JSON_HEADERS }),
            deleteCredential: (slug, host) => call(deleteProjectCredential, { path: { slug, host } }),
            // The build's log and what its pod is doing: { log, state, since }.
            projectImageLog: async (slug) => (await call(getProjectImageLog, { path: { slug } })) ?? { log: '' },
            // Admins: how full the workspace storage and its metadata are.
            storage: () => call(getWorkspaceStorage),
            // Admins: the GPU administration — nodes with pool and tier, pools, tiers, classes (docs/bauplan.md 10.13). Every change answers with the whole picture.
            fleet: () => call(getGpuFleet),
            assignNode: (name, body) => call(putGpuNode, { path: { name }, body, headers: JSON_HEADERS }),
            savePool: (id, body) => call(putGpuPool, { path: { id }, body, headers: JSON_HEADERS }),
            deletePool: (id) => call(deleteGpuPool, { path: { id } }),
            // GPU use per hour; period = { from, to }, project for a project's managers.
            gpuHours: (period, project) => call(getGpuHours, { query: project ? { ...period, project } : period }),
            // Batch jobs: without project the caller's own, with project the caller's there, or all of it for its managers and admins; one page of them ({ items, total, limit, offset }), newest first. A refused submit is a 409 with a message for people.
            listJobs: async (project, page = {}) => asPage(await call(listGpuJobs, { query: { ...(project ? { project } : {}), ...page } })),
            submitJob: (body) => call(submitGpuJob, { body, headers: JSON_HEADERS }),
            getJob: (id) => call(getGpuJob, { path: { id } }),
            // The end of a job's output: { log }, live while it runs, what was kept once it ended.
            jobLog: async (id, lines) => (await call(getGpuJobLog, { path: { id }, query: lines ? { lines } : undefined })) ?? { log: '' },
            cancelJob: (id) => call(cancelGpuJob, { path: { id } }),
            // A job's files (todo job_files): a folder of the home it ran in ({ path, files, truncated }; without path the job's folder), and one file as a Blob. The service reads them through a short-lived pod, so the first request takes a few seconds.
            jobFiles: (id, path) => call(listGpuJobFiles, { path: { id }, query: path ? { path } : undefined }),
            jobFile: (id, path) => call(downloadGpuJobFile, { path: { id }, query: { path }, parseAs: 'blob' }),
            // Uploads a File (a Blob) as path relative to the person's home in the project (under project-shared/ into the shared folder); answers the written file { name, path, size, modified }. The body goes as it is (application/octet-stream), so the browser streams it with its Content-Length. PUT /v1/gpu/files as the client's uploadGpuFile, but through helper/upload.js (XMLHttpRequest), which reports progress and can be cancelled: opts = { onProgress, signal } (useUpload's run passes both).
            uploadFile: (project, path, file, opts = {}) => upload({ client, url: '/v1/gpu/files', method: 'PUT', query: { project, path }, body: file, ...opts }),
        };
    }, [client]);
}
