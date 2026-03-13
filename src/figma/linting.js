import { getPluginClient } from "./client.js";
export async function lintNode(options) {
    const rawResults = await getPluginClient().send("lintNode", options);
    const results = rawResults.result;
    // Group by ruleId
    const grouped = {};
    for (const r of results) {
        const list = grouped[r.ruleId] ?? [];
        list.push(r);
        grouped[r.ruleId] = list;
    }
    return grouped;
}
