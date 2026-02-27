import{r as c,j as e,a as te}from"./vendor-react-CNOxwxsp.js";import{t as We,v as B,T as qe,q as Be,n as Pe,s as Ve,C as re}from"./index-LwWL47nq.js";import{D as fe}from"./DrawingCanvas-I2WqQAcZ.js";import{L as xe}from"./LazyMarkdown-hm9yQW0B.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const Je=(r,u)=>{const h=new Blob([JSON.stringify(u,null,2)],{type:"application/json"}),m=URL.createObjectURL(h),l=document.createElement("a");l.href=m,l.download=`${r.replace(/:/g,"_")}.bible-note`,document.body.appendChild(l),l.click(),document.body.removeChild(l),URL.revokeObjectURL(m)},Qe=r=>new Promise((u,h)=>{const m=new FileReader;m.onload=l=>{var d;try{const x=JSON.parse((d=l.target)==null?void 0:d.result);typeof x.text=="string"&&typeof x.drawing=="string"?u(x):h(new Error("文件格式不正确"))}catch{h(new Error("无法解析 JSON 文件"))}},m.onerror=()=>h(new Error("文件读取失败")),m.readAsText(r)}),Xe=Object.keys(re).sort((r,u)=>u.length-r.length).map(r=>r.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),ne=Xe.join("|"),Ye=`(?:${ne})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,Ge="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",Ke=new RegExp(`${Ye}|${Ge}`,"gi"),ge=r=>{const u=[];for(const h of r.split(/[，,]\s*/)){const[m,l]=h.split("-").map(Number);for(let d=m;d<=(l||m);d++)u.push(d)}return u},Ze=(r,u)=>{const h=new RegExp(`^(${ne})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),m=new RegExp(`^(${ne})\\s*(\\d+)[章篇]$`,"i");let l=r.match(h);if(l){const d=re[l[1]];return d?{bookId:d,chapter:+l[2],verses:ge(l[3])}:null}if(l=r.match(m),l){const d=re[l[1]];return d?{bookId:d,chapter:+l[2]}:null}if(u){const d=r.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(d)return{bookId:u,chapter:+d[1],verses:ge(d[2])}}return null},et={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},be=(r,u,h)=>{if(!u||typeof r!="string")return r;const m=new RegExp(Ke.source,"gi"),l=[];let d=0,x;for(;(x=m.exec(r))!==null;){x.index>d&&l.push(r.slice(d,x.index));const b=Ze(x[0],h);if(b){const I=x[0];l.push(e.jsx("a",{style:et,onClick:p=>{p.preventDefault(),u(b.bookId,b.chapter,b.verses)},children:I},`r${x.index}`))}else l.push(x[0]);d=m.lastIndex}return d<r.length&&l.push(r.slice(d)),l.length===1?l[0]:e.jsx(e.Fragment,{children:l})},P=(r,u,h)=>{if(typeof r=="string")return be(r,u,h);if(typeof r=="number")return be(String(r),u,h);if(r==null||typeof r=="boolean"||te.isValidElement(r))return r;const m=te.Children.toArray(r);return m.length>0?m.map((l,d)=>e.jsx(te.Fragment,{children:P(l,u,h)},d)):r},tt=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],lt=({selection:r,onSaveNote:u,initialContent:h,initialTab:m="research",researchUpdateTrigger:l=0,onNavigate:d})=>{var me;const x=We(),[b,I]=c.useState(m),[p,V]=c.useState(null),[J,Q]=c.useState(""),[ye,L]=c.useState(!0),[w,je]=c.useState("text"),[E,A]=c.useState(""),[ve,we]=c.useState("pen"),[Ne,ke]=c.useState("#000000"),[Ce,Re]=c.useState(2),[k,Se]=c.useState(!0),[U,X]=c.useState(!1),[Te,se]=c.useState(!1),[z,ae]=c.useState(null),Y=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),i=c.useRef(null),R=c.useRef(null),N=c.useRef(null),oe=c.useRef(null),G=c.useRef(Date.now()),S=c.useRef(!1),M=c.useRef(!1),_=c.useRef(null),ie=c.useRef(null),O=c.useRef(null),ce=c.useRef(null),H=c.useRef(null),K=c.useRef(null);c.useEffect(()=>{I(m)},[m]),c.useEffect(()=>{r&&oe.current!==r.id&&(oe.current=r.id,G.current=Date.now(),S.current=!1,M.current=!1,_.current&&clearTimeout(_.current),Z())},[r==null?void 0:r.id]),c.useEffect(()=>{r&&Z()},[x]),c.useEffect(()=>{b==="notes"&&i.current&&J&&(i.current.innerHTML.trim()||(i.current.innerHTML=J))},[b]),c.useEffect(()=>()=>{z&&z.getTracks().forEach(s=>s.stop())},[z]);const Z=async()=>{if(!r)return;L(!0);const s=r.id.split(":");if(s.length>=3){const t=s[0],n=parseInt(s[1]),a=[parseInt(s[2])],o=await B.getVerseData(t,n,a);V(o),o!=null&&o.personalNote?(Q(o.personalNote.text),A(o.personalNote.drawing||""),i.current&&!M.current&&(i.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(S.current=!0)):h?(Q(h),i.current&&!M.current&&(i.current.innerHTML=h),h.trim()&&(S.current=!0)):(Q(""),A(""),i.current&&!M.current&&(i.current.innerHTML=""),S.current=!1)}},$=async(s=!1)=>{var n,a;if(!r){alert("Please select a verse first before saving a note");return}const t=r.id.split(":");if(t.length>=3){const o=t[0],g=parseInt(t[1]),f=[parseInt(t[2])],y=((n=i.current)==null?void 0:n.innerHTML)||"";if(y.trim()||E){const j={text:y,drawing:E,createdAt:((a=p==null?void 0:p.personalNote)==null?void 0:a.createdAt)||Date.now(),updatedAt:Date.now()};await B.savePersonalNote(o,g,f,j),u(r.id,y,s),V(v=>v?{...v,personalNote:j}:null)}else await B.deletePersonalNote(o,g,f),u(r.id,"",s),V(j=>j?{...j,personalNote:void 0}:null);L(!0)}},Ie=()=>{if(!i.current||!r)return;const s=new Date,t=s.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),n=s.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),a=document.createElement("span");a.contentEditable="false",a.style.fontSize="14px",a.style.color="#94a3b8",a.style.fontWeight="normal",a.style.userSelect="none",a.textContent=`[${n} ${t}]`;const o=document.createTextNode(" "),g=window.getSelection();let f=null,y=0,j=null;g&&g.rangeCount>0&&(f=g.getRangeAt(0).cloneRange(),y=f.startOffset,j=f.startContainer);const v=i.current.firstChild;v?(i.current.insertBefore(o,v),i.current.insertBefore(a,o)):(i.current.appendChild(a),i.current.appendChild(o));const W=j,he=y;requestAnimationFrame(()=>{const T=window.getSelection();if(!(!T||!i.current))try{if(W&&W.isConnected){const C=document.createRange();C.setStart(W,he),C.setEnd(W,he),T.removeAllRanges(),T.addRange(C)}else{const C=document.createRange();C.selectNodeContents(i.current),C.collapse(!1),T.removeAllRanges(),T.addRange(C)}}catch{try{const q=document.createRange();q.selectNodeContents(i.current),q.collapse(!1),T.removeAllRanges(),T.addRange(q)}catch{}}}),S.current=!0},D=()=>{var f;const s=Date.now(),t=s-G.current,n=((f=i.current)==null?void 0:f.innerHTML)||"",a=Ve(n).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(a);t>120*1e3&&(o||(S.current=!1)),!S.current&&a.length>0&&!o&&Ie(),G.current=s,M.current=!0,_.current&&clearTimeout(_.current),_.current=window.setTimeout(()=>{M.current=!1},1e4),L(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>{$(!0)},2e3)},Le=async s=>{if(!r||!p)return;const t=r.id.split(":");if(t.length>=3){const n=t[0],a=parseInt(t[1]),o=[parseInt(t[2])];await B.deleteAIResearch(n,a,o,s),Z()}},F=(s,t="")=>{var n;document.execCommand(s,!1,t),(n=i.current)==null||n.focus(),D()},Ee=()=>{var t;const s=((t=i.current)==null?void 0:t.innerText)||"";s.trim()&&(X(!0),Pe(s,()=>X(!1)))},Ae=()=>{Be(),X(!1)},Me=()=>{var n;if(!r)return;const t={text:((n=i.current)==null?void 0:n.innerHTML)||"",drawing:E,media:[],version:1};Je(`VerseNote_${r.id}`,t)},$e=()=>{var s;(s=ie.current)==null||s.click()},De=async s=>{var n;const t=(n=s.target.files)==null?void 0:n[0];if(!(!t||!r))try{const a=await Qe(t);i.current&&(i.current.innerHTML=a.text),A(a.drawing||""),L(!1),$(!1)}catch(a){alert(a instanceof Error?a.message:"Failed to import note")}finally{s.target.value=""}},le=async s=>{var n;const t=(n=s.target.files)==null?void 0:n[0];if(!(!t||!r))try{const a=new FileReader;a.onload=o=>{var f;const g=(f=o.target)==null?void 0:f.result;if(i.current&&w==="text"){const y=`<img src="${g}" alt="${t.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,y),D()}},a.readAsDataURL(t)}catch{}finally{s.target.value=""}},ze=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});ae(s),se(!0),setTimeout(()=>{H.current&&(H.current.srcObject=s)},qe.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},_e=()=>{if(!H.current||!K.current||!r)return;const s=H.current,t=K.current,n=t.getContext("2d");if(!n)return;t.width=s.videoWidth,t.height=s.videoHeight,n.drawImage(s,0,0,t.width,t.height);const a=t.toDataURL("image/jpeg");if(i.current&&w==="text"){const o=`<img src="${a}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),D()}ee()},ee=()=>{z&&(z.getTracks().forEach(s=>s.stop()),ae(null)),se(!1)},He=async s=>{const t=s.target.files;if(!(!t||!r)){for(let n=0;n<t.length;n++){const a=t[n];try{const o=new FileReader;o.onload=g=>{var j;const f=(j=g.target)==null?void 0:j.result,y=a.type.startsWith("image/")?"image":a.type.startsWith("video/")?"video":a.type.startsWith("audio/")?"audio":"file";if(i.current&&w==="text"){let v="";y==="image"?v=`<img src="${f}" alt="${a.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:y==="video"?v=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${f}" type="${a.type}">Your browser does not support video.</video>`:y==="audio"?v=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${f}" type="${a.type}">Your browser does not support audio.</audio>`:v=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${a.name}</span></div>`,document.execCommand("insertHTML",!1,v),D()}},o.readAsDataURL(a)}catch{}}s.target.value=""}},de=s=>{let t=s;return t=t.replace(/\$\\text\{([^}]+)\}\$/g,(n,a)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(a)?a:n),t=t.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),t},pe=s=>{const t=new Date(s),a=new Date().getTime()-t.getTime(),o=Math.floor(a/(1e3*60*60*24));return o===0?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:t.toLocaleDateString("en-US",{month:"short",day:"numeric"})},ue=()=>{var t;const s=(t=r==null?void 0:r.id)==null?void 0:t.split(":")[0];return{p:({children:n})=>e.jsx("p",{style:{marginBottom:"0.5em"},children:P(n,d,s)}),li:({children:n})=>e.jsx("li",{children:P(n,d,s)}),strong:({children:n})=>e.jsx("strong",{style:{fontWeight:600},children:P(n,d,s)}),code:({inline:n,className:a,children:o})=>{const g=/language-(\w+)/.exec(a||"");return g&&g[1]==="math"||n===!1?e.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:e.jsx("code",{children:o})}):e.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},Fe=()=>{const s=t=>t?t.replace(/^\[.*?\]\s*/,""):"";return e.jsxs("div",{className:"notes-tab",children:[e.jsx("input",{type:"file",ref:ie,onChange:De,accept:".bible-note,.json",className:"hidden"}),Y?e.jsx("input",{type:"file",ref:O,onChange:le,accept:"image/*",capture:!0,className:"hidden"}):e.jsx("input",{type:"file",ref:O,onChange:le,accept:"image/*",className:"hidden"}),e.jsx("input",{type:"file",ref:ce,onChange:He,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),Te&&!Y&&e.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[e.jsx("strong",{children:"Take Photo"}),e.jsx("button",{onClick:ee,className:"toolbar-btn",children:"X"})]}),e.jsx("video",{ref:H,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),e.jsx("canvas",{ref:K,className:"hidden"}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[e.jsx("button",{onClick:_e,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),e.jsx("button",{onClick:ee,className:"toolbar-btn",children:"Cancel"})]})]})}),(r==null?void 0:r.selectedRawText)&&e.jsxs("div",{className:"verse-quote-block",children:[e.jsxs("div",{className:"verse-quote-header",children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsx("div",{className:"verse-quote-text",children:s(r.selectedRawText)})]}),e.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(t=>e.jsx("button",{onClick:()=>je(t),className:"toolbar-btn",style:w===t?{background:"#4f46e5",color:"white"}:{},children:t==="text"?"📝 Text":t==="draw"?"✏️ Draw":"🔀 Overlay"},t))}),(w==="text"||w==="overlay")&&e.jsxs("div",{className:"rich-toolbar",children:[e.jsx("button",{onClick:()=>F("bold"),className:"toolbar-btn",title:"Bold",children:e.jsx("strong",{children:"B"})}),e.jsx("button",{onClick:()=>F("italic"),className:"toolbar-btn",title:"Italic",children:e.jsx("em",{children:"I"})}),e.jsx("button",{onClick:()=>F("underline"),className:"toolbar-btn",title:"Underline",children:e.jsx("u",{children:"U"})}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>F("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),e.jsx("button",{onClick:()=>F("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:()=>{Y&&O.current?O.current.click():ze()},className:"toolbar-btn",title:"Take photo",children:"📷"}),e.jsx("button",{onClick:()=>{var t;return(t=ce.current)==null?void 0:t.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),e.jsx("button",{onClick:$e,className:"toolbar-btn",title:"Import note",children:"⬆"}),e.jsx("button",{onClick:Me,className:"toolbar-btn",title:"Export note",children:"⬇"}),e.jsx("span",{className:"toolbar-sep"}),e.jsx("button",{onClick:U?Ae:Ee,className:"toolbar-btn",style:U?{background:"#fee2e2",color:"#ef4444"}:{},title:U?"Stop":"Read aloud",children:U?"⏹":"🔊"})]}),w==="text"&&e.jsx("div",{ref:i,className:"note-editor",contentEditable:!0,onInput:D,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),w==="draw"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[e.jsx(fe,{ref:R,onChange:t=>{A(t),L(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>$(!0),2e3)},initialData:E,overlayMode:!1,isWritingMode:k}),e.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(t=>e.jsx("button",{onClick:()=>{var n;we(t),(n=R.current)==null||n.setTool(t)},className:"toolbar-btn",style:ve===t?{background:t==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:t,children:t==="pen"?"✏️":t==="marker"?"🖊️":t==="highlighter"?"🖍️":"🧹"},t)),e.jsx("button",{onClick:()=>{var t;return(t=R.current)==null?void 0:t.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),e.jsx("button",{onClick:()=>{var t;return(t=R.current)==null?void 0:t.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),e.jsx("span",{className:"toolbar-sep"}),tt.map(t=>e.jsx("button",{onClick:()=>{var n;ke(t),(n=R.current)==null||n.setColor(t)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:t,border:Ne===t?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:t},t)),e.jsx("input",{type:"range",min:"1",max:"20",value:Ce,onChange:t=>{var a;const n=Number(t.target.value);Re(n),(a=R.current)==null||a.setSize(n)},style:{width:"60px",marginLeft:"4px"}})]})]}),w==="overlay"&&e.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[e.jsx("div",{ref:i,className:"note-editor",contentEditable:void 0,onInput:D,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:k?"none":"auto"}}),e.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:k?"auto":"none"},children:e.jsx(fe,{ref:R,onChange:t=>{A(t),L(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>$(!0),2e3)},initialData:E,overlayMode:!0,isWritingMode:k})}),e.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:e.jsx("button",{onClick:()=>Se(!k),className:"toolbar-btn",style:k?{background:"#e0e7ff",color:"#4f46e5"}:{},children:k?"✏️ Draw":"👆 Navigate"})})]}),e.jsxs("div",{className:"note-toolbar",children:[e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>$(!1),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(J||E)&&e.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(i.current&&(i.current.innerHTML=""),A(""),$(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!ye&&e.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},Ue=()=>{const s=ue();return e.jsx("div",{className:"research-tab",children:p!=null&&p.aiResearch&&p.aiResearch.length>0?e.jsx("div",{className:"research-list",children:p.aiResearch.map(t=>e.jsxs("div",{className:"research-entry",children:[e.jsxs("div",{className:"research-header",children:[e.jsxs("div",{className:"research-query",children:[e.jsx("strong",{children:"Q:"})," ",t.query]}),e.jsxs("div",{className:"research-actions",children:[e.jsx("span",{className:"timestamp",children:pe(t.timestamp)}),e.jsx("button",{onClick:()=>Le(t.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),e.jsx("div",{className:"research-response",children:e.jsx(xe,{components:s,children:de(t.response)})}),t.tags&&t.tags.length>0&&e.jsx("div",{className:"research-tags",children:t.tags.map((n,a)=>e.jsxs("span",{className:"tag",children:["#",n]},a))})]},t.id))}):e.jsxs("div",{className:"empty-state",children:[e.jsx("p",{children:"No AI research yet"}),e.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},Oe=()=>{const s=ue(),t=[];return p!=null&&p.personalNote&&t.push({type:"note",timestamp:p.personalNote.updatedAt,content:p.personalNote}),p!=null&&p.aiResearch&&p.aiResearch.forEach(n=>{t.push({type:"research",timestamp:n.timestamp,content:n})}),t.sort((n,a)=>a.timestamp-n.timestamp),e.jsx("div",{className:"all-tab",children:t.length>0?e.jsx("div",{className:"timeline",children:t.map((n,a)=>e.jsxs("div",{className:`timeline-item ${n.type}`,children:[e.jsx("div",{className:"timeline-marker",children:n.type==="note"?"📝":"🤖"}),e.jsxs("div",{className:"timeline-content",children:[e.jsxs("div",{className:"timeline-header",children:[e.jsx("span",{className:"timeline-type",children:n.type==="note"?"Personal Note":"AI Research"}),e.jsx("span",{className:"timeline-time",children:pe(n.timestamp)})]}),n.type==="note"?e.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:n.content.text}}):e.jsxs("div",{className:"research-preview",children:[e.jsxs("div",{className:"research-q",children:["Q: ",n.content.query]}),e.jsx("div",{className:"research-a",children:e.jsx(xe,{components:s,children:de(n.content.response)})})]})]})]},a))}):e.jsx("div",{className:"empty-state",children:e.jsx("p",{children:"No content yet"})})})};return r?e.jsxs("div",{className:"enhanced-notebook",children:[e.jsxs("div",{className:"notebook-header",children:[e.jsxs("h3",{children:[r.bookName," ",r.chapter,":",r.verseNums.join("-")]}),e.jsxs("div",{className:"tab-selector",children:[e.jsxs("button",{className:`tab ${b==="research"?"active":""}`,onClick:()=>{I("research")},children:["🤖 AI Research ",(me=p==null?void 0:p.aiResearch)!=null&&me.length?`(${p.aiResearch.length})`:""]}),e.jsx("button",{className:`tab ${b==="notes"?"active":""}`,onClick:()=>{I("notes")},children:"📝 My Notes"}),e.jsx("button",{className:`tab ${b==="all"?"active":""}`,onClick:()=>{I("all")},children:"📚 All"})]})]}),e.jsxs("div",{className:"notebook-content",children:[b==="notes"&&Fe(),b==="research"&&Ue(),b==="all"&&Oe()]}),e.jsx("style",{children:`
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
      `})]}):e.jsx("div",{className:"notebook-empty",children:e.jsx("p",{children:"Select a verse to add notes"})})};export{lt as default};
