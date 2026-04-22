# Changelog

All notable changes to the KevBot infrastructure and cross-cutting concerns will be documented in this file.

This file tracks technical infrastructure changes (docker, CI/CD, monorepo structure, etc.). For user-facing release highlights and coordinated feature releases, see [RELEASE_NOTES.md](RELEASE_NOTES.md).

For component-specific technical changes, see:

- [API Changelog](api/CHANGELOG.md)
- [Frontend Changelog](frontend/CHANGELOG.md)
- [Database Changelog](db/CHANGELOG.md)
- [Tools Changelog](tools/CHANGELOG.md)
- [GCloud Changelog](gcloud/CHANGELOG.md)

---

## [2.0.0-beta.4](https://github.com/k1dkev/KevBot/compare/v2.0.0-beta.3...v2.0.0-beta.4) (2026-04-22)


### Features

* unified search ([#135](https://github.com/k1dkev/KevBot/issues/135)) ([94bac59](https://github.com/k1dkev/KevBot/commit/94bac5930e63ae180f309be35689394a7183c93e))

## [2.0.0-beta.3](https://github.com/Kunedawg/KevBot/compare/v2.0.0-beta.2...v2.0.0-beta.3) (2025-12-31)


### Features

* **db:** trigger version bump ([#133](https://github.com/Kunedawg/KevBot/issues/133)) ([49a9e2c](https://github.com/Kunedawg/KevBot/commit/49a9e2c8d50232ad51e1e123fb9a1d81b94653df))

## [2.0.0-beta.2](https://github.com/Kunedawg/KevBot/compare/v2.0.0-beta.1...v2.0.0-beta.2) (2025-12-31)


### Features

* **api:** discord auth ([5973de6](https://github.com/Kunedawg/KevBot/commit/5973de65f16e1a7bcb719c31458d1efaa0b84460))
* **db:** add auth sessions and update users table ([77de1bf](https://github.com/Kunedawg/KevBot/commit/77de1bf48cccc8b5dc26e290a99a3f4cd1b7543f))
* **frontend:** discord auth ([11a019b](https://github.com/Kunedawg/KevBot/commit/11a019b76a46038ad1a0b5526a30b1c0ab639339))


### Bug Fixes

* **tools:** use correct env var names ([a101b4a](https://github.com/Kunedawg/KevBot/commit/a101b4a3aeda8ac791d92a4b9b7984b7f73a896c))

## [2.0.0-beta.1](https://github.com/Kunedawg/KevBot/compare/v2.0.0-beta.0...v2.0.0-beta.1) (2025-10-10)


### Features

* **api:** add /plays tests ([#109](https://github.com/Kunedawg/KevBot/issues/109)) ([eb8f1c1](https://github.com/Kunedawg/KevBot/commit/eb8f1c11f722189a71cdd202b1e2521cf4acf8af))
* **api:** add /plays/playlists/random endpoint ([f7ed6f9](https://github.com/Kunedawg/KevBot/commit/f7ed6f94920e0b748b99076d985d554d97ba29ca))
* **api:** add /tracks DELETE endpoint ([2081804](https://github.com/Kunedawg/KevBot/commit/2081804ad277abc34b4e2ec50bccba38fd4920b2))
* **api:** add /tracks integration tests and more ([1f01f6a](https://github.com/Kunedawg/KevBot/commit/1f01f6a0e58e8c5e92a5643af78f529a6ab3cd0a))
* **api:** add /tracks restore ([642d308](https://github.com/Kunedawg/KevBot/commit/642d308bb12940ebfd99d972054a49a3fbf77b74))
* **api:** add /users resource ([23075b1](https://github.com/Kunedawg/KevBot/commit/23075b1ee1127c8f77d6bbd007201aca2f17b617))
* **api:** add basic bcrypt password hashing ([c9a1c2a](https://github.com/Kunedawg/KevBot/commit/c9a1c2a8c841ffbd5beb9b6a5d815caf892a93fb))
* **api:** add basic playlist endpoints ([9a001de](https://github.com/Kunedawg/KevBot/commit/9a001de3e06336ded1f43a0d6422ca5d8813510c))
* **api:** add database version check on start ([cbfaa80](https://github.com/Kunedawg/KevBot/commit/cbfaa80107d436939c26107caacf3f37fc9c0c48))
* **api:** add error cases to /users tests ([f838ed7](https://github.com/Kunedawg/KevBot/commit/f838ed71bc622fff522303b7d436e397baa8ccc8))
* **api:** Add first meaningful test! ([54f3a93](https://github.com/Kunedawg/KevBot/commit/54f3a93ecb7e99e4c7e1e19cbf9634de9dc5b4aa))
* **api:** add GET endpoints for tracks ([8a859d6](https://github.com/Kunedawg/KevBot/commit/8a859d66f94050bf4b0a7d5fb28b2bfb742857e3))
* **api:** add greeting and farewell to API ([3a87177](https://github.com/Kunedawg/KevBot/commit/3a87177032c9c27bfbcf7be22908bc6a6bae640f))
* **api:** add integration tests for auth routes ([f887573](https://github.com/Kunedawg/KevBot/commit/f8875737cb252f183d409452848a5cf7a01e9290))
* **api:** Add jwt authentication to track routes ([cb80563](https://github.com/Kunedawg/KevBot/commit/cb80563ad896e15e64370ac3044c84f8ea69c19e))
* **api:** add PATCH tracks route ([7ccfa6e](https://github.com/Kunedawg/KevBot/commit/7ccfa6e8a2be3e4e8f1182a7d95cc957e4395c73))
* **api:** add play count aggregation task ([3104b10](https://github.com/Kunedawg/KevBot/commit/3104b100d8a1382daf98438d1ad17b3256a3d7c5))
* **api:** add play_count increment on play log ([5574596](https://github.com/Kunedawg/KevBot/commit/5574596a37e4a0b5e93e51ab0f267c62871d8998))
* **api:** add play_count to GET /tracks ([7e0da39](https://github.com/Kunedawg/KevBot/commit/7e0da398b1cae3cf26914e8f17451149caf4c426))
* **api:** add playlist tracks functionality ([541ad21](https://github.com/Kunedawg/KevBot/commit/541ad2173d3d1ec7a18c50549351dcd55bf8ba0d))
* **api:** add POST /plays/tracks endpoint ([8f76278](https://github.com/Kunedawg/KevBot/commit/8f76278f77731dde766b8eade5223cbc7b72380f))
* **api:** add POST tracks/ endpoint ([8eacc8a](https://github.com/Kunedawg/KevBot/commit/8eacc8ad9c7d494086f4ff8b3315b76484c7519e))
* **api:** add register formatting restrictions ([812d072](https://github.com/Kunedawg/KevBot/commit/812d072a60670a418ef952467271db6a5f9ac234))
* **api:** Add testing setup ([2083da9](https://github.com/Kunedawg/KevBot/commit/2083da9f4f98c7015785fe3d1cf3294ff651d4a2))
* **api:** add tests for /users endpoint ([845dcc1](https://github.com/Kunedawg/KevBot/commit/845dcc10d0b4a894ffa670308429e64b8d82b33d))
* **api:** add tests for playlists ([2c006f5](https://github.com/Kunedawg/KevBot/commit/2c006f5e38062037fff26d68ec3dc3d4b9da5463))
* **api:** add tracks search ([#119](https://github.com/Kunedawg/KevBot/issues/119)) ([f611520](https://github.com/Kunedawg/KevBot/commit/f611520b581d5fbc0f2ca5864569445e463332e4))
* **api:** add userService and authService ([f379941](https://github.com/Kunedawg/KevBot/commit/f379941ebc1e6671f4a1c515acef99820eab33da))
* **api:** basic authentication complete ([8e282a9](https://github.com/Kunedawg/KevBot/commit/8e282a92b95acc7a76210372a06e84854993702c))
* **api:** basic jwt auth ([7433d90](https://github.com/Kunedawg/KevBot/commit/7433d906a1922848cf828137bf35a220e29cade3))
* **api:** convert api docs to typescript ([4e8774d](https://github.com/Kunedawg/KevBot/commit/4e8774d8b159014ad79c800dcb5590d11ab30c2e))
* **api:** convert auth routes/controller to ts ([711bfd9](https://github.com/Kunedawg/KevBot/commit/711bfd95b231cb553e5fca8ab74e6ec0911db318))
* **api:** convert tracks routes/controller to ts ([947eddf](https://github.com/Kunedawg/KevBot/commit/947eddf7a652a7fce1586f726ec3707459f5a8a0))
* **api:** convert users routes/controllers to ts ([835acd5](https://github.com/Kunedawg/KevBot/commit/835acd567b7cd3a823de3b7e49cfdf8002c70c1f))
* **api:** converted app.ts to typescript ([7404223](https://github.com/Kunedawg/KevBot/commit/7404223acb251b678bacab95849deb21075340c3))
* **api:** playlist route/controller ts conversion ([25bd602](https://github.com/Kunedawg/KevBot/commit/25bd6029b414ccafccbefd2e5cf5cd5f9aec2f15))
* **api:** plays routes/controller ts conversion ([d6706b6](https://github.com/Kunedawg/KevBot/commit/d6706b6a6fa9ee15186bf16fe018d4a42cf546c2))
* **api:** ts conversion - errorHandler, ... ([e177fd7](https://github.com/Kunedawg/KevBot/commit/e177fd79c13ebfd763c55c2ab7947156423dc776))
* **api:** typescript conversion complete! ([3a8e41b](https://github.com/Kunedawg/KevBot/commit/3a8e41b868ca1ed8629db86115f1875ef3755318))
* **api:** typescript conversion continued ([9e3c6de](https://github.com/Kunedawg/KevBot/commit/9e3c6de9d12931b0ac78fcbe7f1a8f7062df3d31))
* **api:** typescript conversion continued ([9e79eb3](https://github.com/Kunedawg/KevBot/commit/9e79eb35b032322136b47ac47efdfa83528991d1))
* **api:** typescript conversion continued ([e437250](https://github.com/Kunedawg/KevBot/commit/e437250cb93e9ae1e82e6537b8392d29f51da525))
* **api:** typescript conversion continued ([8208028](https://github.com/Kunedawg/KevBot/commit/82080288cc51cddeff62db298b960aacaa3e2d56))
* **api:** typescript conversion continued ([dcd0752](https://github.com/Kunedawg/KevBot/commit/dcd07527488df25f18bc38924528e60d58f88894))
* **api:** typescript conversion continued ([a6907a7](https://github.com/Kunedawg/KevBot/commit/a6907a781f259925dfa65c36cea18f6104ca386a))
* **api:** updated to support latest db tables ([98707dd](https://github.com/Kunedawg/KevBot/commit/98707dd727f96c30240c0881a86692e8b28ed590))
* **ci:** add ci workflow ([9065c65](https://github.com/Kunedawg/KevBot/commit/9065c651bbe0f474db05d4802bd38f9ae3077a82))
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
* **frontend:** initial version ([#121](https://github.com/Kunedawg/KevBot/issues/121)) ([1a7ad9c](https://github.com/Kunedawg/KevBot/commit/1a7ad9c622f87ccd4a2d58c08bf1ded69fc37949))
* improvements to release process ([88dc083](https://github.com/Kunedawg/KevBot/commit/88dc0835baa8a08d92b3947c70687eda006e6d31))
* **project:** major ci and documentation updates ([#122](https://github.com/Kunedawg/KevBot/issues/122)) ([d4b4359](https://github.com/Kunedawg/KevBot/commit/d4b43599fc6aa8826237611cec6e4d5918493c20))
* **tools:** Add automatic schema versioning ([2fa427e](https://github.com/Kunedawg/KevBot/commit/2fa427ed24932c6658287ad969f28d3a02c7ac36))
* **tools:** add base64 support for gcp json ([2e9e601](https://github.com/Kunedawg/KevBot/commit/2e9e6017c9ac498ae6e68ef4757b16ae5eb26424))
* **tools:** add deploy-service.yml ([a9a0a60](https://github.com/Kunedawg/KevBot/commit/a9a0a60c350a769a4acf267c11fbd8ad9d882fe7))
* **tools:** add droplet provisioning workflow ([92a8a33](https://github.com/Kunedawg/KevBot/commit/92a8a339d615db87642b3d2d729bf92bb184198c))
* **tools:** add error checks to migration_manager ([53ef29d](https://github.com/Kunedawg/KevBot/commit/53ef29db658afbf50471e3cb2df1118813ae3f14))
* **tools:** add migrate-database.yml and more... ([90c0618](https://github.com/Kunedawg/KevBot/commit/90c0618bc8981f1da2d1947a3930579d9fc3d5e5))
* **tools:** add new actions ([7a46c5f](https://github.com/Kunedawg/KevBot/commit/7a46c5fd554eb74044e388bf16b9bafca7eedf60))
* **tools:** add new commit filter helper ([5f81300](https://github.com/Kunedawg/KevBot/commit/5f81300c6543e003ebec332c1e93b1d59c512d3a))
* **tools:** Add script for requirements ([1138374](https://github.com/Kunedawg/KevBot/commit/11383741faa9c6d4cd5b0c81725c3cf2259d2b9e))
* **tools:** Add single exe docker for migration ([0d8f676](https://github.com/Kunedawg/KevBot/commit/0d8f676723d60a921463e5ac55fd7d8559c4950d))
* **tools:** added default version for migration ([094fbc2](https://github.com/Kunedawg/KevBot/commit/094fbc22cb455086bbd854f7cb1d7e1142b31709))
* **tools:** migration workflow update ([f6c9c8c](https://github.com/Kunedawg/KevBot/commit/f6c9c8c05e6d43b96ae5e67d5930645580cec846))
* **tools:** simplified Dockerfile ([84ddbf9](https://github.com/Kunedawg/KevBot/commit/84ddbf97b7782ddcb0ab1e35f0a9001808236012))
* **tools:** stop and reset services workflows ([bb00b6e](https://github.com/Kunedawg/KevBot/commit/bb00b6e964d5db6f8f7b8a53bd8e042a60a355d6))
* **tools:** update migration manager Dockerfile ([395326d](https://github.com/Kunedawg/KevBot/commit/395326dc02d4e63aee79b62413aed0ce494a8eb4))
* **tools:** update migration_manager env_vars ([142d622](https://github.com/Kunedawg/KevBot/commit/142d622928e380a22d99cec8d8dc7dbfda0c04df))
* **tools:** Updates to rename_to_id ([aa91d24](https://github.com/Kunedawg/KevBot/commit/aa91d24d91279649ddaa30032869ca56fc371f8e))
* **tools:** updates to workflows ([d7ea3b1](https://github.com/Kunedawg/KevBot/commit/d7ea3b11803b41957acc7a2f656aee9a1773fdd0))


### Bug Fixes

* **api:** fix play_count bug ([b846bc7](https://github.com/Kunedawg/KevBot/commit/b846bc7b6a2b2e5d7bf331fcf511238a973c3312))
* **api:** fix to playlistsService ([fb2a7d4](https://github.com/Kunedawg/KevBot/commit/fb2a7d405396aed4d10bdc473df1ab9b5d229cf6))
* **api:** fix unexpected error with invalid ids ([2598147](https://github.com/Kunedawg/KevBot/commit/2598147cbe590493468b4648250c2c8c8e33aa2b))
* **api:** fix unexpected error with invalid ids ([c8c0f5b](https://github.com/Kunedawg/KevBot/commit/c8c0f5bc4de1a135ddc49807db6d5ff30f0fd8e5))
* **api:** increase timeout for problematic test ([1f01f6a](https://github.com/Kunedawg/KevBot/commit/1f01f6a0e58e8c5e92a5643af78f529a6ab3cd0a))
* **api:** tracks bugs ([7e70821](https://github.com/Kunedawg/KevBot/commit/7e70821b58d053de9f861f392264b69ef5de5535))
* **api:** tracks bugs ([570501a](https://github.com/Kunedawg/KevBot/commit/570501a9bf01e25148d935cca65eabfdd7616904))
* **db:** removed rename supplemental script ([2a539af](https://github.com/Kunedawg/KevBot/commit/2a539af3d066f2a0fa4d065c5195108bdd39cdf1))
* **db:** small fix to 2.1.0 change script ([7ebd437](https://github.com/Kunedawg/KevBot/commit/7ebd437c05e81c2d9377e48740b00fe01d8efa7f))
* **repo:** ci fix for commit linting ([be7e805](https://github.com/Kunedawg/KevBot/commit/be7e8050ffe8393363a62dbbdcfdaaba288df527))
* **tools:** .env file fix to services ([189d11e](https://github.com/Kunedawg/KevBot/commit/189d11eb790e7990615d4834a791c2b50e3583e8))
* **tools:** actual fix to .env file for stop-serv ([9e0e9c0](https://github.com/Kunedawg/KevBot/commit/9e0e9c0cad1e149f29ea75532c544b002eb48274))
* **tools:** add -y flag to provision workflow ([ee3e7f0](https://github.com/Kunedawg/KevBot/commit/ee3e7f01f6aaf9ed9ce6de9b4c0a8394a88e8f2a))
* **tools:** add .env file for workflow compose ([6d4fe49](https://github.com/Kunedawg/KevBot/commit/6d4fe499282473bd0489f91dd7b97773cef5776e))
* **tools:** added environment back to workflows ([c1b4113](https://github.com/Kunedawg/KevBot/commit/c1b4113f28acba775bc80706276a2ee501115fbc))
* **tools:** allow baseline version to be targeted ([#117](https://github.com/Kunedawg/KevBot/issues/117)) ([3c6e395](https://github.com/Kunedawg/KevBot/commit/3c6e395bc36c08b49d95c984f699d758e0fe437c))
* **tools:** docker stop command sub fix ([6896e4c](https://github.com/Kunedawg/KevBot/commit/6896e4c6f1852540806dd07c2e8024b28c2050a2))
* **tools:** fix env file argument flag bug ([1f5e488](https://github.com/Kunedawg/KevBot/commit/1f5e488a5809c2409d62ffc3925ddf4d8e44ca1a))
* **tools:** fix path to repo after checkout ([c3421e6](https://github.com/Kunedawg/KevBot/commit/c3421e649f4b6439e1311476bdef4ecad57a06bd))
* **tools:** fix to env step of migrate-database ([b479141](https://github.com/Kunedawg/KevBot/commit/b4791418e1c1adc6ac665a103958f6b2d2d7f900))
* **tools:** fixed env vars needed by rename_to_id ([75645d2](https://github.com/Kunedawg/KevBot/commit/75645d21d92c779ef24441476033ef0ff95f3cc6))
* **tools:** handling up multiline env var for ssh ([97eaa2f](https://github.com/Kunedawg/KevBot/commit/97eaa2f564d361a5ce41b3b0499ba03cc148f9a9))
* **tools:** migrate-database workflow ([cb0d8b9](https://github.com/Kunedawg/KevBot/commit/cb0d8b9c25c6f21e6437db2d3fb7ccbf93245385))
* **tools:** small fix to deploy-service.yml ([f7558a2](https://github.com/Kunedawg/KevBot/commit/f7558a2053eaaf74a976d4adfb6fde0bd11be389))
* **tools:** small fix to migrate-database ([e0ac235](https://github.com/Kunedawg/KevBot/commit/e0ac235397f983b08fe3aa9f99e43cbf6ce89d1b))
* **tools:** small fix to migrate-database.yml ([8f6da03](https://github.com/Kunedawg/KevBot/commit/8f6da03f9bdca9bfb17583c9865bdf5a0f4de1c0))
* **tools:** small typo fix in workflow ([b109655](https://github.com/Kunedawg/KevBot/commit/b109655a6c2d7a4084d169b2f8c7aacf7370c663))
* **tools:** typo fix in gcloud migration workflow ([460552d](https://github.com/Kunedawg/KevBot/commit/460552de8f0058c95986996192c8a6968f7521f4))
* **tools:** updated reset-service-environment ([ea12d1c](https://github.com/Kunedawg/KevBot/commit/ea12d1c13cbeb1641ebc72a5f82f2ed077c81b7d))

## [2.0.0-beta.1] (2025-10-10)

### Infrastructure

- Initial release-please setup for monorepo with 6 components (kevbot, api, db, frontend, tools, gcloud)
- Made commit scopes optional in conventional commits
- Configured skip-github-release for all components (manual releases via RELEASE_NOTES.md)
- Added root-level version tracking with VERSION.txt
- Set kevbot to prerelease (beta) mode - v2 is the complete rewrite

### Historical Context

This repo represents v2 of KevBot - a complete rewrite from the original Discord bot (v1.0.0 - v1.2.0) to a modern web-based music platform. The v2 beta reflects that this is active development of the new architecture. Historical Discord bot releases are documented in [RELEASE_NOTES.md](RELEASE_NOTES.md).
