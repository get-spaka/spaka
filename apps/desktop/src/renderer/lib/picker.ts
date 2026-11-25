// The media picker (Q158): one panel over the window, opened from an image
// field of the Content tab (and from "Replace…" in the preview); it answers
// with the chosen file's address, or null. From a list of images, several
// can be chosen at once (Q354).
import { useEffect, useState } from "react";
import { spaka } from "./bridge";

/** `multiple`: several images may be chosen, answered in the order they were chosen. */
export type PickRequest = { id: number; multiple: boolean; resolve: (paths: string[] | null) => void };

let current: PickRequest | undefined;
const listeners = new Set<(request: PickRequest | undefined) => void>();
let next = 1;

function set(request: PickRequest | undefined) {
  current = request;
  for (const l of listeners) l(request);
}

function open(multiple: boolean): Promise<string[] | null> {
  current?.resolve(null);
  return new Promise((resolve) =>
    set({
      id: next++,
      multiple,
      resolve: (paths) => {
        set(undefined);
        resolve(paths);
      },
    }),
  );
}

/** Opens the picker; the promise gives the chosen file's address ("/media/cafe.jpg"), or null. */
export function pickImage(): Promise<string | null> {
  return open(false).then((paths) => paths?.[0] ?? null);
}

/** Opens the picker for several images (Q354): their addresses in the order chosen, or null. */
export function pickImages(): Promise<string[] | null> {
  return open(true).then((paths) => (paths?.length ? paths : null));
}

export function usePickRequest(): PickRequest | undefined {
  const [request, setRequest] = useState(current);
  useEffect(() => {
    listeners.add(setRequest);
    return () => void listeners.delete(setRequest);
  }, []);
  return request;
}

/** "Replace…" in the preview (Q159): the main process asks for the picker, and gets its answer. */
if (typeof window !== "undefined")
  spaka.on("media:pick-request", ({ id }) => {
    void pickImage().then((path) => spaka.invoke("media:picked", id, path));
  });
