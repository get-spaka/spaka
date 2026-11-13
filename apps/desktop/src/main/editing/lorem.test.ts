import { describe, expect, test } from "vitest";
import { loremBlock, loremRecord, loremTemplate } from "./lorem";

describe("a block put into a site shows lorem ipsum (Q223, Q224)", () => {
  test("its texts become lorem words of about their length, its tags and Liquid kept", () => {
    const out = loremTemplate(
      '<section class="py-16"><h2 class="text-3xl">Our team</h2><p>Meet {{ data.team.size }} friendly people.</p>{% if x %}<a href="/about">About us</a>{% endif %}</section>',
    );
    expect(out).toMatch(
      /^<section class="py-16"><h2 class="text-3xl">[A-Z][a-z]+ [a-z]+<\/h2><p>[A-Z][a-z]+ \{\{ data\.team\.size \}\} [a-z]+ [a-z]+\.<\/p>\{% if x %\}<a href="\/about">[A-Z][a-z]+ [a-z]+<\/a>\{% endif %\}<\/section>$/,
    );
    expect(out).not.toMatch(/Our|team<|Meet|friendly|About us/);
  });

  test("numbers, days, months and times stay, with the word joining them; capitals follow", () => {
    expect(loremTemplate("<p>Monday to Friday</p><p>9 am to 8 pm</p><p>OUR STORY</p>")).toMatch(
      /^<p>Monday to Friday<\/p><p>9 am to 8 pm<\/p><p>[A-Z]+ [A-Z]+<\/p>$/,
    );
    expect(loremTemplate("<p>Since 1998, call +33 4 78 00 00 00 or hello@example.com</p>")).toMatch(
      /^<p>[A-Z][a-z]+ 1998, [a-z]+ \+33 4 78 00 00 00 [a-z]+ hello@example\.com<\/p>$/,
    );
  });

  test("a form's texts, code and drawings stay; an attribute with a > in Liquid is read whole", () => {
    const form =
      '<form hx-post="/_data/contact"><legend>Your name</legend><button type="submit">Send message</button></form>';
    expect(loremTemplate(form)).toBe(form);
    const svg = "<svg><title>Clock</title></svg><script>hello()</script>";
    expect(loremTemplate(svg)).toBe(svg);
    expect(loremTemplate('<div class="{% if n > 2 %}wide{% endif %}">Hello</div>')).toMatch(
      /^<div class="\{% if n > 2 %\}wide\{% endif %\}">[A-Z][a-z]+<\/div>$/,
    );
  });

  test("a sample record: its text, list and Markdown fields become lorem ipsum, the others stay", () => {
    const definition = `label: Events
fields:
  - name: title
    kind: text
  - name: date
    kind: date
  - name: tags
    kind: list
  - name: booking
    kind: link
  - name: body
    kind: markdown
body: body
`;
    const out = loremRecord(
      '---\ntitle: "Acoustic evening"\ndate: 2027-02-19\ntags: [music, live]\nbooking: "/contact"\n---\n\nTwo local acts play. Doors open at 7:30 pm. [Book](/contact)\n',
      definition,
    );
    expect(out).toContain("date: 2027-02-19");
    expect(out).toContain('booking: "/contact"');
    expect(out).toContain(" 7:30 pm.");
    expect(out).toContain("](/contact)");
    expect(out).not.toMatch(/Acoustic|evening|music|live|Two local|Book\]/);
  });

  test("the site's navigation is never made lorem ipsum", () => {
    const block = {
      id: "header-simple",
      kind: "header",
      source: "<header>Acme</header>",
      data: { name: "navigation", family: "collection" as const },
      datasource: {
        definition: "fields:\n  - name: label\n    kind: text\n",
        records: { "home.md": "---\nlabel: Home\n---\n" },
      },
    };
    expect(loremBlock(block).datasource?.records["home.md"]).toBe("---\nlabel: Home\n---\n");
    expect(loremBlock(block).source).not.toContain("Acme");
  });
});
