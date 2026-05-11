import type { HassEntity } from "home-assistant-js-websocket";
import { HomeAssistant } from "../../hass-frontend/src/types";
import { html } from "lit";

const jsTemplateRegex = new RegExp('\\[\\[\\[([^]*)\\]\\]\\]', 'gm');

const compiledCache = new Map<string, Function>();
const MAX_COMPILED_CACHE = 200;

export function evalJsTemplate(thisArg: any, hass: HomeAssistant, entity: HassEntity | undefined, jsTemplate: any): any {
    const regMatches = jsTemplateRegex.exec(jsTemplate)
    jsTemplateRegex.lastIndex = 0;
    if (!regMatches || regMatches.length < 2)
        return jsTemplate;

    const func = regMatches[1];
    let compiled = compiledCache.get(func);
    if (!compiled) {
        if (compiledCache.size >= MAX_COMPILED_CACHE) compiledCache.clear();
        try {
            compiled = new Function('states', 'entity', 'user', 'hass', 'html',
                `'use strict'; ${func}`);
        } catch (err) {
            console.error(`Error compiling template (${func}):`, err);
            return "Error compiling template.";
        }
        compiledCache.set(func, compiled);
    }

    try {
        return compiled.call(thisArg, hass.states, entity, hass.user, hass, html);
    } catch (err) {
        console.error(`Error evaluating template (${func}):`, err);
        return "Error evaluating template.";
    }
}