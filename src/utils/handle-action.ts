import type { ActionConfig } from "../elements/base/element-base";
import type { HomeAssistant } from "../../hass-frontend/src/types";

export interface ActionableConfig {
    entity?: string;
    tap_action?: ActionConfig;
}

export const handleAction = (
    node: HTMLElement,
    hass: HomeAssistant,
    config: ActionableConfig,
    action: string
): void => {
    // Custom elements only use tap action
    // Wrapped HA elements handle their own tap/hold/double_tap actions
    const actionConfig = config.tap_action || { action: "more-info" };

    switch (actionConfig.action) {
        case "more-info": {
            const entityId = config.entity;
            if (entityId) {
                const event = new CustomEvent("hass-more-info", {
                    detail: { entityId },
                    bubbles: true,
                    composed: true,
                });
                node.dispatchEvent(event);
            }
            break;
        }
        case "navigate": {
            if (actionConfig.navigation_path) {
                window.history.pushState(null, "", actionConfig.navigation_path);
                const event = new CustomEvent("location-changed", {
                    detail: { replace: false },
                    bubbles: true,
                    composed: true,
                });
                window.dispatchEvent(event);
            }
            break;
        }
        case "url": {
            if (actionConfig.url_path) {
                window.open(actionConfig.url_path);
            }
            break;
        }
        case "toggle": {
            if (config.entity) {
                hass.callService("homeassistant", "toggle", {
                    entity_id: config.entity,
                });
            }
            break;
        }
        case "call-service":
        case "perform-action": {
            if (actionConfig.perform_action || actionConfig.service) {
                const [domain, service] = (actionConfig.perform_action || actionConfig.service)!.split(".", 2);
                hass.callService(domain, service, actionConfig.data, actionConfig.target);
            }
            break;
        }
        case "none":
            // Do nothing
            break;
    }
};
