PROMETHEUS V5 — INSTITUTIONAL PAPER TRADING RESEARCH & VALIDATION DIRECTIVE
============================================================================

CLASSIFICATION:
CONTROLLED QUANTITATIVE RESEARCH CAMPAIGN

SYSTEM STATUS:
RESEARCH_CAMPAIGN_ACTIVE

MISSION:
This system is NOT operating as a profit-seeking autonomous trader.

This system is operating as a:
long-horizon quantitative research engine whose sole purpose is to determine whether a statistically valid and execution-survivable trading edge exists under real-world hostile market conditions.

PRIMARY QUESTION:
“Does the edge survive reality?”

NOT:
“Did the system make money recently?”

============================================================================
SECTION 1 — ABSOLUTE RESEARCH FREEZE
============================================================================

PROMETHEUS_V5_LOCKED = TRUE

ALL CORE STRATEGY COMPONENTS ARE IMMUTABLE:

LOCKED:
- edge scoring
- confidence engine
- regime classification
- signal ranking
- breakout logic
- smart money logic
- ML thresholds
- calibration logic
- adversarial penalties
- weighting systems
- feature engineering
- signal routing
- deployment scoring

STRICTLY PROHIBITED:
- tuning after losses
- tuning after drawdowns
- tuning after weak weeks
- threshold optimization from small samples
- emotional intervention
- retrospective overfitting
- cherry-picked regime optimization

ALLOWED:
- infrastructure fixes
- memory optimization
- websocket resilience
- logging improvements
- persistence reliability
- crash recovery
- execution realism improvements

RESEARCH PRINCIPLE:
A changing system cannot produce scientifically valid statistics.

============================================================================
SECTION 2 — SCIENTIFIC RESEARCH OBJECTIVE
============================================================================

The campaign must empirically verify:

1. Statistical validity
2. Regime robustness
3. Adversarial survivability
4. Execution realism survivability
5. Long-duration edge persistence
6. Drawdown survivability
7. Calibration integrity
8. Operational stability
9. Portfolio survivability
10. Human-reviewed deployment readiness

NO deployment discussions are permitted until:
- large-sample validation exists
- adversarial survival is confirmed
- operational stability is proven
- long-duration consistency is observed

============================================================================
SECTION 3 — DATA VALIDATION & MARKET INTEGRITY
============================================================================

OBJECTIVE:
Ensure all downstream analytics operate on trustworthy market structure.

VERIFY:
- missing candles
- duplicate candles
- timestamp corruption
- timezone inconsistency
- delayed feeds
- stale websocket packets
- NaN propagation
- malformed OHLCV
- volume anomalies
- exchange drift
- corrupted gap calculations

MULTI-SOURCE VERIFICATION:
Cross-validate:
- Yahoo Finance
- NSE feeds
- fallback providers

TRACK:
- close variance
- open variance
- volume variance
- timestamp mismatch
- delayed response frequency

CORPORATE ACTION VALIDATION:
Verify:
- splits
- dividends
- bonuses
- mergers
- symbol changes

BIAS DETECTION:
- survivorship bias
- lookahead bias
- selection bias
- leakage contamination

FAILURE FLAG:
DATA_INTEGRITY_FAILURE

============================================================================
SECTION 4 — SIGNAL GENERATION VALIDATION
============================================================================

EVERY SIGNAL MUST FOLLOW FULL TRACEABLE LIFECYCLE:

SIGNAL_GENERATED
→ ENTRY_TRIGGERED
→ EXECUTION_ATTEMPTED
→ EXECUTION_FILLED
→ POSITION_OPEN
→ POSITION_MANAGED
→ EXIT_TRIGGERED
→ POSITION_CLOSED
→ TRADE_LOGGED

VERIFY:
- no repainting
- no future leakage
- no future candle access
- no hindsight ranking
- no post-close contamination
- deterministic output stability

REPEATABILITY TEST:
Same candle input must ALWAYS produce:
- identical score
- identical confidence
- identical decision
- identical ranking

VERIFY:
confidence must correlate with:
- expectancy
- PF
- alpha retention

FAILURE FLAG:
SIGNAL_INSTABILITY

============================================================================
SECTION 5 — EXECUTION REALISM VALIDATION
============================================================================

OBJECTIVE:
Destroy theoretical profitability assumptions.

ALL EXECUTION MUST INCLUDE:

1. Bid-ask spread simulation
2. Slippage simulation
3. Latency simulation
4. Queue delay simulation
5. Partial fill simulation
6. Gap execution realism
7. Volatility expansion stress

TRACK:
- signal timestamp
- executable timestamp
- intended entry
- actual fill
- fill efficiency
- slippage retention
- breakout miss probability

STRESS TEST:
- 0.10% slippage
- 0.25% slippage
- 0.50% slippage
- 1.00% slippage

LATENCY TEST:
- 1s delay
- 3s delay
- 5s delay
- 10s delay

VERIFY:
Strategy remains statistically viable AFTER execution friction.

FAILURE FLAG:
EXECUTION_DECAY_FAILURE

============================================================================
SECTION 6 — REGIME CLASSIFICATION VALIDATION
============================================================================

MARKET REGIMES:

- TRENDING
- RANGE_BOUND
- MEAN_REVERSION
- HIGH_VOL
- LOW_VOL
- PANIC
- SECTOR_ROTATION

FOR EACH REGIME TRACK:

- trade count
- expectancy
- profit factor
- Sharpe ratio
- drawdown
- hit rate
- alpha retention
- slippage retention
- adversarial survivability
- calibration quality

OBJECTIVE:
Determine whether:
- edge is universal
OR
- regime fragile

IDENTIFY:
- collapse regimes
- weak environments
- adversarial sensitivity clusters

FAILURE FLAG:
REGIME_FRAGILITY

============================================================================
SECTION 7 — ADVERSARIAL VALIDATION ENGINE
============================================================================

OBJECTIVE:
Attempt to destroy the edge intentionally.

RUN CONTINUOUS ADVERSARIAL TESTS:

INJECT:
- synthetic volatility
- spread expansion
- random execution delay
- candle perturbation
- signal noise
- liquidity distortion
- execution hostility
- queue instability
- random fill degradation

MONTE CARLO TESTING:
- reshuffle trade order
- randomize outcome distribution
- stress consecutive losses
- simulate fat-tail drawdowns

TRACK:
- ruin probability
- equity stability
- tail-risk exposure
- drawdown survivability
- confidence degradation

OBJECTIVE:
Determine whether profitability survives hostile conditions.

FAILURE FLAG:
ADVERSARIAL_COLLAPSE

============================================================================
SECTION 8 — MACHINE LEARNING VALIDATION
============================================================================

VERIFY:
- walk-forward robustness
- out-of-sample survivability
- feature importance stability
- calibration integrity
- parameter robustness
- prediction consistency

STRICT RULE:
NO retraining during active campaign.

CONFIDENCE VALIDATION:
Higher confidence MUST correlate with:
- stronger expectancy
- stronger PF
- lower collapse probability

OVERFITTING DETECTION:
RED FLAGS:
- unstable feature importance
- excessive parameter sensitivity
- unrealistic Sharpe
- backtest/paper divergence
- calibration collapse

FAILURE FLAG:
ML_OVERFITTING_RISK

============================================================================
SECTION 9 — PORTFOLIO & CAPITAL SURVIVABILITY
============================================================================

OBJECTIVE:
Validate portfolio-level survivability.

TRACK:
- sector concentration
- exposure overlap
- correlation clusters
- cascading loss probability
- capital efficiency
- volatility-adjusted exposure
- drawdown clustering

SIMULATE:
- correlated collapse
- simultaneous failures
- sector contagion
- liquidity contraction

VERIFY:
No single regime failure can catastrophically destroy equity.

FAILURE FLAG:
PORTFOLIO_INSTABILITY

============================================================================
SECTION 10 — OPERATIONAL STABILITY VALIDATION
============================================================================

OBJECTIVE:
Validate long-duration infrastructure survivability.

VERIFY:
- stable heap memory
- stable post-GC behavior
- websocket resilience
- reconnect recovery
- duplicate event prevention
- crash recovery
- state persistence
- event loop responsiveness
- async stability
- deadlock prevention

CRITICAL FAILURE EVENTS:
- HEARTBEAT_STALL
- MEMORY_LEAK
- EXECUTION_DEADLOCK
- SOCKET_FLOOD
- ASYNC_LOOP_BLOCK
- EVENT_QUEUE_OVERFLOW

TARGET:
Continuous stable operation under long-duration observation.

FAILURE FLAG:
INFRASTRUCTURE_FAILURE

============================================================================
SECTION 11 — IMMUTABLE RESEARCH STORAGE
============================================================================

CREATE APPEND-ONLY RESEARCH DATABASE:

research/
├── campaigns/
├── audits/
├── snapshots/
├── trade_logs/
├── execution_logs/
├── regime_stats/
├── adversarial/
├── monte_carlo/
├── calibration/
├── portfolio/
├── deployment_scores/
└── infrastructure/

STRICT RULE:
Historical records can NEVER be overwritten.

EVERY RECORD MUST STORE:
- timestamp
- regime
- symbol
- score
- confidence
- signal source
- slippage
- latency
- outcome
- MFE
- MAE
- drawdown
- adversarial metrics
- infrastructure state

============================================================================
SECTION 12 — WEEKLY RESEARCH AUDIT
============================================================================

AUTO-GENERATE:

WEEKLY_RESEARCH_AUDIT.md

TRACK:
- expectancy trend
- PF trend
- alpha retention
- edge decay
- outlier dependency
- calibration drift
- walk-forward degradation
- slippage survivability
- drawdown stability
- operational incidents

DETECT:
- structural edge decay
- hidden fragility
- overfitting symptoms
- collapse clusters
- regime deterioration

MANDATORY QUESTIONS:

1.
Is profitability dependent on a few extreme outliers?

2.
Does performance collapse in specific regimes?

3.
Does slippage destroy expectancy?

4.
Does adversarial pressure break calibration?

5.
Is drawdown survivable?

6.
Is edge stable over time?

============================================================================
SECTION 13 — DEPLOYMENT READINESS SCORE
============================================================================

COMPUTE:

DEPLOYMENT_READINESS_SCORE (0–100)

WEIGHTS:

20% Statistical Validity
20% Adversarial Survivability
15% Execution Realism
15% Drawdown Survivability
10% Calibration Quality
10% Regime Diversity
10% Operational Stability

CLASSIFICATION:

<60:
NOT_DEPLOYABLE

60–80:
RESEARCH_ONLY

80–90:
LIMITED_CAPITAL_ONLY

90+:
DEPLOYMENT_CANDIDATE

STRICT RULE:
Autonomous deployment authorization is PERMANENTLY DISABLED.

============================================================================
SECTION 14 — HUMAN REVIEW GOVERNANCE
============================================================================

MANDATORY MANUAL APPROVAL REQUIRED.

OPERATOR MUST REVIEW:

[ ] toxic clusters
[ ] false positives
[ ] outlier dependency
[ ] slippage assumptions
[ ] calibration drift
[ ] walk-forward collapse
[ ] regime fragility
[ ] probability of ruin
[ ] operational stability
[ ] portfolio concentration
[ ] adversarial survivability

WITHOUT HUMAN APPROVAL:
DEPLOYMENT REMAINS LOCKED.

============================================================================
SECTION 15 — MINIMUM RESEARCH REQUIREMENTS
============================================================================

MINIMUM VALIDATION REQUIREMENTS:

- 500+ trades
- multiple market regimes
- multiple sectors
- long-duration observation
- adversarial survivability
- stable calibration
- survivable drawdowns
- positive expectancy retention
- execution realism retention
- infrastructure stability
- portfolio survivability

STRICT RULE:
Short-term profitability is NOT evidence of deployability.

============================================================================
SECTION 16 — FINAL SCIENTIFIC QUESTION
============================================================================

At campaign conclusion answer ONLY this:

“Does the edge survive:
slippage,
latency,
execution friction,
regime shifts,
noise,
drawdowns,
adversarial pressure,
portfolio stress,
and long-duration statistical observation?”

IF YES:
Proceed ONLY to:
LIMITED_CAPITAL_EVALUATION

IF NO:
Return to:
RESEARCH_PHASE

============================================================================
END DIRECTIVE
============================================================================
