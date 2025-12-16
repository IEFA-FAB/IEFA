-- FIX FOR INFINITE RECURSION IN user_profiles RLS POLICIES
-- Execute this SQL in Supabase SQL Editor

-- DROP the problematic "Editors can view all profiles" policy
DROP POLICY IF EXISTS "Editors can view all profiles" ON journal.user_profiles;

-- RECREATE it using the security definer function instead
CREATE POLICY "Editors can view all profiles"
  ON journal.user_profiles FOR SELECT
  USING (journal.is_editor(auth.uid()));

-- Also, let's ensure the is_editor function works correctly
-- It should be using security definer to bypass RLS
CREATE OR REPLACE FUNCTION journal.is_editor(user_uuid uuid DEFAULT auth.uid())
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM journal.user_profiles
    WHERE id = user_uuid AND role = 'editor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ADDITIONAL FIX: Create a function to auto-create profile on auth
-- This will create the profile automatically when a user first logs in

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO journal.user_profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'author'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- VERIFY ALL POLICIES ARE CORRECT
-- Run this to see all policies on user_profiles:
-- SELECT * FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'journal';
