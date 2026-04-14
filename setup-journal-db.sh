#!/bin/bash
# Setup journal tables in Supabase using Management API

PROJECT_REF="akzgptgetjmsbibhnuhs"
TOKEN="sbp_v0_e62680ea49e2d6adabb7fcaaa4e62d760b0dfb23"
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"

echo "🔧 Setting up journal tables in Supabase..."

# Helper function to execute SQL
execute_sql() {
  local sql="$1"
  local description="$2"
  
  echo "  → $description"
  
  curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(jq -n --arg q "$sql" '$q')}" | jq -r '.error // "✓"'
}

# 1. Create journal table
execute_sql "CREATE TABLE IF NOT EXISTS journal (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  plain_text TEXT DEFAULT '',
  drawing TEXT DEFAULT '',
  blocks JSONB DEFAULT '[]'::jsonb,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  book_id TEXT,
  chapter INTEGER,
  verse_ref TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);" "Creating journal table"

# 2. Enable RLS
execute_sql "ALTER TABLE journal ENABLE ROW LEVEL SECURITY;" "Enabling RLS"

# 3. RLS Policies
execute_sql "DROP POLICY IF EXISTS \"Users can view their own journal entries\" ON journal;" "Dropping old SELECT policy"
execute_sql "CREATE POLICY \"Users can view their own journal entries\" ON journal FOR SELECT USING (auth.uid() = user_id);" "SELECT policy"

execute_sql "DROP POLICY IF EXISTS \"Users can insert their own journal entries\" ON journal;" "Dropping old INSERT policy"
execute_sql "CREATE POLICY \"Users can insert their own journal entries\" ON journal FOR INSERT WITH CHECK (auth.uid() = user_id);" "INSERT policy"

execute_sql "DROP POLICY IF EXISTS \"Users can update their own journal entries\" ON journal;" "Dropping old UPDATE policy"
execute_sql "CREATE POLICY \"Users can update their own journal entries\" ON journal FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);" "UPDATE policy"

execute_sql "DROP POLICY IF EXISTS \"Users can delete their own journal entries\" ON journal;" "Dropping old DELETE policy"
execute_sql "CREATE POLICY \"Users can delete their own journal entries\" ON journal FOR DELETE USING (auth.uid() = user_id);" "DELETE policy"

# 4. Indexes
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_user ON journal(user_id);" "Index: user_id"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_created_at ON journal(created_at DESC);" "Index: created_at"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_updated_at ON journal(updated_at DESC);" "Index: updated_at"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_tags ON journal USING gin(tags);" "Index: tags (GIN)"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_blocks ON journal USING gin(blocks);" "Index: blocks (GIN)"

# 5. Enable Realtime
execute_sql "ALTER PUBLICATION supabase_realtime ADD TABLE journal;" "Enabling Realtime"

# 6. Create journal_media table
execute_sql "CREATE TABLE IF NOT EXISTS journal_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id TEXT NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);" "Creating journal_media table"

# 7. RLS for journal_media
execute_sql "ALTER TABLE journal_media ENABLE ROW LEVEL SECURITY;" "Enabling RLS for journal_media"

execute_sql "DROP POLICY IF EXISTS \"Users can view their own journal media\" ON journal_media;" "Dropping old SELECT policy"
execute_sql "CREATE POLICY \"Users can view their own journal media\" ON journal_media FOR SELECT USING (auth.uid() = user_id);" "SELECT policy (media)"

execute_sql "DROP POLICY IF EXISTS \"Users can insert their own journal media\" ON journal_media;" "Dropping old INSERT policy"
execute_sql "CREATE POLICY \"Users can insert their own journal media\" ON journal_media FOR INSERT WITH CHECK (auth.uid() = user_id);" "INSERT policy (media)"

execute_sql "DROP POLICY IF EXISTS \"Users can delete their own journal media\" ON journal_media;" "Dropping old DELETE policy"
execute_sql "CREATE POLICY \"Users can delete their own journal media\" ON journal_media FOR DELETE USING (auth.uid() = user_id);" "DELETE policy (media)"

# 8. Indexes for journal_media
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_media_user ON journal_media(user_id);" "Index: user_id (media)"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_media_journal ON journal_media(journal_id);" "Index: journal_id"
execute_sql "CREATE INDEX IF NOT EXISTS idx_journal_media_block ON journal_media(block_id);" "Index: block_id"

# 9. Enable Realtime for journal_media
execute_sql "ALTER PUBLICATION supabase_realtime ADD TABLE journal_media;" "Enabling Realtime (media)"

echo ""
echo "✅ Journal database setup complete!"
echo "   - journal table with blocks support"
echo "   - journal_media table for large images"
echo "   - RLS policies enabled"
echo "   - Indexes created"
echo "   - Realtime enabled"
