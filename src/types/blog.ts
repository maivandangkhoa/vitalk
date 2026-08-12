import type { MultiLangText } from './common';

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
