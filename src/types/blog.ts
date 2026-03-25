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

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: MultiLangText;
  excerpt: MultiLangText;
  coverImageUrl: string;
  publishedAt: Date;
  tags: string[];
}
