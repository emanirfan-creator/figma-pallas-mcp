import { getRestClient } from "./client.js";

export interface FigmaVersion {
    id: string;
    created_at: string;
    label: string | null;
    description: string | null;
    user: {
        id: string;
        handle: string;
        img_url: string;
    };
}

export interface FigmaBranch {
    key: string;
    name: string;
    workspace_id: string;
    thumbnail_url: string;
    created_at: string;
    last_modified: string;
    user: {
        id: string;
        handle: string;
        img_url: string;
    };
}

export async function getVersions(fileKey: string): Promise<FigmaVersion[]> {
    const res = await getRestClient().request<{ versions: FigmaVersion[] }>(`/files/${fileKey}/versions`);
    return res.versions;
}

// Note: Branching requires an Enterprise plan, but we can expose it via the API
export async function getBranches(fileKey: string): Promise<FigmaBranch[]> {
    const res = await getRestClient().request<{ branches: FigmaBranch[] }>(`/files/${fileKey}/branches`);
    return res.branches;
}

export async function createBranch(fileKey: string, name: string): Promise<FigmaBranch> {
    const res = await getRestClient().request<FigmaBranch>(`/files/${fileKey}/branches`, {
        method: "POST",
        body: JSON.stringify({ name })
    });
    return res;
}
