import { getPluginClient } from "./client.js";

export interface LintResult {
    ruleId: string;
    message: string;
    nodeId: string;
    nodeName: string;
    severity: "error" | "warning";
}

export interface LintOptions {
    nodeId?: string; // If omitted, lints current selection
    rules: string[]; // e.g. ["wcag", "no-autolayout", "hardcoded-color"]
}

export async function lintNode(options: LintOptions): Promise<Record<string, LintResult[]>> {
    const rawResults = await getPluginClient().send("lintNode", options as unknown as Record<string, unknown>);
    const results = rawResults.result as LintResult[];

    // Group by ruleId
    const grouped: Record<string, LintResult[]> = {};
    for (const r of results) {
        const list = grouped[r.ruleId] ?? [];
        list.push(r);
        grouped[r.ruleId] = list;
    }
    return grouped;
}
