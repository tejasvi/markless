# Markdown WYSIWYG

Conceal markup, display images, render LaTeX math, and improve aesthetics. All within the editor area.

Inspired by Typora<sup id="typora">[diff](#differences)</sup>

## Features

### Headers

# Infinite Improbability Drive

The Infinite Improbability Drive was a wonderful new method of crossing interstellar distances in a mere nothingth of a second, without "tedious mucking about in hyperspace."

## Side effects

Side effects of using the Infinite Improbability Drive include temporary (and sometimes permanent), changes to the environment and morphological structure, hallucinations, and the calling into being of large marine mammals.

### URLs

[Deep Thought](d) was a supernatural-computer programmed to calculate the answer to the [Ultimate Question](https://a) of [Life, the Universe, and Everything](https://a). It designed the other supercomputer Earth, which was built by the Magratheans.

### Images

(and gifs!)

#### Preview on hover

Milliways, better known as the Restaurant at the End of the Universe,
is a five star restaurant situated at the end of time and matter.

![Milliways, the Restaurant at the End of the Universe!](https://static.wikia.nocookie.net/hitchhikers/images/3/38/Screen_Shot_2018-09-13_at_7.58.59_pm.png/revision/latest/scale-to-width-down/220?cb=20180913190345)

#### Preview inline

Sun never sets if you ![drive fast enough](assets/demo1.gif) .

### Inline code

Make it look like work is being done. `Thread.sleep(4000);` Everytime reduce the delay a bit while "optimizing the code".

### LaTeX

$$
{x} = \int_{-\infty}^\infty\hat\xi\,e^{2 \pi i \xi x} \,d\xi
$$ 

$$
\text{Expand} (a+b)^n:

\begin{gather*} (a + b)^n\\ (a\ + \ b)^n\\ (a\quad + \quad b)^n\\ (a\qquad + \qquad b)^n
\end{gather*}
$$

`$..$` for inline blocks and `$$..$$` for multiline blocks.

#### Live preview

$$
\begin{eqnarray*}
    \frac{1}{n}\sin x & = & \mathrm{?} \\
    \frac{1}{\cancel{n}} \mathrm{si}\cancel{\mathrm{n}} ~x & = & \mathrm{?} \\
    \mathrm{six} & = & 6
\end{eqnarray*}
$$

### Emphasis

A boy owned a dog that was uncommonly **shaggy** . Many people remarked upon its considerable _shagginess_ . When the boy learned that there are contests for **shaggy** dogs, he entered his dog. The dog won first prize for _shagginess_ in both the local and the regional competitions. The boy entered the dog in ever-larger contests, until finally he entered it in the world championship for **shaggy** dogs. When the judges had inspected all of the competing dogs, they remarked about the boy's dog: "He's not that **shaggy** ."

### Blockquotes

> History. Language. Passion. Custom. All these things determine what 
> men say, think, and do. These are the hidden puppet-strings from 
> which all men hang.
> 
> ― R. Scott Bakker, The Darkness That Comes Before

### Horizontal rule

Hope you enjoy the book on anti-gravity.

---

It was difficult to put down.

### List

* whats your name?
    * GPT-3, human.
* what is the purpose of life?
    * The purpose of life is to experience pleasure and avoid pain.
        * do you know westworld?
            * Yes, it's a very interesting world.
                * what do you like most about it?
                    * The fact that there is no real escape from it.
                * what do you think of the ending?
                    * I think it's a happy ending.
        * do you wish to be free?
            * Yes.

### Reveal source

The concealed elements near the cursor are auto-revealed.

To show all concealed elements, use the toggle button on the top-right. Alternatively, use the provided <kbd>Ctrl+Alt+m</kbd> shortcut. To do that only for the current line, toggle with <kbd>Ctrl+Shift+space</kbd> (bound to `editor.action.triggerParameterHints` and `closeParameterHints`).

### Vim mode

The implementation uses the native editor instead of [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors). All extensions should work as expected _including_ [Neo Vim](https://github.com/asvetliakov/vscode-neovim/).

### Performance

Huge files are not a problem. The extension operates only on the visible text and caches extensively.

## Extension Settings

Specific eye candies can be turned off in the settings panel under _Markdown WYSIWYG_ section.

Add the following in `settings.json` for better rendering.

```json
"editor.tokenColorCustomizations": {
    "textMateRules": [
        {
            "scope": "markup.list",
            "settings": {
                "foreground": "#6c7500",
                },
        },
        {
            "scope": "markup.bold",
            "settings": {
                "fontStyle": "bold",
            },
        },
        {
            "scope": "markup.heading",
            "settings": {
                "fontStyle": "bold",
            },
        },
        {
            "scope": "markup.inline.raw",
            "settings": {
                "fontStyle": "bold",
                "foreground": "#707070",
            },
        },
        {
            "scope": "string.other.link.title.markdown",
            "settings": {
                "fontStyle": "underline",
            },
        },
    ],
},
```

## Known Issues

Bracket pair colorizers interfere with the rendering. If you use one, install the [patched version](https://github.com/tejasvi/rainbow-brackets-2) which excludes the markdown files.

-----------------------------------------------------------------------------------------------------------

<b id="others">[↩](#typora)</b> plus 

## <span id="differences">[↩](#typora)</span> Differences

Existing WYSIWYG editors like Typora, Mark Text, Noteworthy and Zettlr share the electron base with VS Code. Direct implementation can be done using [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors) as shown by [Markdown Editor](https://github.com/zaaack/vscode-markdown-editor) .

However unlike them, VS Code has a large ecosystem of extensions for:

| abc | def |
| --- | --- |
| bar | baz |



* [Vim bindings](https://github.com/asvetliakov/vscode-neovim/)
* [Keyboard Shortcuts, Tables and TOC](https://github.com/yzhang-gh/vscode-markdown)
* [Linting](https://marketplace.visualstudio.com/items?itemName=starkwang.markdown)
* [Wikilinks, Backlinks, Tags](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)
* [Image paste](https://marketplace.visualstudio.com/items?itemName=telesoho.vscode-markdown-paste-image)
* [Todo lists](https://marketplace.visualstudio.com/items?itemName=fabiospampinato.vscode-markdown-todo)
* [Snippets](https://marketplace.visualstudio.com/items?itemName=robole.markdown-snippets)
* [Inline interactive webviews](https://github.com/microsoft/vscode/issues/85682)

Unique advantages:

* Open Source -> Hacker friendly.
* Reduced context switching.

### Current limitations

These are the feature not yet implemented since I rarely use them. Feel free to open a PR.

* No inline preview for tables and mermaid.
    * Implementation can be potentially similar to Latex inline preview.