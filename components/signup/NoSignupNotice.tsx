/**
 * NoSignupNotice.tsx — what shows instead of a QR that cannot work · 无报名提示
 *
 * One shared block for the TV qr slide and the leader's #/qr page (ADR-0004
 * §8): an unclaimed LOCAL pack shows the sign-in block (signing in claims
 * it); a public pack without a leader — or no pack at all — shows the
 * bilingual demo line.
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { packSignupState } from '../studypack/packSource';
import UnclaimedSignIn from './UnclaimedSignIn';
import { SU_DEMO_LINE } from './signupStrings';

interface Props {
  pack?: Pick<StudyPack, 'id' | 'leaderId'>;
  lineStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
}

const NoSignupNotice: React.FC<Props> = ({ pack, lineStyle, buttonStyle }) => {
  if (pack && packSignupState(pack) === 'unclaimed') {
    return <UnclaimedSignIn packId={pack.id} lineStyle={lineStyle} buttonStyle={buttonStyle} />;
  }
  return <p data-testid="qr-demo" className="text-stl-text" style={lineStyle}>{SU_DEMO_LINE}</p>;
};

export default NoSignupNotice;
