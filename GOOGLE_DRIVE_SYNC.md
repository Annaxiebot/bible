# Google Drive Sync Setup Guide

This document explains how to set up Google Drive sync for Scripture Scholar.

## Overview

Google Drive sync allows users to:
- ✅ Automatically back up notes, bookmarks, and annotations
- ✅ Sync data across all devices (phone, tablet, computer)
- ✅ Own 100% of their data in their own Google Drive
- ✅ Work offline with automatic sync when back online

## Architecture

User data is stored in a `Scripture Scholar/` folder in the user's Google Drive:

```
📁 Google Drive / Scripture Scholar /
  ├─ notes.json           (all text notes)
  ├─ bookmarks.json       (bookmarks)  
  ├─ annotations.json     (handwriting strokes)
  ├─ settings.json        (user preferences)
  ├─ reading-history.json (reading history)
  ├─ reading-plans.json   (reading plans)
  ├─ verse-data.json      (verse highlights, tags)
  └─ photos/              (camera captures)
      ├─ 2026-02-23-001.jpg
      └─ 2026-02-23-002.jpg
```

## Setup Instructions

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Note your project ID

### 2. Enable Google Drive API

1. In the Google Cloud Console, go to **APIs & Services > Library**
2. Search for "Google Drive API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** user type
3. Fill in the required fields:
   - **App name**: Scripture Scholar
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes**
6. Add the following scope:
   - `https://www.googleapis.com/auth/drive.file`
7. Click **Save and Continue**
8. Add test users if needed (or publish the app)
9. Click **Save and Continue**

### 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: Scripture Scholar Web App
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (for development)
     - `https://yourdomain.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:5173` (for development)
     - `https://yourdomain.com` (for production)
5. Click **Create**
6. Copy the **Client ID** (you'll need this)

### 5. Create API Key (Optional but Recommended)

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials** > **API key**
3. Copy the API key
4. Click **Restrict Key** and select:
   - **API restrictions** > **Restrict key**
   - Select **Google Drive API**
5. Click **Save**

### 6. Configure Environment Variables

Create a `.env.local` file in the project root (if it doesn't exist):

```bash
# Google OAuth 2.0 Client ID (required)
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com

# Google API Key (optional but recommended)
VITE_GOOGLE_API_KEY=your-api-key-here
```

### 7. Test the Integration

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser

3. Click the settings icon (⚙️) in the top right

4. Scroll to the **Cloud Sync with Google Drive** section

5. Click **Sign in with Google to Sync**

6. Authorize the app

7. Your data should now sync to Google Drive!

## Security Notes

- **OAuth 2.0**: Uses Google's secure OAuth 2.0 flow
- **Minimal Permissions**: Only requests `drive.file` scope (access only to files created by this app)
- **User Ownership**: All data is stored in the user's own Google Drive
- **No Server**: Direct client-to-Drive communication (no data passes through our servers)
- **Environment Variables**: Never commit `.env.local` to git (already in `.gitignore`)

## Deployment

When deploying to production:

1. Update OAuth credentials with your production domain
2. Add production domain to **Authorized JavaScript origins** and **Authorized redirect URIs**
3. Set environment variables on your hosting platform:
   - Vercel: Project Settings > Environment Variables
   - Netlify: Site Settings > Build & Deploy > Environment
   - Other: Refer to your hosting provider's documentation

## Troubleshooting

### "Access blocked: This app's request is invalid"

- Make sure your OAuth consent screen is configured correctly
- Add your domain to the authorized origins
- For development, use `http://localhost:5173` exactly (no trailing slash)

### "API key not valid"

- Make sure the API key is restricted to Google Drive API
- Check that the key hasn't expired
- Regenerate the key if needed

### "Failed to sign in"

- Check browser console for errors
- Make sure `VITE_GOOGLE_CLIENT_ID` is set correctly
- Clear browser cache and try again
- Make sure popups are not blocked

### Sync not working

- Check that you're signed in (green checkmark should appear)
- Try clicking "Sync Now" manually
- Check browser console for errors
- Make sure you're online

## Data Migration from Supabase

If you previously used Supabase sync:

1. Export your data from Supabase using the Export feature
2. Sign in to Google Drive sync
3. Your local data will automatically upload to Google Drive
4. You can now disable Supabase sync

## Privacy & Data Ownership

- **Your Data**: All notes, bookmarks, and annotations are stored in YOUR Google Drive, not ours
- **Access**: Only you can access your data
- **Deletion**: You can delete the "Scripture Scholar" folder from your Drive at any time
- **Portability**: All data is in standard JSON format (easy to export/backup)

## Future Improvements

Planned features:
- ✅ Offline-first with automatic sync
- ✅ Conflict resolution (last-write-wins)
- 🔄 Manual conflict resolution UI
- 🔄 Selective sync (choose what to sync)
- 🔄 Sync status indicator in app header
- 🔄 Export/Import from Google Drive folder
- 🔄 iOS app with iCloud sync (using the same folder structure)

## Support

If you encounter issues:
1. Check this documentation
2. Check browser console for errors
3. Open an issue on GitHub with error details
4. Include browser version and OS
