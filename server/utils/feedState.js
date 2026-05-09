/**
 * ══════════════════════════════════════════════════════════════
 * [PHASE 10] PROMETHEUS DATA FEED STATE MACHINE v1.0
 * ══════════════════════════════════════════════════════════════
 *
 * Graded stale states: LIVE → DELAYED → STALE → DISCONNECTED
 * With 5s persistence debounce before state transitions fire.
 *
 * Used by worker.js cycle to attach feed health to every broadcast.
 */

'use strict';

// ─── State thresholds (ms) ────────────────────────────────────────────────────
const THRESHOLDS = {
    LIVE:         30_000,  // 0–30s  → LIVE
    DELAYED:      90_000,  // 30–90s → DELAYED
    STALE:        180_000, // 90–180s → STALE
    DISCONNECTED: Infinity // 180s+   → DISCONNECTED
};

// ─── Trading rules per state ─────────────────────────────────────────────────
const TRADING_RULES = {
    LIVE:         { allowEntry: true,  allowExit: true,  warn: false },
    DELAYED:      { allowEntry: true,  allowExit: true,  warn: true  },
    STALE:        { allowEntry: false, allowExit: true,  warn: true  },  // block entries, allow exits
    DISCONNECTED: { allowEntry: false, allowExit: false, warn: true  },  // full execution halt
};

// ─── State machine ───────────────────────────────────────────────────────────
class FeedStateMachine {
    constructor() {
        this._currentState = 'LIVE';
        this._pendingState = null;
        this._debounceTimer = null;
        this._DEBOUNCE_MS = 10_000; // 10s persistence before transition fires
        this._lastLiveAt = Date.now();
        this._stateChangedAt = Date.now();
        this._stateHistory = []; // ring buffer of last 10 transitions
    }

    /**
     * Call on every confirmed live tick received from the data pipeline.
     */
    markLiveTick() {
        this._lastLiveAt = Date.now();
        this._maybeTransitionTo('LIVE');
    }

    /**
     * Call every cycle to evaluate whether state needs to change.
     * Debounced: state only changes after _DEBOUNCE_MS ms of persistence.
     */
    evaluate() {
        const age = Date.now() - this._lastLiveAt;
        const targetState = this._computeTargetState(age);

        if (targetState !== this._currentState) {
            this._maybeTransitionTo(targetState);
        } else {
            // If we arrived at the correct state, cancel any pending transition
            if (this._pendingState === this._currentState) {
                this._cancelPending();
            }
        }

        return this.snapshot();
    }

    _computeTargetState(ageMs) {
        if (ageMs <= THRESHOLDS.LIVE)    return 'LIVE';
        if (ageMs <= THRESHOLDS.DELAYED) return 'DELAYED';
        if (ageMs <= THRESHOLDS.STALE)   return 'STALE';
        return 'DISCONNECTED';
    }

    _maybeTransitionTo(targetState) {
        if (targetState === this._currentState) {
            this._cancelPending();
            return;
        }
        if (targetState === this._pendingState) return; // already queued

        // Cancel previous pending transition
        this._cancelPending();

        this._pendingState = targetState;
        this._debounceTimer = setTimeout(() => {
            const prev = this._currentState;
            this._currentState = targetState;
            this._pendingState = null;
            this._stateChangedAt = Date.now();

            const entry = { from: prev, to: targetState, at: new Date().toISOString() };
            this._stateHistory.push(entry);
            if (this._stateHistory.length > 10) this._stateHistory.shift();

            const emoji = targetState === 'LIVE' ? '✅' : targetState === 'DELAYED' ? '⚠️' : '🔴';
            console.log(`[FEED_STATE] ${emoji} ${prev} → ${targetState} (debounce cleared)`);
        }, this._DEBOUNCE_MS);
    }

    _cancelPending() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
            this._pendingState = null;
        }
    }

    /**
     * Returns complete snapshot for broadcast inclusion.
     */
    snapshot() {
        const age = Date.now() - this._lastLiveAt;
        const rules = TRADING_RULES[this._currentState];
        const pendingTransition = this._pendingState
            ? { to: this._pendingState, inMs: Math.max(0, this._DEBOUNCE_MS - (Date.now() - (this._stateChangedAt || 0))) }
            : null;

        return {
            state: this._currentState,
            dataAge: age,
            stateAge: Date.now() - this._stateChangedAt,
            allowEntry:  rules.allowEntry,
            allowExit:   rules.allowExit,
            warn:        rules.warn,
            pendingTransition,
            lastLiveAt: this._lastLiveAt,
            history: this._stateHistory.slice(-3),
        };
    }

    get state() { return this._currentState; }
    get allowEntry() { return TRADING_RULES[this._currentState].allowEntry; }
    get allowExit()  { return TRADING_RULES[this._currentState].allowExit;  }
}

// Singleton — one state machine for the entire data pipeline
const feedState = new FeedStateMachine();
module.exports = feedState;
