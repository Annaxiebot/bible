# Deployment Instructions for GitHub Pages

## Setup Steps:

### 1. Add GitHub Secrets for Supabase
1. Go to your repository: https://github.com/csheargm/bible
2. Click on "Settings" tab
3. In the left sidebar, click "Secrets and variables" → "Actions"
4. Click "New repository secret"
5. Add the following secrets (the build passes them as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

No AI key goes into the build: AI runs through the `ai-proxy` edge function
(its `OPENROUTER_API_KEY` is a Supabase secret) or the user's own key — ADR-0007.

### 2. Enable GitHub Pages
1. In repository Settings
2. Go to "Pages" in the left sidebar
3. Under "Build and deployment":
   - Source: Select "GitHub Actions"

### 3. Deploy
The site will automatically deploy when you push to the master branch.
You can also manually trigger deployment:
1. Go to "Actions" tab
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

### 4. Access Your Site
Once deployed, your site will be available at:
https://csheargm.github.io/bible/

## Important Notes:
- The Supabase URL and anon key are public by design (row-level security protects the data)
- The vite config has been set up with base: '/bible/' for proper GitHub Pages routing