import type { ElementMovedEventDetail } from "../components/element-renderer-shp";

/**
 * Configuration options for DragController
 */
export interface DragControllerOptions {
    roomIndex: number;
    entityId: string;
    scale: number;
    scaleRatio: number;
    roomBoundsWidth: number;
    roomBoundsHeight: number;
    parentGroupKey?: string;
    isGroupElement?: boolean;
    originalTransform: string;
}

/**
 * Drag threshold in pixels before drag is activated
 */
const DRAG_THRESHOLD = 5;

/**
 * Counter for unique controller instance IDs (for debugging)
 */
let controllerIdCounter = 0;

/**
 * DragController - Reusable drag-and-drop controller for scalable house plan elements
 * 
 * Manages drag state and event handling for a single draggable element, eliminating
 * code duplication between element-renderer-shp.ts and group-shp.ts.
 * 
 * Features:
 * - Threshold-based drag activation
 * - Parent scale compensation for accurate dragging in scaled containers
 * - Keyboard escape support
 * - Proper event capture and cleanup
 * - Memory leak prevention through detach()
 */
export class DragController {
    private wrapper: HTMLElement;
    private uniqueKey: string;
    private options: DragControllerOptions;
    private instanceId: number;
    
    private state: 'idle' | 'pending' | 'dragging' = 'idle';
    private startX: number = 0;
    private startY: number = 0;
    private pointerId: number | null = null;
    private originalTransform: string;
    private dragStartTransform: string = ''; // Captured at pointerdown, immutable during drag

    /**
     * Get current drag state
     * Used by cleanup logic to prevent removing controllers mid-drag
     */
    public getState(): 'idle' | 'pending' | 'dragging' {
        return this.state;
    }

    /**
     * Get current options for change detection
     * Used to avoid unnecessary updateOptions() calls
     */
    public getOptions(): DragControllerOptions {
        return this.options;
    }

    /**
     * Update controller options
     * CRITICAL: Call on every render to keep scale/roomBounds in sync
     * Note: Does NOT update originalTransform to prevent overwriting captured transform during drag
     */
    public updateOptions(options: DragControllerOptions): void {
        this.options = options;
        // Only update originalTransform when idle (not dragging)
        // This prevents losing the transform if renders happen during drag
        if (this.state === 'idle') {
            this.originalTransform = options.originalTransform;
        }
    }

    constructor(wrapper: HTMLElement, uniqueKey: string, options: DragControllerOptions) {
        this.wrapper = wrapper;
        this.uniqueKey = uniqueKey;
        this.options = options;
        this.originalTransform = options.originalTransform;
        this.instanceId = ++controllerIdCounter;
    }

    /**
     * Attach keydown listener for escape key handling
     * Call this once when controller is created
     */
    public attach(): void {
        document.addEventListener('keydown', this.handleKeyDown);
    }

    /**
     * Detach keydown listener
     * Critical for preventing memory leaks
     */
    public detach(): void {
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    /**
     * Handle pointer down event - start potential drag
     * Call this from template event binding: @pointerdown=${(e) => controller.handlePointerDown(e)}
     */
    public handlePointerDown = (e: PointerEvent): void => {
        // Primary button only
        if (e.button !== 0) return;
        
        // CAPTURE transform at drag start - immutable during drag
        this.dragStartTransform = this.originalTransform;
        
        // SET STATE IMMEDIATELY to prevent cleanup during synchronous re-renders
        this.pointerId = e.pointerId;
        this.state = 'pending';
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        // Store wrapper element from event
        this.wrapper = e.currentTarget as HTMLElement;
        
        // CAPTURE the inline transform at drag start (immutable during drag)
        // Use wrapper.style.transform (inline) not computed style
        // Inline style contains only the element's scale, not positioning transforms
        this.dragStartTransform = this.wrapper.style.transform || '';
        
        // For group elements: check if the pointer landed on a child wrapper.
        // If so, don't start group drag — let the child handle it.
        // IMPORTANT: Must use composedPath() because child-wrapper lives inside
        // group-shp's shadow DOM. Regular e.target is retargeted to the shadow host,
        // so a parentElement walk would never find the child-wrapper.
        if (this.options.isGroupElement) {
            const currentWrapper = e.currentTarget as HTMLElement;
            for (const node of e.composedPath()) {
                if (node === currentWrapper) {
                    break;
                }
                if (node instanceof HTMLElement &&
                    (node.classList?.contains('element-wrapper') || node.classList?.contains('child-wrapper'))) {
                    // Reset state - this controller should not respond to bubbled move events
                    this.state = 'idle';
                    this.pointerId = null;
                    return;
                }
            }
        }
        
        this.wrapper.setPointerCapture(e.pointerId);
    };

    /**
     * Handle pointer move event - apply drag transformation
     * Call this from template event binding: @pointermove=${(e) => controller.handlePointerMove(e)}
     */
    public handlePointerMove = (e: PointerEvent): void => {
        if (this.state === 'idle') return;
        if (this.pointerId !== e.pointerId) return;
        
        // Store wrapper element from event if not already set
        if (!this.wrapper) {
            this.wrapper = e.currentTarget as HTMLElement;
        }
        
        let dx = e.clientX - this.startX;
        let dy = e.clientY - this.startY;
        
        // Check threshold before activating drag
        if (this.state === 'pending') {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < DRAG_THRESHOLD) return;
            
            this.state = 'dragging';
        }
        
        // Compensate for parent CSS scale (overview mode) to prevent drift
        // Walk up DOM tree through shadow boundaries to find scaled container
        let element: HTMLElement | null = this.wrapper;
        for (let i = 0; i < 20 && element; i++) {
            const nextElement: HTMLElement | null = element.parentElement;
            if (nextElement) {
                element = nextElement;
            } else {
                // Cross shadow DOM boundary
                const root = element.getRootNode();
                if (root instanceof ShadowRoot && root.host) {
                    element = root.host as HTMLElement;
                } else {
                    break;
                }
            }
            if (!element) break;
            
            const transform = window.getComputedStyle(element).transform;
            if (transform && transform !== 'none') {
                try {
                    const matrix = new DOMMatrix(transform);
                    const scaleX = matrix.a;
                    const scaleY = matrix.d;
                    if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
                        dx = dx / scaleX;
                        dy = dy / scaleY;
                        break;
                    }
                } catch (e) {
                    // Continue searching
                }
            }
        }
        
        // Apply translate - prepend so it happens in screen space before element scaling
        const translateTransform = `translate(${dx}px, ${dy}px)`;
        const fullTransform = this.dragStartTransform 
            ? `${translateTransform} ${this.dragStartTransform}` 
            : translateTransform;
        
        this.wrapper.style.transform = fullTransform;
        this.wrapper.style.cursor = 'grabbing';
        
        e.preventDefault();
    };

    /**
     * Handle pointer up event - finalize drag and dispatch event
     * Call this from template event binding: @pointerup=${(e) => controller.handlePointerUp(e)}
     */
    public handlePointerUp = (e: PointerEvent): void => {
        if (this.pointerId !== e.pointerId) return;
        
        // Store wrapper element from event if not already set
        if (!this.wrapper) {
            this.wrapper = e.currentTarget as HTMLElement;
        }
        
        this.wrapper.releasePointerCapture(e.pointerId);
        
        if (this.state === 'dragging') {
            // Calculate FINAL dx/dy (RAW screen-space, NO scale compensation)
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;
            
            // Reset visual transform using captured drag-start transform
            // Remove the inline transform property to prevent accumulation
            if (this.dragStartTransform && this.dragStartTransform !== 'none') {
                this.wrapper.style.transform = this.dragStartTransform;
            } else {
                this.wrapper.style.removeProperty('transform');
            }
            this.wrapper.style.cursor = '';
            
            // Dispatch move event with raw screen-space deltas
            const moveEvent = new CustomEvent<ElementMovedEventDetail>('scalable-house-plan-element-moved', {
                detail: {
                    uniqueKey: this.uniqueKey,
                    roomIndex: this.options.roomIndex,
                    entityId: this.options.entityId,
                    deltaXPx: dx,
                    deltaYPx: dy,
                    parentGroupKey: this.options.parentGroupKey,
                    scale: this.options.scale,
                    scaleRatio: this.options.scaleRatio,
                    roomBoundsWidth: this.options.roomBoundsWidth,
                    roomBoundsHeight: this.options.roomBoundsHeight
                }
            });
            window.dispatchEvent(moveEvent);
            
            // Prevent click handler from firing
            e.stopPropagation();
            e.preventDefault();
        }
        
        // Clear captured transform for next drag
        this.dragStartTransform = '';
        this.state = 'idle';
        this.pointerId = null;
    };

    /**
     * Handle keyboard event - support escape key to cancel drag
     */
    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && this.state === 'dragging') {
            const wrapper = document.querySelector(`[data-unique-key="${this.uniqueKey}"]`) as HTMLElement;
            if (wrapper) {
                // Restore transform using captured drag-start transform
                if (this.dragStartTransform && this.dragStartTransform !== 'none') {
                    wrapper.style.transform = this.dragStartTransform;
                } else {
                    wrapper.style.removeProperty('transform');
                }
                wrapper.style.cursor = '';
                if (this.pointerId !== null) {
                    wrapper.releasePointerCapture(this.pointerId);
                }
            }
            this.dragStartTransform = '';
            this.state = 'idle';
            this.pointerId = null;
        }
    };
}
