import type { MultiLangText } from './common';

export interface TeacherProfile {
  name: string;
  age: number;
  location: string;
  locationSince: number;
  origin: string;
  languages: Record<string, string>;
  education: string;
  previousLocations: { city: string; years: string }[];
  interests: string[];
  lessonPrice: number;
  currency: string;
  rating: number;
  totalReviews: number;
  bio: MultiLangText;
  teachingStyle: MultiLangText;
  profileImageUrl: string;
  videoIntroUrl: string;
  socialLinks: Record<string, string>;
  updatedAt: Date;
}
