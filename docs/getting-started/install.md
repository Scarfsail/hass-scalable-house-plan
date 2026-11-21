# Install

## Through HACS

The card is installed as a HACS custom repository:

1. Open **HACS**, then the **⋮** menu → **Custom repositories**.
2. Add `https://github.com/Scarfsail/hass-scalable-house-plan` with the type **Dashboard**.
3. Find **Scalable House Plan** in HACS, open it and select **Download**.
4. Reload the browser (hard refresh) when HACS asks you to.

HACS adds the card's file, `scalable-house-plan-prod.js`, as a dashboard resource for you.

## Manually

1. Download `scalable-house-plan-prod.js` from the [latest release](https://github.com/Scarfsail/hass-scalable-house-plan/releases/latest).
2. Copy it to `config/www/` on your Home Assistant.
3. In **Settings → Dashboards → ⋮ → Resources**, add `/local/scalable-house-plan-prod.js` as a **JavaScript module**.
4. Reload the browser.

## Check it works

Edit any dashboard, add a card and search for **Scalable House Plan**. The card picker shows it with a one-room example configuration. Continue with [your first plan](first-plan.md).
