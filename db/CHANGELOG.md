# kevbot/db Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.14.0](https://github.com/k1dkev/KevBot/compare/db-v2.13.0...db-v2.14.0) (2026-04-22)


### Features

* unified search ([#135](https://github.com/k1dkev/KevBot/issues/135)) ([94bac59](https://github.com/k1dkev/KevBot/commit/94bac5930e63ae180f309be35689394a7183c93e))

## [2.13.0](https://github.com/Kunedawg/KevBot/compare/db-v2.12.0...db-v2.13.0) (2025-12-31)


### Features

* **db:** trigger version bump ([#133](https://github.com/Kunedawg/KevBot/issues/133)) ([49a9e2c](https://github.com/Kunedawg/KevBot/commit/49a9e2c8d50232ad51e1e123fb9a1d81b94653df))

## [2.12.0](https://github.com/Kunedawg/KevBot/compare/db-v2.11.0...db-v2.12.0) (2025-12-31)


### Features

* **db:** add auth sessions and update users table ([77de1bf](https://github.com/Kunedawg/KevBot/commit/77de1bf48cccc8b5dc26e290a99a3f4cd1b7543f))

## [2.11.0](https://github.com/Kunedawg/KevBot/compare/db-v2.10.0...db-v2.11.0) (2025-10-10)


### Features

* **api:** add /tracks integration tests and more ([1f01f6a](https://github.com/Kunedawg/KevBot/commit/1f01f6a0e58e8c5e92a5643af78f529a6ab3cd0a))
* **api:** add basic bcrypt password hashing ([c9a1c2a](https://github.com/Kunedawg/KevBot/commit/c9a1c2a8c841ffbd5beb9b6a5d815caf892a93fb))
* **api:** add play count aggregation task ([3104b10](https://github.com/Kunedawg/KevBot/commit/3104b100d8a1382daf98438d1ad17b3256a3d7c5))
* **db:** add audio to tracks change script ([aaf0556](https://github.com/Kunedawg/KevBot/commit/aaf0556d7fb9f703bb571cc5fb81ff44f3d543ea))
* **db:** add audio_category change script ([01b2712](https://github.com/Kunedawg/KevBot/commit/01b27129f1a7b418c0dceaa55859d423612080aa))
* **db:** add category_play_log change script ([ca8ec4a](https://github.com/Kunedawg/KevBot/commit/ca8ec4a58c39c8130a0d4fb2f3a91c20dc223dcc))
* **db:** add change script for audio_play_log ([6e29cf0](https://github.com/Kunedawg/KevBot/commit/6e29cf036b7738061eaf929d35968b6e5a9c4ad1))
* **db:** add drop stored procedures change script ([ae36ad3](https://github.com/Kunedawg/KevBot/commit/ae36ad3b2c70a6783674d62372cfdd4cb1d6dd84))
* **db:** Add gcloud rename migration script ([8821958](https://github.com/Kunedawg/KevBot/commit/88219587fdde646314aceab7e87b75529e63833d))
* **db:** add play count tables ([1ed3ba9](https://github.com/Kunedawg/KevBot/commit/1ed3ba96d7c53fcc840c626e6ffe8b36a06dcd0b))
* **db:** add player_info to users change script ([996e046](https://github.com/Kunedawg/KevBot/commit/996e046ca6fd1ef0f30bd5ace7aa8b0901db4fd1))
* **db:** add tracks text seach index ([#118](https://github.com/Kunedawg/KevBot/issues/118)) ([1a25930](https://github.com/Kunedawg/KevBot/commit/1a25930ac6016e34a3cd22e069c67f676410c2ca))
* **db:** finalized rename_to_id migration script ([2ca81a0](https://github.com/Kunedawg/KevBot/commit/2ca81a029be0270eb1c0e9284a92c64fa0b3847e))
* **db:** update categories table to playlists ([517397a](https://github.com/Kunedawg/KevBot/commit/517397a4daa108db6a3d3ad2e2de53fc6b7c9841))
* **db:** update user greeting and farewell tables ([c35295c](https://github.com/Kunedawg/KevBot/commit/c35295cfb2cf80d6724800678e2ec7fd7eca5272))
* improvements to release process ([88dc083](https://github.com/Kunedawg/KevBot/commit/88dc0835baa8a08d92b3947c70687eda006e6d31))
* **tools:** updates to workflows ([d7ea3b1](https://github.com/Kunedawg/KevBot/commit/d7ea3b11803b41957acc7a2f656aee9a1773fdd0))


### Bug Fixes

* **api:** increase timeout for problematic test ([1f01f6a](https://github.com/Kunedawg/KevBot/commit/1f01f6a0e58e8c5e92a5643af78f529a6ab3cd0a))
* **db:** removed rename supplemental script ([2a539af](https://github.com/Kunedawg/KevBot/commit/2a539af3d066f2a0fa4d065c5195108bdd39cdf1))
* **db:** small fix to 2.1.0 change script ([7ebd437](https://github.com/Kunedawg/KevBot/commit/7ebd437c05e81c2d9377e48740b00fe01d8efa7f))
* **tools:** add .env file for workflow compose ([6d4fe49](https://github.com/Kunedawg/KevBot/commit/6d4fe499282473bd0489f91dd7b97773cef5776e))

## [kevbot/db@next]

### Added

- Added `1.1.0_change.sql` script.
  - This script adds two tables. One for tracking the database version. The other for a change log.
- Added `mysql_manager.py`.
  - This is a script to assist with the management of the mysql databases/servers.

## [kevbot/db@v1.0.0] - 2024-06-19

### Added

- Baseline version
