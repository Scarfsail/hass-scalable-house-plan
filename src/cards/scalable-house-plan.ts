import { LitElement, html } from "lit-element"
import { CreateCardElement, getCreateCardElement } from "../utils"
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { Lovelace, LovelaceCard, LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";
import { LayerStateManager } from "../utils/layer-state-storage";

export interface Layer {
    id: string;
    name: string;
    icon: string;
    visible: boolean;
    showInToggles: boolean;
}

export interface Room {
    name: string;
    boundary: [number, number][];
    elements: PictureElement[];
}

export interface ScalableHousePlanConfig extends LovelaceCardConfig {
    rooms: Room[];
    layers?: Layer[];
    image: string;
    style?: any
    image_width: number;
    image_height: number;
    max_scale?: number;
    min_scale?: number;
    card_size?: number;
    layers_visibility_persistence_id?: string;
}

interface PictureElement {
    type: string;
    style: any;
    entity?: string;
    tap_action?: any;
    layer_id?: string;
    show_in_overview?: boolean;
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
}


@customElement("scalable-house-plan")
export class ScalableHousePlan extends LitElement implements LovelaceCard {
    private resizeObserver: ResizeObserver;

    private config?: ScalableHousePlanConfig;
    private layerStateManager?: LayerStateManager;

    //@property({ attribute: false }) public hass?: HomeAssistant;
    @state() private _createCardElement: CreateCardElement = null;
    @state() private _layerVisibility: Map<string, boolean> = new Map();

    @property({ attribute: false }) hass?: HomeAssistant;

    getCardSize() {
        return this.config?.card_size ?? 1;
    }


    constructor() {
        super();
        this.resizeObserver = new ResizeObserver(this.onResize.bind(this));
    }

    async setConfig(config: ScalableHousePlanConfig) {
        this.config = {
            ...config,
            layers: config.layers || [],
            rooms: config.rooms || [],
        };
        this._createCardElement = await getCreateCardElement();
        
        // Initialize layer state manager with persistence ID
        const persistenceId = LayerStateManager.generatePersistenceId(config);
        this.layerStateManager = new LayerStateManager(persistenceId);
        
        // Initialize layer visibility state with persistence
        this._initializeLayerVisibility();
    }

    private _initializeLayerVisibility() {
        this._layerVisibility.clear();
        
        // Load persisted layer state from localStorage
        const persistedState = this.layerStateManager?.loadLayerState() || {};
        
        this.config?.layers?.forEach((layer) => {
            // Use persisted state if available, otherwise fall back to layer config default
            const visibility = persistedState.hasOwnProperty(layer.id) 
                ? persistedState[layer.id] 
                : LayerStateManager.getDefaultVisibility(layer);
            
            this._layerVisibility.set(layer.id, visibility);
            
            // Set CSS variable immediately for proper initial display
            this.style.setProperty(`--layer-${layer.id}-display`, visibility ? 'block' : 'none');
        });
    }

    public getLayoutOptions() {
        const rows = this.config?.image_height ? (Math.ceil((this.config?.image_height - 8) / 56)) : 1
        return {
            grid_rows: rows,
            grid_columns: 4,
            grid_min_rows: rows,
        };
    }

    private card?: LovelaceCard;

    private previousViewport = { width: 0, height: 0 };
    render() {

        if (!this.config) {
            return "Config is not defined";
        }
        const clientRect = this.getBoundingClientRect();
        //console.log("RenderY", clientRect);
        const contentHeight = this.config.image_height;
        const contentWidth = this.config.image_width;

        const fitIntoHeight = clientRect.height;
        const fitIntoWidth = clientRect.width;

        // Get the dimensions of the viewport (the visible area)
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        let visibleHeight = 0;
        let visibleWidth = 0;


        if (this.previousViewport.width != viewportWidth || this.previousViewport.height != viewportHeight) {
            this.previousViewport.width = viewportWidth;
            this.previousViewport.height = viewportHeight;
            this.requestUpdate();
            console.log("Viewport changed");
        } else {
            // Calculate the visible height and width
            visibleHeight = Math.max(0, Math.min(viewportHeight, clientRect.bottom) - Math.max(0, clientRect.top));
            visibleWidth = Math.max(0, Math.min(viewportWidth, clientRect.right) - Math.max(0, clientRect.left));
        }
        //console.log('X rect.width, visible.width ; rect.height, visible.height:', clientRect.width, visibleWidth, clientRect.height, visibleHeight);
        const scale = this.getScale(fitIntoHeight, fitIntoWidth, contentWidth, contentHeight)
        if (this.config.max_scale) {
            scale.scaleX = Math.min(scale.scaleX, this.config.max_scale);
            scale.scaleY = Math.min(scale.scaleY, this.config.max_scale);
        }
        if (this.config.min_scale) {
            scale.scaleX = Math.max(scale.scaleX, this.config.min_scale);
            scale.scaleY = Math.max(scale.scaleY, this.config.min_scale);
        }
        this.style.setProperty("position", "relative");

        // Set CSS variables for layer visibility
        this.config?.layers?.forEach((layer) => {
            const isVisible = this._layerVisibility.get(layer.id) ?? true;
            this.style.setProperty(`--layer-${layer.id}-display`, isVisible ? 'block' : 'none');
        });

        this.card = this.card || this.createPictureCardElement(this.config);

        if (this.card) {
            this.card.hass = this.hass;
        }

        if (visibleHeight == 0)
            return html`
                ${this.card}
            `

        return html`
            <div style="overflow:none; width:${visibleWidth}px; height:${visibleHeight}px">
                <div style="transform: scale(${scale.scaleX}, ${scale.scaleY}); transform-origin: 0px 0px; width:${contentWidth}px; height:${contentHeight}px;">
                    ${this.card}
                </div>
            </div>
        `
        /*


        return html`
            <div style="overflow:none; width:${fitIntoWidth}px; height:${fitIntoHeight}px">
                <div style="transform: scale(${scale.scaleX}, ${scale.scaleY}); transform-origin: 0px 0px; width:${contentWidth}px; height:${contentHeight}px;">                    
                ${this.lovelace?.editMode
                ? html`<hui-card-options .hass=${this.hass} .lovelace=${this.lovelace} .path=${[this.index!, 0] as any} .card=${this.cards[0]}>
                        ${this.cards[0]}
                    </hui-card-options>`
                : html`<div>${this.cards[0]}</div>`
            }
                </div>
            </div>
            `
  */  }
    createPictureCardElement(config: ScalableHousePlanConfig) {
        // Flatten all rooms into a single elements array
        const allElements = (config.rooms || []).reduce((acc: PictureElement[], room: Room) => {
            return acc.concat(room.elements || []);
        }, []);

        // Process elements and add CSS variables for layer visibility
        const processedElements = allElements.map((el: PictureElement) => {
            const style = {...el.style};
            style.transform = "none";
            if (el.left!==undefined)
                style.left = typeof el.left === "string" ? el.left : `${el.left}px`;
            if (el.top!==undefined)
                style.top = typeof el.top === "string" ? el.top : `${el.top}px`;
            if (el.right!==undefined)
                style.right = typeof el.right === "string" ? el.right : `${el.right}px`;
            if (el.bottom!==undefined)
                style.bottom = typeof el.bottom === "string" ? el.bottom : `${el.bottom}px`;
            if (el.height!==undefined)
                style.height = typeof el.height === "string" ? el.height : `${el.height}px`;
            if (el.width!==undefined)
                style.width = typeof el.width === "string" ? el.width : `${el.width}px`;    
            
            // Add layer visibility CSS variable if element has layer_id
            if (el.layer_id) {
                style.display = `var(--layer-${el.layer_id}-display, block)`;
            }
            // Elements without layer_id remain always visible
            
            // If this is a layers element, pass the layers configuration
            if (el.type === "custom:scalable-house-plan-layers") {
                return {
                    ...el, 
                    style: style,
                    layers: config.layers || [],
                    _layerVisibility: this._layerVisibility
                };
            }
            
            return {...el, style: style}
        });

        const cardConfig = {
            type: "picture-elements",
            image: config.image,
            elements: processedElements,
            style: config.style
        };

        return this._createCardElement?.(cardConfig);
    }
    connectedCallback() {
        super.connectedCallback();
        const element = document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot?.querySelector("partial-panel-resolver")?.querySelector("ha-panel-lovelace")?.shadowRoot?.querySelector("hui-root")?.shadowRoot?.querySelector("div");
        if (element)
            this.resizeObserver.observe(element);

        // Listen for layer visibility change events
        this.addEventListener('layer-visibility-changed', this._handleLayerVisibilityChange as EventListener);
    }

    disconnectedCallback() {
        this.resizeObserver.disconnect();
        super.disconnectedCallback();

        // Remove layer visibility change event listener
        this.removeEventListener('layer-visibility-changed', this._handleLayerVisibilityChange as EventListener);
    }

    private _handleLayerVisibilityChange(event: Event) {
        const customEvent = event as CustomEvent;
        const { layerId, visible } = customEvent.detail;
        this.toggleLayerVisibility(layerId, visible);
    }

    public toggleLayerVisibility(layerId: string, visible?: boolean) {
        const currentVisibility = this._layerVisibility.get(layerId) ?? true;
        const newVisibility = visible !== undefined ? visible : !currentVisibility;
        
        this._layerVisibility.set(layerId, newVisibility);
        
        // Persist the change to localStorage
        this.layerStateManager?.updateLayerVisibility(layerId, newVisibility);
        
        // Update CSS variable immediately for smooth visibility toggle
        this.style.setProperty(`--layer-${layerId}-display`, newVisibility ? 'block' : 'none');
        
        // Dispatch event to notify other components
        const event = new CustomEvent('layer-visibility-updated', {
            detail: { layerId, visible: newVisibility },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    public getLayerVisibility(layerId: string): boolean {
        return this._layerVisibility.get(layerId) ?? true;
    }

    /**
     * Clear persisted layer state and reset to defaults
     * Useful for debugging or reset functionality
     */
    public resetLayerState() {
        this.layerStateManager?.clearLayerState();
        this._initializeLayerVisibility();
        this.requestUpdate();
    }

    onResize() {
        this.requestUpdate();
    }

    getScale(fitIntoHeight: number, fitIntoWidth: number, contentWidth: number, contentHeight: number) {
        let scaleW = fitIntoWidth / contentWidth;
        let scaleH = fitIntoHeight / contentHeight;
        /*
        if (scaleW < scaleH) //Max ratio between sides is 45:55 -  the shorter side will be bigger than the screen to match the ratio 45:55
            scaleW = Math.max(scaleH * 0.40, scaleW);
        else
            scaleH = Math.max(scaleW * 0.40, scaleH);
        */
        // console.log(`Fit into W:${fitIntoWidth}, H:${fitIntoHeight}  ;  Content W:${contentWidth}, H: ${contentHeight}  ;  Scale W: ${scaleW}, H:${scaleH}`)
        return { scaleX: scaleW, scaleY: scaleH }
    }

    public static async getConfigElement(): Promise<LovelaceCardEditor> {
        await import("./scalable-house-plan-editor");
        return document.createElement("scalable-house-plan-editor") as LovelaceCardEditor;
    }

    public static getStubConfig(): ScalableHousePlanConfig {
        return {
            type: "custom:scalable-house-plan",
            image: "/local/path/to/image.png",
            image_width: 1360,
            image_height: 849,
            layers: [
                {
                    id: "default",
                    name: "Default Layer",
                    icon: "mdi:layers",
                    visible: true,
                    showInToggles: true
                }
            ],
            rooms: [
                {
                    name: "Living Room",
                    boundary: [
                        [100, 100],
                        [400, 100],
                        [400, 300],
                        [100, 300]
                    ],
                    elements: []
                }
            ]
        };
    }
}

// Register card in window.customCards for Home Assistant
declare global {
    interface Window {
        customCards: Array<{
            type: string;
            name: string;
            description: string;
        }>;
    }
}

window.customCards = window.customCards || [];
window.customCards.push({
    type: "scalable-house-plan",
    name: "Scalable House Plan",
    description: "A scalable house plan card with room-based organization"
});
