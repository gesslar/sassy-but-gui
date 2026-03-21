# Sassy, but GUI

## \<marketing/\>

Author Visual Studio Code theme extensions directly in Visual Studio Code,
with the help of state of the art [sassy](https://sassy.gesslar.io/)
technology.

## The truth

That's a sentence, isn't it. But, what does it mean?

[sassy](https://sassy.gesslar.io/) is a cross-platform, command-line
application that enables you to express your VS Code themes in cascading,
hierarchical YAML, versus the flat-property format that VS Code expects and
converts it into the flat-property format that VS Code expects.

I know, that sounds weird. But, it isn't. The problem [sassy](https://sassy.gesslar.io/)
attempts to solve is that VS Code's flat properties, which look like this,

```json
{
  "titleBar.activeForeground": "#bebebe",
  "titleBar.activeBackground": "#090909",
  "titleBar.inactiveForeground": "#808080",
  "titleBar.inactiveBackground": "#060606",
  "titleBar.border": "#ff75d780",
  "badge.foreground": "#ffb3ff",
  "badge.background": "#960078",
}
```

work great for VS Code, but don't really do anything for *you*.

As world-renowned Visual Studio Code Theme Artist and Designer, with the above,
how do you

1. visualise that all `menu` items belong to each as a group?
2. relate all of the different surfaces and sub-surfaces by tone?
3. ensure that all 'inactive things' uniformly relate to the active thing
   they are coupled with, *relationally*?
4. change the colour warmth of anything uniformly across the entire theme?

The truth is that `dot.delimited.property.names` provide zero affordances for
a coherent development or design system. This was created for machines to
parse, and, I don't know about you, but in 2026, despite being promised flying
cars and ageless robot bodies, I'm still not a machine.

So, I made a thing that lets me write:

```yaml
# line up your crayons
palette:
  white: "#bebebe"
  black: "#090909"
  pink: "#b62e94"

# teach your crayons to speak
vars:
  fg:
    main: $$white
  bg:
    main: $$black
  accent:
    main: $$pink
  border:
    main: darken($accent.main, 25)

# teach your crayons to sing
colors:
  titlebar:
    activeForeground: $fg.main
    activeBackground: $bg.main
    inactiveForeground: darken($titlebar.activeForeground, 10)
    inactiveBackground: lighten($titlebar.activeBackground, 10)
    border: fade($border.main, .3)
  badge:
    foreground: lighten($accent.main, 50)
    background: darken($accent.main, 50)
```

That's [sassy](https://sassy.gesslar.io/) in a very, *very* simplified
nutshell.

But what is *Sassy, but GUI*?

## What it is

*Sassy, but GUI* extends the command-line tool directly in Visual Studio Code.
Now, you can do all of the things inside VS Code. Iterating, tweaking, with
a live view of all of the ways in which you're getting it right. And if
something is misbehaving, you can just look, and see where a mischievous
colour goblin began poking at your art and flick it out!

Check out the features list below for some of the ways in which you can assert
your authoritay all over your own design process.

## Features

### Diagnostics

Lint results for your theme, grouped by category: variables, workbench colors,
token colors, and semantic token colors. Each issue is severity-tagged and
expandable, with jump-to-source links that open the relevant file and line in
your editor. Filter by severity or search by message text.

Workbench color diagnostics are validated against the official VS Code theme
schema via
[@gesslar/vscode-theme-schema](https://github.com/gesslar/vscode-theme-schema),
catching unknown properties, deprecated keys, and invalid values.

### Resolve

Pick any color, token color, or semantic token color from your theme output and
trace its resolution chain step by step — through variable references, palette
lookups, séances, and color expressions — down to the final computed value.
Each step shows its type, value, a color swatch (where applicable), and a link
to jump to its definition in source.

### Proof

View the fully composed YAML that Sassy assembles from your theme file and all
its dependencies before evaluation. Useful for verifying that imports, palette
inheritance, and variable layering resolve the way you expect.

### Palette

A swatch grid of every color in your theme's palette, showing name, raw
expression, and resolved value.

### Auto-build

Toggle auto-build to have the extension write your compiled theme JSON to disk
on every change. A visual dirty indicator highlights when the on-disk output is
stale. You can also trigger a one-off build manually.

### File watching

The extension watches your theme file and all of its dependencies. Edit an
imported palette or a shared variables file and the panel rebuilds
automatically.

## Getting started

1. Install the extension.
2. Open a `.sassy.yaml` theme definition file.
3. Click the color-mode icon in the editor title bar, or run **Show Sassy
   Panel** from the command palette.

The panel opens beside your editor. Edits to the theme file (or any file it
imports) trigger a rebuild and the panel updates.

### Commands

| Command | Description |
| --- | --- |
| **Show Sassy Panel** | Open the Sassy panel for the current theme file |
| **Build Theme** | Write the compiled theme JSON to disk |
| **Enable Auto-Build** | Automatically write on every rebuild |
| **Disable Auto-Build** | Stop automatic writes |

These commands also appear in the editor title bar and explorer context menu
when a `.sassy.yaml` file is selected.

## Requirements

- VS Code 1.94.0 or later
- A [Sassy](https://sassy.gesslar.io/) theme project with `.sassy.yaml`
  definition files

## License

`sassy-but-gui` is released into the public domain under the
[Unlicense](UNLICENSE.txt).

This package includes or depends on third-party components under their own
licenses:

| Dependency | License |
| --- | --- |
| [@gesslar/sassy](https://github.com/gesslar/sassy) | Unlicense |
| [@gesslar/toolkit](https://github.com/gesslar/toolkit) | Unlicense |
| [@gesslar/vscode-theme-schema](https://github.com/gesslar/vscode-theme-schema) | Unlicense |
| [@vscode-elements/elements](https://github.com/vscode-elements/elements) | MIT |
| [@vscode/codicons](https://github.com/microsoft/vscode-codicons) | CC-BY-4.0 |
| [@vscode/vsce](https://github.com/Microsoft/vsce) | MIT |

## Post Malone

I didn't want to waste this gold.

### Pedigree

Built upon the wildly successful *sassy* platform, *Sassy, but GUI* extends
theme authorship from the ... well, to nerds it's a CLI, what do not-nerds call
it? Black box? That sounds, ok, both scary but also accurate in every sense if
you're not a nerd. Anyway, so the black boxy way of making themes? It's now in
clicky clicky format.

*Sassy* does require a bit of information to learn how to use it. But, it's
okay! I called in my best friends; my sherpa, my Wakko figurine, and we've all
agreed to help you learn everything you'll need to know at sassy's website. And
if you'd like, we can even hold hands while doing it.

It's right here: <https://sassy.gesslar.io/>.

It has a tutorial, things to know about VS Code and themes, also, it's *pink*.
And, we don't *have* to hold hands if you don't want to. I'll understand. My
sherpa'll understand. Wakko? You're on your own with Wakko.

This might not be what pedigree means.
