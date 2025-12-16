# Journal System Setup Guide

Complete setup instructions for the IEFA Scientific Journal Management System.

## Prerequisites

- Supabase account and project created
- Node.js 18+ and pnpm installed
- Environment variables configured

---

## 1. Environment Variables

Create or update your `.env` file in `apps/iefa/` with the following variables:

```bash
# Supabase Configuration
VITE_IEFA_SUPABASE_URL=https://your-project.supabase.co
VITE_IEFA_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Site Configuration
VITE_SITE_URL=http://localhost:3000

# Email Service (Optional - for future implementation)
# RESEND_API_KEY=re_xxxxxxxxxxxxx
# FROM_EMAIL=journal@yourdomain.com
```

### Where to find Supabase keys:
1. Go to Supabase Dashboard
2. Select your project
3. Go to Settings → API
4. Copy `URL`, `anon` (public), and `service_role` keys

---

## 2. Database Migration

### ✅ Already Completed

You mentioned the migration was already executed. The SQL migration file is available at:
- `supabase/migrations/20241215_create_journal_schema.sql`

This file can be used to recreate the schema if needed in the future.

### What was migrated:
- ✅ `journal` schema created
- ✅ 10 tables created (user_profiles, articles, article_authors, etc.)
- ✅ RLS policies applied
- ✅ Triggers and functions created
- ✅ Views created (published_articles, editorial_dashboard)
- ✅ Initial seed data inserted (email templates, journal settings)

---

## 3. Storage Bucket Setup

Follow the instructions in `supabase/storage_setup.md` to:

1. Create two storage buckets:
   - `journal-submissions` (private)
   - `journal-published` (public)

2. Apply RLS policies for each bucket

3. Test access permissions

**Important**: This must be done manually in the Supabase Dashboard.

---

## 4. Install Dependencies

Run the following command to install new dependencies:

```bash
cd apps/iefa
pnpm install
```

New dependencies added:
- `@supabase/supabase-js` - Supabase client
- `react-dropzone` - File upload component
- `date-fns` - Date formatting
- `@dnd-kit/core` & `@dnd-kit/sortable` - Drag and drop functionality

---

## 5. Type Generation (Optional but Recommended)

Generate TypeScript types from your Supabase schema:

```bash
# Install Supabase CLI globally (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Generate types
supabase gen types typescript --schema journal > src/lib/journal/database.types.ts
```

**Note**: Manual types are already provided in `src/lib/journal/types.ts`, so this step is optional.

---

## 6. Initialize User Profile

Before using the journal system, users need to create their profile:

1. Start the development server:
   ```bash
   pnpm iefa:dev
   ```

2. Log in to your account

3. Navigate to `/journal/profile`

4. Fill out your profile information:
   - Full name
   - Institutional affiliation
   - ORCID iD (optional but recommended)
   - Areas of expertise
   - Bio

This profile data will be automatically used when submitting articles.

---

## 7. Grant Editor Role (Optional)

To access editorial features, a user needs the `editor` role.

Execute this in Supabase Dashboard → SQL Editor:

```sql
-- Replace 'user-uuid-here' with the actual user ID
UPDATE journal.user_profiles 
SET role = 'editor' 
WHERE id = 'user-uuid-here';
```

To find a user's UUID:
```sql
SELECT id, email FROM auth.users;
```

---

## 8. Verify Installation

### Test Checklist:

- [ ] Environment variables loaded correctly
- [ ] Database schema exists in `journal` schema
- [ ] Storage buckets created and policies applied
- [ ] Can access `/journal/profile` when logged in
- [ ] Can save profile information
- [ ] Profile data persists after reload

### Quick Test Queries:

```sql
-- Check if journal schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'journal';

-- Check tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'journal';

-- Check user profiles
SELECT * FROM journal.user_profiles LIMIT 5;

-- Check journal settings
SELECT * FROM journal.journal_settings;
```

---

## 9. File Structure Overview

The following files were created/modified in Phase 1:

```
apps/iefa/
├── src/
│   ├── lib/
│   │   ├── supabase.ts                    # ✏️ Modified (removed schema lock)
│   │   └── journal/                       # 🆕 New directory
│   │       ├── types.ts                   # TypeScript types
│   │       ├── client.ts                  # Database helpers
│   │       ├── hooks.ts                   # React Query hooks
│   │       └── auth.ts                    # Auth/permission helpers
│   ├── components/
│   │   └── journal/                       # 🆕 New directory
│   │       └── ProfileForm.tsx            # Profile form component
│   └── routes/
│       └── journal/
│           └── profile.tsx                # 🆕 Profile page route
├── supabase/                              # 🆕 New directory
│   ├── migrations/
│   │   └── 20241215_create_journal_schema.sql
│   └── storage_setup.md
├── package.json                           # ✏️ Modified (new deps)
└── JOURNAL_SETUP.md                       # 🆕 This file
```

---

## 10. Next Steps (Phase 2)

After completing Phase 1 setup, you're ready for Phase 2:

- **Article Submission Form**: Multi-step form for authors
- **File Upload System**: PDF and source file uploads
- **Author Dashboard**: View submission status
- **Author Management**: Add co-authors to articles

See `steps.md` for detailed Phase 2 tasks.

---

## Troubleshooting

### "Permission denied for schema journal"
**Solution**: Ensure RLS policies are applied and user has a profile in `journal.user_profiles`.

### "Schema not found" errors in queries
**Solution**: Supabase client now requires explicit schema: use `.from('journal.table_name')` instead of `.from('table_name')`.

### Profile page shows errors
**Solution**: 
1. Check user is authenticated
2. Verify `journal.user_profiles` table exists
3. Check browser console for specific errors

### Cannot save profile
**Solution**:
1. Check RLS policies on `journal.user_profiles`
2. Verify user is logged in
3. Check form validation errors

---

## Important Notes

### ⚠️ Email Service Deferred

Email notifications are not implemented in Phase 1. Placeholder email templates exist in the database, but no emails will be sent. This will be implemented in a future phase.

### Multi-Schema Support

The application now supports both `iefa` and `journal` schemas:
- Existing IEFA routes use `iefa` schema
- Journal routes use `journal` schema
- Each query explicitly specifies its schema

### Security

- All database operations use RLS (Row Level Security)
- Users can only access their own articles unless they're editors
- Storage files are protected by RLS policies
- Service role key should NEVER be exposed in client code

---

## Support

For issues or questions:
1. Check this documentation
2. Review `PRD.md` for system requirements
3. Check `steps.md` for implementation details
4. Verify Supabase Dashboard for schema/data issues

---

Last Updated: 2024-12-15
Version: Phase 1 Complete
