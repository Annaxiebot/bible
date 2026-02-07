/**
 * supabase.ts
 * 
 * Supabase client configuration for Bible app cloud sync.
 * Provides real-time sync for bookmarks, annotations, notes, and reading progress.
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://jyntvxgapvnmsfzgpnka.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eWn3s_jO1vTAQgbLK5EgJw_1jkUtQFb';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database types
export interface DbBookmark {
  id: string;
  user_id: string;
  book_id: string;
  book_name: string;
  chapter: number;
  verse: number;
  text_preview: string;
  created_at: string;
}

export interface DbAnnotation {
  id: string;
  user_id: string;
  book_id: string;
  chapter: number;
  canvas_data: string;
  canvas_height: number;
  last_modified: string;
}

export interface DbNote {
  id: string;
  user_id: string;
  book_id: string;
  chapter: number;
  verse: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DbReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  chapter: number;
  completed_at: string;
}

// Helper to get or create anonymous user ID (stored in localStorage)
export function getAnonymousUserId(): string {
  const STORAGE_KEY = 'bible-app-user-id';
  let userId = localStorage.getItem(STORAGE_KEY);
  
  if (!userId) {
    // Generate a UUID-like anonymous user ID
    userId = 'anon_' + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, userId);
  }
  
  return userId;
}

// Sync status management
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

class SyncManager {
  private status: SyncStatus = 'idle';
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  getStatus(): SyncStatus {
    return this.status;
  }

  setStatus(status: SyncStatus) {
    this.status = status;
    this.listeners.forEach(listener => listener(status));
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const syncManager = new SyncManager();

// Check if online
export function isOnline(): boolean {
  return navigator.onLine;
}

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncManager.setStatus('idle');
  });
  
  window.addEventListener('offline', () => {
    syncManager.setStatus('offline');
  });
}
