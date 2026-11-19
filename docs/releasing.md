# Releasing Upstart

A tag `vX.Y.Z` on `main` builds and publishes a release (`.github/workflows/release.yml`):

- macOS, Apple silicon: a `.dmg` to download and a `.zip` the app updates itself from, signed with the Developer ID Application certificate and notarized by Apple;
- Windows, x64, beta: an NSIS installer, unsigned (Q365);
- `latest-mac.yml` and `latest.yml`, which the app reads to update itself.

The two builds attach their files to a draft release; once both are there the release is published, with `docs/releases/X.Y.Z.md` as its notes. A tag with a dash (`v0.2.0-rc.1`) is a pre-release: the app does not offer it as an update to a stable version.

## Each release

1. Set the version in `apps/desktop/package.json` (the tag must be `v` + that version: the workflow checks).
2. Write `docs/releases/X.Y.Z.md` (a pre-release uses the notes of its version, `X.Y.Z`, if they exist).
3. Commit, push, then tag and push the tag:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

4. Check the release page: the `.dmg`, the `.zip`, the `.exe`, `latest-mac.yml`, `latest.yml`.

## The repository's secrets, once

Settings → Secrets and variables → Actions → New repository secret. Nobody but the maintainer handles their values.

| Secret | What it is |
|---|---|
| `CSC_LINK` | The **Developer ID Application** certificate with its private key, exported from Keychain Access as a `.p12`, then encoded: `base64 -i certificate.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | The password chosen when exporting the `.p12` |
| `APPLE_API_KEY` | The content of an App Store Connect API key's `.p8` file (App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys, role Developer) |
| `APPLE_API_KEY_ID` | That key's ID |
| `APPLE_API_ISSUER` | The Issuer ID shown above the keys |

The certificate is created at developer.apple.com → Certificates → "+" → Developer ID Application (G2 Sub-CA), from a certificate signing request made in Keychain Access, then installed by double-clicking it. Keychain Access also needs Apple's "Developer ID - G2" intermediate certificate (from apple.com/certificateauthority) for a signature to build its chain.

## Building on a Mac

`pnpm --filter @upstart/desktop dist:mac` builds the signed `.dmg` and `.zip` locally with the Developer ID certificate in the keychain (`CSC_NAME` picks one when there are several), and notarizes them when `APPLE_API_KEY` (the `.p8` file's path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set. `pnpm --filter @upstart/desktop package` stays the unsigned app the checks use.

The official Claude binary inside the app keeps Anthropic's own signature (ADR 0002): the app's signing leaves it out (`signIgnore`).
