export type Language = 'en' | 'vi' | 'ko' | 'ja';

export type MultiLangText = Record<Language, string>;

export type UserRole = 'admin' | 'user';

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: UserRole;
  provider: 'google' | 'kakao' | 'email';
  preferredLanguage: Language;
  createdAt: Date;
  lastLoginAt: Date;
}
