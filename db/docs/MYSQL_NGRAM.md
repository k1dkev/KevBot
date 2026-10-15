# MySQL NGRAM Token Size

## What it is

`ngram_token_size` controls how text is split for FULLTEXT indexes using the ngram parser.

```txt
Example (size = 2):
yeatmac → ye ea at tm ma ac
```

MySQL 8 defaults this to `2`, which is what KevBot expects. Verify the value on
the hosted database before applying the search-index migrations:

```sql
SHOW VARIABLES LIKE 'ngram_token_size';
```

If it is not `2`, it must be changed at server startup before creating the
indexes. Existing FULLTEXT indexes must be rebuilt after changing it.

## How to change it on a self-managed MySQL server

### 1. Edit MySQL config

Common locations:

```txt
/etc/my.cnf
/etc/mysql/my.cnf
/etc/mysql/mysql.conf.d/mysqld.cnf
```

Add:

```conf
[mysqld]
ngram_token_size=2
```

### 2. Restart MySQL

```sh
sudo systemctl restart mysql
```

### 3. Verify

```sql
SHOW VARIABLES LIKE 'ngram_token_size';
```

### 4. Build (or rebuild) indexes

```sql
ALTER TABLE tracks DROP INDEX ftx_tracks_name;
ALTER TABLE tracks ADD FULLTEXT KEY ftx_tracks_name (name) WITH PARSER ngram;

ALTER TABLE playlists DROP INDEX ftx_playlists_name;
ALTER TABLE playlists ADD FULLTEXT KEY ftx_playlists_name (name) WITH PARSER ngram;

ALTER TABLE users DROP INDEX ftx_users_discord_username;
ALTER TABLE users ADD FULLTEXT KEY ftx_users_discord_username (discord_username) WITH PARSER ngram;
```

## Summary

- MySQL's default is already `ngram_token_size=2`.
- Verify the value on DigitalOcean with `SHOW VARIABLES`.
- Only change server configuration and rebuild indexes if the value differs.
- The three indexes are `ftx_tracks_name`, `ftx_playlists_name`, and
  `ftx_users_discord_username`.
