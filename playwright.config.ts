import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load credentials / connection info from the git-ignored .env file.
dotenv.config({ path: path.resolve(__dirname, ".env") });

const HASS_URL = process.env.HASS_URL || "http://localhost:8123/";

// Persisted authentication state (localStorage hassTokens) produced by the
// `setup` project so the actual tests start already logged in.
export const STORAGE_STATE = path.resolve(__dirname, "tests/.auth/state.json");

// The `docs` project (manual screenshots, `npm run docs:screenshots`) exists only
// when asked for by name, so a plain `playwright test` (`npm test`) never runs it.
// The flag goes into the environment so worker processes see the same projects.
if (process.argv.includes("--project=docs")) process.env.SHP_DOCS_SCREENSHOTS = "1";
const DOCS_PROJECT_ENABLED = process.env.SHP_DOCS_SCREENSHOTS === "1";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [["html", { open: "never" }], ["list"]],
    timeout: 60_000,
    expect: { timeout: 15_000 },

    // A docs run keeps failure artifacts off in every project (setup included):
    // they would capture the whole page of the real Home Assistant.
    use: {
        baseURL: HASS_URL,
        trace: DOCS_PROJECT_ENABLED ? "off" : "retain-on-failure",
        screenshot: DOCS_PROJECT_ENABLED ? "off" : "only-on-failure",
        video: DOCS_PROJECT_ENABLED ? "off" : "retain-on-failure",
    },

    projects: [
        // 1. Logs in and provisions the dedicated test dashboard. Runs first.
        {
            name: "setup",
            testMatch: /setup\/.*\.setup\.ts/,
        },
        // 2. The actual tests, reusing the saved auth state.
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                storageState: STORAGE_STATE,
            },
            dependencies: ["setup"],
        },
        // 3. Regenerates the manual's screenshots (scripts/docs-screenshots.spec.ts).
        ...(DOCS_PROJECT_ENABLED ? [{
            name: "docs",
            testDir: "./scripts",
            testMatch: /docs-screenshots\.spec\.ts/,
            timeout: 120_000,
            use: {
                ...devices["Desktop Chrome"],
                storageState: STORAGE_STATE,
                colorScheme: "dark" as const,
            },
            dependencies: ["setup"],
        }] : []),
    ],
});
