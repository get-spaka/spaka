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

**Question**:
A choice the agent puts to the maker in the conversation, with the answers it offers and the one it recommends. The agent waits for the answer, which the maker may also give in their own words or skip.
_Avoid_: Prompt, dialog, questionnaire, permission

**Plan mode**:
The way of working in which the agent changes nothing in the project: it reads, asks its questions and hands in a plan of what it will build, which the maker approves before anything is written. Building is the other way, and the usual one.
_Avoid_: Draft mode, design step, mock-up

**Tour**:
The five bubbles that show a maker, once their first website is built, how to change it: in words, in the page, with blocks, with the theme, and how to publish it.
_Avoid_: Onboarding, walkthrough, tutorial

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

**Definition**:
The description of a datasource: its fields, the kind of each, which one is the record's long text, and the order its records are listed in.
_Avoid_: Schema, model, type

**Record page**:
A page the project has once per record of a datasource, at an address made from the record's id, all drawn by the same page template.
_Avoid_: Detail page, dynamic route, slug page

**Stand-in record**:
A record shown in the preview while a datasource has no complete record yet, so that the page's layout appears; it disappears when the real records arrive and is never written to the project.
_Avoid_: Placeholder, sample data

**Test record**:
A record of a collected datasource that exists only in the preview, written by the agent or by trying a form there. Test records are never published.
_Avoid_: Sample data, seed, fixture

**Media**:
An image or other file that a project's pages display or link to.
_Avoid_: Asset, upload

**Credits**:
The author, licence and source of a media file taken from an open collection, kept with the file and listed on the site when its licence asks for it.
_Avoid_: Attribution, copyright notice

**Theme**:
The set of named design values (colours, fonts, radii, spacing…) that gives a project its look. A small core of values exists in every project, so palettes and blocks carry over from one project to another; beyond that core a project may declare as many values as it needs. Every styling choice in a project draws from the theme, so changing it restyles the whole project.
_Avoid_: Design system, style, skin

**Palette**:
The colour values of a theme. A project has one palette, and may add a second that visitors who prefer a dark display see instead.
_Avoid_: Colour scheme, mode

**Block**:
A ready-made piece of a page (a hero, a pricing table, a form bound to a datasource…) that is copied from the gallery into a project, where it becomes a shared part, and from then on belongs to that project. A block that lists things brings its datasource with it, with sample records.
_Avoid_: Component, brick, widget

**Collection**:
A datasource of things the site has whatever page shows them (team members, posts, events, dishes, products, pictures, testimonials), shared by every page that lists it.

**Section list**:
A datasource that belongs to one section of one page (its questions, features, plans, figures, logos or steps), named after that page, so that two pages never share it by accident.
_Avoid_: Local datasource

**Navigation**:
The site's datasource of links, read by every header and footer: each link has its label, its address, where it shows and, for a menu, its own links.
_Avoid_: Menu (one menu is one navigation link with links of its own)

**Gallery**:
The catalogue of blocks that ships with Upstart.
_Avoid_: Library, marketplace

**Template**:
A complete, ready-made project that a maker can start a new project from, with its own design, its own blocks, a guide for the agent that adapts it and notes on its design. Made by Upstart or by an outside author.
_Avoid_: Starter, theme; also avoid "template" for the source of a page

**Template guide**:
What a template tells the agent that adapts it: what the template is and suits, how it is made, how to adapt it, and the choices that vary, page type by page type, which the agent asks before adapting each when the maker's messages leave them open. Read during the adaptation only.
_Avoid_: Template questions, readme

**Adaptation**:
The stage in which a website started from a template is made the maker's, while it is created: the maker chooses the page types to keep, then each is adapted in turn, the home page first, and looked at before the next. Once the last is done, the website is edited as any other.
_Avoid_: Onboarding, setup, wizard, customization

**Page type**:
The pages of a template that share their first folder, with their records: the menu; the events and each event's page; the home page alone. What an adaptation goes through, one at a time.
_Avoid_: Page group, route, section

**Design notes**:
What a template leaves with the website it starts, for the agent's later turns: its type, colors, effects and how its lists work.
_Avoid_: Style guide, template guide

### Making templates

**Category**:
The kind of website a template is listed under on the start screen: business, portfolio, blog, launch, event or app.

**Wave**:
A set of templates briefed and approved together, then built, so that no two of them share a subject, a font, a signature effect or a move.

**Batch**:
The few templates of a wave that are built at the same time, each on its own.
_Avoid_: Wave (a wave is briefed together, a batch is built together)

**Brief**:
The page that describes one template before it is built (its concept, type, palette, motion and page types), which the template's author approves.
_Avoid_: Spec, mock-up

**Move**:
The one strong composition a visitor remembers on a site's first screen, chosen by the business's character (giant type, full-bleed photo, index…).
_Avoid_: Hero style, layout

**Signature effect**:
The movement that belongs to one template alone and carries its concept, such as Transfer's stencil or Chalk's line drawing itself.

**Movement level**:
How much a site moves, set by its character: still, gentle, expressive or orchestrated.
_Avoid_: Standard template, original design

### Running and shipping

**Runtime**:
The program that turns a project's files into served pages, fragments and form handling. It behaves identically in the preview and once published.
_Avoid_: Server, backend, engine

**Builder**:
Packages a project for one kind of hosting.
_Avoid_: Exporter, adapter, deployer

**Published site**:
A project once a builder's output has been deployed by the maker, at the address the maker gives the app. A published site keeps the records visitors send.
_Avoid_: Production, live site, deployment

**Management token**:
The secret the app generates for a published site, which lets the app, and nothing else, read, approve and delete the records that site has collected.
_Avoid_: API key, password, admin token

**Form service**:
A third-party service that receives the forms of a static export, which cannot store them itself.
_Avoid_: Form backend, form provider
