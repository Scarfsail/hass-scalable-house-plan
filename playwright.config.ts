import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load credentials / connection info from the git-ignored .env file.
dotenv.config({ path: path.resolve(__dirname, ".env") });

const HASS_URL = process.env.HASS_URL || "http://localhost:8123/";

// Persisted authentication state (localStorage hassTokens) produced by the
// `setup` project so the actual tests start already logged in.
export const STORAGE_STATE = path.resolve(__dirname, "tests/.auth/state.json");

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [["html", { open: "never" }], ["list"]],
    timeout: 60_000,
    expect: { timeout: 15_000 },

    use: {
        baseURL: HASS_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
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
    ],
});
