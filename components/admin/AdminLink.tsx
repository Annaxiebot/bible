/**
 * AdminLink.tsx — the quiet "管理 · Admin" link on the leader home · 管理入口 (ADR-0023)
 *
 * Shown only when is_site_admin() answers true for the signed-in leader;
 * everything else on the leader home is the same for every leader. While
 * checking, when the answer is false, and when the check fails, nothing is
 * shown: R5 (c) — a failed check must not put an error on every leader's
 * home (e.g. before the admin SQL is applied); the owner can still open
 * #/admin directly, which shows the failure in full.
 */
import React from 'react';
import { ADMIN_HASH } from '../landing/landingRoute';
import { AD_TITLE } from './adminStrings';
import { useIsSiteAdmin } from './adminData';
import { controlStyle } from '../newstudy/newStudyStyles';

export const AdminLink: React.FC<{ uid: string }> = ({ uid }) => {
  const check = useIsSiteAdmin(uid);
  if (check.status !== 'yes') return null;
  return (
    <a href={ADMIN_HASH} data-testid="lh-admin"
      className="inline-flex items-center self-start text-stl-text-2 underline underline-offset-4 hover:text-stl-text" style={controlStyle}>
      {AD_TITLE}
    </a>
  );
};
