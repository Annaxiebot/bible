const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/JournalView-DSUWEeA7.js","assets/vendor-react-IFO5CCoQ.js","assets/index-BRiaX-pD.js","assets/vendor-supabase-BmdP2aEH.js","assets/index-B00dgbRv.css","assets/usePaperType-BUFATJTi.js","assets/LazyMarkdown-C8l3Yciq.js","assets/spiritualMemory-BTAVzz65.js","assets/InlineAIError-BF5Kopk1.js","assets/bilingualAnswer-CB4WMcAW.js","assets/AIErrorLine-HyOaMIJ3.js","assets/setupStrings-DoXdHcVD.js","assets/QuickAISetup-x5gvszWS.js","assets/useGoogleSignIn-Bwi_zjnU.js","assets/signupClient-CFhoi_0q.js"])))=>i.map(i=>d[i]);
import{t as Xe,v as J,_ as Ze,T as et,s as tt,C as ce}from"./index-BRiaX-pD.js";import{r as i,j as e,b as le}from"./vendor-react-IFO5CCoQ.js";import{u as rt,S as Ne}from"./usePaperType-BUFATJTi.js";import{L as Ce}from"./LazyMarkdown-C8l3Yciq.js";import"./vendor-katex-BOkseXEh.js";import"./vendor-supabase-BmdP2aEH.js";const nt=(r,u)=>{const h=new Blob([JSON.stringify(u,null,2)],{type:"application/json"}),m=URL.createObjectURL(h),d=document.createElement("a");d.href=m,d.download=`${r.replace(/:/g,"_")}.bible-note`,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(m)},at=r=>new Promise((u,h)=>{const m=new FileReader;m.onload=d=>{var c;try{const g=JSON.parse((c=d.target)==null?void 0:c.result);typeof g.text=="string"&&typeof g.drawing=="string"?u(g):h(new Error("文件格式不正确"))}catch{h(new Error("无法解析 JSON 文件"))}},m.onerror=()=>h(new Error("文件读取失败")),m.readAsText(r)}),st=i.lazy(()=>Ze(()=>import("./JournalView-DSUWEeA7.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]))),Re="bible_notes_view_mode",Y=`
  .notes-mode-bar {
    display: flex;
    padding: 8px 12px 0;
    gap: 0;
    background: #fff;
    border-bottom: 1px solid #f3f4f6;
    flex-shrink: 0;
  }
  .notes-mode-tab {
    flex: 1;
    padding: 8px 16px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .notes-mode-tab.active {
    color: #4f46e5;
    border-bottom-color: #4f46e5;
  }
  .notes-mode-tab:hover:not(.active) {
    color: #6b7280;
  }
`,ot=Object.keys(ce).sort((r,u)=>u.length-r.length).map(r=>r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),de=ot.join("|"),it=`(?:${de})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,lt="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",ct=new RegExp(`${it}|${lt}`,"gi"),Te=r=>{const u=[];for(const h of r.split(/[，,]\s*/)){const[m,d]=h.split("-").map(Number);for(let c=m;c<=(d||m);c++)u.push(c)}return u},dt=(r,u)=>{const h=new RegExp(`^(${de})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),m=new RegExp(`^(${de})\\s*(\\d+)[章篇]$`,"i");let d=r.match(h);if(d){const c=ce[d[1]];return c?{bookId:c,chapter:+d[2],verses:Te(d[3])}:null}if(d=r.match(m),d){const c=ce[d[1]];return c?{bookId:c,chapter:+d[2]}:null}if(u){const c=r.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(c)return{bookId:u,chapter:+c[1],verses:Te(c[2])}}return null},pt={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},Se=(r,u,h)=>{if(!u||typeof r!="string")return r;const m=new RegExp(ct.source,"gi"),d=[];let c=0,g;for(;(g=m.exec(r))!==null;){g.index>c&&d.push(r.slice(c,g.index));const I=dt(g[0],h);if(I){const K=g[0];d.push(e.jsx("a",{style:pt,onClick:Q=>{Q.preventDefault(),u(I.bookId,I.chapter,I.verses)},children:K},`r${g.index}`))}else d.push(g[0]);c=m.lastIndex}return c<r.length&&d.push(r.slice(c)),d.length===1?d[0]:e.jsx(e.Fragment,{children:d})},G=(r,u,h)=>{if(typeof r=="string")return Se(r,u,h);if(typeof r=="number")return Se(String(r),u,h);if(r==null||typeof r=="boolean"||le.isValidElement(r))return r;const m=le.Children.toArray(r);return m.length>0?m.map((d,c)=>e.jsx(le.Fragment,{children:G(d,u,h)},c)):r},ut=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],yt=({selection:r,onSaveNote:u,initialContent:h,initialTab:m="research",researchUpdateTrigger:d=0,onNavigate:c,currentBookId:g,currentChapter:I,currentBookName:K,onSwitchLayout:Q,openNotabilityTrigger:$})=>{var we;const[E,X]=i.useState(()=>{const a=localStorage.getItem(Re);return a==="journal"||a==="verse-notes"?a:r?"verse-notes":"journal"});i.useEffect(()=>{r&&X("verse-notes")},[r==null?void 0:r.id]);const pe=i.useRef($);i.useEffect(()=>{$!==void 0&&pe.current!==$&&(pe.current=$,E!=="journal"&&X("journal"))},[$,E]);const ue=a=>{X(a),localStorage.setItem(Re,a)},Ie=Xe(),[k,P]=i.useState(m),[p,Z]=i.useState(null),[ee,te]=i.useState(""),[$e,_]=i.useState(!0),[j,Ee]=i.useState("text"),[L,M]=i.useState(""),[_e,Le]=i.useState("pen"),[Me,ze]=i.useState("#000000"),[De,Ae]=i.useState(2),[N,He]=i.useState(!0),[Fe,me]=i.useState(!1),[H,he]=i.useState(null),re=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),l=i.useRef(null),C=i.useRef(null),{paperType:ne,setPaperType:Oe}=rt(),w=i.useRef(null),fe=i.useRef(null),ae=i.useRef(Date.now()),T=i.useRef(!1),z=i.useRef(!1),F=i.useRef(null),xe=i.useRef(null),W=i.useRef(null),ge=i.useRef(null),O=i.useRef(null),se=i.useRef(null);i.useEffect(()=>{P(m)},[m]),i.useEffect(()=>{r&&fe.current!==r.id&&(fe.current=r.id,ae.current=Date.now(),T.current=!1,z.current=!1,F.current&&clearTimeout(F.current),oe())},[r==null?void 0:r.id]),i.useEffect(()=>{r&&oe()},[Ie]),i.useEffect(()=>{k==="notes"&&l.current&&ee&&(l.current.innerHTML.trim()||(l.current.innerHTML=ee))},[k]),i.useEffect(()=>()=>{H&&H.getTracks().forEach(a=>a.stop())},[H]);const oe=async()=>{if(!r)return;_(!0);const a=r.id.split(":");if(a.length>=3){const t=a[0],n=parseInt(a[1]),s=[parseInt(a[2])],o=await J.getVerseData(t,n,s);Z(o),o!=null&&o.personalNote?(te(o.personalNote.text),M(o.personalNote.drawing||""),l.current&&!z.current&&(l.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(T.current=!0)):h?(te(h),l.current&&!z.current&&(l.current.innerHTML=h),h.trim()&&(T.current=!0)):(te(""),M(""),l.current&&!z.current&&(l.current.innerHTML=""),T.current=!1)}},D=async(a=!1)=>{var n,s;if(!r){alert("Please select a verse first before saving a note");return}const t=r.id.split(":");if(t.length>=3){const o=t[0],f=parseInt(t[1]),x=[parseInt(t[2])],b=((n=l.current)==null?void 0:n.innerHTML)||"";if(b.trim()||L){const y={text:b,drawing:L,createdAt:((s=p==null?void 0:p.personalNote)==null?void 0:s.createdAt)||Date.now(),updatedAt:Date.now()};await J.savePersonalNote(o,f,x,y),u(r.id,b,a),Z(v=>v?{...v,personalNote:y}:null)}else await J.deletePersonalNote(o,f,x),u(r.id,"",a),Z(y=>y?{...y,personalNote:void 0}:null);_(!0)}},Ue=()=>{if(!l.current||!r)return;const a=new Date,t=a.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),n=a.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),s=document.createElement("span");s.contentEditable="false",s.style.fontSize="14px",s.style.color="#94a3b8",s.style.fontWeight="normal",s.style.userSelect="none",s.textContent=`[${n} ${t}]`;const o=document.createTextNode(" "),f=window.getSelection();let x=null,b=0,y=null;f&&f.rangeCount>0&&(x=f.getRangeAt(0).cloneRange(),b=x.startOffset,y=x.startContainer);const v=l.current.firstChild;v?(l.current.insertBefore(o,v),l.current.insertBefore(s,o)):(l.current.appendChild(s),l.current.appendChild(o));const B=y,ke=b;requestAnimationFrame(()=>{const S=window.getSelection();if(!(!S||!l.current))try{if(B&&B.isConnected){const R=document.createRange();R.setStart(B,ke),R.setEnd(B,ke),S.removeAllRanges(),S.addRange(R)}else{const R=document.createRange();R.selectNodeContents(l.current),R.collapse(!1),S.removeAllRanges(),S.addRange(R)}}catch{try{const V=document.createRange();V.selectNodeContents(l.current),V.collapse(!1),S.removeAllRanges(),S.addRange(V)}catch{}}}),T.current=!0},A=()=>{var x;const a=Date.now(),t=a-ae.current,n=((x=l.current)==null?void 0:x.innerHTML)||"",s=tt(n).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(s);t>120*1e3&&(o||(T.current=!1)),!T.current&&s.length>0&&!o&&Ue(),ae.current=a,z.current=!0,F.current&&clearTimeout(F.current),F.current=window.setTimeout(()=>{z.current=!1},1e4),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>{D(!0)},2e3)},Pe=async a=>{if(!r||!p)return;const t=r.id.split(":");if(t.length>=3){const n=t[0],s=parseInt(t[1]),o=[parseInt(t[2])];await J.deleteAIResearch(n,s,o,a),oe()}},U=(a,t="")=>{var n;document.execCommand(a,!1,t),(n=l.current)==null||n.focus(),A()},We=()=>{var n;if(!r)return;const t={text:((n=l.current)==null?void 0:n.innerHTML)||"",drawing:L,media:[],version:1};nt(`VerseNote_${r.id}`,t)},qe=()=>{var a;(a=xe.current)==null||a.click()},Be=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=await at(t);l.current&&(l.current.innerHTML=s.text),M(s.drawing||""),_(!1),D(!1)}catch(s){alert(s instanceof Error?s.message:"Failed to import note")}finally{a.target.value=""}},be=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=new FileReader;s.onload=o=>{var x;const f=(x=o.target)==null?void 0:x.result;if(l.current&&j==="text"){const b=`<img src="${f}" alt="${t.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,b),A()}},s.readAsDataURL(t)}catch{}finally{a.target.value=""}},Ve=async()=>{try{const a=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});he(a),me(!0),setTimeout(()=>{O.current&&(O.current.srcObject=a)},et.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},Je=()=>{if(!O.current||!se.current||!r)return;const a=O.current,t=se.current,n=t.getContext("2d");if(!n)return;t.width=a.videoWidth,t.height=a.videoHeight,n.drawImage(a,0,0,t.width,t.height);const s=t.toDataURL("image/jpeg");if(l.current&&j==="text"){const o=`<img src="${s}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),A()}ie()},ie=()=>{H&&(H.getTracks().forEach(a=>a.stop()),he(null)),me(!1)},Ye=async a=>{const t=a.target.files;if(!(!t||!r)){for(let n=0;n<t.length;n++){const s=t[n];try{const o=new FileReader;o.onload=f=>{var y;const x=(y=f.target)==null?void 0:y.result,b=s.type.startsWith("image/")?"image":s.type.startsWith("video/")?"video":s.type.startsWith("audio/")?"audio":"file";if(l.current&&j==="text"){let v="";b==="image"?v=`<img src="${x}" alt="${s.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:b==="video"?v=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${x}" type="${s.type}">Your browser does not support video.</video>`:b==="audio"?v=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${x}" type="${s.type}">Your browser does not support audio.</audio>`:v=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${s.name}</span></div>`,document.execCommand("insertHTML",!1,v),A()}},o.readAsDataURL(s)}catch{}}a.target.value=""}},ye=a=>{let t=a;return t=t.replace(/\$\\text\{([^}]+)\}\$/g,(n,s)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(s)?s:n),t=t.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),t},ve=a=>{const t=new Date(a),s=new Date().getTime()-t.getTime(),o=Math.floor(s/(1e3*60*60*24));return o===0?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:t.toLocaleDateString("en-US",{month:"short",day:"numeric"})},je=()=>{var t;const a=(t=r==null?void 0:r.id)==null?void 0:t.split(":")[0];return{p:({children:n})=>e.jsx("p",{style:{marginBottom:"0.5em"},children:G(n,c,a)}),li:({children:n})=>e.jsx("li",{children:G(n,c,a)}),strong:({children:n})=>e.jsx("strong",{style:{fontWeight:600},children:G(n,c,a)}),code:({inline:n,className:s,children:o})=>{const f=/language-(\w+)/.exec(s||"");return f&&f[1]==="math"||n===!1?e.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:e.jsx("code",{children:o})}):e.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},Ge=()=>{const a=t=>t?t.replace(/^\[.*?\]\s*/,""):"";return e.jsxs("div",{className:"notes-tab",children:[e.jsx("input",{type:"file",ref:xe,onChange:Be,accept:".bible-note,.json",className:"hidden"}),re?e.jsx("input",{type:"file",ref:W,onChange:be,accept:"image/*",capture:!0,className:"hidden"}):e.jsx("input",{type:"file",ref:W,onChange:be,accept:"image/*",className:"hidden"}),e.jsx("input",{type:"file",ref:ge,onChange:Ye,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),Fe&&!re&&e.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[e.jsx("strong",{children:"Take Photo"}),e.jsx("button",{onClick:ie,className:"toolbar-btn",children:"X"})]}),e.jsx("video",{ref:O,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),e.jsx("canvas",{ref:se,className:"hidden"}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[e.jsx("button",{onClick:Je,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),e.jsx("button",{onClick:ie,className:"toolbar-btn",children:"Cancel"})]})]})}),(r==null?void 0:r.selectedRawText)&&e.jsxs("div",{className:"verse-quote-block",children:[e.jsxs("div",{className:"verse-quote-header",children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsx("div",{className:"verse-quote-text",children:a(r.selectedRawText)})]}),e.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(t=>e.jsx("button",{onClick:()=>Ee(t),className:"toolbar-btn",style:j===t?{background:"#4f46e5",color:"white"}:{},children:t==="text"?"📝 Text":t==="draw"?"✏️ Draw":"🔀 Overlay"},t))}),(j==="text"||j==="overlay")&&e.jsxs("div",{className:"rich-toolbar",children:[e.jsx("button",{onClick:()=>U("bold"),className:"toolbar-btn",title:"Bold",children:e.jsx("strong",{children:"B"})}),e.jsx("button",{onClick:()=>U("italic"),className:"toolbar-btn",title:"Italic",children:e.jsx("em",{children:"I"})}),e.jsx("button",{onClick:()=>U("underline"),className:"toolbar-btn",title:"Underline",children:e.jsx("u",{children:"U"})}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>U("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),e.jsx("button",{onClick:()=>U("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>{re&&W.current?W.current.click():Ve()},className:"toolbar-btn",title:"Take photo",children:"📷"}),e.jsx("button",{onClick:()=>{var t;return(t=ge.current)==null?void 0:t.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),e.jsx("button",{onClick:qe,className:"toolbar-btn",title:"Import note",children:"⬆"}),e.jsx("button",{onClick:We,className:"toolbar-btn",title:"Export note",children:"⬇"})]}),j==="text"&&e.jsx("div",{ref:l,className:"note-editor",contentEditable:!0,onInput:A,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),j==="draw"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[e.jsx(Ne,{ref:C,onChange:t=>{M(t),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>D(!0),2e3)},initialData:L,overlayMode:!1,isWritingMode:N,paperType:ne}),e.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(t=>e.jsx("button",{onClick:()=>{var n;Le(t),(n=C.current)==null||n.setTool(t)},className:"toolbar-btn",style:_e===t?{background:t==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:t,children:t==="pen"?"✏️":t==="marker"?"🖊️":t==="highlighter"?"🖍️":"🧹"},t)),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),e.jsx("span",{className:"toolbar-sep"}),["plain","grid","ruled"].map(t=>e.jsx("button",{onClick:()=>{var n;Oe(t),(n=C.current)==null||n.setPaperType(t)},className:"toolbar-btn",style:ne===t?{background:"#e0e7ff"}:{},title:t==="plain"?"Plain":t==="grid"?"Grid":"College Ruled",children:t==="plain"?"📄":t==="grid"?"📐":"📝"},t)),e.jsx("span",{className:"toolbar-sep"}),ut.map(t=>e.jsx("button",{onClick:()=>{var n;ze(t),(n=C.current)==null||n.setColor(t)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:t,border:Me===t?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:t},t)),e.jsx("input",{type:"range",min:"1",max:"20",value:De,onChange:t=>{var s;const n=Number(t.target.value);Ae(n),(s=C.current)==null||s.setSize(n)},style:{width:"60px",marginLeft:"4px"}})]})]}),j==="overlay"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[e.jsx("div",{ref:l,className:"note-editor",contentEditable:void 0,onInput:A,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:N?"none":"auto"}}),e.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:N?"auto":"none"},children:e.jsx(Ne,{ref:C,onChange:t=>{M(t),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>D(!0),2e3)},initialData:L,overlayMode:!0,isWritingMode:N,paperType:ne})}),e.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:e.jsx("button",{onClick:()=>He(!N),className:"toolbar-btn",style:N?{background:"#e0e7ff",color:"#4f46e5"}:{},children:N?"✏️ Draw":"👆 Navigate"})})]}),e.jsxs("div",{className:"note-toolbar",children:[e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>D(!1),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(ee||L)&&e.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(l.current&&(l.current.innerHTML=""),M(""),D(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!$e&&e.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},Ke=()=>{const a=je();return e.jsx("div",{className:"research-tab",children:p!=null&&p.aiResearch&&p.aiResearch.length>0?e.jsx("div",{className:"research-list",children:p.aiResearch.map(t=>e.jsxs("div",{className:"research-entry",children:[e.jsxs("div",{className:"research-header",children:[e.jsxs("div",{className:"research-query",children:[e.jsx("strong",{children:"Q:"})," ",t.query]}),e.jsxs("div",{className:"research-actions",children:[e.jsx("span",{className:"timestamp",children:ve(t.timestamp)}),e.jsx("button",{onClick:()=>Pe(t.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),t.image&&e.jsxs("div",{className:"research-image",children:[e.jsx("img",{src:`data:${t.image.mimeType};base64,${t.image.data}`,alt:t.image.caption||"Research image",className:"research-img",onClick:()=>{const n=window.open("");n&&n.document.write(`
                          <html>
                            <head>
                              <title>${t.query}</title>
                              <style>
                                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                              </style>
                            </head>
                            <body>
                              <img src="data:${t.image.mimeType};base64,${t.image.data}" alt="${t.query}" />
                            </body>
                          </html>
                        `)},title:"Click to view full size"}),t.image.caption&&e.jsx("div",{className:"image-caption",children:t.image.caption})]}),e.jsx("div",{className:"research-response",children:e.jsx(Ce,{components:a,children:ye(t.response)})}),t.tags&&t.tags.length>0&&e.jsx("div",{className:"research-tags",children:t.tags.map((n,s)=>e.jsxs("span",{className:"tag",children:["#",n]},s))})]},t.id))}):e.jsxs("div",{className:"empty-state",children:[e.jsx("p",{children:"No AI research yet"}),e.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},Qe=()=>{const a=je(),t=[];return p!=null&&p.personalNote&&t.push({type:"note",timestamp:p.personalNote.updatedAt,content:p.personalNote}),p!=null&&p.aiResearch&&p.aiResearch.forEach(n=>{t.push({type:"research",timestamp:n.timestamp,content:n})}),t.sort((n,s)=>s.timestamp-n.timestamp),e.jsx("div",{className:"all-tab",children:t.length>0?e.jsx("div",{className:"timeline",children:t.map((n,s)=>e.jsxs("div",{className:`timeline-item ${n.type}`,children:[e.jsx("div",{className:"timeline-marker",children:n.type==="note"?"📝":"🤖"}),e.jsxs("div",{className:"timeline-content",children:[e.jsxs("div",{className:"timeline-header",children:[e.jsx("span",{className:"timeline-type",children:n.type==="note"?"Personal Note":"AI Research"}),e.jsx("span",{className:"timeline-time",children:ve(n.timestamp)})]}),n.type==="note"?e.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:n.content.text}}):e.jsxs("div",{className:"research-preview",children:[n.content.image&&e.jsx("div",{className:"research-image",children:e.jsx("img",{src:`data:${n.content.image.mimeType};base64,${n.content.image.data}`,alt:n.content.image.caption||"Research image",className:"research-img",onClick:()=>{const o=n.content.image,f=window.open("");f&&f.document.write(`
                                  <html>
                                    <head>
                                      <title>${n.content.query}</title>
                                      <style>
                                        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                                      </style>
                                    </head>
                                    <body>
                                      <img src="data:${o.mimeType};base64,${o.data}" alt="${n.content.query}" />
                                    </body>
                                  </html>
                                `)},title:"Click to view full size"})}),e.jsxs("div",{className:"research-q",children:["Q: ",n.content.query]}),e.jsx("div",{className:"research-a",children:e.jsx(Ce,{components:a,children:ye(n.content.response)})})]})]})]},s))}):e.jsx("div",{className:"empty-state",children:e.jsx("p",{children:"No content yet"})})})},q=e.jsxs("div",{className:"notes-mode-bar",children:[e.jsx("button",{className:`notes-mode-tab ${E==="journal"?"active":""}`,onClick:()=>ue("journal"),children:"Journal"}),e.jsx("button",{className:`notes-mode-tab ${E==="verse-notes"?"active":""}`,onClick:()=>ue("verse-notes"),children:"Verse Notes"})]});return!r&&E==="verse-notes"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[q,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:Y})]}):E==="journal"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[q,e.jsx("div",{style:{flex:1,overflow:"hidden"},children:e.jsx(i.Suspense,{fallback:e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9ca3af"},children:"Loading..."}),children:e.jsx(st,{bookId:g||(r==null?void 0:r.bookId),chapter:I||(r==null?void 0:r.chapter),bookName:K||(r==null?void 0:r.bookName),onNavigate:c?(a,t)=>c(a,t):void 0,onSwitchLayout:Q,openNotabilityTrigger:$})})}),e.jsx("style",{children:Y})]}):r?e.jsxs("div",{className:"enhanced-notebook",children:[q,e.jsxs("div",{className:"notebook-header",children:[e.jsxs("h3",{children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsxs("div",{className:"tab-selector",children:[e.jsxs("button",{className:`tab ${k==="research"?"active":""}`,onClick:()=>{P("research")},children:["🤖 AI Research ",(we=p==null?void 0:p.aiResearch)!=null&&we.length?`(${p.aiResearch.length})`:""]}),e.jsx("button",{className:`tab ${k==="notes"?"active":""}`,onClick:()=>{P("notes")},children:"📝 My Notes"}),e.jsx("button",{className:`tab ${k==="all"?"active":""}`,onClick:()=>{P("all")},children:"📚 All"})]})]}),e.jsxs("div",{className:"notebook-content",children:[k==="notes"&&Ge(),k==="research"&&Ke(),k==="all"&&Qe()]}),e.jsx("style",{children:`
        .enhanced-notebook {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: white;
        }

        .notebook-header {
          padding: 12px;
          border-bottom: 1px solid #e0e0e0;
          background: #f8f8f8;
        }

        .notebook-header h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #333;
        }

        .tab-selector {
          display: flex;
          gap: 8px;
        }

        .tab {
          padding: 6px 12px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          background: #f0f0f0;
        }

        .tab.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }

        .notebook-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .verse-quote-block {
          padding: 12px;
          background: #f8f9fa;
          border-left: 4px solid #6366f1;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .verse-quote-header {
          font-size: 13px;
          font-weight: 600;
          color: #4f46e5;
          margin-bottom: 8px;
        }

        .verse-quote-text {
          font-size: 14px;
          font-style: italic;
          color: #475569;
          line-height: 1.6;
        }

        .rich-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 6px 0;
          border-bottom: 1px solid #e0e0e0;
          margin-bottom: 8px;
          align-items: center;
        }

        .toolbar-sep {
          width: 1px;
          height: 20px;
          background: #d1d5db;
          margin: 0 2px;
        }

        .draw-palette {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 8px;
          background: white;
          border-top: 1px solid #e0e0e0;
          align-items: center;
        }

        .note-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid #e0e0e0;
          margin-top: 12px;
        }

        .toolbar-btn {
          padding: 4px 10px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .toolbar-btn:hover {
          background: #e0e0e0;
        }

        .save-indicator {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        .research-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .research-entry {
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .research-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .research-query {
          flex: 1;
          font-size: 13px;
          color: #333;
        }

        .research-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .timestamp {
          font-size: 11px;
          color: #999;
        }

        .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .delete-btn:hover {
          opacity: 1;
        }

        .research-response {
          font-size: 13px;
          line-height: 1.6;
          color: #555;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', system-ui, sans-serif;
        }

        .research-image {
          margin-bottom: 12px;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
          border: 1px solid #e0e0e0;
        }

        .research-img {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .research-img:hover {
          transform: scale(1.02);
        }

        .image-caption {
          padding: 8px;
          font-size: 12px;
          color: #666;
          background: #f8f8f8;
          border-top: 1px solid #e0e0e0;
        }

        .research-response p {
          margin: 0 0 0.5em 0;
        }

        .research-response p:last-child {
          margin-bottom: 0;
        }

        .research-response ul, .research-response ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }

        .research-response li {
          margin: 0.25em 0;
        }

        /* KaTeX math styling */
        .research-response .katex,
        .research-a .katex {
          font-size: 1em;
        }

        .research-response .katex-display,
        .research-a .katex-display {
          margin: 0.5em 0;
        }

        .research-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .tag {
          padding: 2px 8px;
          background: #e0e7ff;
          color: #4f46e5;
          border-radius: 12px;
          font-size: 11px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }

        .empty-state .hint {
          font-size: 12px;
          margin-top: 8px;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
        }

        .timeline-marker {
          font-size: 20px;
          flex-shrink: 0;
        }

        .timeline-content {
          flex: 1;
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .timeline-type {
          font-size: 12px;
          font-weight: 600;
          color: #666;
        }

        .timeline-time {
          font-size: 11px;
          color: #999;
        }

        .note-preview, .research-preview {
          font-size: 13px;
          line-height: 1.6;
          color: #333;
        }

        .research-q {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .research-a {
          color: #555;
        }

        .research-a p {
          margin: 0 0 0.5em 0;
        }

        .research-a p:last-child {
          margin-bottom: 0;
        }

        .notebook-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          font-size: 14px;
        }

        .hidden {
          display: none;
        }
      `}),e.jsx("style",{children:Y})]}):e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[q,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:Y})]})};export{yt as default};
