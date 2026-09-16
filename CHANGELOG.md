# Changelog

This project began as a fork of [paweb88/zha-z2m](https://github.com/paweb88/zha-z2m)
by Paweł Galerczyk, which provided the original ZHA -> Z2M conversion logic:
parsing ZHA's SQLite backup, generating a Zigbee2MQTT YAML config from it,
and appending devices into Zigbee2MQTT's `database.db`. Everything below is
what's changed since that starting point.

## Migration & correctness fixes

- Auto-detect ZHA's SQLite schema version (`devices_v12`, `_v13`, `_v15`, ...)
  instead of hardcoding `_v13`, since Home Assistant has bumped it more than
  once - the original hardcoded version fails outright against current
  Home Assistant installs.
- Disambiguate device `friendly_name`s using their Home Assistant room: HA
  only requires a device name to be unique per room, but Zigbee2MQTT
  requires it unique network-wide. Devices sharing a name across rooms
  (e.g. two lamps both named "Lamp 2" in different rooms) now get the room
  appended (`Lamp 2 (Kitchen)`), avoiding a startup failure that the
  original tool didn't handle.
- Merge the generated network settings and device list into an existing
  `configuration.yaml`, instead of only ever emitting a fragment that has
  to be pasted in by hand.
- Generate a zigbee-herdsman-compatible `coordinator_backup.json` (marked
  optional and untested in the UI/README) - this required reverse-engineering
  zigbee-herdsman's actual `UnifiedBackupStorage` format from its source,
  since ZHA's own backup format uses the same format name but a different
  field layout.

## Tooling & project structure

- Migrated the build from webpack + `ts-loader` + `live-server` to
  [Vite](https://vite.dev/) for both building and local dev serving.
- Removed the `buffer`/`crypto-browserify`/`path-browserify`/
  `stream-browserify`/`vm-browserify` polyfills entirely - leftover webpack
  workarounds for an sql.js entry point that isn't used anymore. Removing
  them took `npm audit` to zero known vulnerabilities.
- Separated build output into `dist/` (gitignored, regenerated), keeping
  `index.html`/`src/` as pure hand-authored source.
- Removed dead, pre-webpack compiled files (`public/js/main.js`,
  `public/js/types.js`) and stopped committing build artifacts
  (`bundle.js`, `sql-wasm.wasm`) that `npm run build` regenerates.
- Switched the GitHub Pages deploy from a third-party action pushing to a
  `gh-pages` branch to GitHub's own official Pages Actions workflow
  (`configure-pages` / `upload-pages-artifact` / `deploy-pages`).
- Bumped CI to Node 24.x and updated dependencies within their existing
  semver ranges.
- Added `LICENSE` (the original repo declared MIT in `package.json` but
  never shipped a license file) and this changelog.

## UI & documentation

- Translated the entire tool (interface text and code comments) from
  Polish to English.
- Redesigned the UI as a step-by-step wizard, with each file input naming
  its exact source (e.g. "this is `zigbee.db`, found at
  `homeassistant/data/zigbee.db`") instead of a generic label.
- Documented exactly where to find each required file in a Home Assistant
  backup, and the Home Assistant **File editor** add-on as an alternative
  that avoids needing a full backup export.
- Added a comprehensive `README.md` (the original had none).
