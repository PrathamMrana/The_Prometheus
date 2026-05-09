/**
 * updateQueue.js - Frontend Sync Discipline
 * Ensures sequential application of WebSocket deltas.
 */

class UpdateQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.onProcess = null;
    }

    push(update) {
        this.queue.push(update);
        this.process();
    }

    setProcessor(fn) {
        this.onProcess = fn;
    }

    async process() {
        if (this.isProcessing || !this.onProcess || this.queue.length === 0) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            // 🥶 [PHASE 6] KILL QUEUE ON FREEZE
            if (window.__FREEZE__) {
                this.queue = [];
                return;
            }

            const update = this.queue.shift();
            try {
                await this.onProcess(update);
            } catch (e) {
                console.error('[QUEUE_ERROR]', e);
            }
        }

        this.isProcessing = false;
    }
}

export const updateQueue = new UpdateQueue();
