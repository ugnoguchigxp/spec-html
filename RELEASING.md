# Releasing

English | [日本語](./RELEASING.ja.md)

This document describes the maintainer workflow for publishing Spec HTML to npm. A release must come from a reviewed, clean commit on the default branch.

## Registry preflight

Confirm immediately before every release that the target version is not present on the npm registry:

```bash
npm view spec-html@<version> version
```

The expected result is `E404`. If the version exists, select a new version and restart the release checks. Publication must be performed interactively by an npm account owner with two-factor authentication enabled. Do not add an npm token to the repository.

Keep publication as a local, deliberate maintainer action. CI verifies the package but does not publish it.

## Prepare the release

1. Confirm that the English and Japanese documentation agree on commands, requirements, security constraints, and supported features.
2. Update `CHANGELOG.md`. Replace `Unreleased` with the release date.
3. Select the version according to Semantic Versioning and run `npm version <major|minor|patch> --no-git-tag-version`.
4. Run the complete verification suite:

   ```bash
   npm ci
   npx playwright install chromium firefox webkit
   npm run check
   ```

5. Inspect the exact package contents and metadata:

   ```bash
   npm pack --dry-run
   npm publish --dry-run
   ```

6. Commit the version and changelog changes, obtain review, and merge them to the default branch.
7. Check out the reviewed release commit in a clean worktree and run the release consistency gate:

   ```bash
   npm ci
   npm run release:check
   ```

## Publish

After every required GitHub Actions job passes for the release commit, publish interactively:

```bash
npm publish
```

Create the matching signed `vX.Y.Z` Git tag and GitHub release only after npm reports a successful publication. Use the changelog entry as the release notes.

## Verify

Verify the registry metadata and install the released version in a clean temporary project:

```bash
npm view spec-html version dist-tags repository
npm install --save-dev spec-html@<version>
npx --no-install spec-html --version
```

If verification fails, stop and investigate. Do not overwrite an existing npm version; publish a corrected patch release when necessary.
