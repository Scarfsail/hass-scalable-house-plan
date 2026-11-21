# Development

The card is written in TypeScript with [Lit](https://lit.dev/) and bundled with [Vite](https://vite.dev/) into a single JavaScript module.

## Build

The code uses Home Assistant's frontend types, so clone [home-assistant/frontend](https://github.com/home-assistant/frontend) into `hass-frontend/` first (it is git-ignored).

```bash
git clone https://github.com/home-assistant/frontend hass-frontend
npm install
npm run build-prod   # dist/scalable-house-plan-prod.js, minified (the released file)
npm run build-dev    # dist/scalable-house-plan-dev.js, with a source map
npm run watch        # rebuilds the dev bundle on every change
```

To try a build, add `dist/scalable-house-plan-dev.js` as a dashboard resource of a development Home Assistant (for example by serving the repository from `config/www/`).

Releases are made by semantic-release on every push to `main`, from the commit messages (Angular convention: `feat:` makes a minor release, `fix:` a patch).

## End-to-end tests

The Playwright tests drive a real, running Home Assistant with the card installed:

1. Copy `.env.example` to `.env` and fill in the URL and an admin user's credentials (`.env` is git-ignored).
2. `npx playwright install chromium` once.
3. `npm test` (or `npm run test:headed`, `npm run test:ui`).

The `setup` project logs in and provisions a dedicated panel dashboard, `/shp-e2e-test`, over the websocket API; the tests then run against it. See `tests/README.md`.

## Regenerating the screenshots

Every picture in this manual is made by one command, from the files in `docs/demo/`:

```bash
npm run docs:screenshots
```

It needs the same `.env` and running Home Assistant as the tests. It provisions a `/shp-docs-demo` dashboard with `docs/demo/willow-lane.yaml` and, in the browser only:

- replaces the states, entities, devices, areas and floors Home Assistant sends with the invented ones in `docs/demo/willow-lane-states.json`, so nothing of the real house can appear,
- turns service calls into no-ops and answers history requests with no data,
- serves `willow-lane.jpg` and a placeholder camera frame from `docs/demo/`,
- shows the UI in English with the dark theme, without saving anything to the user's profile.

It writes 256-colour PNGs to `docs/assets/images/`, each a crop of the card or of its editor, never of the whole page. The script is `scripts/docs-screenshots.spec.ts`; it runs as the `docs` Playwright project, which `npm test` leaves out.

## The manual

The manual is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) from `docs/` and published to GitHub Pages by `.github/workflows/docs.yml`: pull requests check that it builds, pushes to `main` deploy it.

```bash
python3 -m venv .venv && .venv/bin/pip install -r docs/requirements.txt
.venv/bin/mkdocs serve      # live preview
.venv/bin/mkdocs build --strict
```

## Translations

UI texts live in `src/localize/translations/` (`en.json`, `cs.json`). The card uses Czech when Home Assistant's language is Czech and English otherwise. To add a language, add a JSON file with the same keys and register it in `src/localize/localize.ts`.
