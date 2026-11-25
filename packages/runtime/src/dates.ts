// Dates with no time, as a record's date field holds them: JavaScript reads
// `2027-01-12` as midnight UTC, and Liquid prints it in the machine's time zone,
// the day before anywhere west of Greenwich. A day has no time zone: it prints
// as it is written. A date with a time, "now" and timestamps stay Liquid's.
import { type FilterImplOptions, filters, type Liquid } from "liquidjs";

type FilterHandler = Exclude<FilterImplOptions, { raw: boolean }>;

/** `2027-01-12`, or the month alone: the forms JavaScript reads as UTC. */
const DATE_ONLY = /^\d{4}-\d{2}(-\d{2})?$/;

/** Midnight of the day written, in the machine's time zone. */
const localMidnight = (day: string) => `${day.length === 7 ? `${day}-01` : day}T00:00:00`;

/**
 * The offset, in minutes, at which Liquid prints midnight UTC of the day as that day.
 * That is 0, but for the hour Liquid is off when the machine's clocks change that day.
 */
function offsetOf(day: string): number {
  const utc = new Date(day);
  return utc.getTimezoneOffset() - (new Date(localMidnight(day)).getTime() - utc.getTime()) / 60_000;
}

const isDay = (value: unknown): value is string => typeof value === "string" && DATE_ONLY.test(value);

/** The date filters, with days that print as written. */
export function registerDateFilters(liquid: Liquid): void {
  const date = filters.date as FilterHandler;
  // At an offset of its own, its timestamp ("%s") stays midnight UTC: days counted from it are 24 hours each.
  liquid.registerFilter("date", function (value, format, timezone) {
    return date.call(this, value, format, isDay(value) ? offsetOf(value) : timezone);
  });
  // These take no offset.
  for (const name of ["date_to_string", "date_to_long_string", "date_to_xmlschema", "date_to_rfc822"] as const) {
    const filter = filters[name] as FilterHandler;
    liquid.registerFilter(name, function (value, ...args) {
      const day = isDay(value) && !Number.isNaN(Date.parse(value));
      return filter.call(this, day ? localMidnight(value) : value, ...args);
    });
  }
}
