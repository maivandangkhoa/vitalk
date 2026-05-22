import type { MultiLangText } from './common';
import type { AllowedDuration } from '@/lib/constants';

export type LessonLevel = 'beginner' | 'intermediate' | 'conversation';

export interface LessonType {
  id: string;
  title: MultiLangText;
  description: MultiLangText;
  /**
   * Durations (in minutes) that students can pick for this lesson type.
   * Default: all four (45, 60, 90, 120). Admin may restrict.
   */
  allowedDurations?: AllowedDuration[];
  features: MultiLangText[];
  level: LessonLevel;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
