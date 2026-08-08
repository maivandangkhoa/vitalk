import type { Review } from '@/types';
import type { TeacherProfile } from '@/types/profile';

export interface SiteReviewStats {
  /** Reviews visible on the site. Null when there are none to report. */
  reviewCount: number | null;
  /** One decimal, e.g. "5.0". Null when no teacher has a rating yet. */
  averageRating: string | null;
}

/**
 * The review numbers shown in the hero on `/` and on `/reviews`.
 *
 * Both pages used to compute this themselves from a hardcoded `362` and a
 * local average, which is how they drifted apart — one got corrected and the
 * other kept the old literal. Keeping it a plain function rather than a hook
 * means neither page pays for an extra fetch to use it.
 *
 * The rating deliberately does not come from the review documents: italki's
 * reviews endpoint carries no stars, so every imported review is stored at a
 * flat 5 and averaging them would measure the importer rather than the
 * teaching. `teachers.rating` holds italki's real per-teacher figure, weighted
 * here by how many reviews each teacher accounts for.
 */
export function siteReviewStats(
  teachers: TeacherProfile[],
  reviews: Review[]
): SiteReviewStats {
  const rated = teachers.filter((t) => t.rating > 0 && t.totalReviews > 0);
  const ratedReviews = rated.reduce((sum, t) => sum + t.totalReviews, 0);

  return {
    reviewCount: reviews.length > 0 ? reviews.length : null,
    averageRating:
      ratedReviews > 0
        ? (
            rated.reduce((sum, t) => sum + t.rating * t.totalReviews, 0) /
            ratedReviews
          ).toFixed(1)
        : null,
  };
}
