# Release Process Implementation Summary

This document summarizes the release process setup completed for the KevBot repository.

TODO: update docs to allow rebase merging

TODO: update docs to make say that github releases are okay, but they will be manually deleted

TODO: Make sure db versions are released as separate releases. Prefer just putting multiple changes together instead of having so many migration scripts

## What Was Implemented

### ✅ 1. Fixed Commit Linting Strategy

**File**: `.github/workflows/lint-commit.yml`

**Change**: Removed `pull_request` trigger, now only runs on pushes to `main`

**Why**: With squash merge strategy, individual commits in PRs are discarded. Only PR titles (which become the final commit) need to follow conventional commits format. This eliminates the pain of enforcing format on WIP commits.

### ✅ 2. Created Release-Please Automation

**Files Created**:

- `.github/workflows/release-please.yml` - Workflow that runs on every push to main
- `.github/release-please-config.json` - Configuration for monorepo with 6 components
- `.github/.release-please-manifest.json` - Current version tracking

**Components Configured**:

- `v2.0.0-beta.1` - Overall app version (prerelease beta, no component prefix)
- `api-v2.0.0` - Node.js package
- `db-v1.0.0` - Simple release with VERSION.txt
- `frontend-v0.1.0` - Node.js package
- `tools-v1.0.0` - Simple release with VERSION.txt
- `gcloud-v1.0.0` - Simple release with VERSION.txt

**All components use `skip-github-release: true`** - GitHub Releases are created manually via RELEASE_NOTES.md

**App-level is in prerelease (beta) mode** - reflecting v2 active development

**Behavior**:

- Automatically creates/updates Release PRs when conventional commits are merged
- Generates CHANGELOGs for each component
- Bumps versions based on commit types (feat→minor, fix→patch, BREAKING→major)
- Creates git tags when Release PR is merged (e.g., `api-v2.1.0`)
- Does NOT create GitHub Releases automatically

### ✅ 3. Added Version Files

**Files Created**:

- `VERSION.txt` - Root-level version set to 1.0.0
- `tools/VERSION.txt` - Set to 1.0.0
- `gcloud/VERSION.txt` - Set to 1.0.0

**Files Updated**:

- `api/package.json` - Version updated to 2.0.0 (matching git tag)
- `db/VERSION.txt` - Changed from "next" to 1.0.0
- `CHANGELOG.md` - Initialized with proper structure and component links

### ✅ 4. Rewrote CONTRIBUTING.md

**Location**: `/CONTRIBUTING.md`

**Key Sections**:

- Quick start guide with Docker commands
- Clear explanation of WIP commits being acceptable
- Detailed PR title guidelines with examples (scopes now optional)
- Explanation of release process with release-please
- Project structure overview
- Component-specific development guidelines

**Emphasis**: Only PR titles need conventional commits format, not individual commits!
**Updated**: Scopes are now optional - use for component-specific changes, omit for cross-cutting changes

### ✅ 5. Updated RELEASE_NOTES.md

**Location**: `/RELEASE_NOTES.md`

**Purpose**: User-facing highlights for coordinated releases

**Changes**:

- Added clear documentation of purpose (user-facing vs technical)
- Kept historical releases (v1.0.0 - v1.2.0)
- Added explanation of component versioning
- Added links to technical CHANGELOGs
- Ready for future coordinated release notes

### ✅ 6. Enhanced README.md

**Location**: `/README.md`

**New Sections**:

- Project overview and component descriptions
- Quick start instructions
- Project structure visualization
- **Versioning & Releases section** with:
  - Component version tracking
  - Release process explanation
  - Links to documentation
- Development guidelines
- Example PR titles
- Testing instructions
- Architecture references

### ✅ 7. Cleaned Up Documentation

**Deleted**: `CONTRIBUTING_OLD.md` - No longer needed with new CONTRIBUTING.md

### ✅ 8. Documented GitHub Settings

**File**: `.github/REPOSITORY_SETTINGS.md`

**Contents**:

- Step-by-step instructions for configuring branch protection
- Merge settings (squash-only configuration)
- Actions permissions for release-please
- Verification checklist
- Testing instructions
- Troubleshooting guide
- Optional enhancements (PR templates, CODEOWNERS)

## What You Need to Do Next

### 🔧 Required: Configure GitHub Repository Settings

Follow the instructions in `.github/REPOSITORY_SETTINGS.md`:

1. **Enable squash merge only**:

   - Go to Settings → General → Pull Requests
   - Uncheck "Allow merge commits"
   - Uncheck "Allow rebase merging"
   - Check "Allow squash merging"
   - Set default to "Pull request title"

2. **Configure branch protection for main**:

   - Go to Settings → Branches → Add rule for `main`
   - Require pull requests
   - Require status checks: `pr-lint`, `run_api_tests`
   - Enable automatic branch deletion

3. **Set Actions permissions**:
   - Go to Settings → Actions → General
   - Enable "Read and write permissions"
   - Allow GitHub Actions to create and approve pull requests

### 🧪 Testing the Setup

1. **Create a test branch**:

   ```bash
   git checkout -b test/release-process
   echo "Testing release process" > test-file.txt
   git add test-file.txt
   git commit -m "wip: testing"
   git push origin test/release-process
   ```

2. **Open a PR** with title: `chore: test release process setup` (no scope needed for cross-cutting changes)

3. **Verify**:

   - ✅ PR title linting passes (conventional commits check)
   - ✅ Commit linting does NOT run on your branch commits
   - ✅ Only squash merge button is available
   - ✅ After merge, check git log - should show one commit with PR title

4. **Check release-please**:
   - After merging, release-please should create a PR updating CHANGELOGs
   - Review the Release PR (don't merge yet unless you want to actually release)

## How the New Workflow Works

### For Developers

1. **Create feature branch**: `feat/my-feature` or `fix/my-bug`

2. **Code freely**: Make WIP commits, they don't need conventional format

   ```bash
   git commit -m "wip"
   git commit -m "trying something"
   git commit -m "fix typo"
   ```

3. **Open PR**: Title MUST follow conventional commits (scopes now optional)

   ```
   feat(api): add streaming endpoint        # Component-specific
   fix(frontend): resolve player issue      # Component-specific
   chore: update docker compose             # Cross-cutting, no scope
   ci: add automated backups                # Infrastructure, no scope
   ```

4. **Merge**: Always squash merge (automatic if settings configured correctly)

### For Releases

1. **Automatic**: After PR merge, release-please creates/updates Release PR

2. **Review**: Check auto-generated CHANGELOGs and version bumps

3. **Merge Release PR**: Publishes releases, creates tags, triggers deploys

4. **Optional**: For major coordinated releases, manually update `RELEASE_NOTES.md`

## File Changes Summary

### Files Created

- `.github/workflows/release-please.yml`
- `.github/release-please-config.json`
- `.github/.release-please-manifest.json`
- `.github/REPOSITORY_SETTINGS.md`
- `.github/RELEASE_PROCESS_IMPLEMENTATION.md` (this file)
- `VERSION.txt` - Root-level version tracking
- `tools/VERSION.txt`
- `gcloud/VERSION.txt`

### Files Modified

- `.github/workflows/lint-commit.yml` - Removed pull_request trigger
- `CONTRIBUTING.md` - Complete rewrite, scopes now optional
- `RELEASE_NOTES.md` - Updated with new purpose
- `README.md` - Added versioning section
- `api/package.json` - Version updated to 2.0.0
- `db/VERSION.txt` - Changed to 1.0.0
- `CHANGELOG.md` - Initialized with proper structure
- `commitlint.config.js` - Made scopes optional, removed "project" scope

### Files Deleted

- `CONTRIBUTING_OLD.md` - Obsolete

## Benefits of This Setup

✅ **No more WIP commit pain**: Branch commits can be anything

✅ **Clean git history**: Squash merge creates one commit per PR

✅ **Automated changelogs**: Generated from PR titles

✅ **Independent versioning**: Components release separately

✅ **Flexible releases**: Merge Release PRs when ready

✅ **Low cognitive load**: Only think about format when writing PR title

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

## Questions or Issues?

- Check `.github/REPOSITORY_SETTINGS.md` for configuration help
- Review `CONTRIBUTING.md` for workflow details
- Test with a draft PR to verify settings
