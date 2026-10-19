# Change Log

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->

## [1.1.0]

- Code blocks get a background, their fences are hidden and the language is shown (#6)
- `==highlighted text==` (#15)
- YAML and TOML front matter is no longer rendered as a horizontal rule and a heading (#11, #16)
- Setext headings (underlined with `===` or `---`) keep their first characters
- Ordered lists keep their numbers. `markless.listBullets` sets the symbols of unordered lists (#7, #17)
- Images are found relative to the markdown file, also in remote windows, and `<img>` tags are previewed (#9, #12, #14). File names with spaces, `data:` images and images in tables and diff views are previewed too
- Mermaid diagrams render again, several at a time, and syntax errors are shown (#10)
- Math, tables and diagrams are sized from the editor line height. They were cut to a sliver on macOS and with a custom `editor.lineHeight` (#13, #18)
- Math blocks render correctly in documents longer than 500 lines (#22), and documents with folded sections update faster
- The cursor and word highlights line up with the visible text, and hidden link URLs are no longer highlighted (#19, #21)
- Decorations are removed when a document stops being markdown (#20)
- Horizontal rules span the editor again
- Task items that start with formatting hide their `[ ]`, and block quotes in list items get their bars
- The concealed markup of an element is revealed all at once when the cursor enters it
- Settings and theme changes apply without reloading, and `markless.inlineImage.enabled` turns image previews off
- Development setup in CONTRIBUTING.md (#21)

## [1.0.7]

- Initial release
