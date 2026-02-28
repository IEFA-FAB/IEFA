# Supabase Storage Configuration for Journal System

This document contains instructions for setting up storage buckets in the Supabase Dashboard.

## Storage Buckets

You need to create two storage buckets:

### 1. journal-submissions (PRIVATE)

**Purpose**: Store article manuscripts, source files, and supplementary materials during the submission and review process.

**Settings:**
- **Name**: `journal-submissions`
- **Public**: `false` (Private bucket)
- **File size limit**: 50MB per file
- **Allowed MIME types**: All types allowed

**How to create:**
1. Go to Supabase Dashboard → Storage
2. Click "New bucket"
3. Enter name: `journal-submissions`
4. Keep "Public bucket" unchecked
5. Click "Create bucket"

---

### 2. journal-published (PUBLIC)

**Purpose**: Store final published PDFs that are publicly accessible.

**Settings:**
- **Name**: `journal-published`
- **Public**: `true` (Public bucket)
- **File size limit**: 50MB per file
- **Allowed MIME types**: PDF, images

**How to create:**
1. Go to Supabase Dashboard → Storage
2. Click "New bucket"
3. Enter name: `journal-published`
4. Check "Public bucket"
5. Click "Create bucket"

---

## Folder Structure

### journal-submissions structure:
```
journal-submissions/
├── {article-id}/
│   ├── v1/
│   │   ├── manuscript.pdf
│   │   ├── source.typ
│   │   └── supplementary/
│   │       ├── data.csv
│   │       └── figures.zip
│   ├── v2/
│   │   └── manuscript.pdf
│   └── v3/
│       └── ...
```

### journal-published structure:
```
journal-published/
├── 2024/
│   ├── {article-id}/
│   │   ├── article.pdf
│   │   └── thumbnail.png
├── 2025/
│   └── ...
```

---

## Row Level Security (RLS) Policies

After creating the buckets, you need to apply RLS policies to control access.

### Execute these in SQL Editor (Supabase Dashboard → SQL Editor):

```sql
-- ============================================
-- RLS POLICIES FOR journal-submissions (PRIVATE)
-- ============================================

-- Policy: Users can upload to their own articles
create policy "Users can upload to their own articles"
on storage.objects for insert
with check (
  bucket_id = 'journal-submissions'
  and (storage.foldername(name))[1]::uuid in (
    select id from journal.articles where submitter_id = auth.uid()
  )
);

-- Policy: Users can read their own submissions
create policy "Users can read their own submissions"
on storage.objects for select
using (
  bucket_id = 'journal-submissions'
  and (
    -- Author can read their own
    (storage.foldername(name))[1]::uuid in (
      select id from journal.articles where submitter_id = auth.uid()
    )
    -- OR Reviewer can read assigned articles
    or (storage.foldername(name))[1]::uuid in (
      select article_id from journal.review_assignments
      where reviewer_id = auth.uid() and status in ('accepted', 'completed')
    )
    -- OR Editor can read all
    or exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  )
);

-- Policy: Users can update their own article files
create policy "Users can update own article files"
on storage.objects for update
using (
  bucket_id = 'journal-submissions'
  and (storage.foldername(name))[1]::uuid in (
    select id from journal.articles 
    where submitter_id = auth.uid()
    and status in ('draft', 'revision_requested')
  )
);

-- Policy: Editors can delete any file
create policy "Editors can delete submissions"
on storage.objects for delete
using (
  bucket_id = 'journal-submissions'
  and exists (
    select 1 from journal.user_profiles
    where id = auth.uid() and role = 'editor'
  )
);

-- ============================================
-- RLS POLICIES FOR journal-published (PUBLIC)
-- ============================================

-- Policy: Anyone can read published articles
create policy "Anyone can read published articles"
on storage.objects for select
using (bucket_id = 'journal-published');

-- Policy: Only editors can upload to published bucket
create policy "Editors can upload published articles"
on storage.objects for insert
with check (
  bucket_id = 'journal-published'
  and exists (
    select 1 from journal.user_profiles
    where id = auth.uid() and role = 'editor'
  )
);

-- Policy: Only editors can update published files
create policy "Editors can update published files"
on storage.objects for update
using (
  bucket_id = 'journal-published'
  and exists (
    select 1 from journal.user_profiles
    where id = auth.uid() and role = 'editor'
  )
);

-- Policy: Only editors can delete published files
create policy "Editors can delete published files"
on storage.objects for delete
using (
  bucket_id = 'journal-published'
  and exists (
    select 1 from journal.user_profiles
    where id = auth.uid() and role = 'editor'
  )
);
```

---

## Testing Storage Access

After applying the policies, test the configuration:

### 1. Test as Author
- Log in as a regular user
- Navigate to `/journal/submit`
- Try uploading a PDF file
- Verify file appears in `journal-submissions/{article-id}/v1/`

### 2. Test as Reviewer
- Assign yourself as reviewer to an article
- Try accessing the article's files
- Verify you can download the manuscript

### 3. Test as Editor
- Grant editor role to a user
- Try accessing all articles' files
- Verify full access to all buckets

### 4. Test Public Access
- Without logging in, try accessing a published article PDF
- URL should be publicly accessible: `https://{project}.supabase.co/storage/v1/object/public/journal-published/{path}`

---

## Important Notes

1. **File Naming**: The application automatically generates file paths. Don't manually upload files to these buckets.

2. **Storage Limits**: Free tier Supabase has 1GB storage limit. Monitor usage in Dashboard → Settings → Usage.

3. **Cleanup**: Implement periodic cleanup of deleted articles' files to free up space.

4. **Security**: Never expose service role key in client-side code. Storage operations use RLS for security.

5. **Backups**: Consider regular backups of published bucket contents.

---

## Troubleshooting

### "Permission denied" errors
- Check RLS policies are applied correctly
- Verify user has proper role in `journal.user_profiles`
- Check article ownership for file uploads

### Files not appearing
- Verify bucket names match exactly
- Check file path structure follows the documented format
- Ensure file size doesn't exceed limits

### Slow uploads
- Files over 10MB may take time
- Consider implementing progress indicators
- Check network connection
