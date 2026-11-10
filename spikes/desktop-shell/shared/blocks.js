// A three-block stand-in for the gallery. Each block is the HTML that would
// be copied into the project when the maker drops it in a page.

export const blocks = [
  {
    id: "cta-banner",
    name: "Call to action",
    hint: "A coloured band with one button",
    html: `<section data-piece="block-cta-banner" class="bg-primary py-14 text-primary-content">
  <div class="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 text-center md:flex-row md:justify-between md:text-left">
    <div>
      <h2 class="text-2xl font-bold">Leaving next month?</h2>
      <p class="opacity-90">Plan it tonight. The first trip is free.</p>
    </div>
    <a class="btn btn-lg" href="#join">Start a plan</a>
  </div>
</section>`,
  },
  {
    id: "stats",
    name: "Stats row",
    hint: "Three numbers side by side",
    html: `<section data-piece="block-stats" class="mx-auto max-w-5xl px-6 py-14">
  <div class="stats stats-vertical w-full border border-base-300 md:stats-horizontal">
    <div class="stat"><div class="stat-title">Trips planned</div><div class="stat-value text-primary">48,200</div><div class="stat-desc">since January</div></div>
    <div class="stat"><div class="stat-title">Tabs closed</div><div class="stat-value text-secondary">1.9M</div><div class="stat-desc">give or take</div></div>
    <div class="stat"><div class="stat-title">Countries</div><div class="stat-value text-accent">117</div><div class="stat-desc">and counting</div></div>
  </div>
</section>`,
  },
  {
    id: "faq",
    name: "Questions",
    hint: "Three collapsible answers",
    html: `<section data-piece="block-faq" class="mx-auto max-w-3xl px-6 py-14">
  <h2 class="mb-6 text-center text-3xl font-bold">Questions</h2>
  <div class="collapse collapse-arrow border border-base-300 bg-base-100">
    <input type="radio" name="faq" checked>
    <div class="collapse-title font-semibold">Does it work without an account?</div>
    <div class="collapse-content text-sm opacity-80">Yes, for one trip. An account keeps your plans across devices.</div>
  </div>
  <div class="collapse collapse-arrow mt-2 border border-base-300 bg-base-100">
    <input type="radio" name="faq">
    <div class="collapse-title font-semibold">Which maps are offline?</div>
    <div class="collapse-content text-sm opacity-80">Every area your plan touches, downloaded before you leave.</div>
  </div>
  <div class="collapse collapse-arrow mt-2 border border-base-300 bg-base-100">
    <input type="radio" name="faq">
    <div class="collapse-title font-semibold">Can I cancel?</div>
    <div class="collapse-content text-sm opacity-80">Any time, in two clicks. Your plans stay readable.</div>
  </div>
</section>`,
  },
];

export const blockById = (id) => blocks.find((block) => block.id === id) ?? null;
