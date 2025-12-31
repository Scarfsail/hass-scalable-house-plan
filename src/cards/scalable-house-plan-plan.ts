import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import type { Room, ScalableHousePlanConfig, EntityConfig } from "./scalable-house-plan";
import { CreateCardElement, getElementTypeForEntity, mergeElementProperties } from "../utils";
import { LayerStateManager } from "../utils/layer-state-storage";

interface PictureElement {
    type: string;
    style: any;
    entity?: string;
    tap_action?: any;
    layer_id?: string;
    left?: string | number;
    right?: string | number;
    top?: string | number;
    bottom?: string | number;
    width?: string | number;
    height?: string | number;
    [key: string]: any;
}

/**
 * Plan view component
 * Displays the house plan with rooms overlay and positioned elements
 */
@customElement("scalable-house-plan-plan")
export class ScalableHousePlanPlan extends LitElement {
    @property({ attribute: false }) public hass?: HomeAssistant;
    @property({ attribute: false }) public config?: ScalableHousePlanConfig;
    @property({ attribute: false }) public createCardElement?: CreateCardElement;
    @property({ attribute: false }) public onRoomClick?: (room: Room, index: number) => void;

    @state() private _layerVisibility: Map<string, boolean> = new Map();
    private layerStateManager?: LayerStateManager;
    private card?: LovelaceCard;
    private previousViewport = { width: 0, height: 0 };

    static get styles() {
        return css`
            :host {
                display: block;
                position: relative;
            }
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        this._initializeLayerState();
    }

    updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        
        // Reinitialize layer state if config changes
        if (changedProperties.has('config') && this.config) {
            this._initializeLayerState();
        }
    }

    private _initializeLayerState() {
        if (!this.config) return;

        // Initialize layer state manager with persistence ID
        const persistenceId = LayerStateManager.generatePersistenceId(this.config);
        this.layerStateManager = new LayerStateManager(persistenceId);
        
        // Initialize layer visibility state with persistence
        this._layerVisibility.clear();
        
        // Load persisted layer state from localStorage
        const persistedState = this.layerStateManager.loadLayerState() || {};
        
        this.config.layers?.forEach((layer) => {
            // Use persisted state if available, otherwise fall back to layer config default
            const visibility = persistedState.hasOwnProperty(layer.id) 
                ? persistedState[layer.id] 
                : LayerStateManager.getDefaultVisibility(layer);
            
            this._layerVisibility.set(layer.id, visibility);
            
            // Set CSS variable immediately for proper initial display
            this.style.setProperty(`--layer-${layer.id}-display`, visibility ? 'block' : 'none');
        });
    }

    public toggleLayerVisibility(layerId: string, visible?: boolean) {
        const currentVisibility = this._layerVisibility.get(layerId) ?? true;
        const newVisibility = visible !== undefined ? visible : !currentVisibility;
        
        this._layerVisibility.set(layerId, newVisibility);
        
        // Persist the change to localStorage
        this.layerStateManager?.updateLayerVisibility(layerId, newVisibility);
        
        // Update CSS variable immediately for smooth visibility toggle
        this.style.setProperty(`--layer-${layerId}-display`, newVisibility ? 'block' : 'none');
        
        // Request update to re-render with new layer visibility
        this.requestUpdate();
    }

    public getLayerVisibility(layerId: string): boolean {
        return this._layerVisibility.get(layerId) ?? true;
    }

    render() {
        if (!this.config) {
            return html`<div>Config is not defined</div>`;
        }

        const clientRect = this.getBoundingClientRect();
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

        const scale = this.getScale(fitIntoHeight, fitIntoWidth, contentWidth, contentHeight);
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

        if (visibleHeight == 0) {
            return html`${this.card}`;
        }

        const roomsOverlay = this._renderRooms();

        return html`
            <div style="overflow:none; width:${visibleWidth}px; height:${visibleHeight}px">
                <div style="transform: scale(${scale.scaleX}, ${scale.scaleY}); transform-origin: 0px 0px; width:${contentWidth}px; height:${contentHeight}px; position: relative;">
                    ${this.card}
                    ${roomsOverlay}
                </div>
            </div>
        `;
    }

    private createPictureCardElement(config: ScalableHousePlanConfig) {
        // Flatten all rooms into a single elements array with coordinate transformation
        const allElements = (config.rooms || []).reduce((acc: PictureElement[], room: Room) => {
            // Calculate room's bounding box (top-left corner)
            const roomOffset = this._getRoomOffset(room);
            
            // Transform each entity into picture elements
            const transformedElements = (room.entities || [])
                .filter((entityConfig: EntityConfig) => {
                    // String shorthand = detail-only, no plan
                    if (typeof entityConfig === 'string') return false;
                    
                    // Only include entities with plan section and show !== false
                    return entityConfig.plan && (entityConfig.plan.show !== false);
                })
                .map((entityConfig: EntityConfig) => {
                    const entity = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
                    const plan = typeof entityConfig === 'string' ? undefined : entityConfig.plan;
                    
                    if (!plan) return null;
                    
                    // Get default element definition for this entity
                    const deviceClass = this.hass?.states[entity]?.attributes?.device_class;
                    const defaultElement = getElementTypeForEntity(entity, deviceClass, 'plan');
                    
                    // Merge default properties with user overrides
                    const elementConfig = mergeElementProperties(defaultElement, plan.element);
                    
                    // Create picture element with entity and merged config
                    return this._transformEntityToPictureElement(entity, plan, elementConfig, roomOffset);
                })
                .filter((el): el is PictureElement => el !== null);
            
            return acc.concat(transformedElements);
        }, []);

        // Process elements and add CSS variables for layer visibility
        const processedElements = allElements.map((el: PictureElement) => {
            const style = {...el.style};
            style.transform = "none";
            if (el.left !== undefined)
                style.left = typeof el.left === "string" ? el.left : `${el.left}px`;
            if (el.top !== undefined)
                style.top = typeof el.top === "string" ? el.top : `${el.top}px`;
            if (el.right !== undefined)
                style.right = typeof el.right === "string" ? el.right : `${el.right}px`;
            if (el.bottom !== undefined)
                style.bottom = typeof el.bottom === "string" ? el.bottom : `${el.bottom}px`;
            if (el.height !== undefined)
                style.height = typeof el.height === "string" ? el.height : `${el.height}px`;
            if (el.width !== undefined)
                style.width = typeof el.width === "string" ? el.width : `${el.width}px`;    
            
            // Add layer visibility CSS variable if element has layer_id
            if (el.layer_id) {
                style.display = `var(--layer-${el.layer_id}-display, block)`;
            }
            
            // If this is a layers element, pass the layers configuration
            if (el.type === "custom:scalable-house-plan-layers") {
                return {
                    ...el, 
                    style: style,
                    layers: config.layers || [],
                    _layerVisibility: this._layerVisibility
                };
            }
            
            return {...el, style: style};
        });

        const cardConfig = {
            type: "picture-elements",
            image: config.image,
            elements: processedElements,
            style: config.style
        };

        return this.createCardElement?.(cardConfig);
    }

    private _getRoomOffset(room: Room): { x: number; y: number } {
        if (!room.boundary || room.boundary.length === 0) {
            return { x: 0, y: 0 };
        }
        
        const xs = room.boundary.map(p => p[0]);
        const ys = room.boundary.map(p => p[1]);
        
        return {
            x: Math.min(...xs),
            y: Math.min(...ys)
        };
    }

    private _transformEntityToPictureElement(
        entityId: string, 
        plan: any, 
        elementConfig: any, 
        roomOffset: { x: number; y: number }
    ): PictureElement {
        // Create a flattened element combining plan and element config
        const flattened: PictureElement = {
            ...elementConfig,
            type: elementConfig.type!,
            entity: entityId,
            style: plan.style || {},
            layer_id: plan.layer_id
        };
        
        // Transform position coordinates from room-relative to absolute
        if (typeof plan.left === 'number') {
            flattened.left = plan.left + roomOffset.x;
        } else if (plan.left !== undefined) {
            flattened.left = plan.left;
        }
        
        if (typeof plan.right === 'number') {
            flattened.right = plan.right + roomOffset.x;
        } else if (plan.right !== undefined) {
            flattened.right = plan.right;
        }
        
        if (typeof plan.top === 'number') {
            flattened.top = plan.top + roomOffset.y;
        } else if (plan.top !== undefined) {
            flattened.top = plan.top;
        }
        
        if (typeof plan.bottom === 'number') {
            flattened.bottom = plan.bottom + roomOffset.y;
        } else if (plan.bottom !== undefined) {
            flattened.bottom = plan.bottom;
        }
        
        // Copy dimensions (no transformation needed)
        if (plan.width !== undefined) {
            flattened.width = plan.width;
        }
        if (plan.height !== undefined) {
            flattened.height = plan.height;
        }
        
        return flattened;
    }

    private _renderRooms() {
        if (!this.config?.rooms) return html``;

        const defaultColor = 'rgba(128, 128, 128, 0.2)';

        return svg`
            <svg style="position: absolute; top: 0; left: 0; width: ${this.config.image_width}px; height: ${this.config.image_height}px; z-index: 1;" viewBox="0 0 ${this.config.image_width} ${this.config.image_height}" preserveAspectRatio="none">
                ${this.config.rooms.map((room, index) => {
                    if (!room.boundary || room.boundary.length < 3) return svg``;
                    
                    const fillColor = room.color || defaultColor;
                    const strokeColor = fillColor.replace(/[\d.]+\)$/, '0.4)');
                    const points = room.boundary.map(p => `${p[0]},${p[1]}`).join(' ');
                    
                    return svg`
                        <polygon 
                            points="${points}" 
                            fill="${fillColor}" 
                            stroke="${strokeColor}"
                            stroke-width="2"
                            style="cursor: pointer; transition: fill 0.2s ease;"
                            @click=${(e: Event) => this._handleRoomClick(room, index, e)}
                            @mouseenter=${(e: Event) => this._handleRoomHover(room, index, e, true)}
                            @mouseleave=${(e: Event) => this._handleRoomHover(room, index, e, false)}
                        />
                    `;
                })}
            </svg>
        `;
    }

    private _handleRoomClick(room: Room, index: number, event: Event) {
        event.stopPropagation();
        console.log('Room clicked:', room.name, index);
        
        if (this.onRoomClick) {
            this.onRoomClick(room, index);
        }
    }

    private _handleRoomHover(room: Room, index: number, event: Event, isEntering: boolean) {
        const target = event.target as SVGPolygonElement;
        if (isEntering) {
            const currentFill = target.getAttribute('fill') || 'rgba(128, 128, 128, 0.2)';
            const hoverFill = currentFill.replace(/[\d.]+\)$/, '0.4)');
            target.setAttribute('fill', hoverFill);
        } else {
            const fillColor = room.color || 'rgba(128, 128, 128, 0.2)';
            target.setAttribute('fill', fillColor);
        }
    }

    private getScale(fitIntoHeight: number, fitIntoWidth: number, contentWidth: number, contentHeight: number) {
        let scaleW = fitIntoWidth / contentWidth;
        let scaleH = fitIntoHeight / contentHeight;
        return { scaleX: scaleW, scaleY: scaleH };
    }
}
