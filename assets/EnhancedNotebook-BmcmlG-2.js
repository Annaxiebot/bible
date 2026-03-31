const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/JournalView-C91D7WHT.js","assets/vendor-react-CFhoJv6l.js","assets/journalStorage-CSKzFOhS.js","assets/index-CasEFICT.js","assets/vendor-google-BD6ai2ur.js","assets/vendor-anthropic-CkMCgFtn.js","assets/vendor-supabase-D-SUoaNb.js","assets/SimpleDrawingCanvas-BSsdyATu.js","assets/imageCompressionService-DB0KGYQO.js"])))=>i.map(i=>d[i]);
import{K as Xe,v as J,_ as Ge,T as Ze,J as et,E as tt,s as rt,C as ie}from"./index-CasEFICT.js";import{r as i,j as e,a as oe}from"./vendor-react-CFhoJv6l.js";import{S as we}from"./SimpleDrawingCanvas-BSsdyATu.js";import{L as ke}from"./LazyMarkdown-DAJUNskv.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const nt=(r,u)=>{const h=new Blob([JSON.stringify(u,null,2)],{type:"application/json"}),m=URL.createObjectURL(h),d=document.createElement("a");d.href=m,d.download=`${r.replace(/:/g,"_")}.bible-note`,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(m)},at=r=>new Promise((u,h)=>{const m=new FileReader;m.onload=d=>{var c;try{const g=JSON.parse((c=d.target)==null?void 0:c.result);typeof g.text=="string"&&typeof g.drawing=="string"?u(g):h(new Error("文件格式不正确"))}catch{h(new Error("无法解析 JSON 文件"))}},m.onerror=()=>h(new Error("文件读取失败")),m.readAsText(r)}),st=i.lazy(()=>Ge(()=>import("./JournalView-C91D7WHT.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8]))),Ne="bible_notes_view_mode",K=`
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
`,ot=Object.keys(ie).sort((r,u)=>u.length-r.length).map(r=>r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),le=ot.join("|"),it=`(?:${le})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,lt="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",ct=new RegExp(`${it}|${lt}`,"gi"),Ce=r=>{const u=[];for(const h of r.split(/[，,]\s*/)){const[m,d]=h.split("-").map(Number);for(let c=m;c<=(d||m);c++)u.push(c)}return u},dt=(r,u)=>{const h=new RegExp(`^(${le})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),m=new RegExp(`^(${le})\\s*(\\d+)[章篇]$`,"i");let d=r.match(h);if(d){const c=ie[d[1]];return c?{bookId:c,chapter:+d[2],verses:Ce(d[3])}:null}if(d=r.match(m),d){const c=ie[d[1]];return c?{bookId:c,chapter:+d[2]}:null}if(u){const c=r.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(c)return{bookId:u,chapter:+c[1],verses:Ce(c[2])}}return null},pt={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},Re=(r,u,h)=>{if(!u||typeof r!="string")return r;const m=new RegExp(ct.source,"gi"),d=[];let c=0,g;for(;(g=m.exec(r))!==null;){g.index>c&&d.push(r.slice(c,g.index));const I=dt(g[0],h);if(I){const Q=g[0];d.push(e.jsx("a",{style:pt,onClick:$=>{$.preventDefault(),u(I.bookId,I.chapter,I.verses)},children:Q},`r${g.index}`))}else d.push(g[0]);c=m.lastIndex}return c<r.length&&d.push(r.slice(c)),d.length===1?d[0]:e.jsx(e.Fragment,{children:d})},Y=(r,u,h)=>{if(typeof r=="string")return Re(r,u,h);if(typeof r=="number")return Re(String(r),u,h);if(r==null||typeof r=="boolean"||oe.isValidElement(r))return r;const m=oe.Children.toArray(r);return m.length>0?m.map((d,c)=>e.jsx(oe.Fragment,{children:Y(d,u,h)},c)):r},ut=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],vt=({selection:r,onSaveNote:u,initialContent:h,initialTab:m="research",researchUpdateTrigger:d=0,onNavigate:c,currentBookId:g,currentChapter:I,currentBookName:Q})=>{var ve;const[$,ce]=i.useState(()=>{const a=localStorage.getItem(Ne);return a==="journal"||a==="verse-notes"?a:r?"verse-notes":"journal"});i.useEffect(()=>{r&&ce("verse-notes")},[r==null?void 0:r.id]);const de=a=>{ce(a),localStorage.setItem(Ne,a)},Se=Xe(),[k,U]=i.useState(m),[p,X]=i.useState(null),[G,Z]=i.useState(""),[Te,E]=i.useState(!0),[j,Ie]=i.useState("text"),[_,L]=i.useState(""),[$e,Ee]=i.useState("pen"),[_e,Le]=i.useState("#000000"),[Me,ze]=i.useState(2),[N,De]=i.useState(!0),[W,ee]=i.useState(!1),[Ae,pe]=i.useState(!1),[A,ue]=i.useState(null),te=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),l=i.useRef(null),R=i.useRef(null),w=i.useRef(null),me=i.useRef(null),re=i.useRef(Date.now()),S=i.useRef(!1),M=i.useRef(!1),H=i.useRef(null),he=i.useRef(null),q=i.useRef(null),fe=i.useRef(null),F=i.useRef(null),ne=i.useRef(null);i.useEffect(()=>{U(m)},[m]),i.useEffect(()=>{r&&me.current!==r.id&&(me.current=r.id,re.current=Date.now(),S.current=!1,M.current=!1,H.current&&clearTimeout(H.current),ae())},[r==null?void 0:r.id]),i.useEffect(()=>{r&&ae()},[Se]),i.useEffect(()=>{k==="notes"&&l.current&&G&&(l.current.innerHTML.trim()||(l.current.innerHTML=G))},[k]),i.useEffect(()=>()=>{A&&A.getTracks().forEach(a=>a.stop())},[A]);const ae=async()=>{if(!r)return;E(!0);const a=r.id.split(":");if(a.length>=3){const t=a[0],n=parseInt(a[1]),s=[parseInt(a[2])],o=await J.getVerseData(t,n,s);X(o),o!=null&&o.personalNote?(Z(o.personalNote.text),L(o.personalNote.drawing||""),l.current&&!M.current&&(l.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(S.current=!0)):h?(Z(h),l.current&&!M.current&&(l.current.innerHTML=h),h.trim()&&(S.current=!0)):(Z(""),L(""),l.current&&!M.current&&(l.current.innerHTML=""),S.current=!1)}},z=async(a=!1)=>{var n,s;if(!r){alert("Please select a verse first before saving a note");return}const t=r.id.split(":");if(t.length>=3){const o=t[0],f=parseInt(t[1]),x=[parseInt(t[2])],b=((n=l.current)==null?void 0:n.innerHTML)||"";if(b.trim()||_){const y={text:b,drawing:_,createdAt:((s=p==null?void 0:p.personalNote)==null?void 0:s.createdAt)||Date.now(),updatedAt:Date.now()};await J.savePersonalNote(o,f,x,y),u(r.id,b,a),X(v=>v?{...v,personalNote:y}:null)}else await J.deletePersonalNote(o,f,x),u(r.id,"",a),X(y=>y?{...y,personalNote:void 0}:null);E(!0)}},He=()=>{if(!l.current||!r)return;const a=new Date,t=a.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),n=a.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),s=document.createElement("span");s.contentEditable="false",s.style.fontSize="14px",s.style.color="#94a3b8",s.style.fontWeight="normal",s.style.userSelect="none",s.textContent=`[${n} ${t}]`;const o=document.createTextNode(" "),f=window.getSelection();let x=null,b=0,y=null;f&&f.rangeCount>0&&(x=f.getRangeAt(0).cloneRange(),b=x.startOffset,y=x.startContainer);const v=l.current.firstChild;v?(l.current.insertBefore(o,v),l.current.insertBefore(s,o)):(l.current.appendChild(s),l.current.appendChild(o));const P=y,je=b;requestAnimationFrame(()=>{const T=window.getSelection();if(!(!T||!l.current))try{if(P&&P.isConnected){const C=document.createRange();C.setStart(P,je),C.setEnd(P,je),T.removeAllRanges(),T.addRange(C)}else{const C=document.createRange();C.selectNodeContents(l.current),C.collapse(!1),T.removeAllRanges(),T.addRange(C)}}catch{try{const V=document.createRange();V.selectNodeContents(l.current),V.collapse(!1),T.removeAllRanges(),T.addRange(V)}catch{}}}),S.current=!0},D=()=>{var x;const a=Date.now(),t=a-re.current,n=((x=l.current)==null?void 0:x.innerHTML)||"",s=rt(n).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(s);t>120*1e3&&(o||(S.current=!1)),!S.current&&s.length>0&&!o&&He(),re.current=a,M.current=!0,H.current&&clearTimeout(H.current),H.current=window.setTimeout(()=>{M.current=!1},1e4),E(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>{z(!0)},2e3)},Fe=async a=>{if(!r||!p)return;const t=r.id.split(":");if(t.length>=3){const n=t[0],s=parseInt(t[1]),o=[parseInt(t[2])];await J.deleteAIResearch(n,s,o,a),ae()}},O=(a,t="")=>{var n;document.execCommand(a,!1,t),(n=l.current)==null||n.focus(),D()},Oe=()=>{var t;const a=((t=l.current)==null?void 0:t.innerText)||"";a.trim()&&(ee(!0),tt(a,()=>ee(!1)))},Ue=()=>{et(),ee(!1)},We=()=>{var n;if(!r)return;const t={text:((n=l.current)==null?void 0:n.innerHTML)||"",drawing:_,media:[],version:1};nt(`VerseNote_${r.id}`,t)},qe=()=>{var a;(a=he.current)==null||a.click()},Be=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=await at(t);l.current&&(l.current.innerHTML=s.text),L(s.drawing||""),E(!1),z(!1)}catch(s){alert(s instanceof Error?s.message:"Failed to import note")}finally{a.target.value=""}},xe=async a=>{var n;const t=(n=a.target.files)==null?void 0:n[0];if(!(!t||!r))try{const s=new FileReader;s.onload=o=>{var x;const f=(x=o.target)==null?void 0:x.result;if(l.current&&j==="text"){const b=`<img src="${f}" alt="${t.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,b),D()}},s.readAsDataURL(t)}catch{}finally{a.target.value=""}},Pe=async()=>{try{const a=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});ue(a),pe(!0),setTimeout(()=>{F.current&&(F.current.srcObject=a)},Ze.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},Ve=()=>{if(!F.current||!ne.current||!r)return;const a=F.current,t=ne.current,n=t.getContext("2d");if(!n)return;t.width=a.videoWidth,t.height=a.videoHeight,n.drawImage(a,0,0,t.width,t.height);const s=t.toDataURL("image/jpeg");if(l.current&&j==="text"){const o=`<img src="${s}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),D()}se()},se=()=>{A&&(A.getTracks().forEach(a=>a.stop()),ue(null)),pe(!1)},Je=async a=>{const t=a.target.files;if(!(!t||!r)){for(let n=0;n<t.length;n++){const s=t[n];try{const o=new FileReader;o.onload=f=>{var y;const x=(y=f.target)==null?void 0:y.result,b=s.type.startsWith("image/")?"image":s.type.startsWith("video/")?"video":s.type.startsWith("audio/")?"audio":"file";if(l.current&&j==="text"){let v="";b==="image"?v=`<img src="${x}" alt="${s.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:b==="video"?v=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${x}" type="${s.type}">Your browser does not support video.</video>`:b==="audio"?v=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${x}" type="${s.type}">Your browser does not support audio.</audio>`:v=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${s.name}</span></div>`,document.execCommand("insertHTML",!1,v),D()}},o.readAsDataURL(s)}catch{}}a.target.value=""}},ge=a=>{let t=a;return t=t.replace(/\$\\text\{([^}]+)\}\$/g,(n,s)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(s)?s:n),t=t.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),t},be=a=>{const t=new Date(a),s=new Date().getTime()-t.getTime(),o=Math.floor(s/(1e3*60*60*24));return o===0?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:t.toLocaleDateString("en-US",{month:"short",day:"numeric"})},ye=()=>{var t;const a=(t=r==null?void 0:r.id)==null?void 0:t.split(":")[0];return{p:({children:n})=>e.jsx("p",{style:{marginBottom:"0.5em"},children:Y(n,c,a)}),li:({children:n})=>e.jsx("li",{children:Y(n,c,a)}),strong:({children:n})=>e.jsx("strong",{style:{fontWeight:600},children:Y(n,c,a)}),code:({inline:n,className:s,children:o})=>{const f=/language-(\w+)/.exec(s||"");return f&&f[1]==="math"||n===!1?e.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:e.jsx("code",{children:o})}):e.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},Ke=()=>{const a=t=>t?t.replace(/^\[.*?\]\s*/,""):"";return e.jsxs("div",{className:"notes-tab",children:[e.jsx("input",{type:"file",ref:he,onChange:Be,accept:".bible-note,.json",className:"hidden"}),te?e.jsx("input",{type:"file",ref:q,onChange:xe,accept:"image/*",capture:!0,className:"hidden"}):e.jsx("input",{type:"file",ref:q,onChange:xe,accept:"image/*",className:"hidden"}),e.jsx("input",{type:"file",ref:fe,onChange:Je,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),Ae&&!te&&e.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[e.jsx("strong",{children:"Take Photo"}),e.jsx("button",{onClick:se,className:"toolbar-btn",children:"X"})]}),e.jsx("video",{ref:F,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),e.jsx("canvas",{ref:ne,className:"hidden"}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[e.jsx("button",{onClick:Ve,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),e.jsx("button",{onClick:se,className:"toolbar-btn",children:"Cancel"})]})]})}),(r==null?void 0:r.selectedRawText)&&e.jsxs("div",{className:"verse-quote-block",children:[e.jsxs("div",{className:"verse-quote-header",children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsx("div",{className:"verse-quote-text",children:a(r.selectedRawText)})]}),e.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(t=>e.jsx("button",{onClick:()=>Ie(t),className:"toolbar-btn",style:j===t?{background:"#4f46e5",color:"white"}:{},children:t==="text"?"📝 Text":t==="draw"?"✏️ Draw":"🔀 Overlay"},t))}),(j==="text"||j==="overlay")&&e.jsxs("div",{className:"rich-toolbar",children:[e.jsx("button",{onClick:()=>O("bold"),className:"toolbar-btn",title:"Bold",children:e.jsx("strong",{children:"B"})}),e.jsx("button",{onClick:()=>O("italic"),className:"toolbar-btn",title:"Italic",children:e.jsx("em",{children:"I"})}),e.jsx("button",{onClick:()=>O("underline"),className:"toolbar-btn",title:"Underline",children:e.jsx("u",{children:"U"})}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>O("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),e.jsx("button",{onClick:()=>O("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>{te&&q.current?q.current.click():Pe()},className:"toolbar-btn",title:"Take photo",children:"📷"}),e.jsx("button",{onClick:()=>{var t;return(t=fe.current)==null?void 0:t.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),e.jsx("button",{onClick:qe,className:"toolbar-btn",title:"Import note",children:"⬆"}),e.jsx("button",{onClick:We,className:"toolbar-btn",title:"Export note",children:"⬇"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:W?Ue:Oe,className:"toolbar-btn",style:W?{background:"#fee2e2",color:"#ef4444"}:{},title:W?"Stop":"Read aloud",children:W?"⏹":"🔊"})]}),j==="text"&&e.jsx("div",{ref:l,className:"note-editor",contentEditable:!0,onInput:D,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),j==="draw"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[e.jsx(we,{ref:R,onChange:t=>{L(t),E(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>z(!0),2e3)},initialData:_,overlayMode:!1,isWritingMode:N}),e.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(t=>e.jsx("button",{onClick:()=>{var n;Ee(t),(n=R.current)==null||n.setTool(t)},className:"toolbar-btn",style:$e===t?{background:t==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:t,children:t==="pen"?"✏️":t==="marker"?"🖊️":t==="highlighter"?"🖍️":"🧹"},t)),e.jsx("button",{onClick:()=>{var t;return(t=R.current)==null?void 0:t.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),e.jsx("button",{onClick:()=>{var t;return(t=R.current)==null?void 0:t.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),e.jsx("span",{className:"toolbar-sep"}),ut.map(t=>e.jsx("button",{onClick:()=>{var n;Le(t),(n=R.current)==null||n.setColor(t)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:t,border:_e===t?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:t},t)),e.jsx("input",{type:"range",min:"1",max:"20",value:Me,onChange:t=>{var s;const n=Number(t.target.value);ze(n),(s=R.current)==null||s.setSize(n)},style:{width:"60px",marginLeft:"4px"}})]})]}),j==="overlay"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[e.jsx("div",{ref:l,className:"note-editor",contentEditable:void 0,onInput:D,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:N?"none":"auto"}}),e.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:N?"auto":"none"},children:e.jsx(we,{ref:R,onChange:t=>{L(t),E(!1),w.current&&clearTimeout(w.current),w.current=window.setTimeout(()=>z(!0),2e3)},initialData:_,overlayMode:!0,isWritingMode:N})}),e.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:e.jsx("button",{onClick:()=>De(!N),className:"toolbar-btn",style:N?{background:"#e0e7ff",color:"#4f46e5"}:{},children:N?"✏️ Draw":"👆 Navigate"})})]}),e.jsxs("div",{className:"note-toolbar",children:[e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>z(!1),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(G||_)&&e.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(l.current&&(l.current.innerHTML=""),L(""),z(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!Te&&e.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},Ye=()=>{const a=ye();return e.jsx("div",{className:"research-tab",children:p!=null&&p.aiResearch&&p.aiResearch.length>0?e.jsx("div",{className:"research-list",children:p.aiResearch.map(t=>e.jsxs("div",{className:"research-entry",children:[e.jsxs("div",{className:"research-header",children:[e.jsxs("div",{className:"research-query",children:[e.jsx("strong",{children:"Q:"})," ",t.query]}),e.jsxs("div",{className:"research-actions",children:[e.jsx("span",{className:"timestamp",children:be(t.timestamp)}),e.jsx("button",{onClick:()=>Fe(t.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),t.image&&e.jsxs("div",{className:"research-image",children:[e.jsx("img",{src:`data:${t.image.mimeType};base64,${t.image.data}`,alt:t.image.caption||"Research image",className:"research-img",onClick:()=>{const n=window.open("");n&&n.document.write(`
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
                        `)},title:"Click to view full size"}),t.image.caption&&e.jsx("div",{className:"image-caption",children:t.image.caption})]}),e.jsx("div",{className:"research-response",children:e.jsx(ke,{components:a,children:ge(t.response)})}),t.tags&&t.tags.length>0&&e.jsx("div",{className:"research-tags",children:t.tags.map((n,s)=>e.jsxs("span",{className:"tag",children:["#",n]},s))})]},t.id))}):e.jsxs("div",{className:"empty-state",children:[e.jsx("p",{children:"No AI research yet"}),e.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},Qe=()=>{const a=ye(),t=[];return p!=null&&p.personalNote&&t.push({type:"note",timestamp:p.personalNote.updatedAt,content:p.personalNote}),p!=null&&p.aiResearch&&p.aiResearch.forEach(n=>{t.push({type:"research",timestamp:n.timestamp,content:n})}),t.sort((n,s)=>s.timestamp-n.timestamp),e.jsx("div",{className:"all-tab",children:t.length>0?e.jsx("div",{className:"timeline",children:t.map((n,s)=>e.jsxs("div",{className:`timeline-item ${n.type}`,children:[e.jsx("div",{className:"timeline-marker",children:n.type==="note"?"📝":"🤖"}),e.jsxs("div",{className:"timeline-content",children:[e.jsxs("div",{className:"timeline-header",children:[e.jsx("span",{className:"timeline-type",children:n.type==="note"?"Personal Note":"AI Research"}),e.jsx("span",{className:"timeline-time",children:be(n.timestamp)})]}),n.type==="note"?e.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:n.content.text}}):e.jsxs("div",{className:"research-preview",children:[n.content.image&&e.jsx("div",{className:"research-image",children:e.jsx("img",{src:`data:${n.content.image.mimeType};base64,${n.content.image.data}`,alt:n.content.image.caption||"Research image",className:"research-img",onClick:()=>{const o=n.content.image,f=window.open("");f&&f.document.write(`
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
                                `)},title:"Click to view full size"})}),e.jsxs("div",{className:"research-q",children:["Q: ",n.content.query]}),e.jsx("div",{className:"research-a",children:e.jsx(ke,{components:a,children:ge(n.content.response)})})]})]})]},s))}):e.jsx("div",{className:"empty-state",children:e.jsx("p",{children:"No content yet"})})})},B=e.jsxs("div",{className:"notes-mode-bar",children:[e.jsx("button",{className:`notes-mode-tab ${$==="journal"?"active":""}`,onClick:()=>de("journal"),children:"Journal"}),e.jsx("button",{className:`notes-mode-tab ${$==="verse-notes"?"active":""}`,onClick:()=>de("verse-notes"),children:"Verse Notes"})]});return!r&&$==="verse-notes"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[B,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:K})]}):$==="journal"?e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[B,e.jsx("div",{style:{flex:1,overflow:"hidden"},children:e.jsx(i.Suspense,{fallback:e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#9ca3af"},children:"Loading..."}),children:e.jsx(st,{bookId:g||(r==null?void 0:r.bookId),chapter:I||(r==null?void 0:r.chapter),bookName:Q||(r==null?void 0:r.bookName),onNavigate:c?(a,t)=>c(a,t):void 0})})}),e.jsx("style",{children:K})]}):r?e.jsxs("div",{className:"enhanced-notebook",children:[B,e.jsxs("div",{className:"notebook-header",children:[e.jsxs("h3",{children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsxs("div",{className:"tab-selector",children:[e.jsxs("button",{className:`tab ${k==="research"?"active":""}`,onClick:()=>{U("research")},children:["🤖 AI Research ",(ve=p==null?void 0:p.aiResearch)!=null&&ve.length?`(${p.aiResearch.length})`:""]}),e.jsx("button",{className:`tab ${k==="notes"?"active":""}`,onClick:()=>{U("notes")},children:"📝 My Notes"}),e.jsx("button",{className:`tab ${k==="all"?"active":""}`,onClick:()=>{U("all")},children:"📚 All"})]})]}),e.jsxs("div",{className:"notebook-content",children:[k==="notes"&&Ke(),k==="research"&&Ye(),k==="all"&&Qe()]}),e.jsx("style",{children:`
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
      `}),e.jsx("style",{children:K})]}):e.jsxs("div",{className:"enhanced-notebook",style:{display:"flex",flexDirection:"column",height:"100%"},children:[B,e.jsx("div",{className:"notebook-empty",style:{flex:1},children:e.jsx("p",{children:"Select a verse to add notes"})}),e.jsx("style",{children:K})]})};export{vt as default};
