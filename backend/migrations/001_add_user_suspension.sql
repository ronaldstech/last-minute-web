-- Run once on databases created before admin user management was added.
ALTER TABLE users
  ADD COLUMN is_suspended TINYINT(1) NOT NULL DEFAULT 0 AFTER phone_verified;
