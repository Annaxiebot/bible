/**
 * PackSyncLine.tsx — one line about the pack sync · 查经包同步状态行
 *
 * Renders the packSync status: syncing, synced, or a red line with the
 * step's server message (R5: a failed push, pull or delete is never
 * swallowed). Nothing while idle (signed out, unconfigured, nothing done
 * yet). Shared by "我的查经包" on #/new and the leader home (#/leader).
 */
import React, { useEffect, useState } from 'react';
import { subscribePackSyncStatus, type PackSyncStatus } from './packSync';
import { PS_SYNCING, PS_SYNCED } from './packSyncStrings';
import { textStyle } from './newStudyStyles';

export const PackSyncLine: React.FC = () => {
  const [status, setStatus] = useState<PackSyncStatus>({ state: 'idle', failure: null });
  useEffect(() => subscribePackSyncStatus(setStatus), []);
  if (status.state === 'idle') return null;
  if (status.state === 'failed' && status.failure) {
    return <p role="alert" data-testid="pack-sync-line" className="text-red-300" style={textStyle}>{status.failure.message}</p>;
  }
  return (
    <p role="status" data-testid="pack-sync-line" className="text-stl-text-2" style={textStyle}>
      {status.state === 'syncing' ? PS_SYNCING : PS_SYNCED}
    </p>
  );
};
