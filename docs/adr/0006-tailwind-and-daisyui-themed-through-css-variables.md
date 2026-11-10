# Blocks and templates are written with Tailwind and daisyUI, themed through CSS variables

Every project is styled with Tailwind utilities plus daisyUI 5 component classes, and all its colours, fonts and radii come from the theme's CSS variables. The gallery's blocks and the templates are written in that one vocabulary, so any block fits any project and takes on its theme. The agent departs from it only when the maker asks, and blocks are then no longer guaranteed to fit.

daisyUI is the component layer because it is MIT-licensed, ships no JavaScript (nothing to re-initialise after an htmx swap), exposes its colours and radii as runtime CSS variables, and is by far the most widely used of the candidates.

## Considered options

- **Basecoat**: MIT, shadcn look and variable names, a small script that initialises swapped-in markup by itself. Young (2025) and far less adopted.
- **Flowbite**: its script does not initialise swapped-in markup by itself, its free blocks carry no clear licence, and its Pro licence forbids site-building tools.
- **Preline, FlyonUI**: their "Fair Use" licence forbids redistributing reusable components, which is exactly what a gallery does.
- **Tailwind alone**: no dependency, but longer markup for the agent to write, and less consistent buttons, fields and cards from one block to the next.

## Consequences

- daisyUI has no page sections. The gallery's sections are our own, starting from HyperUI's MIT-licensed sections with their hard-coded colours rewritten to theme colours.
- daisyUI's variables are pointed at the theme's own, and Tailwind is given the same names, so changing one theme value restyles daisyUI components and Tailwind utilities alike. The live-generation spike confirmed it ([report](../../spikes/live-generation/REPORT.md)).
- In the preview the stylesheet is daisyUI's prebuilt one plus Tailwind's in-browser compiler, which showed no unstyled frame in the spike. At export the stylesheet is compiled.
- daisyUI has no font variables, so fonts come straight from the theme's variables.
- A project has one palette. A second one for dark mode is added only on the maker's request.
