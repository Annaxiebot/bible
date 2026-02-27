/**
 * AuthPanel.tsx
 *
 * Simplified auth panel: Google OAuth sign-in or continue offline.
 */

import { useState, useEffect } from 'react';
import { authManager, syncManager, isSupabaseConfigured, type AuthState, type SyncStatus } from '../services/supabase';
import { syncService } from '../services/syncService';
import '../styles/AuthPanel.css';

export function AuthPanel() {
  const [authState, setAuthState] = useState<AuthState>(authManager.getState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubAuth = authManager.subscribe(setAuthState);
    const unsubSync = syncManager.subscribe(setSyncStatus);
    return () => { unsubAuth(); unsubSync(); };
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    const { error } = await authManager.signInWithGoogle();
    setIsLoading(false);
    if (error) setError(error.message);
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    await authManager.signOut();
    setIsLoading(false);
    setMessage('Signed out successfully');
  };

  const handleSync = async () => {
    setError('');
    setMessage('');
    try {
      await syncService.performFullSync();
      setMessage('Sync completed!');
    } catch (err) {
      setError('Sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'syncing': return 'Syncing...';
      case 'idle': return 'Synced';
      case 'error': return 'Sync error';
      case 'offline': return 'Offline';
      case 'disabled': return 'Sync disabled';
      default: return 'Unknown';
    }
  };

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing': return '🔄';
      case 'idle': return '✅';
      case 'error': return '❌';
      case 'offline': return '📡';
      case 'disabled': return '🔒';
      default: return '❓';
    }
  };

  const lastSyncTime = syncManager.getLastSyncTime();
  const lastSyncText = lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Never';

  if (authState.isLoading) {
    return <div className="auth-panel"><div className="auth-loading">Loading...</div></div>;
  }

  return (
    <div className="auth-panel">
      {authState.isAuthenticated ? (
        <div className="auth-signed-in">
          <div className="auth-user-info">
            <div className="auth-email">
              <strong>📧</strong> {authState.user?.email}
            </div>
            <div className="auth-sync-status">
              <span className="sync-icon">{getSyncStatusIcon()}</span>
              <span className="sync-text">{getSyncStatusText()}</span>
              {syncStatus === 'idle' && (
                <span className="sync-time">Last: {lastSyncText}</span>
              )}
            </div>
          </div>
          <div className="auth-actions">
            <button onClick={handleSync} disabled={syncStatus === 'syncing' || isLoading} className="btn-sync">
              Sync Now
            </button>
            <button onClick={handleSignOut} disabled={isLoading} className="btn-signout">
              Sign Out
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}
        </div>
      ) : (
        <div className="auth-signed-out">
          <div className="auth-prompt">
            <p className="auth-info">
              💾 Your data is saved locally.
              <br />
              Sign in with Google to sync across devices.
            </p>
            {isSupabaseConfigured() && (
              <button onClick={handleGoogleSignIn} disabled={isLoading} className="btn-show-auth">
                {isLoading ? 'Redirecting...' : 'Sign in with Google'}
              </button>
            )}
            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
