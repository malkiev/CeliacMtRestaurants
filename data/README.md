# Import provenance and privacy

`restaurants.json` contains business directory fields for the 43 named rows read from the community spreadsheet on 6 September 2026. The complete directory range A1:G1000 was checked; empty-name checkbox rows are excluded. Community feedback is deliberately omitted from the public repository, including unattributed comments that could disclose personal or family health information. No ratings, authors, cuisines, prices, addresses, or coordinates were invented. Original CAM flags are import metadata pending an admin check, not published badges.

Run `npm run import` to regenerate the public, idempotent business seed and reconciliation report. The public seed contains no feedback. Re-running it does not remove feedback or overwrite maintained records already in a local or hosted database. Duplicate name/locality/island rows are flagged for manual reconciliation.

Keep original community exports and feedback under ignored `data/private/`. The pre-PR source, seed, and report have been preserved locally under `data/private/pr-originals/`; these files are not included in Git. For an authorised private import, generate its SQL and report there:

```sh
npm run import -- data/private/restaurants.json data/private/seed.sql
```

Providing a custom input without an output path defaults to `data/private/seed.sql`. Review private imports before applying them deliberately to the intended database. Preserve original wording and source references privately; never manufacture ratings, authors, or verification dates.

The separate form-response tab and Google Drive comment threads were not included in the original seed. They require a separate inventory and reconciliation before claiming complete historical migration.
