# Mobile chat: composer under the keyboard (2026-08-08)

## Problem
Tapping the message box on iOS scrolls the whole page: the site header leaves the
top, the footer climbs into view under the composer, and the thread is pushed off
screen. Cause: `ChatShell` is sized `h-[calc(100vh-9rem)]` inside a normal
scrolling document. iOS never shrinks the layout viewport for the keyboard — both
`100vh` and `100dvh` keep reporting the full screen — so the pane stays taller
than what you can see and Safari scrolls the document to chase the caret.

## Plan
- [x] `useMobileFullscreen(enabled)` hook — publish `visualViewport.height` as
      `--app-vh` (+ `offsetTop` as `--app-vv-top`), freeze the body underneath,
      only under the `md` breakpoint
- [x] `ChatShell`: an open thread on the phone becomes `fixed` + `--app-vh` tall;
      desktop keeps the inline two-column card (`100vh` → `100dvh` there)
- [x] `MessageThread`: re-pin to the bottom when the visual viewport resizes, so
      opening the keyboard never hides the last message
- [x] `overscroll-contain` on the thread so it can't drag the page behind it
- [x] Typecheck + build + lint clean; the three arbitrary utilities confirmed
      present in `dist/assets/*.css` (Tailwind silently drops a class it cannot
      parse, and `h-[var(--app-vh,100dvh)]` has a comma in it)

## Decisions
- **No `viewport-fit=cover`** (dropped from the proposal): the manifest is
  `display: standalone`, so `cover` would push the *whole site* under the notch
  and home indicator in the installed PWA. Without it iOS already insets the
  layout viewport, and in Safari the toolbar occupies that strip — the composer
  is clear either way, and `env(safe-area-inset-*)` would just be 0.
- Body lock is `position: fixed` + restored `scrollY`, not `overflow: hidden` —
  iOS ignores the latter.
- The conversation list (no thread open) stays inline; only an open thread takes
  over the screen. The list's viewport-tall frame is now `md:` only — it exists
  to hold the two desktop columns side by side, and on a phone it drew a
  screen-tall empty box around a single row. Mobile inbox = content height, page
  scrolls.

## Follow-up: one-button composer
The attach button moved into the send button's slot (`MessageComposer`). The row
is now `[textarea] [one button]`, and the textarea takes the freed width.

Owner asked for the swap to key off *focus*. It keys off **content** instead —
`!!image || !!text.trim()` — because on a phone the field stays focused for the
whole conversation, so focus would park a permanently disabled send button in
that slot with no way left to reach the image picker. Same result the moment a
character is typed, and no disabled state exists anywhere in the composer now.

Sizing: the slot is 44px square (`size-11`, radius matched to the field) against
a field floored to the same 44 (`min-h-11`). `leading-6` pins the line box —
without it the 16px iOS-zoom floor makes one line taller on a phone than on a
desktop and the two only line up on one of them. Icons had to be `size-5`, not
`h-5 w-5`: the Button's `[&_svg:not([class*='size-'])]:size-4` rule outranks a
plain `h-5 w-5` on the icon, which is why the old attach icon was really 16px.

## Not done / manual
Nothing here can prove the keyboard behaviour — it only exists on a real iOS
device. Needs a phone pass on https://havitalk.web.app after deploy:
1. Open a thread, tap the box — composer must sit on the keyboard, last message
   visible, no footer anywhere.
2. Scroll to the top of the thread and keep dragging — the page behind must not
   move.
3. Back arrow, then browser back — the inbox must come back at its old scroll
   position, not pinned.
4. Rotate with the keyboard open.
5. Desktop and iPad (≥768px) — unchanged two-column card.
6. `/admin/messages` on a phone (teacher + admin monitor).

Not committed, not deployed.
