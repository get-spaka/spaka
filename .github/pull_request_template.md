<!-- What this changes, and how it was checked. -->

- [ ] Run the checks on macOS and Windows

<!--
Ticked, CI runs on macOS and Windows too, at once and at each push: the unit
tests, the packaged app and the whole-app checks, ten long jobs on the most
costly runners. Unticked, only on Linux: lint, types and unit tests, the
pre-push hook having run the whole-app checks this change calls for. main runs
everything after each merge.
-->
