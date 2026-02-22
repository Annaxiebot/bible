/**
 * supabase.ts
 * 
 * Supabase client configuration for Bible app cloud sync.
 * Provides optional authentication and real-time sync for notes, annotations, 
 * reading history, and settings.
 */

import { createClient, User, Session, AuthError } from '@supabase/supabase-js';

// Get configuration from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not configured. Cloud sync will be disabled.');
}

// Create Supabase client
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// =====================================================
// DATABASE TYPES
// =====================================================

export interface DbNote {
  id: string;
  user_id: string;
  reference: string;
  book_id: string;
  chapter: number;
  verse?: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DbAnnotation {
  id: string;
  user_id: string;
  book_id: string;
  chapter: number;
  panel_id?: string | null;
  canvas_data: string;
  canvas_height: number;
  created_at: string;
  updated_at: string;
}

export interface DbReadingHistory {
  id: string;
  user_id: string;
  book_id: string;
  book_name: string;
  chapter: number;
  last_read: string;
  has_notes: boolean;
  has_ai_research: boolean;
}

export interface DbLastRead {
  user_id: string;
  book_id: string;
  book_name: string;
  chapter: number;
  updated_at: string;
}

export interface DbUserSettings {
  user_id: string;
  settings: Record<string, any>;
  updated_at: string;
}

// =====================================================
// AUTH STATE MANAGEMENT
// =====================================================

export type AuthState = {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

class AuthManager {
  private state: AuthState = {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true
  };
  
  private listeners: Set<(state: AuthState) => void> = new Set();

  constructor() {
    this.initialize();
  }

  private async initialize() {
    if (!supabase) {
      this.state.isLoading = false;
      this.notify();
      return;
    }

    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    this.updateState(session);

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      this.updateState(session);
    });

    this.state.isLoading = false;
    this.notify();
  }

  private updateState(session: Session | null) {
    this.state = {
      user: session?.user || null,
      session,
      isAuthenticated: !!session,
      isLoading: false
    };
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state); // Call immediately with current state
    return () => this.listeners.delete(listener);
  }

  async signInWithGoogle(): Promise<{ error: AuthError | null }> {
    if (!supabase) {
      return { error: new Error('Supabase not configured') as any };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    return { error };
  }

  async signOut(): Promise<{ error: AuthError | null }> {
    if (!supabase) {
      return { error: new Error('Supabase not configured') as any };
    }
    const { error } = await supabase.auth.signOut();
    return { error };
  }

  getUserId(): string | null {
    return this.state.user?.id || null;
  }

  getEmail(): string | null {
    return this.state.user?.email || null;
  }
}

export const authManager = new AuthManager();

// =====================================================
// SYNC STATUS MANAGEMENT
// =====================================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

class SyncManager {
  private status: SyncStatus = supabase ? 'idle' : 'disabled';
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncTime: number | null = null;
  private syncError: string | null = null;

  getStatus(): SyncStatus {
    return this.status;
  }

  setStatus(status: SyncStatus, error?: string) {
    this.status = status;
    if (error) {
      this.syncError = error;
    } else if (status !== 'error') {
      this.syncError = null;
    }
    
    if (status === 'idle' && !error) {
      this.lastSyncTime = Date.now();
    }
    
    this.listeners.forEach(listener => listener(status));
  }

  getLastSyncTime(): number | null {
    return this.lastSyncTime;
  }

  getError(): string | null {
    return this.syncError;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isEnabled(): boolean {
    return this.status !== 'disabled';
  }
}

export const syncManager = new SyncManager();

// =====================================================
// ONLINE/OFFLINE DETECTION
// =====================================================

export function isOnline(): boolean {
  return navigator.onLine;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (syncManager.getStatus() === 'offline') {
      syncManager.setStatus('idle');
    }
  });
  
  window.addEventListener('offline', () => {
    syncManager.setStatus('offline');
  });
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

export function canSync(): boolean {
  return isSupabaseConfigured() && authManager.getState().isAuthenticated && isOnline();
}
