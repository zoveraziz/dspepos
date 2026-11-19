export const DB_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SALE', 'PURCHASE')),
    amount REAL NOT NULL,
    serial_no INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_outbox (
    mutation_id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SYNCING', 'FAILED')),
    retry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_trans_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status);
`;
