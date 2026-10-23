/**
 * LandingLeaderLink.test.tsx — the nav's leader control, both states · 带领者入口测试
 *
 * Signed out: "带领者登录 Leader sign-in" (Chinese first) is a link to the
 * leader home, which offers Google or email (ADR-0020) — it no longer starts
 * Google by itself. Signed in: the leader's first name (else the email's
 * local part) is a link to #/leader. services/supabase is mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    signInWithGoogle: (returnTo?: string) => signInMock(returnTo),
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
  it('signed out: one link "带领者登录 Leader sign-in" to the leader home; no Google redirect from the nav', () => {
    render(<LandingLeaderLink />);
    const link = screen.getByTestId('nav-leader-signin');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', LEADER_HOME_HASH);
    expect(link.textContent).toBe(`${NAV_LEADER_SIGNIN.zh} ${NAV_LEADER_SIGNIN.en}`);
    link.click();
    expect(signInMock).not.toHaveBeenCalled();
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
