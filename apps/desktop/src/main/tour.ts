// When the tour opens by itself (Q328, Q333, Q336, Q340): once, when the agent
// has finished the maker's first website. Built from nothing, at the end of that
// turn; from a template, once its adaptation is over (every page adapted, or the
// pages left removed), never between two pages. A turn that failed or was
// stopped opens nothing, nor does a website the maker is not looking at.

export type TourMoment = {
  /** The tour was seen or skipped, or the maker had websites before it existed. */
  seen: boolean;
  /** The turn ended with the agent done, not stopped or failed. */
  done: boolean;
  /** The website is the one on screen. */
  shown: boolean;
  /** The website was being adapted from a template when the turn ended. */
  adapting: boolean;
  /** That adaptation is over with this turn. */
  adaptationFinished: boolean;
  /** The website has a page. */
  hasPage: boolean;
};

export function opensTour(m: TourMoment): boolean {
  if (m.seen || !m.shown || !m.hasPage) return false;
  if (m.adapting) return m.adaptationFinished;
  return m.done;
}
