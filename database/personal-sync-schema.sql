-- Personal app sync — the five recovered tables · 个人圣经应用同步表 (ADR-0010)
--
-- Apply AFTER supabase-schema.sql and journal-schema-update.sql: open the
-- Supabase dashboard → SQL editor → paste this whole file → Run. Idempotent
-- (IF NOT EXISTS / DROP POLICY IF EXISTS), so re-running is safe. Applied to
-- the live project through the management API on 2026-10-05.
--
-- Why this file exists: services/syncService.ts has synced these tables since
-- the app's first Supabase project, but no SQL file ever captured them — the
-- live project never had them, so every verse-data / bookmark / chat /
-- memory / sync-metadata push failed. Every column, key and conflict target
-- below is derived from what syncService.ts writes and reads (the upsert
-- payloads and their onConflict strings); database/__tests__/
-- personalSyncSchema.test.ts pins the two against each other.
--
-- bible_cache is NOT created: it held per-user copies of public Bible text.
-- BSB and CUV are bundled (public/bible-data) and other versions re-fetch
-- from their public source, so syncService no longer syncs it (ADR-0010).
--
-- Access: owner-only. Each signed-in user reads and writes only rows where
-- auth.uid() = user_id; nothing for anon. Rows go with the account
-- (ON DELETE CASCADE).

-- =====================================================
-- VERSE_DATA — personal note + AI research per verse
-- upsert onConflict 'user_id,verse_id' (syncVerseData)
-- =====================================================
CREATE TABLE IF NOT EXISTS verse_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verse_id TEXT NOT NULL,            -- VerseData.id, e.g. "GEN_1_1" or a GENERAL id
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verses INTEGER[] NOT NULL,
  data JSONB NOT NULL,               -- the whole VerseData object
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, verse_id)
);
CREATE INDEX IF NOT EXISTS idx_verse_data_user_updated ON verse_data(user_id, updated_at);

-- =====================================================
-- BOOKMARKS
-- upsert onConflict 'user_id,bookmark_id' (syncBookmarks)
-- =====================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id TEXT NOT NULL,         -- Bookmark.id, "bookId:chapter:verse"
  book_id TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text_preview TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,        -- Bookmark.createdAt, epoch ms from the client
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bookmark_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_updated ON bookmarks(user_id, updated_at);

-- =====================================================
-- CHAT_HISTORY — one row per AI chat thread
-- upsert onConflict 'user_id,id' (syncChatHistory)
-- =====================================================
CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT NOT NULL,                  -- ChatHistoryRecord.id (UUID or "bookId:chapter")
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  book_id TEXT NOT NULL DEFAULT '',
  chapter INTEGER NOT NULL DEFAULT 0,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_modified BIGINT NOT NULL,     -- ChatHistoryRecord.lastModified, epoch ms
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_updated ON chat_history(user_id, updated_at);

-- =====================================================
-- SPIRITUAL_MEMORY — the personal agent's remembered themes
-- upsert onConflict 'id' (syncSpiritualMemory); ids are "mem_<ms>_<rand>"
-- =====================================================
CREATE TABLE IF NOT EXISTS spiritual_memory (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,            -- SpiritualMemoryItem.category
  content TEXT NOT NULL,
  source TEXT,                       -- journal entry id, nullable
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spiritual_memory_user_updated ON spiritual_memory(user_id, updated_at);

-- =====================================================
-- SYNC_METADATA — per-module last-modified stamps (the cross-device trigger)
-- upsert onConflict 'user_id,module' (updateServerTimestamp, performFullSync)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_metadata (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,              -- a SyncModule name, e.g. 'notes', 'verseData'
  last_modified BIGINT NOT NULL,     -- epoch ms
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module)
);

-- =====================================================
-- RLS — owner-only on all five; nothing for anon
-- =====================================================
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['verse_data', 'bookmarks', 'chat_history', 'spiritual_memory', 'sync_metadata'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Users can view their own %s" ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own %s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Users can insert their own %s" ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Users can update their own %s" ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "Users can delete their own %s" ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t, t);
  END LOOP;
END $rls$;

-- Realtime: syncService subscribes to sync_metadata changes (channel
-- 'sync-realtime') so a second device learns about a push within seconds.
DO $rt$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sync_metadata') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_metadata;
  END IF;
END $rt$;
