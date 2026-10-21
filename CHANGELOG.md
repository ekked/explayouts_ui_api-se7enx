# Changelog

## Unreleased

- **Imports create a draft** with draft zones and blocks; rules come along disabled with known types only; layout
  type, block definitions and view types are checked against the settings (with explayouts' importer rules when
  available); one transaction; a refused export answers 400 with the reason. A zone links to a shared layout by its
  identifier only. Both export forms import; the export carries `linked_layout_identifier`.
- The rule endpoints keep only known target and condition types.
- The editor returns only to a page of this site (`return_to`, the kept referrer).
- Cancel of the new layout dialog no longer creates the layout.
- Design tab: a parameter of the type `boolean` is a checkbox (it was a text field); number fields take `min` and
  `max` from the parameter. The new parameters, options and view type names of explayouts' blocks (parity with
  netgen/layouts-standard) are translated in every catalogue.
- **Content tab as in the reference**: the parameters of the group "content" (explayouts' `[BlockDefinition_<id>]
  ContentParameters[]`: text, links, images, video, map) are edited in the Content tab with the block label and the
  collection, the others in the Design tab (`expLayoutsUIApplicationApi::blockFormParameters()`); the Content tab
  opens first when it has parameters. Without the list every parameter stays in the Design tab.
- A select keeps a stored value that is none of its options as an option of its own, "(saved) <value>"; the next
  auto-submit no longer replaces it with the first option.
- Item view types and the view types of master/slave selects are named and translated; the catalogues translate
  every parameter text of explayouts' blocks.
- The changes to the app bundle are versioned: `src/app-patches/` holds the modules that differ from netgen/layouts-ui
  2.0.0, `apply.mjs` builds the bundle from them, `tests/js/app-patches.test.mjs` checks it byte for byte.
- Leaving the layout editor asks only when something can still be lost (a running write, typing in a block within the
  last second, a form of the sidebar or of a dialog that is not saved), no longer right after opening a layout.
- An inline text in the canvas that is emptied completely is saved (it was skipped); a form without a method attribute
  is saved as POST.

Open: the import is still a second implementation beside explayouts' `expLayoutsImporter` (shared are the
validation and the handling of rules).
