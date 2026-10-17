-- Playback retries share one event identity; SQL scripts remain forward-only.
CREATE TABLE playback_events (
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT NULL,
  track_id INT NOT NULL,
  play_type INT NOT NULL,
  source_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  playlist_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_playback_events_actor_created (user_id, created_at),
  CONSTRAINT fk_playback_events_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_playback_events_track FOREIGN KEY (track_id) REFERENCES tracks(id),
  CONSTRAINT fk_playback_events_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);
