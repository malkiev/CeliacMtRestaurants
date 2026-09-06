# Import provenance

`restaurants.json` contains the 43 named directory rows read from the community spreadsheet on 6 September 2026. The complete directory range A1:G1000 was checked; empty-name checkbox rows are excluded. Original feedback wording is retained without personal attribution. No stars, cuisines, prices, addresses, or coordinates were inferred. Original CAM flags are private import metadata pending an admin check.

Run `npm run import` to regenerate the idempotent SQL and reconciliation report. Inspect the report before applying the SQL. Re-running an import does not overwrite maintained website records. Duplicate name/locality/island rows are flagged for manual branch reconciliation.

The separate form-response tab and Google Drive comment threads are not included in this seed. They require a separate inventory and reconciliation before claiming complete historical migration. Keep raw personal submissions under the ignored `data/private/` directory.
