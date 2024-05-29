# CriticMarkup plugin for Obsidian

A [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) renderer for [Obsidian](https://obsidian.md/) for
collaborative editing and reviewing your notes. Includes a suggestion mode for keeping track of changes, and a comment mode for easily leaving comments.

This plugin was built upon the excellent work and advice of @kometenstaub, the original repositories can be found here: [CriticMarkup plugin](https://github.com/kometenstaub/obsidian-criticmarkup)
and [CriticMarkup parser](https://github.com/kometenstaub/lang-criticmarkup).

Roadmap for full product can be found below. No timeline will be given for when (and in which order)
these features will be implemented. If features prove to be completely infeasible to implement, they will be removed from the roadmap.

The plugin _is_ available for beta testing, but please keep in mind that you should not use this plugin in
your main vault. There is a non-zero risk of text being removed when using e.g. the suggestion mode.

Please report any errors or bug you encounter, especially when these result in loss of data or cause
crashes/malfuctions in Obsidian. In the [Obsidian Discord](https://discord.com/invite/obsidianmd), there is a thread
under `Extensions > Plugin Advanced > Commentator`, you can report bugs there, or in the [Github issues page](https://github.com/Fevol/obsidian-criticmarkup/issues).

### Parser

- [x] Parsing of CriticMarkup syntax (see [CriticMarkup parser library](https://github.com/Fevol/criticmarkup-parser/))
- [x] Parsing of annotations and extended syntax (see **Syntax**)
- [ ] Improving resilience to invalid markup

### UIX

#### Commands

- [x] Mark selection as `Insertion`/`Deletion`/...
- [x] Accepting/Rejecting all changes in document
  - [x] Via command palette (entire document/selection)
  - [x] Via context menu (selection)
  - [x] Via gutter markings (line)

#### Extensions

- [x] Auto-close critic-markup brackets when typing
- [ ] Automatically correct invalid markup
- [ ] Automatically simplify dangling and (partially) empty markup

#### Suggestion View

- [x] Vault-wide index of all suggestions and comments
  - [x] Automatically create/re-synchronize on vault opening
  - [x] Keep up-to-date with immediate changes in vault
- [x] Custom view for viewing suggestions and comments over entire vault
  - [x] Metadata rendering
  - [ ] Filter by recency
  - [ ] Filter by author (see also custom syntax)
  - [x] Performance improvements
  - [x] UIX/Scrolling improvements
  - [x] Accept/Close selection of suggestions and comments

#### Editor

- [x] Preview of `Accept/Reject` commands in editor
- [x] Toggling suggestion mode on/off in editor
- [ ] Toggling comment mode on/off in editor
- [ ] Integration of toggles for suggestion mode, preview and comment mode with other community plugins
- [ ] Specify suggestion/comment-only mode in frontmatter (based on authorship)

### Rendering

- [x] Rendering of markup in Live Preview
- [x] Rendering of markup in Reading View (Postprocessor)
- [x] Rendering comments
  - [x] In right-side gutter of document
  - [x] On hover in document

### Syntax

- [x] Extend CriticMarkup syntax to allow for authorship and timestamp annotation
- [x] Extend `Comment` markup to support comment threads
- [ ] Allow custom highlight colours for `Highlight` markup

### Suggestion Mode

- [x] Converting edit operations into appropriate markings
- [ ] Correct cursor placement through edit and cursor operations
  - [x] Support different options for cursor movement (always stop when markup encountered, ...)
  - [ ] Full Vim Support
- [ ] Toggle sequential CM state updating for improved multi-cursor support when inserting/deleting

### Comment Mode

- [ ] Add comments to selection
- [x] Smooth cursor movement through markup
