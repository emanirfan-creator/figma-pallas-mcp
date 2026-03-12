import { getRestClient } from "./client.js";

export interface FigmaComment {
    id: string;
    file_key: string;
    parent_id: string;
    message: string;
    resolved_at: string | null;
    created_at: string;
    client_meta: {
        node_id?: string;
        node_offset?: { x: number; y: number };
    } | null;
}

export async function readComments(fileKey: string): Promise<FigmaComment[]> {
    const res = await getRestClient().request<{ comments: FigmaComment[] }>(`/files/${fileKey}/comments`);
    return res.comments;
}

export async function writeComment(fileKey: string, message: string, nodeId?: string): Promise<FigmaComment> {
    const payload: Record<string, unknown> = { message };
    if (nodeId) {
        payload.client_meta = { node_id: nodeId };
    }

    return getRestClient().request<FigmaComment>(`/files/${fileKey}/comments`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export async function resolveComment(fileKey: string, commentId: string): Promise<void> {
    await getRestClient().request(`/files/${fileKey}/comments/${commentId}`, {
        method: "DELETE"
    });
}
