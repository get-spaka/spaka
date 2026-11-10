// daisyUI ships no types: the builder only hands its plugin to Tailwind.
declare module "daisyui" {
  const plugin: import("tailwindcss").Plugin;
  export default plugin;
}
