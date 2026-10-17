ALTER TABLE users
  ADD COLUMN authorization_role ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user';

CREATE TABLE authorization_state (
  id TINYINT UNSIGNED NOT NULL,
  bootstrap_completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_authorization_state_singleton CHECK (id = 1)
);

INSERT INTO authorization_state (id, bootstrap_completed) VALUES (1, FALSE);
