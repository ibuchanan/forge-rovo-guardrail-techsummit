/*
Working log export using the REST API with Basic auth and hard-coded defaults.
- Auth: FORGE_API_EMAIL and FORGE_API_TOKEN env vars (Basic auth)
- Environment: production (hard-coded)
- Time window: configurable minutes (default 15, max 60)
- App id: read from manifest.yml (ari:...:app/<uuid>)
- Optional site filters: set in SITE_IDS array below
- Output: writes all pages to ./export.log (one JSON object per line)
*/

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Hard-coded config
const ENVIRONMENTS = {
  production: "f10b2a25-7c74-4df5-8717-05841514369a",
  staging: "d325df3a-9f3c-4dab-84f4-b981f1b90d14",
  development: "3b20b74f-8cb6-4b8e-8c9e-8bf11cc3d5a0",
};
const ENVIRONMENT_ID = ENVIRONMENTS["production"];
// Time window in minutes (capped between 1 and 60)
const TIME_WINDOW_MINUTES = 60; // default: last 15 minutes
const OUTPUT_PATH = "./export.log";
const MESSAGE_FILTER: string | undefined = undefined; // e.g., 'example_search_text'
const LEVELS: string[] = ["INFO", "ERROR"];
const SITE_IDS: string[] = [];

// Regex to match: "[Liam Estrada](lestrada@oneatlassian.atlassian.com): 21"
// Captures: 1=Name, 2=Email, 3=Value
const LOG_PATTERN = /^\[([^\]]+)\]\(([^)]+)\):\s*(\d+)$/;

function loadDotEnvIfPresent() {
  // Simple .env loader to avoid extra dependencies
  const path = ".env";
  if (!existsSync(path)) return;
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    // best-effort; ignore errors
  }
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Please export it, e.g. \`export ${name}=...\``,
    );
  }
  return v;
}

function readAppUuidFromManifest(): string {
  const yaml = readFileSync("manifest.yml", "utf8");
  const idMatch = yaml.match(/^\s*id:\s*ari:[^\n]*app\/([0-9a-fA-F-]{36})/m);
  if (!idMatch) {
    throw new Error(
      "Unable to read app UUID from manifest.yml (id: ari:...:app/<uuid>)",
    );
  }
  return idMatch[1];
}

function buildUrl(
  appId: string,
  start: Date,
  end: Date,
  cursor?: string,
): string {
  const base = new URL(`https://api.atlassian.com/v1/app/logs/${appId}`);
  base.searchParams.set("environmentId", ENVIRONMENT_ID);
  base.searchParams.set("startDate", start.toISOString());
  base.searchParams.set("endDate", end.toISOString());
  LEVELS.forEach((lvl) => base.searchParams.append("level", lvl));
  if (MESSAGE_FILTER) base.searchParams.set("message", MESSAGE_FILTER);
  SITE_IDS.forEach((site) =>
    base.searchParams.append("installationContext", site),
  );
  if (cursor) base.searchParams.set("cursor", cursor);
  return base.toString();
}

async function fetchAndProcessLogs(
  appId: string,
  start: Date,
  end: Date,
  authHeader: string,
) {
  let cursor: string | undefined;
  const scores: Record<string, number> = {};

  console.log("Fetching logs...");
  try {
    do {
      const url = buildUrl(appId, start, end, cursor);
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }

      const data = await res.json();
      const logs = (data.appLogs as any[]) || [];

      for (const log of logs) {
        const msg = log?.body?.stringValue;
        if (typeof msg === "string") {
          const match = msg.match(LOG_PATTERN);
          if (match) {
            // match[1] = Name, match[2] = Email, match[3] = Value
            const key = `[${match[1]}](${match[2]})`;
            const val = parseInt(match[3], 10);
            if (!(key in scores)) {
              scores[key] = val;
            }
          }
        }
      }
      cursor = data.cursor as string | undefined;
      if (cursor) process.stdout.write(".");
    } while (cursor);
  } catch (err) {
    console.error("\nError fetching logs:", err);
  }
  console.log("\nDone fetching.");

  // Sort descending by value
  const sortedEntries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const sortedObj: Record<string, number> = Object.fromEntries(sortedEntries);

  // Write to file
  writeFileSync(OUTPUT_PATH, JSON.stringify(sortedObj, null, 2));
  console.log(`\nSummary written to ${OUTPUT_PATH}`);

  // Print top 10
  console.log("\nTop 10:");
  sortedEntries.slice(0, 10).forEach(([key, val], idx) => {
    console.log(`${idx + 1}. ${key}: ${val}`);
  });
}

async function main() {
  // Load .env before reading env vars
  loadDotEnvIfPresent();

  const email = requiredEnv("FORGE_API_EMAIL");
  const token = requiredEnv("FORGE_API_TOKEN");
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  const appId = readAppUuidFromManifest();

  const now = new Date();
  const endDate = new Date(now.getTime());
  // Clamp minutes to [1, 60]
  const minutes = Math.max(1, Math.min(60, TIME_WINDOW_MINUTES));
  const startDate = new Date(now.getTime() - minutes * 60 * 1000);

  await fetchAndProcessLogs(appId, startDate, endDate, authHeader);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
