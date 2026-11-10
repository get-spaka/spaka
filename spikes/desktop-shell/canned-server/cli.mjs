// `node cli.mjs [port]` runs the canned server alone, to look at the page in
// an ordinary browser.
import { startCannedServer } from "./server.mjs";

const { url } = await startCannedServer({ port: Number(process.argv[2] ?? 4517) });
console.log(`canned page on ${url}`);
