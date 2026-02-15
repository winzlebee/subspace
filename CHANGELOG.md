# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]


## [0.6.2] - 2026-02-15

- Fix mobile web view formatting
- Add android apk build guide


## [0.6.1] - 2026-02-15

- Add version number display for client and server to user settings UI
- Add API endpoint for server version
- Update README with more complete local dev setup instructions


## [0.6.0] - 2026-02-15

### Fixed

- Fix database persistence in Docker deployments by using DATABASE_URL environment variable
- Fix port configuration inconsistencies (server now consistently uses port 3001)
- Remove unused PORT environment variable from Dockerfile

### Changed

- Update Dockerfile to use correct working directory and volume paths
- Add UPLOAD_DIR environment variable for configurable upload directory
- Clean up docker-compose files to remove unused port 8080 mapping

### Documentation

- Fix nginx reverse proxy configuration to use correct port 3001
- Add comprehensive environment variables documentation
- Add data persistence section explaining Docker volume usage
- Add Portainer stack deployment instructions
- Remove documentation for non-existent config.toml and LetMeIn features


## [0.5.9] (Client only) - 2026-02-15

- Fix join server not refreshing the server list
- Fix join server not setting the current server
- Fix padding on phone so voice controls are visible

## [0.5.8] (Client only) - 2026-02-15

- Cleanup server settings modal
- Add audio settings page to user
- Add extra WebRTC logging

## [0.5.5] - 2026-02-14

- Fix TURN using wrong username

## [0.5.4] - 2026-02-14

- Fix client-side TURN handling

## [0.5.3] - 2026-02-14

- Allow setting a custom TURN server URI via the TURN_URL environment variable

## [0.5.2] (Client only) - 2026-02-14

- Fixup reactions

## [0.5.1] (Client only) - 2026-02-14

- Add emoji keyboard
- Emoji-only messages render larger than regular messages

## [0.5.0] (Client only) - 2026-02-14

- Fix message pinning (done by me as claude can't figure it out)

## [0.4.7] (Client only) - 2026-02-14

- Add 'Login Again' on a 404 error when a token for a server in local storage is no longer valid
- Remove redundant second 'Join Server' button
- Remove the 'Home' button that does nothing for now. Later we can add a DM feature that will use this

## [0.4.5] - 2026-02-14

- Add mandatory TURN server for WebRTC connection
    - This is required for voice chat to work
    - The TURN server is always provided by the same instance as the subspace server
    - This means that if you're hosting your own subspace server, you'll need to host your own TURN server as well

## [0.4.4] - 2026-02-14

- Voice chat should now work

## [0.4.2] - 2026-02-13

- Screenshare and video support

## [0.4.1] - 2026-02-13

- Fix voice chat not working
- Show users as they join the server

## [0.4.0] - 2026-02-12

- Fix joining servers with a UUID
- Fix pinning and reacting to messages
- Fix editing messages
- Fix deleting messages
- Add a sidebar for pinned messages

## [0.3.6] - 2026-02-12

- Fix leaving an instance

## [0.3.5] - 2026-02-12

- Fix broken titlebar
- Fix uploaded images not loading in the client

## [0.3.3] - 2026-02-12

- Fix broken titlebar

## [0.3.1] - 2026-02-12

- Fixed the CI/CD pipeline for building and releasing
- Fixed the base path for the GitHub Pages deployment

## [0.2.4] - 2026-02-12

### Added

- Configurable server URL setup screen
- "Change Server" button on login screen

## [0.2.3] - 2026-02-12

### Improved

- Added pins
- Added @mentions
- Added speaking detection
- Cleaned up build files
- Fixed UI bug with muted users
- Voice chat display and controls

## [0.2.2] - 2026-02-11

### Changed

- Version bump for release pipeline fixes

## [0.2.1] - 2026-02-11

### Changed

- Added Rust build caches to CI workflows

## [0.2.0] - 2026-02-11

### Added

- Initial release with working server and Tauri desktop client
- User registration and authentication
- Real-time messaging via WebSocket
- File uploading support
- Native custom titlebar
- CI/CD pipeline for building and releasing
