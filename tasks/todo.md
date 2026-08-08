# Teacher bio / teaching style → rich text (2026-08-08)

## Scope agreed with owner
Bold, italic, bullet + numbered list, **and images** (owner moderates uploads manually).
No colours, no alignment, no links (links would let a teacher pull students off-platform).

## Done
- [x] `pickLang()` in `src/lib/multiLang.ts` — fallback chain `selected → en → vi → any filled language`
- [x] `src/lib/richText.ts` — `toRichHtml` (legacy plain text → HTML), `richTextToPlain`, `isRichTextEmpty`
- [x] `sanitizeTeacherHtml()` in `src/lib/sanitize.ts` — allowlist + private DOMPurify instance that strips non-https `img src`
- [x] `src/components/admin/RichTextField.tsx` — trimmed Tiptap editor, image upload to `teacher-profiles/`
- [x] `AdminProfile.tsx` — only the open language tab mounts an editor; `*` marker uses `isRichTextEmpty`; empty langs saved as `''`
- [x] `TeacherRichText` renders sanitized prose on TeacherProfilePage + TeachersListPage
- [x] HomePage carousel uses `richTextToPlain` (it clamps to 3 lines)
- [x] i18n keys for the toolbar/image dialog in all 5 locales
- [x] `tsc --noEmit`, `npm run build`, lint (no new findings), 24 logic + 24 sanitizer assertions green

## Review notes
- Three bugs were caught only by the sanitizer tests: `loading="lazy"` eaten by the custom
  `ALLOWED_URI_REGEXP`, `data:` image URIs surviving, and `richTextToPlain` gluing list items
  together. Details live in memory (`teacher-rich-text.md`).
- No storage rules change needed: bio images reuse the existing `teacher-profiles/` prefix.

## Not done / manual
- Not committed, not deployed.
- Needs a browser pass: edit a bio with each toolbar button, upload an image, switch language
  tabs, save, then check the teacher profile page, the teachers list and the home carousel.
