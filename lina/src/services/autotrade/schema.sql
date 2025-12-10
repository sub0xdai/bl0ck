-- src/services/autotrade/schema.sql
CREATE TABLE IF NOT EXISTS autotrade_subscriptions (
  user_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at BIGINT NOT NULL,
  activated_at BIGINT NOT NULL,
  last_renewal_at BIGINT NOT NULL,
  total_paid DECIMAL(18, 6) NOT NULL DEFAULT 1.0,
  tx_signatures TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autotrade_status ON autotrade_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_autotrade_expires ON autotrade_subscriptions(expires_at);
