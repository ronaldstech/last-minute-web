CREATE TABLE IF NOT EXISTS wallet_transactions (
  charge_id VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  operator_id VARCHAR(100) NOT NULL,
  operator_name VARCHAR(120) NOT NULL,
  mobile VARCHAR(32) NOT NULL,
  coins INT UNSIGNED NOT NULL,
  amount_mwk INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tx_ref VARCHAR(160) NULL,
  failure_reason VARCHAR(500) NULL,
  credited TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (charge_id),
  KEY wallet_transactions_user_created (user_id, created_at),
  CONSTRAINT wallet_transactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
