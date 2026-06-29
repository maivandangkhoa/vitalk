# ViTalk

A full-featured language learning platform connecting students with native Vietnamese teachers for online and in-person lessons. Built with React, TypeScript, and Firebase.

## Features

**For Students**
- Browse teacher profiles with ratings, reviews, and availability
- Multi-step booking wizard — select lesson type, pick a time slot, choose payment method
- Support for online (Zoom, Google Meet, Zalo, Kakao Talk) and in-person lessons
- Real-time timezone conversion for scheduling across countries
- View and manage booking history

**For Teachers**
- Manage weekly availability calendar in 30-minute slots
- Set lesson rates with per-duration price overrides
- View upcoming and past bookings

**Admin**
- Dashboard with booking analytics and payment status charts
- Manage teachers, students, lesson types, and offline locations
- Blog editor (Tiptap WYSIWYG) with AI-powered translation to all supported languages
- Review moderation

**Platform**
- Multi-language UI: English, Korean, Chinese (Simplified), Japanese, Vietnamese
- Automatic language detection by browser locale and IP geolocation
- Payment: PayPal, Toss (Korean), bank transfer
- Email notifications and lesson reminders
- PWA-ready with service worker

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router 7 |
| Styling | Tailwind CSS 4, shadcn/ui, Motion |
| Forms | React Hook Form + Zod |
| State | Zustand |
| Backend | Firebase (Firestore, Auth, Storage, Cloud Functions) |
| Payments | PayPal SDK, Toss Payments |
| Auth | Email/Password, Google, Naver, Kakao |
| i18n | i18next (EN / KO / ZH / JA / VI) |
| Editor | Tiptap 3 |
| AI | Anthropic Claude (blog translation) |
| Email | Nodemailer via Cloud Functions |

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with Firestore, Authentication, Storage, and Functions enabled

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd vitalk
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your Firebase project values:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run the development server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server (kills any existing process on port 5173 first) |
| `npm run build` | Type-check and build for production → `dist/` |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build and deploy hosting + functions to Firebase |
| `npm run deploy:hosting` | Deploy frontend only |
| `npm run deploy:functions` | Deploy Cloud Functions only |

Deployment requires a Firebase service account key at `firebase-auth.json` in the project root.

## Project Structure

```
vitalk/
├── src/
│   ├── pages/          # Route-level page components
│   │   └── admin/      # Admin-only pages (dashboard, bookings, blog, etc.)
│   ├── components/
│   │   ├── ui/         # shadcn/ui primitives
│   │   ├── layout/     # PublicLayout, AdminLayout
│   │   ├── booking/    # Payment components (PayPal, Toss, bank transfer)
│   │   └── shared/     # ProtectedRoute, LoadingSpinner, etc.
│   ├── hooks/          # Data-fetching hooks (useTeachers, useBookings, …)
│   ├── stores/         # Zustand stores (auth, profile, ui)
│   ├── lib/            # Firebase init, i18n, pricing, timezone utilities
│   ├── types/          # TypeScript interfaces
│   └── router/         # React Router config with lazy loading
├── functions/          # Firebase Cloud Functions (Node.js 20)
│   └── src/
│       ├── paypal.ts         # createPaypalOrder, capturePaypalOrder
│       ├── toss.ts           # confirmTossPayment
│       ├── naverAuth.ts      # Naver OAuth
│       ├── kakaoAuth.ts      # Kakao OAuth
│       ├── bookingTriggers.ts # Send emails on booking create/update
│       ├── reminders.ts      # Scheduled lesson reminder emails
│       ├── translateBlog.ts  # AI translation via Anthropic Claude
│       └── scrapeItalki.ts   # italki profile/review sync
├── public/
│   └── locales/        # i18n translation files (en, ko, zh, ja, vi)
├── firestore.rules     # Firestore security rules
├── storage.rules       # Storage security rules
└── firebase.json       # Firebase project config
```

## Firebase Setup

The project uses Firebase project ID `vietalky`. Firestore collections:

| Collection | Purpose |
|---|---|
| `users` | User accounts and roles |
| `teachers` | Teacher profiles and pricing |
| `teachers/{id}/availability` | Monthly availability calendars |
| `bookings` | Lesson bookings and payment state |
| `lessonTypes` | Available lesson types |
| `reviews` | Student reviews |
| `blogPosts` | Blog articles with multi-language content |
| `locations` | Offline lesson venues |
| `siteConfig` | Global settings (currency, pricing defaults) |

Security rules enforce role-based access: public read for teachers/reviews/blogs, authenticated access for bookings, admin-only for management operations.

## Cloud Functions Dependencies

The following credentials are required as Firebase Function environment config or Secret Manager entries for full functionality:

- **Anthropic API key** — blog translation
- **PayPal client ID + secret** — payment processing
- **Toss client key + secret** — Korean payment processing
- **Naver app credentials** — Naver OAuth
- **Kakao app credentials** — Kakao OAuth
- **SMTP credentials** — email notifications (via Nodemailer)
