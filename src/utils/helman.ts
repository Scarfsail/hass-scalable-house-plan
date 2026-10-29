import type { HomeAssistant } from "../../hass-frontend/src/types";

/** Helman's public element that opens a device's detail for an entity (Scarfsail/hass-helman). */
export const HELMAN_ENTITY_DETAIL_TAG = "helman-entity-detail";

interface HelmanEntityDetailClass {
    entityIds(hass: HomeAssistant): Promise<ReadonlySet<string>>;
}

// Shared by all cards: read once per page load
let helmanEntityIds: Promise<ReadonlySet<string>> | undefined;

/** Entity ids that have a Helman device detail. Never resolves when Helman isn't loaded. */
export function loadHelmanEntityIds(hass: HomeAssistant): Promise<ReadonlySet<string>> {
    return helmanEntityIds ??= customElements.whenDefined(HELMAN_ENTITY_DETAIL_TAG)
        .then((ctor) => (ctor as unknown as HelmanEntityDetailClass).entityIds(hass))
        .catch(() => new Set<string>());
}
