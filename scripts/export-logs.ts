/*
Working log export using the REST API with Basic auth and hard-coded defaults.
- Auth: FORGE_API_EMAIL and FORGE_API_TOKEN env vars (Basic auth)
- Environment: production (hard-coded)
- Time window: configurable minutes (default 15, max 60)
- App id: read from manifest.yml (ari:...:app/<uuid>)
- Optional site filters: set in SITE_IDS array below
- Output: writes all pages to ./logs-export.jsonl (one JSON object per line)
*/

import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Hard-coded config
const ENVIRONMENTS = {
  production: "f10b2a25-7c74-4df5-8717-05841514369a",
  staging: "d325df3a-9f3c-4dab-84f4-b981f1b90d14",
  development: "3b20b74f-8cb6-4b8e-8c9e-8bf11cc3d5a0",
};
const ENVIRONMENT_ID = ENVIRONMENTS["production"];
// Time window in minutes (capped between 1 and 60)
const TIME_WINDOW_MINUTES = 15; // default: last 15 minutes
const OUTPUT_PATH = "./logs-export.json";
const MESSAGE_FILTER: string | undefined = undefined; // e.g., 'example_search_text'
const LEVELS: string[] = ["INFO"]; // duplicate level params supported by API
const SITE_IDS: string[] = [
  // e.g., 'ari:cloud:confluence::site/089a1455-4ea0-122a-b70c-5b17360f047d',
  //       'ari:cloud:jira::site/4eecb4e0-22cc-4e18-bad1-b58a154be343',
];

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

async function fetchAllPages(
  appId: string,
  start: Date,
  end: Date,
  authHeader: string,
  outFile: string,
) {
  const out = createWriteStream(resolve(outFile));
  let cursor: string | undefined;
  let page = 0;
  try {
    do {
      const url = buildUrl(appId, start, end, cursor);
      console.debug(`url: ${url}`);
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
      page++;
      console.log(`Fetched page ${page}${data.cursor ? " (more...)" : ""}`);
      out.write(JSON.stringify(data) + "\n");
      cursor = data.cursor as string | undefined;
    } while (cursor);
  } finally {
    out.end();
  }
  console.log(`Wrote logs to ${resolve(outFile)}`);
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

  await fetchAllPages(appId, startDate, endDate, authHeader, OUTPUT_PATH);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
