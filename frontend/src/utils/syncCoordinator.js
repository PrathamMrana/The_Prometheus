/**
 * syncCoordinator.js - Frontend Sync Discipline
 * Atomically locks all dashboard modules to the same sync_id.
 */

class SyncCoordinator {
    constructor() {
        this.currentSyncId = null;
        this.isProcessing = false;
    }

    lock(syncId) {
        if (syncId !== this.currentSyncId) {
            console.log(`[SYNC] Atomic ID Shift: ${this.currentSyncId} -> ${syncId}`);
            this.currentSyncId = syncId;
            return true;
        }
        return false;
    }

    isAligned(syncId) {
        return syncId === this.currentSyncId;
    }

    getSyncId() {
        return this.currentSyncId;
    }
}

export const syncCoordinator = new SyncCoordinator();
