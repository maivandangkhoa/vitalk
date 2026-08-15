import { useSyncExternalStore } from 'react';

/**
 * How many image uploads are in flight, page-wide.
 *
 * Saving mid-upload silently loses the image: the blog editor's stand-in is a
 * decoration, so `getHTML()` genuinely has no image in it yet, and "Preview &
 * publish" then navigates away and unmounts the editor the finished upload was
 * going to insert into. The writer, meanwhile, has been looking at the picture
 * the whole time.
 *
 * The count lives outside React because the things that raise it never meet in
 * the tree — one editor per language tab, plus the cover uploader — while the
 * button that has to wait for them sits above all of it.
 */

let inFlight = 0;
const listeners = new Set<() => void>();

/** Marks an upload as started. Call the returned function when it settles. */
export function beginUpload(): () => void {
  inFlight++;
  listeners.forEach((notify) => notify());

  let settled = false;
  return () => {
    // Idempotent: a caller that ends the same upload twice must not drive the
    // count negative, which would un-block the buttons while work is pending.
    if (settled) return;
    settled = true;
    inFlight--;
    listeners.forEach((notify) => notify());
  };
}

export function usePendingUploads(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => inFlight,
    () => 0
  );
}
