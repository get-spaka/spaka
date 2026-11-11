// The media picker (Q158): one panel over the window, opened from an image
// field of the Content tab (and from "Replace…" in the preview); it answers
// with the chosen file's address, or null.
import { useEffect, useState } from "react";

export type PickRequest = { id: number; resolve: (path: string | null) => void };

let current: PickRequest | undefined;
const listeners = new Set<(request: PickRequest | undefined) => void>();
let next = 1;

function set(request: PickRequest | undefined) {
  current = request;
  for (const l of listeners) l(request);
}

/** Opens the picker; the promise gives the chosen file's address ("/media/cafe.jpg"), or null. */
export function pickImage(): Promise<string | null> {
  current?.resolve(null);
  return new Promise((resolve) =>
    set({
      id: next++,
      resolve: (path) => {
        set(undefined);
        resolve(path);
      },
    }),
  );
}

export function usePickRequest(): PickRequest | undefined {
  const [request, setRequest] = useState(current);
  useEffect(() => {
    listeners.add(setRequest);
    return () => void listeners.delete(setRequest);
  }, []);
  return request;
}
