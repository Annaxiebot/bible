/**
 * AuthPanel.tsx
 * 
 * Authentication panel for optional cloud sync.
 * Allows users to sign up, sign in, and manage their sync account.
 */

import { useState, useEffect } from 'react';
import { authManager, syncManager, type AuthState, type SyncStatus } from '../services/supabase';
import { syncService } from '../services/syncService';
import '../styles/AuthPanel.css';

export function AuthPanel() {
  const [authState, setAuthState] = useState<AuthState>(authManager.getState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubAuth = authManager.subscribe(setAuthState);
    const unsubSync = syncManager.subscribe(setSyncStatus);
    return () => {
      unsubAuth();
      unsubSync();
    };
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error } = await authManager.signUp(email, password);
    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setMessage('Account created! Please check your email to verify your account.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    setIsLoading(true);
    const { error } = await authManager.signIn(email, password);
    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setMessage('Signed in successfully!');
      setShowAuth(false);
      setEmail('');
      setPassword('');
    }
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
      setMessage('Sync completed successfully!');
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
  const lastSyncText = lastSyncTime 
    ? new Date(lastSyncTime).toLocaleTimeString()
    : 'Never';

  if (authState.isLoading) {
    return (
      <div className="auth-panel">
        <div className="auth-loading">Loading...</div>
      </div>
    );
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
            <button 
              onClick={handleSync}
              disabled={syncStatus === 'syncing' || isLoading}
              className="btn-sync"
            >
              Sync Now
            </button>
            <button 
              onClick={handleSignOut}
              disabled={isLoading}
              className="btn-signout"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="auth-signed-out">
          {!showAuth ? (
            <div className="auth-prompt">
              <p className="auth-info">
                💾 Your data is saved locally by default.
                <br />
                <strong>Optional:</strong> Create an account to sync across devices.
              </p>
              <button 
                onClick={() => setShowAuth(true)}
                className="btn-show-auth"
              >
                Sign In / Sign Up
              </button>
            </div>
          ) : (
            <div className="auth-form-container">
              <button 
                onClick={() => setShowAuth(false)}
                className="btn-close"
              >
                ✕
              </button>
              
              <div className="auth-toggle">
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setError('');
                    setMessage('');
                  }}
                  className={!isSignUp ? 'active' : ''}
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    setError('');
                    setMessage('');
                  }}
                  className={isSignUp ? 'active' : ''}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="auth-form">
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                </div>

                {isSignUp && (
                  <div className="form-group">
                    <label htmlFor="confirm-password">Confirm Password</label>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      disabled={isLoading}
                      minLength={6}
                    />
                  </div>
                )}

                {error && <div className="auth-error">{error}</div>}
                {message && <div className="auth-message">{message}</div>}

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="btn-submit"
                >
                  {isLoading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
