# Changelog

## [0.3.0](https://github.com/ArchProof/org-infra/compare/org-infra-v0.2.0...org-infra-v0.3.0) (2026-09-18)


### Features

* **catalog:** add maf-intro repository to the organization catalog ([#21](https://github.com/ArchProof/org-infra/issues/21)) ([dd5f9b6](https://github.com/ArchProof/org-infra/commit/dd5f9b6283254cce7f1b637afdd7aa7d141f7e5f))

## [0.2.0](https://github.com/ArchProof/org-infra/compare/org-infra-v0.1.0...org-infra-v0.2.0) (2026-09-18)


### Features

* **ci:** gate release automerge on gitops convergence ([#19](https://github.com/ArchProof/org-infra/issues/19)) ([bdd10f3](https://github.com/ArchProof/org-infra/commit/bdd10f38b0201d43dc9da8b4f8a0f7ed22a82ee6))
* **gitops:** add speculative PR plan preview ([#16](https://github.com/ArchProof/org-infra/issues/16)) ([0e50886](https://github.com/ArchProof/org-infra/commit/0e50886c6281a1f4ce48985b2da70f0ae07bf5d4))
* **gitops:** declare baseline imports for org-infra resources ([#9](https://github.com/ArchProof/org-infra/issues/9)) ([f04fdba](https://github.com/ArchProof/org-infra/commit/f04fdbaee6f3dfffcb61d0905a414139bed33ec5))
* **gitops:** implement two-stage plan and human-reviewed apply architecture ([#4](https://github.com/ArchProof/org-infra/issues/4)) ([2c73df0](https://github.com/ArchProof/org-infra/commit/2c73df079d259175552960142633af4845e68c3d))
* **gitops:** introduce release-please and milestone audit snapshot ([#14](https://github.com/ArchProof/org-infra/issues/14)) ([a5cafd1](https://github.com/ArchProof/org-infra/commit/a5cafd12817b3f15bb7c67da0ef23902d2cfff4a))
* **gitops:** mask state endpoint and bucket container using secret references ([#10](https://github.com/ArchProof/org-infra/issues/10)) ([37240b9](https://github.com/ArchProof/org-infra/commit/37240b97406a785cc094a41042d354effca8f0ce))
* **gitops:** modernize OpenTofu workflows with separated plan/apply … ([#2](https://github.com/ArchProof/org-infra/issues/2)) ([36d9bfc](https://github.com/ArchProof/org-infra/commit/36d9bfc3d8089edb71d0f4001577955ef47600c9))
* **gitops:** require speculative plan check before merge ([#17](https://github.com/ArchProof/org-infra/issues/17)) ([5332fa9](https://github.com/ArchProof/org-infra/commit/5332fa99ed1ece5b704cbfdf1acf0c685cedd6fd))


### Bug Fixes

* **gitops:** configure S3 backend flags and sanitize credentials ([#3](https://github.com/ArchProof/org-infra/issues/3)) ([194dfe5](https://github.com/ArchProof/org-infra/commit/194dfe5843b784efbe2a1e99a4f850529971c029))
* **gitops:** disable tofu_wrapper to preserve plan detailed-exitcode ([#5](https://github.com/ArchProof/org-infra/issues/5)) ([9463cda](https://github.com/ArchProof/org-infra/commit/9463cda3e002be64ba04cbc7f6d7e3622e24e0ff))
* **gitops:** ensure backend.json is generated in apply job ([#6](https://github.com/ArchProof/org-infra/issues/6)) ([1067741](https://github.com/ArchProof/org-infra/commit/106774182da469d4a33ada159ddce938ee8ce28e))
* **gitops:** export GITHUB_APP_ID and installation ID in apply job ([#7](https://github.com/ArchProof/org-infra/issues/7)) ([4f6d543](https://github.com/ArchProof/org-infra/commit/4f6d54302f5997258d8b72197a1b4b3525e81dfd))
* **gitops:** pin healthy state storage endpoint to bypass unhealthy ALB node ([#8](https://github.com/ArchProof/org-infra/issues/8)) ([5a647d5](https://github.com/ArchProof/org-infra/commit/5a647d54b323f49b69710cd1b4fd643e7d94fac6))


### Refactoring

* clean GitOps OpenTofu architecture and streamline CI validation ([#1](https://github.com/ArchProof/org-infra/issues/1)) ([d801563](https://github.com/ArchProof/org-infra/commit/d8015638a39d9604d75ed8f7c0c7d3b97bd62c28))
* **scripts:** use native GitHub CLI (gh) for secret synchronization ([#11](https://github.com/ArchProof/org-infra/issues/11)) ([2763207](https://github.com/ArchProof/org-infra/commit/2763207ffc432997e7642ddddb1530194fa31568))


### Chores & Maintenance

* **scripts:** remove sync-secrets.mjs in favor of native gh shell scripts ([#12](https://github.com/ArchProof/org-infra/issues/12)) ([626e12f](https://github.com/ArchProof/org-infra/commit/626e12fbc767494d424249be73b6a1a50c002b80))
