import { STATE_RUNNING } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../hass-frontend/src/types";

const RELOAD_DELAY_MS = 10_000;

// Shared by all cards: one watcher per page, at most one pending reload
let latest: { hass: HomeAssistant; isSuppressed: () => boolean } | undefined;
let armed = false;
let logged = false;
let reloadTimer: number | undefined;

const isUp = (hass: HomeAssistant) => hass.connected && hass.config.state === STATE_RUNNING;

/**
 * Reloads the page once HA is running again after a restart, so stale caches
 * (ours and third-party cards') start fresh. The restart signal is seeing a
 * non-RUNNING config state: after reconnecting, HA's frontend refetches
 * get_config, which reports NOT_RUNNING/STARTING during startup. Plain
 * disconnects (screen sleep, Wi-Fi blips) and a normal page load never reload.
 * A restart where no non-RUNNING state reaches the client is missed.
 */
export function watchHassRestart(hass: HomeAssistant, isSuppressed: () => boolean): void {
    latest = { hass, isSuppressed };
    if (!isUp(hass)) {
        window.clearTimeout(reloadTimer);
        reloadTimer = undefined;
        if (hass.config.state !== STATE_RUNNING) armed = true;
        return;
    }
    if (!armed || reloadTimer !== undefined) return;

    if (!logged) {
        logged = true;
        console.info(`scalable-house-plan: Home Assistant restarted, reloading page in ${RELOAD_DELAY_MS / 1000} s`);
    }
    reloadTimer = window.setTimeout(() => {
        reloadTimer = undefined;
        // Stay armed: the next hass push retries
        if (!latest || !isUp(latest.hass) || latest.isSuppressed()) return;
        window.location.reload();
    }, RELOAD_DELAY_MS);
}
