import { describe, expect, test } from "vitest";
import type { ListedProject } from "./ipc";
import { ordered } from "./project-order";

const project = (name: string, createdAt: number, updatedAt: number): ListedProject => ({
  id: name,
  name,
  path: `/sites/${name}`,
  createdAt,
  updatedAt,
});

const list = [
  project("Wedding", 1, 30),
  project("bakery", 3, 10),
  project("Écrin", 2, 20),
  project("Atelier 10", 4, 5),
  project("Atelier 9", 5, 6),
];
const names = (projects: ListedProject[]) => projects.map((p) => p.name);

describe("the order of the sidebar's projects", () => {
  test("Last updated: the website changed last comes first", () => {
    expect(names(ordered(list, "updated"))).toEqual(["Wedding", "Écrin", "bakery", "Atelier 9", "Atelier 10"]);
  });

  test("Name A–Z: case and accents aside, numbers as numbers", () => {
    expect(names(ordered(list, "name"))).toEqual(["Atelier 9", "Atelier 10", "bakery", "Écrin", "Wedding"]);
  });

  test("Date created: the newest first", () => {
    expect(names(ordered(list, "created"))).toEqual(["Atelier 9", "Atelier 10", "bakery", "Écrin", "Wedding"]);
  });

  test("leaves the list it is given as it was", () => {
    const before = names(list);
    ordered(list, "name");
    expect(names(list)).toEqual(before);
  });
});
