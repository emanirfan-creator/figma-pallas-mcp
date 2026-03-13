import { getPluginClient } from "./client.js";
/**
 * Requests the current selection from the Figma plugin.
 */
export async function getSelection() {
    const rawResults = await getPluginClient().send("getSelection", {});
    return rawResults.result;
}
