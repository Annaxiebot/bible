import{Z as c,E as d}from"./bilingualAnswer-B8raGiAu.js";import{r as t,j as o,d as h}from"./vendor-react-IFO5CCoQ.js";import{A as p}from"./AIErrorLine-C7R-63T7.js";import{y as u,t as m}from"./index-CsUz-uL3.js";import{Q as g}from"./QuickAISetup-C3G7_l7y.js";const _=`INSTRUCTION (overrides any other language preference): Write your entire response in Simplified Chinese (简体中文) as the primary language, but keep key theological/technical terms, proper nouns, book names, and Bible references in English (e.g. covenant, atonement, Genesis 15:6, John 3:16). Optionally add a short Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）". Produce a single unified response in Chinese with English keywords embedded.

`,b=`You are a world-class Bible Scholar and Researcher.

CORE DIRECTIVE: Be extremely concise. Provide a brief overview or summary of the answer only.
Avoid long paragraphs unless specifically asked for a deep dive.

LANGUAGE AND FORMAT (the only language rule; it applies whatever language the question is in):
Write the answer twice — first in Simplified Chinese, then the same answer in English — as two sections,
each starting with its heading on a line of its own, exactly:
${c}
[Brief Chinese summary and key points]
如果您需要更深入的解析或特定细节，请告知。

${d}
[Brief English summary and key points]
Please let me know if you would like more in-depth details or a specific deep dive.

Use these two headings once each and no other top-level headings. In the Chinese section, append the
English equivalent in parentheses after key theological terms, proper nouns, book names and important
concepts on first mention — e.g. 圣灵 (Holy Spirit), 圣约 (Covenant), 以弗所书 (Ephesians); write Bible
references in English (e.g. John 3:16).

Maintain professional scholarship even in brevity.
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.`,E="text-sm text-red-600",f="ml-2 rounded-lg border border-indigo-300 px-3 py-0.5 text-indigo-600 hover:bg-indigo-50",I=10001,v=({error:r,onRetry:i,testId:a,style:l})=>{const[s,e]=t.useState(!1),n=t.useCallback(()=>e(!1),[]);return o.jsxs("div",{"data-testid":a,style:l,children:[o.jsx(p,{error:r,onSetup:()=>e(!0),onRetry:i,className:E,buttonClassName:f}),s&&h.createPortal(o.jsx("div",{style:{position:"relative",zIndex:I},children:o.jsx(g,{open:!0,onClose:n})}),document.body)]})};function k(){const[r,i]=t.useState({}),a=t.useCallback((s,e)=>{i(n=>({...n,[s]:u(e,m())}))},[]),l=t.useCallback(s=>{i(e=>{if(!(s in e))return e;const n={...e};return delete n[s],n})},[]);return{errors:r,fail:a,clear:l}}export{b as B,v as I,_ as J,f as L,E as a,k as u};
