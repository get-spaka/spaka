// Files the main process imports as text, by Vite's ?raw: Spaka's build host
// and its Vite's lockfile (packages/vite.ts).
declare module "*?raw" {
  const text: string;
  export default text;
}
