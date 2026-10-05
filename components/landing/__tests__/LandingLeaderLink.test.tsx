/**
 * LandingLeaderLink.test.tsx — the nav's leader control, both states · 带领者入口测试
 *
 * Signed out: "带领者登录 Leader sign-in" (Chinese first) is a button that
 * starts the identity-only Google sign-in; an auth error is shown. Signed
 * in: the leader's first name (else the email's local part) is a link to
 * #/leader. services/supabase is mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NAV_LEADER_SIGNIN } from '../landingStrings';
import { LEADER_HOME_HASH } from '../../leader/leaderRoute';

type User = { id: string; email: string | null } | null;
let user: User = null;
let fullName: string | null = null;
const signInMock = vi.fn();
vi.mock('../../../services/supabase', () => ({
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => ({ user, session: null, isAuthenticated: !!user, isLoading: false }),
    subscribe: (l: (s: unknown) => void) => { l({ user, session: null, isAuthenticated: !!user, isLoading: false }); return () => undefined; },
    getFullName: () => fullName,
    signInWithGoogle: () => signInMock(),
  },
}));

import LandingLeaderLink from '../LandingLeaderLink';
import { leaderDisplayName } from '../../leader/useLeaderSession';

beforeEach(() => {
  user = null;
  fullName = null;
  signInMock.mockReset().mockResolvedValue({ error: null });
});

describe('LandingLeaderLink', () => {
  it('signed out: one button "带领者登录 Leader sign-in" that starts Google sign-in', async () => {
    render(<LandingLeaderLink />);
    const button = screen.getByTestId('nav-leader-signin');
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe(`${NAV_LEADER_SIGNIN.zh} ${NAV_LEADER_SIGNIN.en}`);
    fireEvent.click(button);
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('signed out: a failed sign-in start is shown, not swallowed', async () => {
    signInMock.mockResolvedValue({ error: { message: 'Supabase not configured' } });
    render(<LandingLeaderLink />);
    fireEvent.click(screen.getByTestId('nav-leader-signin'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase not configured');
  });

  it('signed in: the first name links to the leader home', () => {
    user = { id: 'uid-lead', email: 'chris@example.com' };
    fullName = 'Chris Xie';
    render(<LandingLeaderLink />);
    const link = screen.getByRole('link', { name: 'Chris' });
    expect(link).toHaveAttribute('href', LEADER_HOME_HASH);
    expect(screen.queryByTestId('nav-leader-signin')).toBeNull();
  });

  it('signed in without a name: the email local part', () => {
    user = { id: 'uid-lead', email: 'pastor.li@example.com' };
    render(<LandingLeaderLink />);
    expect(screen.getByRole('link', { name: 'pastor.li' })).toHaveAttribute('href', LEADER_HOME_HASH);
  });
});

describe('leaderDisplayName', () => {
  it('first word of the name, else email local part, else empty', () => {
    expect(leaderDisplayName('  谢立荣 ', 'x@y.z')).toBe('谢立荣');
    expect(leaderDisplayName('Chris Xie', null)).toBe('Chris');
    expect(leaderDisplayName(null, 'a.b@c.d')).toBe('a.b');
    expect(leaderDisplayName('', null)).toBe('');
  });
});
