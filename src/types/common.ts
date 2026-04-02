export type Language = 'en' | 'vi' | 'ko' | 'ja';

export type MultiLangText = Record<Language, string>;

export type UserRole = 'admin' | 'teacher' | 'user';

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: UserRole;
  provider: 'google' | 'kakao' | 'naver' | 'email';
  preferredLanguage: Language;
  teacherId?: string;
  createdAt: Date;
  lastLoginAt: Date;
}
