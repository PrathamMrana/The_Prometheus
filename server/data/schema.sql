-- 🛡️ PROMETHEUS PRODUCTION SCHEMA v1.0
-- Optimized for PostgreSQL/SQLite

-- 1. PORTFOLIO CORE
CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    balance DECIMAL(18, 2) NOT NULL DEFAULT 1000000.00,
    locked_balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    realized_pnl DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. HOLDINGS
CREATE TABLE IF NOT EXISTS holdings (
    symbol VARCHAR(20) PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0,
    avg_price DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    total_cost DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    locked_qty INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ORDERS (Atomic Ledger)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL, -- BUY | SELL
    type VARCHAR(10) NOT NULL, -- MARKET | LIMIT
    qty INTEGER NOT NULL,
    price DECIMAL(18, 2) NOT NULL,
    status VARCHAR(20) NOT NULL, -- PENDING | FILLED | CANCELLED | REJECTED
    pnl DECIMAL(18, 2),
    timestamp BIGINT NOT NULL,
    metadata TEXT -- JSON blob for tradeTags, scores, etc.
);

-- 4. EXECUTION LEDGER (Event Sourcing for Replay)
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type VARCHAR(50) NOT NULL,
    payload TEXT NOT NULL,
    hash VARCHAR(64) NOT NULL,
    timestamp BIGINT NOT NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp);
