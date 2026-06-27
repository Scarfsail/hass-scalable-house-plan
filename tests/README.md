# End-to-end tests (Playwright)

These tests drive a real, locally running Home Assistant instance that has this
custom frontend integration installed, and exercise the `scalable-house-plan`
card editor.

## Setup

1. Make sure Home Assistant is running locally (default `http://localhost:8123/`).
2. Copy `.env.example` to `.env` and fill in admin credentials:

   ```
   HASS_URL=http://localhost:8123/
   HASS_USERNAME=your-admin-user
   HASS_PASSWORD=your-password
   ```

   `.env` is git-ignored and must never be committed.

3. Install browsers once (already done if `npx playwright install chromium` ran):

   ```
   npx playwright install chromium
   ```

## Running

```
npm test            # headless
npm run test:headed # see the browser
npm run test:ui     # Playwright UI mode
npm run test:report # open the last HTML report
```

## How it works

- The **`setup`** project (`tests/setup/auth.setup.ts`) logs in through the HA
  login form, saves the auth state to `tests/.auth/state.json`, and provisions a
  dedicated **panel-mode** dashboard (`/shp-e2e-test`) containing a single
  `custom:scalable-house-plan` card. The dashboard is created via the HA
  websocket API (`lovelace/dashboards/create` + `lovelace/config/save`) and its
  config is reset to a clean, room-less state on every run.
- The **`chromium`** project reuses that auth state and runs the specs.
- `tests/helpers/ha.ts` contains reusable steps: `login`, `openTestDashboard`,
  `enterDashboardEditMode` (calls `lovelace.setEditMode(true)`), and
  `openCardEditor` (clicks the card's "Upravit" button to open the editor
  dialog).

## Tests

- `tests/editor.spec.ts` — card editor:
  - **adds the first room** — opens the editor and clicks "Přidat místnost",
    asserting the room count and a room editor row appear.

> Note: the running HA instance is in Czech, so UI assertions use Czech labels
> ("Upravit", "Přidat místnost", "Místnosti - N").
