# Changelog

## Unreleased

- **Imports create a draft** with draft zones and blocks; rules come along disabled with known types only; layout
  type, block definitions and view types are checked against the settings (with explayouts' importer rules when
  available); one transaction; a refused export answers 400 with the reason. A zone links to a shared layout by its
  identifier only. Both export forms import; the export carries `linked_layout_identifier`.
- The rule endpoints keep only known target and condition types.
- The editor returns only to a page of this site (`return_to`, the kept referrer).
- Cancel of the new layout dialog no longer creates the layout.

Open: the import is still a second implementation beside explayouts' `expLayoutsImporter` (shared are the
validation and the handling of rules).
