// Files the main process imports as text, by Vite's ?raw: Spaka's build host
// with what it preloads, and its Rolldown's lockfile (packages/rolldown.ts).
declare module "*?raw" {
  const text: string;
  export default text;
}
