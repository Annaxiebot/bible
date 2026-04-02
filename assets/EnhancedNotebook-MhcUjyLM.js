const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/JournalView-CWVzpxp2.js","assets/vendor-react-CFhoJv6l.js","assets/journalStorage-CfNxgvoS.js","assets/index-Ble6hoJ7.js","assets/vendor-google-BD6ai2ur.js","assets/vendor-anthropic-CkMCgFtn.js","assets/vendor-supabase-D-SUoaNb.js","assets/usePaperType-DSLPum37.js","assets/strokeNormalizer-BmelCWgF.js","assets/imageCompressionService-CS_9pSJ9.js","assets/LazyMarkdown-CIUCYkM9.js","assets/journalAIService-DNWl3rR9.js","assets/spiritualMemory-C5Bz7HtS.js"])))=>i.map(i=>d[i]);
import{N as Ze,v as G,_ as et,T as tt,M as rt,G as nt,s as at,C as le}from"./index-Ble6hoJ7.js";import{r as i,j as e,a as ie}from"./vendor-react-CFhoJv6l.js";import{u as st,S as Ne}from"./usePaperType-DSLPum37.js";import{L as ke}from"./LazyMarkdown-CIUCYkM9.js";import{readNoteFile as ot,downloadNote as it}from"./fileSystem-S0Xg9bNE.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";import"./strokeNormalizer-BmelCWgF.js";const lt=i.lazy(()=>et(()=>import("./JournalView-CWVzpxp2.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12]))),Ce="bible_notes_view_mode",Y=`
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
`,ct=Object.keys(le).sort((r,u)=>u.length-r.length).map(r=>r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),ce=ct.join("|"),dt=`(?:${ce})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,pt="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",ut=new RegExp(`${dt}|${pt}`,"gi"),Re=r=>{const u=[];for(const f of r.split(/[，,]\s*/)){const[x,p]=f.split("-").map(Number);for(let c=x;c<=(p||x);c++)u.push(c)}return u},mt=(r,u)=>{const f=new RegExp(`^(${ce})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),x=new RegExp(`^(${ce})\\s*(\\d+)[章篇]$`,"i");let p=r.match(f);if(p){const c=le[p[1]];return c?{bookId:c,chapter:+p[2],verses:Re(p[3])}:null}if(p=r.match(x),p){const c=le[p[1]];return c?{bookId:c,chapter:+p[2]}:null}if(u){const c=r.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(c)return{bookId:u,chapter:+c[1],verses:Re(c[2])}}return null},ht={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},Te=(r,u,f)=>{if(!u||typeof r!="string")return r;const x=new RegExp(ut.source,"gi"),p=[];let c=0,v;for(;(v=x.exec(r))!==null;){v.index>c&&p.push(r.slice(c,v.index));const I=mt(v[0],f);if(I){const Q=v[0];p.push(e.jsx("a",{style:ht,onClick:$=>{$.preventDefault(),u(I.bookId,I.chapter,I.verses)},children:Q},`r${v.index}`))}else p.push(v[0]);c=x.lastIndex}return c<r.length&&p.push(r.slice(c)),p.length===1?p[0]:e.jsx(e.Fragment,{children:p})},K=(r,u,f)=>{if(typeof r=="string")return Te(r,u,f);if(typeof r=="number")return Te(String(r),u,f);if(r==null||typeof r=="boolean"||ie.isValidElement(r))return r;const x=ie.Children.toArray(r);return x.length>0?x.map((p,c)=>e.jsx(ie.Fragment,{children:K(p,u,f)},c)):r},ft=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],Ct=({selection:r,onSaveNote:u,initialContent:f,initialTab:x="research",researchUpdateTrigger:p=0,onNavigate:c,currentBookId:v,currentChapter:I,currentBookName:Q})=>{var je;const[$,de]=i.useState(()=>{const a=localStorage.getItem(Ce);return a==="journal"||a==="verse-notes"?a:r?"verse-notes":"journal"});i.useEffect(()=>{r&&de("verse-notes")},[r==null?void 0:r.id]);const pe=a=>{de(a),localStorage.setItem(Ce,a)},Se=Ze(),[N,q]=i.useState(x),[d,X]=i.useState(null),[J,Z]=i.useState(""),[Ie,_]=i.useState(!0),[j,$e]=i.useState("text"),[M,E]=i.useState(""),[_e,Me]=i.useState("pen"),[Ee,ze]=i.useState("#000000"),[De,Le]=i.useState(2),[k,Ae]=i.useState(!0),[O,ee]=i.useState(!1),[He,ue]=i.useState(!1),[A,me]=i.useState(null),te=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),l=i.useRef(null),C=i.useRef(null),{paperType:re,setPaperType:Fe}=st(),w=i.useRef(null),he=i.useRef(null),ne=i.useRef(Date.now()),T=i.useRef(!1),z=i.useRef(!1),H=i.useRef(null),fe=i.useRef(null),P=i.useRef(null),xe=i.useRef(null),F=i.useRef(null),ae=i.useRef(null);i.useEffect(()=>{q(x)},[x]),i.useEffect(()=>{r&&he.current!==r.id&&(he.current=r.id,ne.current=Date.now(),T.current=!1,z.current=!1,H.current&&clearTimeout(H.current),se())},[r==null?void 0:r.id]),i.useEffect(()=>{r&&se()},[Se]),i.useEffect(()=>{N==="notes"&&l.current&&J&&(l.current.innerHTML.trim()||(l.current.innerHTML=J))},[N]),i.useEffect(()=>()=>{A&&A.getTracks().forEach(a=>a.stop())},[A]);const se=async()=>{if(!r)return;_(!0);const a=r.id.split(":");if(a.length>=3){const t=a[0],n=parseInt(a[1]),s=[parseInt(a[2])],o=await G.getVerseData(t,n,s);X(o),o!=null&&o.personalNote?(Z(o.personalNote.text),E(o.personalNote.drawing||""),l.current&&!z.current&&(l.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(T.current=!0)):f?(Z(f),l.current&&!z.current&&(l.current.innerHTML=f),f.trim()&&(T.current=!0)):(Z(""),E(""),l.current&&!z.current&&(l.current.innerHTML=""),T.current=!1)}},D=async(a=!1)=>{var n,s;if(!r){alert("Please select a verse first before saving a note");return}const t=r.id.split(":");if(t.length>=3){const o=t[0],m=parseInt(t[1]),h=[parseInt(t[2])],g=((n=l.current)==null?void 0:n.innerHTML)||"";if(g.trim()||M){const b={text:g,drawing:M,createdAt:((s=d==null?void 0:d.personalNote)==null?void 0:s.createdAt)||Date.now(),updatedAt:Date.now()};await G.savePersonalNote(o,m,h,b),u(r.id,g,a),X(y=>y?{...y,personalNote:b}:null)}else await G.deletePersonalNote(o,m,h),u(r.id,"",a),X(b=>b?{...b,personalNote:void 0}:null);_(!0)}},We=()=>{if(!l.current||!r)return;const a=new Date,t=a.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),n=a.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),s=document.createElement("span");s.contentEditable="false",s.style.fontSize="14px",s.style.color="#94a3b8",s.style.fontWeight="normal",s.style.userSelect="none",s.textContent=`[${n} ${t}]`;const o=document.createTextNode(" "),m=window.getSelection();let h=null,g=0,b=null;m&&m.rangeCount>0&&(h=m.getRangeAt(0).cloneRange(),g=h.startOffset,b=h.startContainer);const y=l.current.firstChild;y?(l.current.insertBefore(o,y),l.current.insertBefore(s,o)):(l.current.appendChild(s),l.current.appendChild(o));const B=b,we=g;requestAnimationFrame(()=>{const S=window.getSelection();if(!(!S||!l.current))try{if(B&&B.isConnected){const R=document.createRange();R.setStart(B,we),R.setEnd(B,we),S.removeAllRanges(),S.addRange(R)}else{const R=document.createRange();R.selectNodeContents(l.current),R.collapse(!1),S.removeAllRanges(),S.addRange(R)}}catch{try{const V=document.createRange();V.selectNodeContents(l.current),V.collapse(!1),S.removeAllRanges(),S.addRange(V)}catch{}}}),T.current=!0},L=()=>{var h;const a=Date.now(),t=a-ne.current,n=((h=l.current)==null?void 0:h.innerHTML)||"",s=at(n).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(s);t>120*1e3&&(o||(T.current=!1)),!T.current&&s.length>0&&!o&&We(),ne.current=a,z.current=!0,H.current&&clearTimeout(H.current),H.current=window.setTimeout(()=>{z.current=!1},1e4),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>{D(!0)},2e3)},qe=async a=>{if(!r||!d)return;const t=r.id.split(":");if(t.length>=3){const n=t[0],s=parseInt(t[1]),o=[parseInt(t[2])];await G.deleteAIResearch(n,s,o,a),se()}},W=(a,t="")=>{var n;document.execCommand(a,!1,t),(n=l.current)==null||n.focus(),L()},Oe=()=>{var t;const a=((t=l.current)==null?void 0:t.innerText)||"";a.trim()&&(ee(!0),nt(a,()=>ee(!1)))},Pe=()=>{rt(),ee(!1)},Ue=()=>{var n;if(!r)return;const t={text:((n=l.current)==null?void 0:n.innerHTML)||"",drawing:M,media:[],version:1};it(`VerseNote_${r.id}`,t)},Be=()=>{var a;(a=fe.current)==null||a.click()},Ve=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=await ot(t);l.current&&(l.current.innerHTML=s.text),E(s.drawing||""),_(!1),D(!1)}catch(s){alert(s instanceof Error?s.message:"Failed to import note")}finally{a.target.value=""}},ge=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=new FileReader;s.onload=o=>{var h;const m=(h=o.target)==null?void 0:h.result;if(l.current&&j==="text"){const g=`<img src="${m}" alt="${t.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,g),L()}},s.readAsDataURL(t)}catch{}finally{a.target.value=""}},Ge=async()=>{try{const a=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});me(a),ue(!0),setTimeout(()=>{F.current&&(F.current.srcObject=a)},tt.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},Ye=()=>{if(!F.current||!ae.current||!r)return;const a=F.current,t=ae.current,n=t.getContext("2d");if(!n)return;t.width=a.videoWidth,t.height=a.videoHeight,n.drawImage(a,0,0,t.width,t.height);const s=t.toDataURL("image/jpeg");if(l.current&&j==="text"){const o=`<img src="${s}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),L()}oe()},oe=()=>{A&&(A.getTracks().forEach(a=>a.stop()),me(null)),ue(!1)},Ke=async a=>{const t=a.target.files;if(!(!t||!r)){for(let n=0;n<t.length;n++){const s=t[n];try{const o=new FileReader;o.onload=m=>{var b;const h=(b=m.target)==null?void 0:b.result,g=s.type.startsWith("image/")?"image":s.type.startsWith("video/")?"video":s.type.startsWith("audio/")?"audio":"file";if(l.current&&j==="text"){let y="";g==="image"?y=`<img src="${h}" alt="${s.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:g==="video"?y=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${h}" type="${s.type}">Your browser does not support video.</video>`:g==="audio"?y=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${h}" type="${s.type}">Your browser does not support audio.</audio>`:y=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${s.name}</span></div>`,document.execCommand("insertHTML",!1,y),L()}},o.readAsDataURL(s)}catch{}}a.target.value=""}},be=a=>{let t=a;return t=t.replace(/\$\\text\{([^}]+)\}\$/g,(n,s)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(s)?s:n),t=t.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),t},ye=a=>{const t=new Date(a),s=new Date().getTime()-t.getTime(),o=Math.floor(s/(1e3*60*60*24));return o===0?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:t.toLocaleDateString("en-US",{month:"short",day:"numeric"})},ve=()=>{var t;const a=(t=r==null?void 0:r.id)==null?void 0:t.split(":")[0];return{p:({children:n})=>e.jsx("p",{style:{marginBottom:"0.5em"},children:K(n,c,a)}),li:({children:n})=>e.jsx("li",{children:K(n,c,a)}),strong:({children:n})=>e.jsx("strong",{style:{fontWeight:600},children:K(n,c,a)}),code:({inline:n,className:s,children:o})=>{const m=/language-(\w+)/.exec(s||"");return m&&m[1]==="math"||n===!1?e.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:e.jsx("code",{children:o})}):e.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},Qe=()=>{const a=t=>t?t.replace(/^\[.*?\]\s*/,""):"";return e.jsxs("div",{className:"notes-tab",children:[e.jsx("input",{type:"file",ref:fe,onChange:Ve,accept:".bible-note,.json",className:"hidden"}),te?e.jsx("input",{type:"file",ref:P,onChange:ge,accept:"image/*",capture:!0,className:"hidden"}):e.jsx("input",{type:"file",ref:P,onChange:ge,accept:"image/*",className:"hidden"}),e.jsx("input",{type:"file",ref:xe,onChange:Ke,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),He&&!te&&e.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[e.jsx("strong",{children:"Take Photo"}),e.jsx("button",{onClick:oe,className:"toolbar-btn",children:"X"})]}),e.jsx("video",{ref:F,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),e.jsx("canvas",{ref:ae,className:"hidden"}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[e.jsx("button",{onClick:Ye,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),e.jsx("button",{onClick:oe,className:"toolbar-btn",children:"Cancel"})]})]})}),(r==null?void 0:r.selectedRawText)&&e.jsxs("div",{className:"verse-quote-block",children:[e.jsxs("div",{className:"verse-quote-header",children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsx("div",{className:"verse-quote-text",children:a(r.selectedRawText)})]}),e.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(t=>e.jsx("button",{onClick:()=>$e(t),className:"toolbar-btn",style:j===t?{background:"#4f46e5",color:"white"}:{},children:t==="text"?"📝 Text":t==="draw"?"✏️ Draw":"🔀 Overlay"},t))}),(j==="text"||j==="overlay")&&e.jsxs("div",{className:"rich-toolbar",children:[e.jsx("button",{onClick:()=>W("bold"),className:"toolbar-btn",title:"Bold",children:e.jsx("strong",{children:"B"})}),e.jsx("button",{onClick:()=>W("italic"),className:"toolbar-btn",title:"Italic",children:e.jsx("em",{children:"I"})}),e.jsx("button",{onClick:()=>W("underline"),className:"toolbar-btn",title:"Underline",children:e.jsx("u",{children:"U"})}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>W("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),e.jsx("button",{onClick:()=>W("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>{te&&P.current?P.current.click():Ge()},className:"toolbar-btn",title:"Take photo",children:"📷"}),e.jsx("button",{onClick:()=>{var t;return(t=xe.current)==null?void 0:t.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),e.jsx("button",{onClick:Be,className:"toolbar-btn",title:"Import note",children:"⬆"}),e.jsx("button",{onClick:Ue,className:"toolbar-btn",title:"Export note",children:"⬇"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:O?Pe:Oe,className:"toolbar-btn",style:O?{background:"#fee2e2",color:"#ef4444"}:{},title:O?"Stop":"Read aloud",children:O?"⏹":"🔊"})]}),j==="text"&&e.jsx("div",{ref:l,className:"note-editor",contentEditable:!0,onInput:L,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),j==="draw"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[e.jsx(Ne,{ref:C,onChange:t=>{E(t),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>D(!0),2e3)},initialData:M,overlayMode:!1,isWritingMode:k,paperType:re}),e.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(t=>e.jsx("button",{onClick:()=>{var n;Me(t),(n=C.current)==null||n.setTool(t)},className:"toolbar-btn",style:_e===t?{background:t==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:t,children:t==="pen"?"✏️":t==="marker"?"🖊️":t==="highlighter"?"🖍️":"🧹"},t)),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),e.jsx("span",{className:"toolbar-sep"}),["plain","grid","ruled"].map(t=>e.jsx("button",{onClick:()=>{var n;Fe(t),(n=C.current)==null||n.setPaperType(t)},className:"toolbar-btn",style:re===t?{background:"#e0e7ff"}:{},title:t==="plain"?"Plain":t==="grid"?"Grid":"College Ruled",children:t==="plain"?"📄":t==="grid"?"📐":"📝"},t)),e.jsx("span",{className:"toolbar-sep"}),ft.map(t=>e.jsx("button",{onClick:()=>{var n;ze(t),(n=C.current)==null||n.setColor(t)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:t,border:Ee===t?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:t},t)),e.jsx("input",{type:"range",min:"1",max:"20",value:De,onChange:t=>{var s;const n=Number(t.target.value);Le(n),(s=C.current)==null||s.setSize(n)},style:{width:"60px",marginLeft:"4px"}})]})]}),j==="overlay"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[e.jsx("div",{ref:l,className:"note-editor",contentEditable:void 0,onInput:L,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:k?"none":"auto"}}),e.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:k?"auto":"none"},children:e.jsx(Ne,{ref:C,onChange:t=>{E(t),_(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>D(!0),2e3)},initialData:M,overlayMode:!0,isWritingMode:k,paperType:re})}),e.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:e.jsx("button",{onClick:()=>Ae(!k),className:"toolbar-btn",style:k?{background:"#e0e7ff",color:"#4f46e5"}:{},children:k?"✏️ Draw":"👆 Navigate"})})]}),e.jsxs("div",{className:"note-toolbar",children:[e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>D(!1),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(J||M)&&e.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(l.current&&(l.current.innerHTML=""),E(""),D(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!Ie&&e.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},Xe=()=>{const a=ve();return e.jsx("div",{className:"research-tab",children:d!=null&&d.aiResearch&&d.aiResearch.length>0?e.jsx("div",{className:"research-list",children:d.aiResearch.map(t=>e.jsxs("div",{className:"research-entry",children:[e.jsxs("div",{className:"research-header",children:[e.jsxs("div",{className:"research-query",children:[e.jsx("strong",{children:"Q:"})," ",t.query]}),e.jsxs("div",{className:"research-actions",children:[e.jsx("span",{className:"timestamp",children:ye(t.timestamp)}),e.jsx("button",{onClick:()=>qe(t.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),t.image&&e.jsxs("div",{className:"research-image",children:[e.jsx("img",{src:`data:${t.image.mimeType};base64,${t.image.data}`,alt:t.image.caption||"Research image",className:"research-img",onClick:()=>{const n=window.open("");n&&n.document.write(`
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
                        `)},title:"Click to view full size"}),t.image.caption&&e.jsx("div",{className:"image-caption",children:t.image.caption})]}),e.jsx("div",{className:"research-response",children:e.jsx(ke,{components:a,children:be(t.response)})}),t.tags&&t.tags.length>0&&e.jsx("div",{className:"research-tags",children:t.tags.map((n,s)=>e.jsxs("span",{className:"tag",children:["#",n]},s))})]},t.id))}):e.jsxs("div",{className:"empty-state",children:[e.jsx("p",{children:"No AI research yet"}),e.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},Je=()=>{const a=ve(),t=[];return d!=null&&d.personalNote&&t.push({type:"note",timestamp:d.personalNote.updatedAt,content:d.personalNote}),d!=null&&d.aiResearch&&d.aiResearch.forEach(n=>{t.push({type:"research",timestamp:n.timestamp,content:n})}),t.sort((n,s)=>s.timestamp-n.timestamp),e.jsx("div",{className:"all-tab",children:t.length>0?e.jsx("div",{className:"timeline",children:t.map((n,s)=>e.jsxs("div",{className:`timeline-item ${n.type}`,children:[e.jsx("div",{className:"timeline-marker",children:n.type==="note"?"📝":"🤖"}),e.jsxs("div",{className:"timeline-content",children:[e.jsxs("div",{className:"timeline-header",children:[e.jsx("span",{className:"timeline-type",children:n.type==="note"?"Personal Note":"AI Research"}),e.jsx("span",{className:"timeline-time",children:ye(n.timestamp)})]}),n.type==="note"?e.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:n.content.text}}):e.jsxs("div",{className:"research-preview",children:[n.content.image&&e.jsx("div",{className:"research-image",children:e.jsx("img",{src:`data:${n.content.image.mimeType};base64,${n.content.image.data}`,alt:n.content.image.caption||"Research image",className:"research-img",onClick:()=>{const o=n.content.image,m=window.open("");m&&m.document.write(`
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
                                `)},title:"Click to view full size"})}),e.jsxs("div",{className:"research-q",children:["Q: ",n.content.query]}),e.jsx("div",{className:"research-a",children:e.jsx(ke,{components:a,children:be(n.content.response)})})]})]})]},s))}):e.jsx("div",{className:"empty-state",children:e.jsx("p",{children:"No content yet"})})})},U=e.jsxs("div",{className:"notes-mode-bar",children:[e.jsx("button",{className:`notes-mode-tab ${$==="journal"?"active":""}`,onClick:()=>pe("journal"),children:"Journal"}),e.jsx("button",{className:`notes-mode-tab ${$==="verse-notes"?"active":""}`,onClick:()=>pe("verse-notes"),children:"Verse Notes"})]});return!r&&$==="verse-notes"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[U,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:Y})]}):$==="journal"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[U,e.jsx("div",{style:{flex:1,overflow:"hidden"},children:e.jsx(i.Suspense,{fallback:e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9ca3af"},children:"Loading..."}),children:e.jsx(lt,{bookId:v||(r==null?void 0:r.bookId),chapter:I||(r==null?void 0:r.chapter),bookName:Q||(r==null?void 0:r.bookName),onNavigate:c?(a,t)=>c(a,t):void 0})})}),e.jsx("style",{children:Y})]}):r?e.jsxs("div",{className:"enhanced-notebook",children:[U,e.jsxs("div",{className:"notebook-header",children:[e.jsxs("h3",{children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsxs("div",{className:"tab-selector",children:[e.jsxs("button",{className:`tab ${N==="research"?"active":""}`,onClick:()=>{q("research")},children:["🤖 AI Research ",(je=d==null?void 0:d.aiResearch)!=null&&je.length?`(${d.aiResearch.length})`:""]}),e.jsx("button",{className:`tab ${N==="notes"?"active":""}`,onClick:()=>{q("notes")},children:"📝 My Notes"}),e.jsx("button",{className:`tab ${N==="all"?"active":""}`,onClick:()=>{q("all")},children:"📚 All"})]})]}),e.jsxs("div",{className:"notebook-content",children:[N==="notes"&&Qe(),N==="research"&&Xe(),N==="all"&&Je()]}),e.jsx("style",{children:`
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
      `}),e.jsx("style",{children:Y})]}):e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[U,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:Y})]})};export{Ct as default};
