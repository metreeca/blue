# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/blue/compare/v0.9.1...HEAD)

### Added

- Accept plain string and string array shorthands for language-tagged Local/Locals values, normalising them to the
  `und` (Undetermined) language tag

### Removed

- Remove `validate()` patch mode (`mode: "patch"`) and `validatePatch()` following upstream removal from @metreeca/qest

### Fixed

- Enforce inherited constraints conjunctively when a property is overridden in a derived shape

## [0.9.1](https://github.com/metreeca/blue/releases/tag/v0.9.1)

Initial release.
