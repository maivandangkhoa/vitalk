import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Shows a picked image at the caret while its bytes upload.
 *
 * The preview is a widget decoration rather than a node in the document, and
 * that is the whole point: a `blob:` URL dies with the page, so one reaching
 * `getHTML()` — and from there the Save button — would be a permanently broken
 * image in a published post. Decorations live outside the document, so there is
 * nothing to save and nothing to undo, and the position still rides along with
 * every edit made while the upload runs.
 */

const previewKey = new PluginKey<DecorationSet>('imageUploadPreview');

interface PreviewAction {
  add?: { id: string; pos: number; previewUrl: string };
  remove?: { id: string };
}

/**
 * The dimmed, pulsing stand-in. Plain DOM — decorations render outside React.
 *
 * Styled inline rather than with Tailwind classes: the class scanner only reads
 * the markup in components, so a class named only here may never be generated —
 * and the editor's `prose` rules would then win. That is not hypothetical: it
 * ate the image's `my-0` and dropped the badge below the picture.
 */
function previewElement(previewUrl: string): HTMLElement {
  const wrap = document.createElement('span');
  // A block box with no margin of its own, so the image's `prose` margins
  // collapse straight through it: the wrapper then sits exactly on the image
  // and the badge can be positioned against it without knowing those margins.
  wrap.style.cssText = 'position:relative;display:block';
  wrap.contentEditable = 'false';

  const img = document.createElement('img');
  img.src = previewUrl;
  // Deliberately unsized. The editor's own `prose` rules give this the same box
  // the finished image will get, so the swap doesn't move the page — anything
  // set here, a max-height above all, turns into a jump when the real image
  // takes over.
  img.style.opacity = '0.6';
  wrap.appendChild(img);

  const badge = document.createElement('span');
  badge.textContent = 'Uploading…';
  badge.style.cssText =
    'position:absolute;bottom:0.5rem;left:0.5rem;padding:0.125rem 0.5rem;' +
    'border-radius:0.375rem;background:rgba(0,0,0,0.7);color:#fff;' +
    'font-size:0.75rem;font-weight:500;line-height:1.25rem';
  wrap.appendChild(badge);

  // Pulsing the image (not the badge, which has to stay readable) is what says
  // "not final yet". Scripted for the same reason the styles are inline.
  img.style.opacity = '0.6';
  img.animate?.(
    [{ opacity: 0.75 }, { opacity: 0.4 }],
    { duration: 1200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }
  );

  return wrap;
}

export const ImageUploadPreview = Extension.create({
  name: 'imageUploadPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: previewKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const mapped = set.map(tr.mapping, tr.doc);
            const action = tr.getMeta(previewKey) as PreviewAction | undefined;

            if (action?.add) {
              const { id, pos, previewUrl } = action.add;
              return mapped.add(tr.doc, [
                Decoration.widget(pos, previewElement(previewUrl), { id }),
              ]);
            }
            if (action?.remove) {
              const { id } = action.remove;
              return mapped.remove(
                mapped.find(undefined, undefined, (spec) => spec.id === id)
              );
            }
            return mapped;
          },
        },
        props: {
          decorations: (state) => previewKey.getState(state),
        },
      }),
    ];
  },
});

/**
 * Drops a preview by the caret. `id` identifies it for the two calls below.
 *
 * It goes at the block boundary after the caret's block, not at the caret
 * itself: an image is a block, so it will end up a sibling of the paragraphs
 * either way, and a preview rendered *inside* a paragraph collapses its margins
 * against different neighbours — which moved everything below by 40px the
 * moment the real image took over. Same place in, same place out.
 */
export function showUploadPreview(editor: Editor, id: string, previewUrl: string): void {
  if (editor.isDestroyed) return;
  const { tr } = editor.state;
  const { $from } = tr.selection;
  const pos = $from.depth ? $from.after() : $from.pos;
  editor.view.dispatch(tr.setMeta(previewKey, { add: { id, pos, previewUrl } }));
}

/** Where the preview sits now, after any edits made during the upload. */
export function uploadPreviewPos(editor: Editor, id: string): number | null {
  if (editor.isDestroyed) return null;
  const found = previewKey
    .getState(editor.state)
    ?.find(undefined, undefined, (spec) => spec.id === id);
  return found?.length ? found[0].from : null;
}

export function hideUploadPreview(editor: Editor, id: string): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(previewKey, { remove: { id } }));
}
