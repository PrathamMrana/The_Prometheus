/**
 * syncCoordinator.js - Deterministic Snapshot Locking
 * Ensures strict monotonic ordering (1, 2, 3...) for all dashboard pulses.
 */

let counter = 0;

function createSyncId() {
  counter += 1;
  return counter;
}

function getSyncId() {
  return counter;
}

module.exports = { createSyncId, getSyncId };
