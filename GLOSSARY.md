# Upstart

Upstart is an open-source desktop app for building websites and web apps by chatting with an AI agent and editing the result visually.

## Language

### People

**Maker**:
The person using Upstart to build a project.
_Avoid_: User (ambiguous with visitor), customer

**Visitor**:
A person browsing or using a published project.
_Avoid_: End user, user

### Building

**Project**:
A single website or web app being built in Upstart, embodied as one folder of plain files on the maker's disk. That folder is the project's sole source of truth.
_Avoid_: Workspace, site (when meaning the whole unit of work)

**Agent**:
The AI coding agent that edits a project on the maker's behalf, running under the maker's own AI subscription or API key.
_Avoid_: Assistant, bot, Upsie

**Skill**:
A set of instructions, sometimes with scripts, that the agent picks up when a task calls for it. A skill ships with Upstart, or is added by the maker either for all their projects or for one project, of which it is then a part.
_Avoid_: Plugin, extension, prompt

**Connector**:
A link to an outside service or to a program that gives the agent tools it does not have by itself. The maker adds a connector for all their projects or for one project.
_Avoid_: MCP server, integration, plugin

**Effort**:
How much the agent thinks before it acts on a message. The maker sets it for a project and can change it at any moment of the conversation.
_Avoid_: Thinking mode, reasoning level

**Preview**:
The live rendering of a project inside the app, where the maker watches the agent work and edits visually.
_Avoid_: Canvas, iframe

**Comment**:
A note the maker pins on an element of the preview for the agent. The maker writes several, then sends them together as one message of the conversation.
_Avoid_: Annotation, selection, pin

**Visitor view**:
The preview behaving as the published project will for a visitor: links, buttons and fragments work, and nothing is selected or edited.
_Avoid_: Play mode, live mode

**Conversation**:
The single, continuous exchange between the maker and the agent about a project.
_Avoid_: Session, thread, chat

**Snapshot**:
A saved state of a project that the maker can return to. One is taken after every agent turn and every manual edit, and together they form the project's history.
_Avoid_: Checkpoint, version, commit

### What a project is made of

**Page**:
An addressable HTML document of a project.
_Avoid_: Route, screen

**Section**:
One of the top-level parts a page is divided into, from top to bottom. The maker can reorder a page's sections.
_Avoid_: Row, band; block (a block is what the gallery offers, a section is what a page contains)

**Shared part**:
A piece of page, such as a header or a footer, that several pages include. Changing it changes every page that includes it.
_Avoid_: Partial, include, layout, component

**Fragment**:
A piece of HTML served on its own to update part of a page.
_Avoid_: Partial, snippet

**Datasource**:
A named, typed collection of records that a project's pages can display. A datasource is either **authored** (the maker writes its records, which are part of the project) or **collected** (visitors submit its records through forms, and they stay where the project is published).
_Avoid_: Table, collection, database, CMS

**Record**:
One entry of a datasource.
_Avoid_: Row, item, entry

**Test record**:
A record of a collected datasource that exists only in the preview, written by the agent or by trying a form there. Test records are never published.
_Avoid_: Sample data, seed, fixture

**Media**:
An image or other file that a project's pages display or link to.
_Avoid_: Asset, upload

**Theme**:
The set of named design values (colours, fonts, radii, spacing…) that gives a project its look. A small core of values exists in every project, so palettes and blocks carry over from one project to another; beyond that core a project may declare as many values as it needs. Every styling choice in a project draws from the theme, so changing it restyles the whole project.
_Avoid_: Design system, style, skin

**Palette**:
The colour values of a theme. A project has one palette, and may add a second that visitors who prefer a dark display see instead.
_Avoid_: Colour scheme, mode

**Block**:
A ready-made piece of a page (a hero, a pricing table, a form bound to a datasource…) that is copied from the gallery into a project, where it becomes a shared part, and from then on belongs to that project.
_Avoid_: Component, brick, widget

**Gallery**:
The catalogue of blocks that ships with Upstart.
_Avoid_: Library, marketplace

**Template**:
A complete, ready-made project that a maker can start a new project from.
_Avoid_: Starter, theme; also avoid "template" for the source of a page

### Running and shipping

**Runtime**:
The program that turns a project's files into served pages, fragments and form handling. It behaves identically in the preview and once published.
_Avoid_: Server, backend, engine

**Builder**:
Packages a project for one kind of hosting.
_Avoid_: Exporter, adapter, deployer
