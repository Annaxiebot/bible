# Supabase Cloud Sync Setup

This document explains how to set up and use the optional cloud sync feature.

## Features

- **Optional Authentication**: Local storage works by default, no account required
- **Cross-Device Sync**: Sign in to sync your data across multiple devices
- **Auto-sync**: Syncs every 5 minutes when authenticated
- **Manual Sync**: Click "Sync Now" button anytime
- **Synced Data**:
  - Verse notes
  - Handwritten annotations (canvas drawings)
  - Reading history
  - Last read position

## Database Setup

### 1. Access Supabase Dashboard

- Organization: **Scripture Scholar**
- Project: **bible-app**
- URL: https://supabase.com/dashboard/project/jyntvxgapvnmsfzgpnka

### 2. Create Database Tables

1. Go to **SQL Editor** in the Supabase dashboard
2. Open the file `supabase-schema.sql` in this project
3. Copy the entire SQL content
4. Paste it into the SQL Editor
5. Click **Run** to execute

This will create:
- `notes` - For verse notes
- `annotations` - For handwritten/canvas annotations
- `reading_history` - For chapter reading history
- `last_read` - For last reading position
- `user_settings` - For app preferences
- All necessary indexes and Row Level Security (RLS) policies

### 3. Enable Authentication

The schema already enables Supabase Auth. Users can:
- Sign up with email/password
- Sign in to sync their data
- All data is private (RLS policies ensure users only see their own data)

## Environment Variables

The following environment variables are already configured in `.env.local`:

```env
VITE_SUPABASE_URL=https://jyntvxgapvnmsfzgpnka.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Note**: These are safe to commit as they're the public anon key. RLS policies protect user data.

## How It Works

### Local-First Approach

1. **Without Account**: All data stored in browser (IndexedDB + localStorage)
2. **With Account**: Data synced to cloud, but local storage still works
3. **Offline Mode**: App works fully offline, syncs when back online

### Sync Behavior

- **Initial Sync**: When user signs in, all local data syncs to cloud
- **Bidirectional Sync**: Merges local and remote data (last-write-wins)
- **Periodic Sync**: Auto-syncs every 5 minutes when authenticated
- **Manual Sync**: User can trigger sync anytime via "Sync Now" button

### Conflict Resolution

Currently uses **last-write-wins** strategy:
- Newer timestamp wins on conflict
- Remote changes downloaded and merged into local
- Local changes uploaded to remote

## User Interface

The auth panel is located in the **Sidebar** under **☁️ Cloud Sync**:

- **Signed Out**:
  - Shows info about local-first approach
  - "Sign In / Sign Up" button
  - Sign up/sign in form

- **Signed In**:
  - Shows user email
  - Sync status indicator (✅ Synced, 🔄 Syncing, ❌ Error, etc.)
  - Last sync time
  - "Sync Now" button
  - "Sign Out" button

## Testing

### Test Locally

1. Start dev server: `npm run dev`
2. Open http://localhost:3000/bible/
3. Open Sidebar → ☁️ Cloud Sync
4. Create an account and sign in
5. Add some notes/annotations
6. Check Supabase dashboard to verify data synced

### Test Cross-Device Sync

1. Sign in on Device A
2. Add notes/annotations
3. Wait for sync (or click "Sync Now")
4. Sign in with same account on Device B
5. Verify data appears on Device B

### Test Offline Mode

1. Sign in and add data
2. Disconnect from internet
3. Add more data (saves locally)
4. Reconnect to internet
5. Data should auto-sync

## Security

- **Row Level Security (RLS)**: Enabled on all tables
- **User Isolation**: Users can only access their own data
- **Anonymous Keys**: Public anon key is safe to use client-side
- **Email Verification**: Can be enabled in Supabase Auth settings

## Troubleshooting

### Sync Not Working

1. Check browser console for errors
2. Verify internet connection
3. Check Supabase project status
4. Verify environment variables are set correctly

### Data Not Appearing After Sign In

1. Check if initial sync completed (status should be ✅ Synced)
2. Try manual sync with "Sync Now" button
3. Check browser console for errors
4. Verify RLS policies are correctly set in Supabase

### Email Verification

By default, Supabase requires email verification. To disable for testing:
1. Go to **Authentication** → **Providers** → **Email**
2. Uncheck "Enable email confirmations"
3. Save changes

## Future Enhancements

Potential improvements:
- Real-time sync using Supabase Realtime
- Conflict resolution UI for manual merge
- Sync Bible cache for fully offline experience
- Settings sync (theme, preferences, etc.)
- Sharing notes/annotations with others
- Export to PDF/Google Drive integration
