# GutenLib - PRD (Product Requirements Document)

## Original Problem Statement
المستخدم طلب تحليل مشروع GutenLib وإعادة بنائه بالكامل مع تحسين الـ Frontend وجعله أسرع وإصلاح التصميم العام.

## Architecture
- **Framework**: Next.js 16.1.6 with TypeScript
- **Styling**: Tailwind CSS 4 + Custom CSS
- **React**: 19.2.3
- **EPUB**: epubjs for EPUB reading
- **Voice**: Socket.IO + WebRTC for voice rooms
- **Arabic**: @connectrpc/connect for gRPC (ABL API)
- **Mobile**: Capacitor for Android
- **Storage**: IndexedDB (library data) + localStorage (reading progress)
- **External APIs**: Gutendex (English books), ABL gRPC (Arabic books)

## User Personas
1. **English Reader** - Browses/reads English books from Project Gutenberg
2. **Arabic Reader** - Reads Arabic books via ABL library
3. **Library Manager** - Organizes favorites, lists, notes

## Core Requirements
- Browse/search books (English & Arabic)
- Read books in-app (text, EPUB, Arabic pages)
- Track reading progress
- Manage personal library (favorites, lists, notes)
- Voice rooms for book discussions

## What's Been Implemented (Jan 2026)

### Frontend Redesign Complete
- **New Color System**: Jewel & Luxury theme with amber/emerald accents (#D97706 primary)
- **Typography**: Playfair Display + Outfit (EN), Amiri + Tajawal (AR)
- **Glassmorphism**: Glass-effect surfaces for nav, cards, modals
- **Animations**: CSS fadeInUp, float, stagger-children effects
- **Homepage**: Cinematic hero section with bento grid feature cards
- **Books Page**: Improved card grid with hover lift effects and overlay
- **Book Detail**: Clean layout with glass cards, amber CTAs
- **Arabic Section**: Updated with amber accent colors, better RTL
- **Navigation**: Glassmorphic header with active state indicators
- **Search**: Rounded search bar with clear button and glass dropdown
- **Reading Lists**: Glass cards with gradient progress bars
- **Backend Proxy**: Fixed double /api/ prefix issue

### Testing Status
- All pages load correctly ✅
- Navigation flows work ✅
- Search functionality works ✅
- data-testid coverage verified ✅
- Backend proxy fixed ✅

## Prioritized Backlog
### P0 (Critical)
- None currently

### P1 (High)
- Arabic books API (ABL gRPC) returns empty results - external service issue
- Reader components (Reader.tsx, EpubReader.tsx, ArabicReader.tsx) still use old design
- LibraryClient.tsx still uses old design patterns

### P2 (Medium)
- Voice rooms page still uses old inline CSS design
- Admin page needs updating
- Image optimization (use next/image instead of <img>)
- Performance: Code-split large reader components
- Add loading skeletons for better perceived performance

### Future/Backlog
- Server-side sync for library data (currently local-only)
- PWA offline support
- Reading stats & streaks
- Social features (share lists, reviews)
- AI-powered book recommendations
