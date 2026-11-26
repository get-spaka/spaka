# A project is a folder of plain files, not a structured model

A project's sole source of truth is a folder of human-readable files on the maker's disk (HTML, CSS, assets, datasource definitions), not a JSON component tree or an app-owned database. Coding agents edit files natively, the maker owns and can version their own code, and version 1 had already abandoned its JSON page/section/brick model because it constrained what the agent could build.

## Consequences

- Visual editing (inline text, drag and drop) has to map elements in the preview back to locations in source files, instead of mutating a model the app owns.
- What belongs to a project without being part of its site (its identifier, the chosen model and effort, its skills, its connectors without their secrets) sits in a hidden `.spaka/` folder inside it, so it travels with the project.
- The history is the exception: snapshots are kept in the app's own data, tied to the project by its identifier. The agent writes anywhere in the project folder, so a history kept there could be damaged by it, and it would make the folder heavy. A project that is copied or received therefore starts without its history.
