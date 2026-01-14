/**
 * Shared timer service to avoid creating individual timers for each component
 * This significantly improves performance when many components need periodic updates
 */

type TimerCallback = () => void;

class TimerService {
    private static instance: TimerService;
    private subscribers: Set<TimerCallback> = new Set();
    private timerId?: number;
    private readonly interval: number = 1000; // 1 second

    private constructor() {}

    static getInstance(): TimerService {
        if (!TimerService.instance) {
            TimerService.instance = new TimerService();
        }
        return TimerService.instance;
    }

    /**
     * Subscribe to timer ticks
     * Starts the timer if this is the first subscriber
     */
    subscribe(callback: TimerCallback): void {
        this.subscribers.add(callback);
        
        // Start timer if this is the first subscriber
        if (this.subscribers.size === 1 && !this.timerId) {
            this.start();
        }
    }

    /**
     * Unsubscribe from timer ticks
     * Stops the timer if there are no more subscribers
     */
    unsubscribe(callback: TimerCallback): void {
        this.subscribers.delete(callback);
        
        // Stop timer if no more subscribers
        if (this.subscribers.size === 0 && this.timerId) {
            this.stop();
        }
    }

    private start(): void {
        this.timerId = window.setInterval(() => {
            this.tick();
        }, this.interval);
    }

    private stop(): void {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined;
        }
    }

    private tick(): void {
        // Notify all subscribers
        this.subscribers.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in timer callback:', error);
            }
        });
    }

    /**
     * Get the number of active subscribers (for debugging)
     */
    getSubscriberCount(): number {
        return this.subscribers.size;
    }
}

// Export singleton instance
export const timerService = TimerService.getInstance();
