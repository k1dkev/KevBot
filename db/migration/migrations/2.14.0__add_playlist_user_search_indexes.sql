-- Adds supporting indexes and config for playlist and user search features.

-- check ngram token size is 2, fail if not
DROP PROCEDURE IF EXISTS check_ngram;
DELIMITER //

CREATE PROCEDURE check_ngram()
BEGIN
  IF @@ngram_token_size != 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ngram_token_size must be 2';
  END IF;
END //

DELIMITER ;

CALL check_ngram();
DROP PROCEDURE check_ngram;

ALTER TABLE `playlists`
  ADD INDEX `idx_playlists_name` (`name`);

ALTER TABLE `playlists`
  ADD FULLTEXT INDEX `ftx_playlists_name` (`name`) WITH PARSER ngram;

ALTER TABLE `users`
  ADD INDEX `idx_users_discord_username` (`discord_username`);

ALTER TABLE `users`
  ADD FULLTEXT INDEX `ftx_users_discord_username` (`discord_username`) WITH PARSER ngram;

