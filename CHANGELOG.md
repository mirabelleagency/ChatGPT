# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2025-11-08
### Added
- Introduced a Vite-based React build pipeline with hot module reloading for local development.
- Added an Express server scaffold to expose API routes and serve the production bundle.
- Documented development, build, and production workflows in the README.

### Changed
- Promoted the runtime version constant to an ES module and bumped the displayed version to `1.2.0`.

## [1.1.0] - 2025-11-08
### Added
- Introduced an explicit `version.js` file and surfaced the application version badge in the UI.
- Started a changelog to capture future updates.

### Changed
- Documented the release process and versioning expectations in the README.

## [1.0.0] - 2025-11-08
### Added
- Rebuilt the planner UI with React components rendered via Babel in the browser.
- Retained scheduling logic including dependencies, auto-scheduling, and critical path analysis.
- Provided responsive styling and documentation for the standalone setup.
