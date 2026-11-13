// The release script of the public templates repository: see release-main.ts.
import { releaseMain } from "./release-main";

process.exit(releaseMain(process.argv.slice(2)));
