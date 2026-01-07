import type { HomeAssistant } from "../../hass-frontend/src/types";
export interface AlarmoAreaEntity {
    entity_id: string;
    area_id: string;
}
export interface AlarmoSensor {
    area: string;
    enabled: boolean;
    entity_id: string;
    modes: string[];
    type: string
}

export interface AlarmoSensorState {
    area_entity: string
    armed: boolean
    triggered: boolean
}
type AlarmoSensors = Record<string, AlarmoSensor>;

export interface AlarmoSensorAndArea {
    areaEntity: AlarmoAreaEntity;
    sensor: AlarmoSensor;
}

export async function getAlarmoAreaEntitiesAndSensors(hass: HomeAssistant) {

    const [area_entities, sensors] = await Promise.all([
        hass.callWS({ type: "alarmo/entities" }) as Promise<AlarmoAreaEntity[]>,
        hass.callWS({ type: "alarmo/sensors" }) as Promise<AlarmoSensors>]
    );
    return { area_entities, sensors };
}


export async function getAlarmoSensorToAlarmoEntityMapping(entities: AlarmoAreaEntity[], sensors: AlarmoSensors) {
    const mapping = new Map<string, AlarmoSensorAndArea>();
    for (const sensorId in sensors) {
        const sensor = sensors[sensorId];
        const areaEntity = entities.find(e => e.area_id === sensor.area);
        if (areaEntity) {
            mapping.set(sensor.entity_id, { areaEntity, sensor });
        }
    }
    return mapping;
}

let sensorsToAreas: Map<string, AlarmoSensorAndArea> | undefined = undefined;

export async function alarmoSensorsToAreas(hass: HomeAssistant) {
    if (!sensorsToAreas) {
        const { area_entities, sensors } = await getAlarmoAreaEntitiesAndSensors(hass);
        sensorsToAreas = await getAlarmoSensorToAlarmoEntityMapping(area_entities, sensors);
    }
    return sensorsToAreas;
}

export async function getAlarmoSensorAndArea(hass: HomeAssistant, entity_id: string) {
    const sensors = await alarmoSensorsToAreas(hass);
    const sensor = sensors.get(entity_id)
    return sensor
}

export function getAlarmoSensorState(hass?: HomeAssistant, sensor?: AlarmoSensorAndArea): AlarmoSensorState | undefined {
    if (!hass || !sensor)
        return undefined;

    const state: AlarmoSensorState = {
        area_entity: sensor.areaEntity.entity_id,
        armed: false,
        triggered: false
    }

    const areaState = hass.states[sensor.areaEntity.entity_id].state as string;
    if (areaState === "disarmed")
        return state;

    if (areaState === "triggered") {
        state.triggered = true;
        state.armed = true;
        return state;
    }

    state.armed = sensor.sensor.modes.includes(areaState);
    return state
}