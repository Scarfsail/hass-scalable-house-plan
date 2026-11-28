import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../hass-frontend/src/types";

export type CoverAction = "open" | "close" | "stop";

/** The cover buttons to offer in the cover's current state, or undefined for an unknown state */
export function getCoverActions(entity: HassEntity): CoverAction[] | undefined {
    let state = entity.state;

    if (state == "open" && entity.attributes.current_position != 100) {
        state = "opened_partially";
    }

    switch (state) {
        case "open": return ["close"];
        case "closed": return ["open"];
        case "opening": return ["stop", "close"];
        case "closing": return ["stop", "open"];
        case "opened_partially": return ["open", "close"];
        default: return undefined;
    }
}

export function getCoverActionColor(action: CoverAction) {
    switch (action) {
        case "open": return "var(--success-color)"
        case "stop": return "var(--warning-color)"
        case "close": return "var(--primary-color)"
    }
}

export function performCoverAction(hass: HomeAssistant, action: CoverAction, entity_id: string) {
    hass.callService('cover', `${action}_cover`, { entity_id });
}
