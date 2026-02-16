-- Scripture Scholar Database Schema
-- This schema supports optional cloud sync for user data
-- Run this in your Supabase SQL editor

-- Enable Row Level Security on all tables
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- NOTES TABLE
-- Stores verse-specific notes (markdown/rich text)
-- =====================================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, -- e.g., "John 3:16"
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Composite index for efficient queries
  UNIQUE(user_id, reference)
);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notes
CREATE POLICY "Users can view their own notes"
  ON notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON notes FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_book_chapter ON notes(book_id, chapter);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);

-- =====================================================
-- ANNOTATIONS TABLE
-- Stores handwritten notes/drawings on canvas
-- =====================================================
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  panel_id TEXT, -- 'chinese' or 'english' (for bilingual view)
  canvas_data TEXT NOT NULL, -- JSON serialized drawing paths
  canvas_height INTEGER DEFAULT 0, -- Expanded canvas height in pixels
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Composite unique constraint
  UNIQUE(user_id, book_id, chapter, panel_id)
);

-- Enable RLS
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for annotations
CREATE POLICY "Users can view their own annotations"
  ON annotations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own annotations"
  ON annotations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own annotations"
  ON annotations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own annotations"
  ON annotations FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_annotations_user_id ON annotations(user_id);
CREATE INDEX idx_annotations_book_chapter ON annotations(book_id, chapter);
CREATE INDEX idx_annotations_updated_at ON annotations(updated_at DESC);

-- =====================================================
-- READING_HISTORY TABLE
-- Tracks which chapters user has read
-- =====================================================
CREATE TABLE IF NOT EXISTS reading_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  last_read TIMESTAMPTZ DEFAULT NOW(),
  has_notes BOOLEAN DEFAULT FALSE,
  has_ai_research BOOLEAN DEFAULT FALSE,
  
  -- Composite unique constraint
  UNIQUE(user_id, book_id, chapter)
);

-- Enable RLS
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reading_history
CREATE POLICY "Users can view their own reading history"
  ON reading_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reading history"
  ON reading_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading history"
  ON reading_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reading history"
  ON reading_history FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_reading_history_user_id ON reading_history(user_id);
CREATE INDEX idx_reading_history_book ON reading_history(book_id);
CREATE INDEX idx_reading_history_last_read ON reading_history(last_read DESC);

-- =====================================================
-- USER_SETTINGS TABLE
-- Stores app preferences and configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_settings
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LAST_READ TABLE
-- Stores the last position read (for quick resume)
-- =====================================================
CREATE TABLE IF NOT EXISTS last_read (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE last_read ENABLE ROW LEVEL SECURITY;

-- RLS Policies for last_read
CREATE POLICY "Users can view their own last read"
  ON last_read FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own last read"
  ON last_read FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own last read"
  ON last_read FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own last read"
  ON last_read FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_last_read_updated_at
  BEFORE UPDATE ON last_read
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPFUL QUERIES (for reference)
-- =====================================================

-- Get all notes for a user
-- SELECT * FROM notes WHERE user_id = auth.uid() ORDER BY updated_at DESC;

-- Get reading history for a user
-- SELECT * FROM reading_history WHERE user_id = auth.uid() ORDER BY last_read DESC;

-- Get total chapters read
-- SELECT COUNT(*) FROM reading_history WHERE user_id = auth.uid();

-- Get books with notes
-- SELECT DISTINCT book_id, book_name FROM reading_history 
-- WHERE user_id = auth.uid() AND has_notes = TRUE;
