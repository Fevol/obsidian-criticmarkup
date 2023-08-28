# CriticMarkup plugin for Obsidian

A [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) renderer for [Obsidian](https://obsidian.md/) for
collaborative editing and reviewing your notes. Includes a suggestion mode for keeping track of changes, and a comment mode for easily leaving comments.

This plugin was built upon the excellent work and advice of @kometenstaub, the original repositories can be found here: [CriticMarkup plugin](https://github.com/kometenstaub/obsidian-criticmarkup)
and [CriticMarkup parser](https://github.com/kometenstaub/lang-criticmarkup).

Roadmap for full product can be found below. No timeline will be given for when (and in which order)
these features will be implemented. If features prove to be completely infeasible to implement, they will be removed from the roadmap. 

The plugin *is* available for beta testing, but please keep in mind that you should not use this plugin in
your main vault. There is a non-zero risk of text being removed when using e.g. the suggestion mode.

Please report any errors or bug you encounter, especially when these result in loss of data or cause
crashes/malfuctions in Obsidian. In the [Obsidian Discord](https://discord.com/invite/obsidianmd), there is a thread
under `Extensions > Plugin Advanced > Commentator`, you can report bugs there, or in the [Github issues page](https://github.com/Fevol/obsidian-criticmarkup/issues).

### Parser
- [X] Parsing of CriticMarkup syntax (see [CriticMarkup parser library](https://github.com/Fevol/criticmarkup-parser/))
- [ ] Parsing of annotations and extended syntax (see **Syntax**)

### UIX
- [X] Mark selection as `Insertion`/`Deletion`/...
- [X] Accepting/Rejecting all changes in document
  - [X] Via command palette (entire document/selection)
  - [X] Via context menu (selection)
  - [X] Via gutter markings (line)
- [X] Auto-close critic-markup brackets when typing
- [ ] Automatically correct invalid markup
- [ ] Automatically simplify dangling and (partially) empty markup
- [X] Vault-wide index of all suggestions and comments
  - [X] Automatically create/re-synchronize on vault opening
  - [X] Stays up-to-date with changes in vault
- [X] Custom view for viewing suggestions and comments over entire vault
  - [ ] Filter by recency
  - [ ] Filter by author (see also custom syntax)
  - [ ] Performance improvements
  - [ ] UIX/Scrolling improvements
  - [X] Accept/Close selection of suggestions and comments
- [X] Preview of `Accept/Reject` commands in editor
- [X] Toggling suggestion mode on/off in editor
- [ ] Toggling comment mode on/off in editor
- [ ] Integration of toggles for suggestion mode, preview and comment mode with other community plugins

### Rendering
- [X] Rendering of markup in Live Preview
- [X] Rendering of markup in Reading View (Postprocessor)
- [X] Rendering comments 
  - [X] In right-side gutter of document
  - [X] On hover in document

### Syntax
- [ ] Extend CriticMarkup syntax to allow for authorship and timestamp annotation
- [ ] Extend `Comment` markup to support comment threads
- [ ] Allow custom highlight colours for `Highlight` markup


### Suggestion Mode

- [X] Marking **insertion** actions as `{++insertion++}`
- [X] Marking **deletion** actions as `{--deletion--}`
- [X] Marking **replacement** actions as `{~~deletion~>insertion~~}`
- [X] Smooth cursor movement through markup
  - [ ] Support different options for cursor movement (always stop when markup encountered, ...)
  - [ ] Full Vim Support 
- [ ] Toggle sequential CM state updating for improved multi-cursor support when inserting/deleting

### Comment Mode
- [ ] Add comments to selection
- [ ] Smooth cursor movement through markup

