// The sidebar's projects in the order the maker chose (Q393-Q395). Opening a
// project changes none of these orders: only a change to its website moves it
// in "Last updated".
import type { ListedProject, ProjectOrder } from "./ipc";

const byName = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function ordered(projects: ListedProject[], order: ProjectOrder): ListedProject[] {
  const list = [...projects];
  if (order === "name") return list.sort((a, b) => byName.compare(a.name, b.name) || b.updatedAt - a.updatedAt);
  if (order === "created") return list.sort((a, b) => b.createdAt - a.createdAt);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}
