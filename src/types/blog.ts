import type { MultiLangText } from './common';

/**
 * Where an imported post came from, so it can be re-synced.
 *
 * Absent on posts written here, and on everything imported before this existed
 * — the importer used to drop blogId/logNo the moment it had the content, which
 * left no way back to the original. Sync asks for the URL once in that case.
 */
export interface BlogPostSource {
  platform: 'naver';
  blogId: string;
  logNo: string;
  /** Fingerprint of the source as of the last sync; drives "has it changed?". */
  contentHash: string;
  syncedAt: Date | null;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: MultiLangText;
  excerpt: MultiLangText;
  content: MultiLangText;
  coverImageUrl: string;
  tags: string[];
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  source?: BlogPostSource;
}

/**
 * A reader's comment on a post. `authorName`/`authorPhoto` are copied in at
 * write time — `users/{uid}` is owner-read-only, so the list cannot join back
 * to the account that wrote it. Same trade-off `reviews` already makes.
 */
export interface BlogComment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  createdAt: Date | null;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: MultiLangText;
  excerpt: MultiLangText;
  coverImageUrl: string;
  publishedAt: Date;
  tags: string[];
}
