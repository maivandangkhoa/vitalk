import type { MultiLangText } from './common';
import type { AllowedDuration } from '@/lib/constants';
import type { SupportedCurrency } from '@/lib/currency';

export interface TeacherProfile {
  id: string;
  slug: string;
  uid: string;
  email: string;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  name: string;
  age: number;
  location: string;
  locationSince: number;
  origin: string;
  languages: Record<string, string>;
  education: string;
  previousLocations: { city: string; years: string }[];
  interests: string[];
  /**
   * USD per 60 minutes. Used as the base for all duration prices unless
   * overridden in `lessonPriceOverrides`.
   */
  hourlyRate: number;
  /** Optional per-currency override of `hourlyRate`. */
  hourlyRates?: Partial<Record<SupportedCurrency, number>>;
  /** Optional explicit USD price for a given duration (skips multiplier math). */
  lessonPriceOverrides?: Partial<Record<AllowedDuration, number>>;
  currency: string;
  /** @deprecated kept for backward-compat with old docs; read `hourlyRate` instead. */
  lessonPrice?: number;
  rating: number;
  totalReviews: number;
  bio: MultiLangText;
  teachingStyle: MultiLangText;
  profileImageUrl: string;
  videoIntroUrl: string;
  socialLinks: Record<string, string>;
  /** Contact handles per online lesson platform — shown to students once
   *  they pick a platform in the booking flow so they know who to add. */
  contactIds?: {
    teams?: string;
    googleMeet?: string;
    zalo?: string;
    kakaoTalk?: string;
    /** Optional QR-code image URLs for the apps where adding a contact by
     *  scanning is the norm. */
    zaloQrUrl?: string;
    kakaoTalkQrUrl?: string;
  };
  updatedAt: Date;
}
