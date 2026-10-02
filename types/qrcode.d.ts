/**
 * qrcode.d.ts — the slice of the `qrcode` package the app uses · 类型声明
 *
 * The package ships no types; this declares only `toString` (SVG output),
 * which is what components/signup/SignupQr.tsx calls. Add members here as
 * they are used rather than pulling in @types/qrcode.
 */
declare module 'qrcode' {
  export interface QRCodeToStringOptions {
    type?: 'svg' | 'utf8' | 'terminal';
    margin?: number;
    width?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  const QRCode: { toString: typeof toString };
  export default QRCode;
}
