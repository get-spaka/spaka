// The maker's comments on the page, kept for each project until they are
// sent to the agent as one message, or discarded (Q95). They survive a
// navigation and a new rendering: the page draws them again from here.
import { randomUUID } from "node:crypto";
import type { PageComment } from "../../shared/ipc";

export class Comments {
  private readonly byProject = new Map<string, PageComment[]>();

  list(projectId: string): PageComment[] {
    return this.byProject.get(projectId) ?? [];
  }

  save(projectId: string, comment: Omit<PageComment, "id"> & { id?: string }): PageComment[] {
    const list = this.list(projectId);
    const text = comment.text.trim();
    const existing = comment.id ? list.find((c) => c.id === comment.id) : undefined;
    let next: PageComment[];
    if (!text) next = list.filter((c) => c.id !== comment.id);
    else if (existing) next = list.map((c) => (c.id === existing.id ? { ...existing, text } : c));
    else next = [...list, { ...comment, id: randomUUID(), text }];
    this.byProject.set(projectId, next);
    return next;
  }

  remove(projectId: string, id: string): PageComment[] {
    const next = this.list(projectId).filter((c) => c.id !== id);
    this.byProject.set(projectId, next);
    return next;
  }

  clear(projectId: string) {
    this.byProject.delete(projectId);
  }
}

/**
 * One message from the comments: what the maker sees in the conversation,
 * and what the agent receives, with where each element comes from.
 */
export function commentsMessage(comments: PageComment[]): { shown: string; forAgent: string } {
  const pages = new Set(comments.map((c) => c.route));
  const where = (c: PageComment) => (pages.size > 1 ? ` (${c.route})` : "");
  const shown = comments.map((c, i) => `${i + 1}. ${c.label}${where(c)}: ${c.text}`).join("\n");
  const forAgent = [
    `The maker left ${comments.length === 1 ? "a comment" : `${comments.length} comments`} on elements of the preview. Make the changes they ask for.`,
    ...comments.map(
      (c, i) =>
        `${i + 1}. On page ${c.route}, the element at ${c.file}:${c.line}:\n   ${c.snippet}\n   Comment: ${c.text}`,
    ),
  ].join("\n\n");
  return { shown, forAgent };
}
