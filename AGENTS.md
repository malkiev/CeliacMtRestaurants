# Repository Guidelines

## Project Structure & Module Organization

This repository is currently in the planning stage for a mobile-first Maltese coeliac community directory.

- `PLAN.md` contains the draft scope, architecture options, migration approach, and unresolved decisions. Treat proposed technologies as provisional.
- `README.md` is currently empty; populate it with setup instructions when implementation begins.
- No application source, tests, assets, or dependency manifests exist yet. Document their actual locations when scaffolding the application.

## Build, Test, and Development Commands

No build, development server, or automated test commands are configured. Do not assume `npm test` or `npm run dev` works.

Current repository checks:

- `git status --short`: inspect pending changes.
- `git diff --check`: detect whitespace errors in tracked changes; review newly created files separately.
- `git diff`: review tracked edits before committing.

When adding tooling, document installation, local development, build, lint, and test commands in `README.md`, and commit the package manager's lockfile.

## Coding Style & Naming Conventions

Use UTF-8, descriptive names, and focused modules. Preserve Maltese characters in place names and locality data. Use Markdown headings, short paragraphs, and relative links for repository documentation.

No formatter, linter, or code indentation convention is established. Configure these with the initial application scaffold; follow the chosen formatter consistently. Keep environment-specific configuration outside application logic.

## Testing Guidelines

No testing framework or coverage threshold exists yet. Document the selected framework and test naming convention when introducing executable code.

Prioritise behavioural tests for role enforcement, admin-only CAM verification, moderation visibility, review averages, and spreadsheet import deduplication. Include mobile checks for denied geolocation, missing data, and PWA installation. Describe relevant validation and any untested behaviour in each pull request.

## Commit & Pull Request Guidelines

Git history contains only `first commit`, so no established message convention exists. Use concise imperative subjects, such as `Add locality filter`, and keep commits focused.

Pull requests should explain the problem, resulting behaviour, and validation performed. Link relevant issues and include mobile screenshots for UI changes. Document schema, configuration, and hosting-cost implications when applicable.

## Data & Security

Never commit credentials, private community exports, or personal account data. Use placeholder values in configuration examples. Enforce permissions in the backend; only admins may change CAM verification. Preserve imported feedback provenance and never invent ratings, authors, or verification dates.
