/**
 * ASCII slugs for URLs.
 *
 * A slug that keeps its original letters is percent-encoded the moment it
 * travels: `/blog/trời-ơi-베트남어` shows up in a KakaoTalk bubble as
 * `/blog/tr%E1%BB%9Di-%C6%A1i-%EB%B2%A0…`. Everything here exists to keep the
 * output inside `[a-z0-9-]`.
 */

/** Revised Romanization, indexed by the jamo's position in the syllable block. */
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** Index of the silent ㅇ among the initials. */
const CHO_IEUNG = 11;
/** Index of ㄹ among the finals. */
const JONG_RIEUL = 8;

/** Position of a character inside the Hangul syllable block, or -1. */
function syllableIndex(ch: string | undefined): number {
  const code = ch ? ch.codePointAt(0)! : -1;
  return code >= HANGUL_FIRST && code <= HANGUL_LAST ? code - HANGUL_FIRST : -1;
}

/**
 * Hangul → Latin, one syllable at a time. Non-Hangul characters pass through.
 *
 * Only one of Revised Romanization's sound-change rules is applied: a final ㄹ
 * followed by the silent ㅇ carries over as `r`, so 물어보기 reads `mureobogi`
 * rather than `muleobogi`. The rest — 소개합니다 is properly `sogaehamnida`,
 * not the `sogaehapnida` this produces — needs a pronunciation model that a
 * slug does not earn.
 */
function romanizeHangul(text: string): string {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const index = syllableIndex(ch);
      if (index < 0) return ch;
      const jong = index % 28;
      const carriesOver =
        jong === JONG_RIEUL &&
        Math.floor(syllableIndex(chars[i + 1]) / 588) === CHO_IEUNG;
      return (
        CHO[Math.floor(index / 588)] +
        JUNG[Math.floor((index % 588) / 28)] +
        (carriesOver ? 'r' : JONG[jong])
      );
    })
    .join('');
}

/**
 * Anything that is neither a Latin letter, a digit, nor a separator — Hangul,
 * Han, kana, emoji. Punctuation stays because it becomes a hyphen later.
 */
const FOREIGN_SCRIPT = /[^\p{Script=Latin}\p{Nd}\s\p{P}]/gu;

/** Long enough for a readable title, short enough to paste into a chat. */
const MAX_LENGTH = 80;

/**
 * Build a URL-safe slug from a title in any of the site's five languages.
 *
 * A title that mixes scripts — `"Trời ơi!" 베트남어 감탄 표현` — keeps only its
 * Latin half (`troi-oi`): the Vietnamese phrase is what the post is about, and
 * romanizing the Korean gloss around it would bury it. A title with no Latin at
 * all is romanized whole, since dropping it would leave nothing.
 *
 * Returns `''` when a title romanizes to nothing, so callers pick their own
 * fallback.
 */
export function toAsciiSlug(text: string): string {
  const source = /\p{Script=Latin}/u.test(text)
    ? text.replace(FOREIGN_SCRIPT, ' ')
    : romanizeHangul(text);

  const slug = source
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Not a combining mark, so NFD leaves it alone.
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= MAX_LENGTH) return slug;
  const cut = slug.slice(0, MAX_LENGTH);
  const lastWord = cut.lastIndexOf('-');
  return lastWord > 0 ? cut.slice(0, lastWord) : cut;
}
