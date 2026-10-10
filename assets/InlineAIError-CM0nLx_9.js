import{Z as c,E as d}from"./bilingualAnswer-CEoCCcz7.js";import{r as t,j as o,d as h}from"./vendor-react-IFO5CCoQ.js";import{A as p}from"./AIErrorLine-CbP3I6uI.js";import{q as u,k as m}from"./index-DyicJ0De.js";import{Q as g}from"./QuickAISetup-Dz3FiUuH.js";const R=`INSTRUCTION (overrides any other language preference): Write your entire response in Simplified Chinese (简体中文) as the primary language, but keep key theological/technical terms, proper nouns, book names, and Bible references in English (e.g. covenant, atonement, Genesis 15:6, John 3:16). Optionally add a short Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）". Produce a single unified response in Chinese with English keywords embedded.

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
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.`,f="text-sm text-red-600",E="ml-2 rounded-lg border border-indigo-300 px-3 py-0.5 text-indigo-600 hover:bg-indigo-50",I="ml-2 text-indigo-600 underline underline-offset-4",A=10001,k=({error:r,onRetry:i,testId:a,style:l})=>{const[n,e]=t.useState(!1),s=t.useCallback(()=>e(!1),[]);return o.jsxs("div",{"data-testid":a,style:l,children:[o.jsx(p,{error:r,onSetup:()=>e(!0),onRetry:i,className:f,buttonClassName:E,linkClassName:I}),n&&h.createPortal(o.jsx("div",{style:{position:"relative",zIndex:A},children:o.jsx(g,{open:!0,onClose:s})}),document.body)]})};function v(){const[r,i]=t.useState({}),a=t.useCallback((n,e)=>{i(s=>({...s,[n]:u(e,m())}))},[]),l=t.useCallback(n=>{i(e=>{if(!(n in e))return e;const s={...e};return delete s[n],s})},[]);return{errors:r,fail:a,clear:l}}export{b as B,k as I,R as J,I as L,E as a,f as b,v as u};
