import type { MultiLangText } from './common';

export type LessonLevel = 'beginner' | 'intermediate' | 'conversation';

export interface LessonType {
  id: string;
  title: MultiLangText;
  description: MultiLangText;
  duration: number;
  price: number;
  currency: string;
  features: MultiLangText[];
  level: LessonLevel;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
