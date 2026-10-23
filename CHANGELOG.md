# Changelog

## Unreleased

- **The editor page's own scripts run without jQuery.** The content browser dialog of "+ Add items" and of the
  browse fields of a block form (`javascript/explayouts-app.js`) is plain DOM: it no longer needs jQuery or
  Bootstrap's modal plugin, and shows and hides itself as that plugin did (fade of backdrop and dialog, Escape, a
  click beside the dialog, the focus kept inside while it is open). Closing it now returns the focus to the link or
  button it was opened from. Every text of the dialog, the translated ones too, is escaped through one helper that
  also escapes quotes. A browse field tells the block form about a change with a native `change` event, which
  listeners added with `addEventListener` now get as well. Its requests still go through the app's request
  function while the app has one (progress bar, session timeout dialog, warning on leaving), else through `fetch`
  with the same headers. `explayouts-app-head.js` and the Tiptap glue (`src/editors/`) did not use jQuery.
- **Dialogs, collapsible panels, dropdown menus, tooltips, the date field and the inline switches of the sidebar
  run without jQuery plugins.** Bootstrap 3's JavaScript (modal, collapse, dropdown, transition), Moment.js with its
  locales and eonasdan-bootstrap-datetimepicker are no longer in the editor bundle (932 KB → 621 KB, gzipped
  254 KB → 175 KB); small DOM code of this package takes their place (`Core.ui`, see README) with the same markup,
  classes, transitions and keys, so the stylesheets apply as before.
- Dialogs say what they are (`role="dialog"`, `aria-modal`, named by their title, `aria-hidden` when closed), Tab and
  Shift+Tab stay inside an open dialog, and on closing the focus goes back to where it was.
- The Options, Items and Advanced panels of the sidebar fold and unfold on a click again: under jQuery 4 Bootstrap's
  collapse stopped with an error on the first click.
- Dropdown menus: the toggles say they are closed (`aria-expanded="false"`) until opened.
- The date and time field of a block form is the browser's own (`<input type="datetime-local">`); it sends the same
  value as before (`YYYY-MM-DDTHH:mm`, local time). The date in the draft dialog is formatted with
  `Intl.DateTimeFormat`: the same text as before in English, German, French and Italian, in other languages the
  browser's conventions.

## 1.3.29

- **Design tab: changing only the View type of a list is saved** also when the new view type leaves no item view
  type to choose (`list_zigzag`, `list_accordion`, a view type of your own). The View type of a list is the master of
  the Item view type select, and its change was saved only through the change it made to the item view type; with
  none left, the block kept its old view type until another field of the form changed.
- **"+ Add items" gives every new item a position of its own.** The editor sends the chosen items at the
  collection's offset, and each was stored at exactly that position, so two items chosen together ended up at
  position 0 next to the item already there, in the reverse order. Now each goes in at its position and the items
  from there on move down: the new items come first, in the order chosen. Moving an item (drag in **Items**, *Set
  position*) moves the items in between the same way. A manual collection keeps its positions 0, 1, 2 ... without
  gaps (positions shared by items stored before are sorted out on the next change); in a dynamic collection, where
  a manual item is pinned to a slot of the query's results, the slots are kept and only the run of pinned items
  behind the slot taken moves down.

## 1.3.28

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
- The content browser of the layout editor escapes class and object names, quotes included; ids are read as numbers.
- The gallery block preview, the Design tab, view type saving and the canvas preview (the block's own template,
  rebuilt from an allowlist) are fixed.
- Arabic, French, Ukrainian, Persian, Pashto and Kurdish (Kurmanji) translations; the ten translations of 1.3.27 and
  the new ones carry every parameter text of the editor.
- The accessible tabs, palette and toolbar buttons of 1.3.22 are kept in the bundle as patches of modules 17, 54 and
  85; the safe return target and the Cancel link live in the page's script files (no inline script).

Open: the import is still a second implementation beside explayouts' `expLayoutsImporter` (shared are the
validation and the handling of rules).
