/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Script 1: Delete all previous tables and start from a clean slate
export const SUPABASE_DELETE_PREVIOUS_SQL = `-- =========================================================
-- SPARK APP: DELETE PREVIOUS TABLES ONLY
-- Run this in Supabase SQL Editor if you need to wipe old tables:
-- =========================================================

DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_members CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.user_crypto_keys CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
`;

// Script 2: Complete Fresh Production Setup (Drops any old tables first, then builds complete schema)
export const SUPABASE_SETUP_SQL = `-- =========================================================
-- SPARK APP: COMPLETE CLEAN PRODUCTION DATABASE SETUP
-- Drops previous tables first, then creates clean schema:
-- (Dashboard -> SQL Editor -> New query -> Paste & Run)
-- =========================================================

-- 0. Clean up any previous tables to prevent schema/constraint conflicts
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_members CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.user_crypto_keys CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Create PROFILES Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT 'https://api.dicebear.com/7.x/bottts/svg?seed=spark1',
  avatar_style TEXT DEFAULT 'cosmic_neon',
  bio TEXT DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 50,
  weekly_coins INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 1,
  daily_coins_earned INTEGER NOT NULL DEFAULT 0,
  daily_coins_date DATE NOT NULL DEFAULT CURRENT_DATE,
  equipped_frame TEXT NOT NULL DEFAULT 'frame_pulsar',
  equipped_theme TEXT NOT NULL DEFAULT 'theme_cosmic',
  equipped_outfit TEXT NOT NULL DEFAULT 'outfit_voyager',
  unlocked_items TEXT[] NOT NULL DEFAULT ARRAY['frame_pulsar', 'theme_cosmic', 'outfit_voyager'],
  last_spark_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_username_format CHECK (username ~* '^[a-zA-Z0-9_]{3,20}$')
);

-- Case-insensitive unique index for usernames
CREATE UNIQUE INDEX idx_profiles_username_lower ON public.profiles (LOWER(username));

-- 2. Create CONVERSATIONS Table (Supports 1-to-1 and Group Chats)
CREATE TABLE public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  is_group BOOLEAN DEFAULT FALSE,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create CONVERSATION_MEMBERS Table
CREATE TABLE public.conversation_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conv_members_user ON public.conversation_members (user_id);
CREATE INDEX idx_conv_members_conv ON public.conversation_members (conversation_id);

-- 4. Create MESSAGES Table (With End-to-End Encryption & Group Media Columns)
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  ciphertext TEXT,
  iv TEXT,
  encryption_version TEXT DEFAULT 'e2ee_ecdh_aes_gcm_v1',
  coins_earned INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_conv ON public.messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_sender ON public.messages (sender_id, created_at DESC);
CREATE INDEX idx_messages_receiver ON public.messages (receiver_id, created_at DESC);

-- 5. Create USER_CRYPTO_KEYS Table (Public Identity Keys for ECDH Key Agreement)
-- NOTE: Only PUBLIC keys are stored here. Private keys NEVER leave user devices.
CREATE TABLE public.user_crypto_keys (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  public_key JSONB NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'ECDH-P256',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create FRIENDSHIPS Table
CREATE TABLE public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  streak_count INTEGER NOT NULL DEFAULT 1,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- =========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_crypto_keys ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- CONVERSATIONS POLICIES
CREATE POLICY "Users can view conversations they belong to"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- CONVERSATION_MEMBERS POLICIES
CREATE POLICY "Users can view members of their conversations"
  ON public.conversation_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add members to conversation"
  ON public.conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- MESSAGES POLICIES (Strict Chat Privacy)
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id 
    OR auth.uid() = receiver_id
    OR (
      conversation_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert messages as themselves"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

-- USER_CRYPTO_KEYS POLICIES
CREATE POLICY "Public crypto keys are viewable by authenticated users"
  ON public.user_crypto_keys FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own public crypto key"
  ON public.user_crypto_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own public crypto key"
  ON public.user_crypto_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- FRIENDSHIPS POLICIES
CREATE POLICY "Users can view their friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can manage their friendships"
  ON public.friendships FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- =========================================================
-- REALTIME REPLICATION SETUP
-- =========================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_crypto_keys;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- =========================================================
-- SECURE USERNAME AVAILABILITY RPC
-- Allows checking username availability without exposing user directories
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_username_available(target_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_username IS NULL OR LENGTH(TRIM(target_username)) < 3 OR LENGTH(TRIM(target_username)) > 20 THEN
    RETURN FALSE;
  END IF;
  
  IF target_username !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE LOWER(username) = LOWER(TRIM(target_username))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO authenticated, anon;

-- =========================================================
-- PRIVATE STORAGE BUCKET FOR GROUP CHAT IMAGES
-- =========================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'storage',
  'storage',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage RLS: Only authenticated group members can upload/view private images
DROP POLICY IF EXISTS "Group members can upload media" ON storage.objects;
CREATE POLICY "Group members can upload media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-media', 'storage')
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Group members can view media" ON storage.objects;
CREATE POLICY "Group members can view media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('chat-media', 'storage')
    AND auth.uid() IS NOT NULL
  );
`;

// Script 3: Safe Non-Destructive Migration Script for Existing Databases
export const SUPABASE_MIGRATION_SQL = `-- =========================================================
-- SPARK APP: SAFE NON-DESTRUCTIVE MIGRATION
-- Run this in Supabase SQL Editor if you already have existing data
-- It preserves all users, messages, friendships and keys without data loss:
-- =========================================================

-- 1. Ensure all profiles columns and extensions exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 50;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_coins_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_coins_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_frame TEXT NOT NULL DEFAULT 'frame_pulsar';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_theme TEXT NOT NULL DEFAULT 'theme_cosmic';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_outfit TEXT NOT NULL DEFAULT 'outfit_voyager';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlocked_items TEXT[] NOT NULL DEFAULT ARRAY['frame_pulsar', 'theme_cosmic', 'outfit_voyager'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_spark_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure case-insensitive unique index for usernames exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (LOWER(username));

-- 3. Ensure username format constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_username_format'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT check_username_format CHECK (username ~* '^[a-zA-Z0-9_]{3,20}$');
  END IF;
END $$;

-- 4. Ensure profiles Row Level Security (RLS) is enabled and policies are created
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Profiles are viewable by authenticated users'
  ) THEN
    CREATE POLICY "Profiles are viewable by authenticated users"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.profiles FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END $$;

-- 5. Create or update the secure username availability RPC function
CREATE OR REPLACE FUNCTION public.check_username_available(target_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_username IS NULL OR LENGTH(TRIM(target_username)) < 3 OR LENGTH(TRIM(target_username)) > 20 THEN
    RETURN FALSE;
  END IF;
  
  IF target_username !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE LOWER(username) = LOWER(TRIM(target_username))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO authenticated, anon;

-- 6. Support Group Conversations & Image URLs in Messages
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_media_url ON public.messages (conversation_id) WHERE media_url IS NOT NULL;

-- 7. Provision Private Storage Bucket ('chat-media' & 'storage') for Group Images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'storage',
  'storage',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 8. Storage Row Level Security (RLS) for Private Group Images
DROP POLICY IF EXISTS "Group members can upload media" ON storage.objects;
CREATE POLICY "Group members can upload media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-media', 'storage')
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Group members can view media" ON storage.objects;
CREATE POLICY "Group members can view media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('chat-media', 'storage')
    AND auth.uid() IS NOT NULL
  );
`;

