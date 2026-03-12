/**
 * Panda CSS Tokens — read/write token definition files
 * Writes are always atomic (temp file + rename).
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenValue = string | number | Record<string, unknown>;

export interface TokenTree {
    [key: string]: TokenValue | TokenTree;
}

// ---------------------------------------------------------------------------
// Read tokens
// ---------------------------------------------------------------------------

/**
 * Reads a Panda token file and returns the deep token tree.
 * Supports both TS/JS exports using a lightweight text extraction approach.
 * The returned object is the parsed JSON-safe representation of the token object.
 */
export async function readTokens(tokenFilePath: string): Promise<TokenTree> {
    const src = await readFile(tokenFilePath, "utf8");

    // Strategy: find the export default / export const tokens = ... block
    // and parse the literal JSON-safe object
    const extracted = extractObjectLiteral(src);
    if (!extracted) {
        throw new Error(
            `Could not extract token object from ${tokenFilePath}.\n` +
            "Expected a top-level 'export const tokens = {...}' or 'export default {...}'."
        );
    }
    // Convert JS object literal to JSON by replacing unquoted keys and trailing commas
    try {
        return JSON.parse(toJson(extracted));
    } catch (e) {
        throw new Error(
            `Token object in ${tokenFilePath} is not parseable as JSON.\n` +
            `Details: ${String(e)}`
        );
    }
}

// ---------------------------------------------------------------------------
// Write token
// ---------------------------------------------------------------------------

/**
 * Updates a single token value at dotted tokenPath in the token file.
 * Write is atomic: writes to a temp file then renames.
 */
export async function writeToken(
    tokenFilePath: string,
    tokenPath: string,
    value: TokenValue
): Promise<void> {
    const src = await readFile(tokenFilePath, "utf8");
    const keys = tokenPath.split(".");

    // Simple text-level replacement for the leaf key:value pair
    // This is sufficient for primitively structured token files.
    const updated = setNestedValue(src, keys, value);
    await atomicWrite(tokenFilePath, updated);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractObjectLiteral(src: string): string | null {
    // Match "export default {" or "export const <name> = {"
    const match = src.match(
        /export\s+(?:default\s*|const\s+\w+\s*=\s*)\{([\s\S]*)\}/
    );
    if (!match) return null;
    return `{${match[1]}}`;
}

function toJson(objLiteral: string): string {
    return objLiteral
        // Quote unquoted object keys
        .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*):/g, '$1"$2"$3:')
        // Remove trailing commas before } or ]
        .replace(/,(\s*[}\]])/g, "$1")
        // Replace single-quoted strings with double-quoted
        .replace(/'([^']*)'/g, '"$1"');
}

function setNestedValue(
    src: string,
    keys: string[],
    value: TokenValue
): string {
    // Build a regex to find the last key and replace its value
    // This is a best-effort approach for simple token files
    const lastKey = keys[keys.length - 1];
    if (!lastKey) return src;
    const pattern = new RegExp(
        `(["']?${escapeRegex(lastKey)}["']?\\s*:\\s*)(["']?[^,\\n}]*["']?)`,
        "g"
    );
    const replacement =
        typeof value === "string"
            ? `"${value}"`
            : JSON.stringify(value);
    return src.replace(pattern, `$1${replacement}`);
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
    const tmp = join(tmpdir(), `pallas-token-${randomBytes(6).toString("hex")}.tmp`);
    await writeFile(tmp, content, "utf8");
    await rename(tmp, filePath);
}
