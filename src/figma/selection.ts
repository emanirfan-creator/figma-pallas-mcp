import { getPluginClient } from "./client.js";

/**
 * Requests the current selection from the Figma plugin.
 */
export async function getSelection(): Promise<{ id: string; name: string; type: string }[]> {
    const rawResults = await getPluginClient().send("getSelection", {});
    return rawResults.result as { id: string; name: string; type: string }[];
}
