/**
 * 🔱 PROMETHEUS — DEPLOYMENT KILL SWITCH
 * PHASE: RESEARCH INTELLIGENCE
 * 
 * Auto-disables live deployment if structural alpha decay, false discovery,
 * or panic regime breakdowns occur.
 */

'use strict';

class DeploymentKillSwitch {
    
    evaluate(verdictData, survivabilityData) {
        let isKilled = false;
        const killReasons = [];

        if (verdictData.verdict === 'INVALIDATED') {
            isKilled = true;
            killReasons.push('RESEARCH_VERDICT_INVALIDATED');
        }

        if (survivabilityData.trendDirection === 'COLLAPSING') {
            isKilled = true;
            killReasons.push('STRUCTURAL_EDGE_DECAY');
        }

        if (verdictData.penalties && verdictData.penalties.some(p => p.includes('PBO') || p.includes('False Discovery'))) {
            isKilled = true;
            killReasons.push('FALSE_ALPHA_DETECTED');
        }

        return {
            isKilled,
            killReasons,
            status: isKilled ? 'SYSTEM_HALTED' : 'ARMED'
        };
    }
}

module.exports = new DeploymentKillSwitch();
