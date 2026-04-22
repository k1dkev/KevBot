# api changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0](https://github.com/k1dkev/KevBot/compare/api-v2.2.0...api-v2.3.0) (2026-04-22)


### Features

* unified search ([#135](https://github.com/k1dkev/KevBot/issues/135)) ([94bac59](https://github.com/k1dkev/KevBot/commit/94bac5930e63ae180f309be35689394a7183c93e))

## [2.2.0](https://github.com/Kunedawg/KevBot/compare/api-v2.1.0...api-v2.2.0) (2025-12-31)


### Features

* **api:** discord auth ([5973de6](https://github.com/Kunedawg/KevBot/commit/5973de65f16e1a7bcb719c31458d1efaa0b84460))

## [2.1.0](https://github.com/Kunedawg/KevBot/compare/api-v2.0.0...api-v2.1.0) (2025-10-10)


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
* **db:** add play count tables ([1ed3ba9](https://github.com/Kunedawg/KevBot/commit/1ed3ba96d7c53fcc840c626e6ffe8b36a06dcd0b))


### Bug Fixes

* **api:** fix play_count bug ([b846bc7](https://github.com/Kunedawg/KevBot/commit/b846bc7b6a2b2e5d7bf331fcf511238a973c3312))
* **api:** fix to playlistsService ([fb2a7d4](https://github.com/Kunedawg/KevBot/commit/fb2a7d405396aed4d10bdc473df1ab9b5d229cf6))
* **api:** fix unexpected error with invalid ids ([2598147](https://github.com/Kunedawg/KevBot/commit/2598147cbe590493468b4648250c2c8c8e33aa2b))
* **api:** fix unexpected error with invalid ids ([c8c0f5b](https://github.com/Kunedawg/KevBot/commit/c8c0f5bc4de1a135ddc49807db6d5ff30f0fd8e5))
* **api:** increase timeout for problematic test ([1f01f6a](https://github.com/Kunedawg/KevBot/commit/1f01f6a0e58e8c5e92a5643af78f529a6ab3cd0a))
* **api:** tracks bugs ([7e70821](https://github.com/Kunedawg/KevBot/commit/7e70821b58d053de9f861f392264b69ef5de5535))
* **api:** tracks bugs ([570501a](https://github.com/Kunedawg/KevBot/commit/570501a9bf01e25148d935cca65eabfdd7616904))

## [api@v2.0.0]

### Added

- Added key API resources
  - `/users`
  - `/tracks`
    - upload, download, and streaming is supported
  - `/playlists`
  - `/plays`
  - `/auth`
  - `/docs`
- Implemented JWT authentication
- Implemented integration tests for all endpoints
- Created Open API spec
