import{r as c,j as e,a as G}from"./vendor-react-CNOxwxsp.js";import{t as He,v as F,T as _e,q as Fe,n as Ue,s as Oe,C as K}from"./index-BeR11dhP.js";import{D as de}from"./DrawingCanvas-DYCkUdiR.js";import{L as pe}from"./LazyMarkdown-yjrJlS_m.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const We=(r,u)=>{const h=new Blob([JSON.stringify(u,null,2)],{type:"application/json"}),m=URL.createObjectURL(h),i=document.createElement("a");i.href=m,i.download=`${r.replace(/:/g,"_")}.bible-note`,document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(m)},qe=r=>new Promise((u,h)=>{const m=new FileReader;m.onload=i=>{var d;try{const g=JSON.parse((d=i.target)==null?void 0:d.result);typeof g.text=="string"&&typeof g.drawing=="string"?u(g):h(new Error("文件格式不正确"))}catch{h(new Error("无法解析 JSON 文件"))}},m.onerror=()=>h(new Error("文件读取失败")),m.readAsText(r)}),Be=Object.keys(K).sort((r,u)=>u.length-r.length).map(r=>r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),Z=Be.join("|"),Pe=`(?:${Z})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,Ve="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",Je=new RegExp(`${Pe}|${Ve}`,"gi"),ue=r=>{const u=[];for(const h of r.split(/[，,]\s*/)){const[m,i]=h.split("-").map(Number);for(let d=m;d<=(i||m);d++)u.push(d)}return u},Qe=(r,u)=>{const h=new RegExp(`^(${Z})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),m=new RegExp(`^(${Z})\\s*(\\d+)[章篇]$`,"i");let i=r.match(h);if(i){const d=K[i[1]];return d?{bookId:d,chapter:+i[2],verses:ue(i[3])}:null}if(i=r.match(m),i){const d=K[i[1]];return d?{bookId:d,chapter:+i[2]}:null}if(u){const d=r.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(d)return{bookId:u,chapter:+d[1],verses:ue(d[2])}}return null},Xe={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},me=(r,u,h)=>{if(!u||typeof r!="string")return r;const m=new RegExp(Je.source,"gi"),i=[];let d=0,g;for(;(g=m.exec(r))!==null;){g.index>d&&i.push(r.slice(d,g.index));const b=Qe(g[0],h);if(b){const S=g[0];i.push(e.jsx("a",{style:Xe,onClick:p=>{p.preventDefault(),u(b.bookId,b.chapter,b.verses)},children:S},`r${g.index}`))}else i.push(g[0]);d=m.lastIndex}return d<r.length&&i.push(r.slice(d)),i.length===1?i[0]:e.jsx(e.Fragment,{children:i})},U=(r,u,h)=>{if(typeof r=="string")return me(r,u,h);if(typeof r=="number")return me(String(r),u,h);if(r==null||typeof r=="boolean"||G.isValidElement(r))return r;const m=G.Children.toArray(r);return m.length>0?m.map((i,d)=>e.jsx(G.Fragment,{children:U(i,u,h)},d)):r},Ye=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],st=({selection:r,onSaveNote:u,initialContent:h,initialTab:m="research",researchUpdateTrigger:i=0,onNavigate:d})=>{var ce;const g=He(),[b,S]=c.useState(m),[p,O]=c.useState(null),[W,q]=c.useState(""),[he,T]=c.useState(!0),[w,fe]=c.useState("text"),[I,L]=c.useState(""),[xe,ge]=c.useState("pen"),[be,ye]=c.useState("#000000"),[je,ve]=c.useState(2),[k,we]=c.useState(!0),[z,B]=c.useState(!1),[Ne,ee]=c.useState(!1),[M,te]=c.useState(null),P=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),l=c.useRef(null),C=c.useRef(null),N=c.useRef(null),re=c.useRef(null),V=c.useRef(Date.now()),R=c.useRef(!1),ne=c.useRef(null),H=c.useRef(null),se=c.useRef(null),$=c.useRef(null),J=c.useRef(null);c.useEffect(()=>{S(m)},[m]),c.useEffect(()=>{r&&re.current!==r.id&&(re.current=r.id,V.current=Date.now(),R.current=!1,Q())},[r==null?void 0:r.id]),c.useEffect(()=>{r&&Q()},[g]),c.useEffect(()=>{b==="notes"&&l.current&&W&&(l.current.innerHTML.trim()||(l.current.innerHTML=W))},[b]),c.useEffect(()=>()=>{M&&M.getTracks().forEach(s=>s.stop())},[M]);const Q=async()=>{if(!r)return;T(!0);const s=r.id.split(":");if(s.length>=3){const t=s[0],n=parseInt(s[1]),a=[parseInt(s[2])],o=await F.getVerseData(t,n,a);O(o),o!=null&&o.personalNote?(q(o.personalNote.text),L(o.personalNote.drawing||""),l.current&&(l.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(R.current=!0)):h?(q(h),l.current&&(l.current.innerHTML=h),h.trim()&&(R.current=!0)):(q(""),L(""),l.current&&(l.current.innerHTML=""),R.current=!1)}},E=async(s=!1)=>{var n,a;if(!r){alert("Please select a verse first before saving a note");return}const t=r.id.split(":");if(t.length>=3){const o=t[0],f=parseInt(t[1]),x=[parseInt(t[2])],y=((n=l.current)==null?void 0:n.innerHTML)||"";if(y.trim()||I){const j={text:y,drawing:I,createdAt:((a=p==null?void 0:p.personalNote)==null?void 0:a.createdAt)||Date.now(),updatedAt:Date.now()};await F.savePersonalNote(o,f,x,j),u(r.id,y,s),O(v=>v?{...v,personalNote:j}:null)}else await F.deletePersonalNote(o,f,x),u(r.id,"",s),O(j=>j?{...j,personalNote:void 0}:null);T(!0)}},ke=()=>{if(!l.current||!r)return;const s=new Date,t=s.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),n=s.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),a=document.createElement("span");a.contentEditable="false",a.style.fontSize="14px",a.style.color="#94a3b8",a.style.fontWeight="normal",a.style.userSelect="none",a.textContent=`[${n} ${t}]`;const o=document.createTextNode(" "),f=window.getSelection();let x=null,y=0,j=null;f&&f.rangeCount>0&&(x=f.getRangeAt(0).cloneRange(),y=x.startOffset,j=x.startContainer);const v=l.current.firstChild;if(v?(l.current.insertBefore(o,v),l.current.insertBefore(a,o)):(l.current.appendChild(a),l.current.appendChild(o)),f&&x&&j)try{const _=document.createRange();_.setStart(j,y),_.setEnd(j,y),f.removeAllRanges(),f.addRange(_)}catch{const Y=document.createRange();Y.setStartAfter(o),Y.setEndAfter(o),f.removeAllRanges(),f.addRange(Y)}R.current=!0},A=()=>{var x;const s=Date.now(),t=s-V.current,n=((x=l.current)==null?void 0:x.innerHTML)||"",a=Oe(n).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(a);t>120*1e3&&(o||(R.current=!1)),!R.current&&a.length>0&&!o&&ke(),V.current=s,T(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>{E(!0)},2e3)},Ce=async s=>{if(!r||!p)return;const t=r.id.split(":");if(t.length>=3){const n=t[0],a=parseInt(t[1]),o=[parseInt(t[2])];await F.deleteAIResearch(n,a,o,s),Q()}},D=(s,t="")=>{var n;document.execCommand(s,!1,t),(n=l.current)==null||n.focus(),A()},Re=()=>{var t;const s=((t=l.current)==null?void 0:t.innerText)||"";s.trim()&&(B(!0),Ue(s,()=>B(!1)))},Se=()=>{Fe(),B(!1)},Te=()=>{var n;if(!r)return;const t={text:((n=l.current)==null?void 0:n.innerHTML)||"",drawing:I,media:[],version:1};We(`VerseNote_${r.id}`,t)},Ie=()=>{var s;(s=ne.current)==null||s.click()},Le=async s=>{var n;const t=(n=s.target.files)==null?void 0:n[0];if(!(!t||!r))try{const a=await qe(t);l.current&&(l.current.innerHTML=a.text),L(a.drawing||""),T(!1),E(!1)}catch(a){alert(a instanceof Error?a.message:"Failed to import note")}finally{s.target.value=""}},ae=async s=>{var n;const t=(n=s.target.files)==null?void 0:n[0];if(!(!t||!r))try{const a=new FileReader;a.onload=o=>{var x;const f=(x=o.target)==null?void 0:x.result;if(l.current&&w==="text"){const y=`<img src="${f}" alt="${t.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,y),A()}},a.readAsDataURL(t)}catch{}finally{s.target.value=""}},Ee=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});te(s),ee(!0),setTimeout(()=>{$.current&&($.current.srcObject=s)},_e.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},Ae=()=>{if(!$.current||!J.current||!r)return;const s=$.current,t=J.current,n=t.getContext("2d");if(!n)return;t.width=s.videoWidth,t.height=s.videoHeight,n.drawImage(s,0,0,t.width,t.height);const a=t.toDataURL("image/jpeg");if(l.current&&w==="text"){const o=`<img src="${a}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),A()}X()},X=()=>{M&&(M.getTracks().forEach(s=>s.stop()),te(null)),ee(!1)},Me=async s=>{const t=s.target.files;if(!(!t||!r)){for(let n=0;n<t.length;n++){const a=t[n];try{const o=new FileReader;o.onload=f=>{var j;const x=(j=f.target)==null?void 0:j.result,y=a.type.startsWith("image/")?"image":a.type.startsWith("video/")?"video":a.type.startsWith("audio/")?"audio":"file";if(l.current&&w==="text"){let v="";y==="image"?v=`<img src="${x}" alt="${a.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:y==="video"?v=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${x}" type="${a.type}">Your browser does not support video.</video>`:y==="audio"?v=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${x}" type="${a.type}">Your browser does not support audio.</audio>`:v=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${a.name}</span></div>`,document.execCommand("insertHTML",!1,v),A()}},o.readAsDataURL(a)}catch{}}s.target.value=""}},oe=s=>{let t=s;return t=t.replace(/\$\\text\{([^}]+)\}\$/g,(n,a)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(a)?a:n),t=t.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),t},ie=s=>{const t=new Date(s),a=new Date().getTime()-t.getTime(),o=Math.floor(a/(1e3*60*60*24));return o===0?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:t.toLocaleDateString("en-US",{month:"short",day:"numeric"})},le=()=>{var t;const s=(t=r==null?void 0:r.id)==null?void 0:t.split(":")[0];return{p:({children:n})=>e.jsx("p",{style:{marginBottom:"0.5em"},children:U(n,d,s)}),li:({children:n})=>e.jsx("li",{children:U(n,d,s)}),strong:({children:n})=>e.jsx("strong",{style:{fontWeight:600},children:U(n,d,s)}),code:({inline:n,className:a,children:o})=>{const f=/language-(\w+)/.exec(a||"");return f&&f[1]==="math"||n===!1?e.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:e.jsx("code",{children:o})}):e.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},$e=()=>{const s=t=>t?t.replace(/^\[.*?\]\s*/,""):"";return e.jsxs("div",{className:"notes-tab",children:[e.jsx("input",{type:"file",ref:ne,onChange:Le,accept:".bible-note,.json",className:"hidden"}),P?e.jsx("input",{type:"file",ref:H,onChange:ae,accept:"image/*",capture:!0,className:"hidden"}):e.jsx("input",{type:"file",ref:H,onChange:ae,accept:"image/*",className:"hidden"}),e.jsx("input",{type:"file",ref:se,onChange:Me,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),Ne&&!P&&e.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[e.jsx("strong",{children:"Take Photo"}),e.jsx("button",{onClick:X,className:"toolbar-btn",children:"X"})]}),e.jsx("video",{ref:$,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),e.jsx("canvas",{ref:J,className:"hidden"}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[e.jsx("button",{onClick:Ae,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),e.jsx("button",{onClick:X,className:"toolbar-btn",children:"Cancel"})]})]})}),(r==null?void 0:r.selectedRawText)&&e.jsxs("div",{className:"verse-quote-block",children:[e.jsxs("div",{className:"verse-quote-header",children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsx("div",{className:"verse-quote-text",children:s(r.selectedRawText)})]}),e.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(t=>e.jsx("button",{onClick:()=>fe(t),className:"toolbar-btn",style:w===t?{background:"#4f46e5",color:"white"}:{},children:t==="text"?"📝 Text":t==="draw"?"✏️ Draw":"🔀 Overlay"},t))}),(w==="text"||w==="overlay")&&e.jsxs("div",{className:"rich-toolbar",children:[e.jsx("button",{onClick:()=>D("bold"),className:"toolbar-btn",title:"Bold",children:e.jsx("strong",{children:"B"})}),e.jsx("button",{onClick:()=>D("italic"),className:"toolbar-btn",title:"Italic",children:e.jsx("em",{children:"I"})}),e.jsx("button",{onClick:()=>D("underline"),className:"toolbar-btn",title:"Underline",children:e.jsx("u",{children:"U"})}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>D("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),e.jsx("button",{onClick:()=>D("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>{P&&H.current?H.current.click():Ee()},className:"toolbar-btn",title:"Take photo",children:"📷"}),e.jsx("button",{onClick:()=>{var t;return(t=se.current)==null?void 0:t.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),e.jsx("button",{onClick:Ie,className:"toolbar-btn",title:"Import note",children:"⬆"}),e.jsx("button",{onClick:Te,className:"toolbar-btn",title:"Export note",children:"⬇"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:z?Se:Re,className:"toolbar-btn",style:z?{background:"#fee2e2",color:"#ef4444"}:{},title:z?"Stop":"Read aloud",children:z?"⏹":"🔊"})]}),w==="text"&&e.jsx("div",{ref:l,className:"note-editor",contentEditable:!0,onInput:A,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),w==="draw"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[e.jsx(de,{ref:C,onChange:t=>{L(t),T(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>E(!0),2e3)},initialData:I,overlayMode:!1,isWritingMode:k}),e.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(t=>e.jsx("button",{onClick:()=>{var n;ge(t),(n=C.current)==null||n.setTool(t)},className:"toolbar-btn",style:xe===t?{background:t==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:t,children:t==="pen"?"✏️":t==="marker"?"🖊️":t==="highlighter"?"🖍️":"🧹"},t)),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),e.jsx("button",{onClick:()=>{var t;return(t=C.current)==null?void 0:t.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),e.jsx("span",{className:"toolbar-sep"}),Ye.map(t=>e.jsx("button",{onClick:()=>{var n;ye(t),(n=C.current)==null||n.setColor(t)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:t,border:be===t?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:t},t)),e.jsx("input",{type:"range",min:"1",max:"20",value:je,onChange:t=>{var a;const n=Number(t.target.value);ve(n),(a=C.current)==null||a.setSize(n)},style:{width:"60px",marginLeft:"4px"}})]})]}),w==="overlay"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[e.jsx("div",{ref:l,className:"note-editor",contentEditable:void 0,onInput:A,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:k?"none":"auto"}}),e.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:k?"auto":"none"},children:e.jsx(de,{ref:C,onChange:t=>{L(t),T(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>E(!0),2e3)},initialData:I,overlayMode:!0,isWritingMode:k})}),e.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:e.jsx("button",{onClick:()=>we(!k),className:"toolbar-btn",style:k?{background:"#e0e7ff",color:"#4f46e5"}:{},children:k?"✏️ Draw":"👆 Navigate"})})]}),e.jsxs("div",{className:"note-toolbar",children:[e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>E(),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(W||I)&&e.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(l.current&&(l.current.innerHTML=""),L(""),E(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!he&&e.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},De=()=>{const s=le();return e.jsx("div",{className:"research-tab",children:p!=null&&p.aiResearch&&p.aiResearch.length>0?e.jsx("div",{className:"research-list",children:p.aiResearch.map(t=>e.jsxs("div",{className:"research-entry",children:[e.jsxs("div",{className:"research-header",children:[e.jsxs("div",{className:"research-query",children:[e.jsx("strong",{children:"Q:"})," ",t.query]}),e.jsxs("div",{className:"research-actions",children:[e.jsx("span",{className:"timestamp",children:ie(t.timestamp)}),e.jsx("button",{onClick:()=>Ce(t.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),e.jsx("div",{className:"research-response",children:e.jsx(pe,{components:s,children:oe(t.response)})}),t.tags&&t.tags.length>0&&e.jsx("div",{className:"research-tags",children:t.tags.map((n,a)=>e.jsxs("span",{className:"tag",children:["#",n]},a))})]},t.id))}):e.jsxs("div",{className:"empty-state",children:[e.jsx("p",{children:"No AI research yet"}),e.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},ze=()=>{const s=le(),t=[];return p!=null&&p.personalNote&&t.push({type:"note",timestamp:p.personalNote.updatedAt,content:p.personalNote}),p!=null&&p.aiResearch&&p.aiResearch.forEach(n=>{t.push({type:"research",timestamp:n.timestamp,content:n})}),t.sort((n,a)=>a.timestamp-n.timestamp),e.jsx("div",{className:"all-tab",children:t.length>0?e.jsx("div",{className:"timeline",children:t.map((n,a)=>e.jsxs("div",{className:`timeline-item ${n.type}`,children:[e.jsx("div",{className:"timeline-marker",children:n.type==="note"?"📝":"🤖"}),e.jsxs("div",{className:"timeline-content",children:[e.jsxs("div",{className:"timeline-header",children:[e.jsx("span",{className:"timeline-type",children:n.type==="note"?"Personal Note":"AI Research"}),e.jsx("span",{className:"timeline-time",children:ie(n.timestamp)})]}),n.type==="note"?e.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:n.content.text}}):e.jsxs("div",{className:"research-preview",children:[e.jsxs("div",{className:"research-q",children:["Q: ",n.content.query]}),e.jsx("div",{className:"research-a",children:e.jsx(pe,{components:s,children:oe(n.content.response)})})]})]})]},a))}):e.jsx("div",{className:"empty-state",children:e.jsx("p",{children:"No content yet"})})})};return r?e.jsxs("div",{className:"enhanced-notebook",children:[e.jsxs("div",{className:"notebook-header",children:[e.jsxs("h3",{children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsxs("div",{className:"tab-selector",children:[e.jsxs("button",{className:`tab ${b==="research"?"active":""}`,onClick:()=>{S("research")},children:["🤖 AI Research ",(ce=p==null?void 0:p.aiResearch)!=null&&ce.length?`(${p.aiResearch.length})`:""]}),e.jsx("button",{className:`tab ${b==="notes"?"active":""}`,onClick:()=>{S("notes")},children:"📝 My Notes"}),e.jsx("button",{className:`tab ${b==="all"?"active":""}`,onClick:()=>{S("all")},children:"📚 All"})]})]}),e.jsxs("div",{className:"notebook-content",children:[b==="notes"&&$e(),b==="research"&&De(),b==="all"&&ze()]}),e.jsx("style",{children:`
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
      `})]}):e.jsx("div",{className:"notebook-empty",children:e.jsx("p",{children:"Select a verse to add notes"})})};export{st as default};
