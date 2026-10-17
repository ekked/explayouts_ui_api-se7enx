# explayouts_ui_api TODO

- The `explayouts_share` table is created ad hoc (`CREATE TABLE IF NOT EXISTS`, MySQL-specific DDL) inside `handleShare()`; move it to the installed schema in `explayouts/sql/` with per-driver variants.
- `expLayoutsUIApplicationApi` is a single ~1200-line dispatcher; splitting handlers into per-resource classes would ease maintenance.
- The SPA meta tags and page globals carry the explayouts names (the bundle is patched to read them). The `ngcb` content browser tag, the `netgen-layouts.*` asset names and the CSS classes the bundled JS and CSS use (`ngl-*`, `ngc`) keep the upstream names.
- Upstream features not (fully) ported: undo/redo history, layout restore from archive, per-translation block parameters.
- Automated tests cover only the dispatcher's policy check and its error answer (`tests/`), not the JSON endpoints themselves.
