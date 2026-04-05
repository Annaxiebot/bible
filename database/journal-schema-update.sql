-- Journal Table Schema Update
-- Adds journal entries support with blocks, realtime sync, and media

-- =====================================================
-- JOURNAL TABLE
-- Stores journal entries with block-based content
-- =====================================================
CREATE TABLE IF NOT EXISTS journal (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  plain_text TEXT DEFAULT '',
  drawing TEXT DEFAULT '',
  blocks JSONB DEFAULT '[]'::jsonb, -- NEW: Block-based content (text, drawing, image blocks)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  book_id TEXT,
  chapter INTEGER,
  verse_ref TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;

-- RLS Policies for journal
CREATE POLICY "Users can view their own journal entries"
  ON journal FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal entries"
  ON journal FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
  ON journal FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
  ON journal FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_created_at ON journal(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_updated_at ON journal(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_tags ON journal USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_journal_blocks ON journal USING gin(blocks);

-- Notability-style unified canvas data (serialized JSON)
ALTER TABLE journal ADD COLUMN IF NOT EXISTS notability_data TEXT DEFAULT NULL;

-- Enable Realtime for journal
ALTER PUBLICATION supabase_realtime ADD TABLE journal;

-- =====================================================
-- JOURNAL_MEDIA TABLE (Optional - for large images)
-- Stores references to uploaded media in Supabase Storage
-- =====================================================
CREATE TABLE IF NOT EXISTS journal_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id TEXT NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL, -- References block.id in journal.blocks JSONB
  storage_path TEXT NOT NULL, -- Path in Supabase Storage bucket
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE journal_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies for journal_media
CREATE POLICY "Users can view their own journal media"
  ON journal_media FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal media"
  ON journal_media FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal media"
  ON journal_media FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_media_user ON journal_media(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_media_journal ON journal_media(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_media_block ON journal_media(block_id);

-- Enable Realtime for journal_media
ALTER PUBLICATION supabase_realtime ADD TABLE journal_media;
