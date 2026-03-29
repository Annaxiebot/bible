import{r as c,j as t,a as te}from"./vendor-react-CNOxwxsp.js";import{H as qe,v as B,T as We,G as Be,A as Pe,s as Ve,C as re}from"./index-KzIfhRLk.js";import{S as fe}from"./SimpleDrawingCanvas-BbgUnNRp.js";import{L as xe}from"./LazyMarkdown-gryRfLCG.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const Ge=(n,u)=>{const h=new Blob([JSON.stringify(u,null,2)],{type:"application/json"}),m=URL.createObjectURL(h),l=document.createElement("a");l.href=m,l.download=`${n.replace(/:/g,"_")}.bible-note`,document.body.appendChild(l),l.click(),document.body.removeChild(l),URL.revokeObjectURL(m)},Je=n=>new Promise((u,h)=>{const m=new FileReader;m.onload=l=>{var d;try{const g=JSON.parse((d=l.target)==null?void 0:d.result);typeof g.text=="string"&&typeof g.drawing=="string"?u(g):h(new Error("文件格式不正确"))}catch{h(new Error("无法解析 JSON 文件"))}},m.onerror=()=>h(new Error("文件读取失败")),m.readAsText(n)}),Qe=Object.keys(re).sort((n,u)=>u.length-n.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),ne=Qe.join("|"),Xe=`(?:${ne})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,Ye="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",Ke=new RegExp(`${Xe}|${Ye}`,"gi"),ge=n=>{const u=[];for(const h of n.split(/[，,]\s*/)){const[m,l]=h.split("-").map(Number);for(let d=m;d<=(l||m);d++)u.push(d)}return u},Ze=(n,u)=>{const h=new RegExp(`^(${ne})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),m=new RegExp(`^(${ne})\\s*(\\d+)[章篇]$`,"i");let l=n.match(h);if(l){const d=re[l[1]];return d?{bookId:d,chapter:+l[2],verses:ge(l[3])}:null}if(l=n.match(m),l){const d=re[l[1]];return d?{bookId:d,chapter:+l[2]}:null}if(u){const d=n.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(d)return{bookId:u,chapter:+d[1],verses:ge(d[2])}}return null},et={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},be=(n,u,h)=>{if(!u||typeof n!="string")return n;const m=new RegExp(Ke.source,"gi"),l=[];let d=0,g;for(;(g=m.exec(n))!==null;){g.index>d&&l.push(n.slice(d,g.index));const b=Ze(g[0],h);if(b){const I=g[0];l.push(t.jsx("a",{style:et,onClick:p=>{p.preventDefault(),u(b.bookId,b.chapter,b.verses)},children:I},`r${g.index}`))}else l.push(g[0]);d=m.lastIndex}return d<n.length&&l.push(n.slice(d)),l.length===1?l[0]:t.jsx(t.Fragment,{children:l})},P=(n,u,h)=>{if(typeof n=="string")return be(n,u,h);if(typeof n=="number")return be(String(n),u,h);if(n==null||typeof n=="boolean"||te.isValidElement(n))return n;const m=te.Children.toArray(n);return m.length>0?m.map((l,d)=>t.jsx(te.Fragment,{children:P(l,u,h)},d)):n},tt=["#000000","#007AFF","#FF3B30","#34C759","#FFCC00"],lt=({selection:n,onSaveNote:u,initialContent:h,initialTab:m="research",researchUpdateTrigger:l=0,onNavigate:d})=>{var me;const g=qe(),[b,I]=c.useState(m),[p,V]=c.useState(null),[G,J]=c.useState(""),[ye,$]=c.useState(!0),[w,je]=c.useState("text"),[L,A]=c.useState(""),[ve,we]=c.useState("pen"),[Ne,ke]=c.useState("#000000"),[Ce,Re]=c.useState(2),[k,Te]=c.useState(!0),[U,Q]=c.useState(!1),[Se,ae]=c.useState(!1),[D,se]=c.useState(null),X=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),i=c.useRef(null),R=c.useRef(null),N=c.useRef(null),oe=c.useRef(null),Y=c.useRef(Date.now()),T=c.useRef(!1),E=c.useRef(!1),H=c.useRef(null),ie=c.useRef(null),O=c.useRef(null),ce=c.useRef(null),_=c.useRef(null),K=c.useRef(null);c.useEffect(()=>{I(m)},[m]),c.useEffect(()=>{n&&oe.current!==n.id&&(oe.current=n.id,Y.current=Date.now(),T.current=!1,E.current=!1,H.current&&clearTimeout(H.current),Z())},[n==null?void 0:n.id]),c.useEffect(()=>{n&&Z()},[g]),c.useEffect(()=>{b==="notes"&&i.current&&G&&(i.current.innerHTML.trim()||(i.current.innerHTML=G))},[b]),c.useEffect(()=>()=>{D&&D.getTracks().forEach(a=>a.stop())},[D]);const Z=async()=>{if(!n)return;$(!0);const a=n.id.split(":");if(a.length>=3){const e=a[0],r=parseInt(a[1]),s=[parseInt(a[2])],o=await B.getVerseData(e,r,s);V(o),o!=null&&o.personalNote?(J(o.personalNote.text),A(o.personalNote.drawing||""),i.current&&!E.current&&(i.current.innerHTML=o.personalNote.text),o.personalNote.text&&o.personalNote.text.trim()&&(T.current=!0)):h?(J(h),i.current&&!E.current&&(i.current.innerHTML=h),h.trim()&&(T.current=!0)):(J(""),A(""),i.current&&!E.current&&(i.current.innerHTML=""),T.current=!1)}},z=async(a=!1)=>{var r,s;if(!n){alert("Please select a verse first before saving a note");return}const e=n.id.split(":");if(e.length>=3){const o=e[0],f=parseInt(e[1]),x=[parseInt(e[2])],y=((r=i.current)==null?void 0:r.innerHTML)||"";if(y.trim()||L){const j={text:y,drawing:L,createdAt:((s=p==null?void 0:p.personalNote)==null?void 0:s.createdAt)||Date.now(),updatedAt:Date.now()};await B.savePersonalNote(o,f,x,j),u(n.id,y,a),V(v=>v?{...v,personalNote:j}:null)}else await B.deletePersonalNote(o,f,x),u(n.id,"",a),V(j=>j?{...j,personalNote:void 0}:null);$(!0)}},Ie=()=>{if(!i.current||!n)return;const a=new Date,e=a.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),r=a.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),s=document.createElement("span");s.contentEditable="false",s.style.fontSize="14px",s.style.color="#94a3b8",s.style.fontWeight="normal",s.style.userSelect="none",s.textContent=`[${r} ${e}]`;const o=document.createTextNode(" "),f=window.getSelection();let x=null,y=0,j=null;f&&f.rangeCount>0&&(x=f.getRangeAt(0).cloneRange(),y=x.startOffset,j=x.startContainer);const v=i.current.firstChild;v?(i.current.insertBefore(o,v),i.current.insertBefore(s,o)):(i.current.appendChild(s),i.current.appendChild(o));const q=j,he=y;requestAnimationFrame(()=>{const S=window.getSelection();if(!(!S||!i.current))try{if(q&&q.isConnected){const C=document.createRange();C.setStart(q,he),C.setEnd(q,he),S.removeAllRanges(),S.addRange(C)}else{const C=document.createRange();C.selectNodeContents(i.current),C.collapse(!1),S.removeAllRanges(),S.addRange(C)}}catch{try{const W=document.createRange();W.selectNodeContents(i.current),W.collapse(!1),S.removeAllRanges(),S.addRange(W)}catch{}}}),T.current=!0},M=()=>{var x;const a=Date.now(),e=a-Y.current,r=((x=i.current)==null?void 0:x.innerHTML)||"",s=Ve(r).trim(),o=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(s);e>120*1e3&&(o||(T.current=!1)),!T.current&&s.length>0&&!o&&Ie(),Y.current=a,E.current=!0,H.current&&clearTimeout(H.current),H.current=window.setTimeout(()=>{E.current=!1},1e4),$(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>{z(!0)},2e3)},$e=async a=>{if(!n||!p)return;const e=n.id.split(":");if(e.length>=3){const r=e[0],s=parseInt(e[1]),o=[parseInt(e[2])];await B.deleteAIResearch(r,s,o,a),Z()}},F=(a,e="")=>{var r;document.execCommand(a,!1,e),(r=i.current)==null||r.focus(),M()},Le=()=>{var e;const a=((e=i.current)==null?void 0:e.innerText)||"";a.trim()&&(Q(!0),Pe(a,()=>Q(!1)))},Ae=()=>{Be(),Q(!1)},Ee=()=>{var r;if(!n)return;const e={text:((r=i.current)==null?void 0:r.innerHTML)||"",drawing:L,media:[],version:1};Ge(`VerseNote_${n.id}`,e)},ze=()=>{var a;(a=ie.current)==null||a.click()},Me=async a=>{var r;const e=(r=a.target.files)==null?void 0:r[0];if(!(!e||!n))try{const s=await Je(e);i.current&&(i.current.innerHTML=s.text),A(s.drawing||""),$(!1),z(!1)}catch(s){alert(s instanceof Error?s.message:"Failed to import note")}finally{a.target.value=""}},le=async a=>{var r;const e=(r=a.target.files)==null?void 0:r[0];if(!(!e||!n))try{const s=new FileReader;s.onload=o=>{var x;const f=(x=o.target)==null?void 0:x.result;if(i.current&&w==="text"){const y=`<img src="${f}" alt="${e.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,y),M()}},s.readAsDataURL(e)}catch{}finally{a.target.value=""}},De=async()=>{try{const a=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:!1});se(a),ae(!0),setTimeout(()=>{_.current&&(_.current.srcObject=a)},We.SCROLL_RETRY_MS)}catch{alert("Unable to access camera. Please check your camera permissions.")}},He=()=>{if(!_.current||!K.current||!n)return;const a=_.current,e=K.current,r=e.getContext("2d");if(!r)return;e.width=a.videoWidth,e.height=a.videoHeight,r.drawImage(a,0,0,e.width,e.height);const s=e.toDataURL("image/jpeg");if(i.current&&w==="text"){const o=`<img src="${s}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;document.execCommand("insertHTML",!1,o),M()}ee()},ee=()=>{D&&(D.getTracks().forEach(a=>a.stop()),se(null)),ae(!1)},_e=async a=>{const e=a.target.files;if(!(!e||!n)){for(let r=0;r<e.length;r++){const s=e[r];try{const o=new FileReader;o.onload=f=>{var j;const x=(j=f.target)==null?void 0:j.result,y=s.type.startsWith("image/")?"image":s.type.startsWith("video/")?"video":s.type.startsWith("audio/")?"audio":"file";if(i.current&&w==="text"){let v="";y==="image"?v=`<img src="${x}" alt="${s.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`:y==="video"?v=`<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${x}" type="${s.type}">Your browser does not support video.</video>`:y==="audio"?v=`<audio controls style="width: 100%; margin: 10px 0;"><source src="${x}" type="${s.type}">Your browser does not support audio.</audio>`:v=`<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${s.name}</span></div>`,document.execCommand("insertHTML",!1,v),M()}},o.readAsDataURL(s)}catch{}}a.target.value=""}},de=a=>{let e=a;return e=e.replace(/\$\\text\{([^}]+)\}\$/g,(r,s)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(s)?s:r),e=e.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),e},pe=a=>{const e=new Date(a),s=new Date().getTime()-e.getTime(),o=Math.floor(s/(1e3*60*60*24));return o===0?e.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):o<7?`${o}d ago`:e.toLocaleDateString("en-US",{month:"short",day:"numeric"})},ue=()=>{var e;const a=(e=n==null?void 0:n.id)==null?void 0:e.split(":")[0];return{p:({children:r})=>t.jsx("p",{style:{marginBottom:"0.5em"},children:P(r,d,a)}),li:({children:r})=>t.jsx("li",{children:P(r,d,a)}),strong:({children:r})=>t.jsx("strong",{style:{fontWeight:600},children:P(r,d,a)}),code:({inline:r,className:s,children:o})=>{const f=/language-(\w+)/.exec(s||"");return f&&f[1]==="math"||r===!1?t.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:t.jsx("code",{children:o})}):t.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:o})}}},Fe=()=>{const a=e=>e?e.replace(/^\[.*?\]\s*/,""):"";return t.jsxs("div",{className:"notes-tab",children:[t.jsx("input",{type:"file",ref:ie,onChange:Me,accept:".bible-note,.json",className:"hidden"}),X?t.jsx("input",{type:"file",ref:O,onChange:le,accept:"image/*",capture:!0,className:"hidden"}):t.jsx("input",{type:"file",ref:O,onChange:le,accept:"image/*",className:"hidden"}),t.jsx("input",{type:"file",ref:ce,onChange:_e,accept:"image/*,video/*,audio/*,.pdf,.doc,.docx,.txt",multiple:!0,className:"hidden"}),Se&&!X&&t.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e3,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center"},children:t.jsxs("div",{style:{background:"white",borderRadius:"8px",padding:"16px",maxWidth:"600px",width:"90%"},children:[t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"},children:[t.jsx("strong",{children:"Take Photo"}),t.jsx("button",{onClick:ee,className:"toolbar-btn",children:"X"})]}),t.jsx("video",{ref:_,autoPlay:!0,playsInline:!0,style:{width:"100%",borderRadius:"8px",marginBottom:"12px",maxHeight:"400px"}}),t.jsx("canvas",{ref:K,className:"hidden"}),t.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"center"},children:[t.jsx("button",{onClick:He,className:"toolbar-btn",style:{background:"#4f46e5",color:"white"},children:"Capture"}),t.jsx("button",{onClick:ee,className:"toolbar-btn",children:"Cancel"})]})]})}),(n==null?void 0:n.selectedRawText)&&t.jsxs("div",{className:"verse-quote-block",children:[t.jsxs("div",{className:"verse-quote-header",children:[n.bookName," ",n.chapter,":",n.verseNums.join("-")]}),t.jsx("div",{className:"verse-quote-text",children:a(n.selectedRawText)})]}),t.jsx("div",{style:{display:"flex",gap:"4px",marginBottom:"8px"},children:["text","draw","overlay"].map(e=>t.jsx("button",{onClick:()=>je(e),className:"toolbar-btn",style:w===e?{background:"#4f46e5",color:"white"}:{},children:e==="text"?"📝 Text":e==="draw"?"✏️ Draw":"🔀 Overlay"},e))}),(w==="text"||w==="overlay")&&t.jsxs("div",{className:"rich-toolbar",children:[t.jsx("button",{onClick:()=>F("bold"),className:"toolbar-btn",title:"Bold",children:t.jsx("strong",{children:"B"})}),t.jsx("button",{onClick:()=>F("italic"),className:"toolbar-btn",title:"Italic",children:t.jsx("em",{children:"I"})}),t.jsx("button",{onClick:()=>F("underline"),className:"toolbar-btn",title:"Underline",children:t.jsx("u",{children:"U"})}),t.jsx("span",{className:"toolbar-sep"}),t.jsx("button",{onClick:()=>F("formatBlock","blockquote"),className:"toolbar-btn",title:"Quote",children:"❝"}),t.jsx("button",{onClick:()=>F("insertUnorderedList"),className:"toolbar-btn",title:"List",children:"≡"}),t.jsx("span",{className:"toolbar-sep"}),t.jsx("button",{onClick:()=>{X&&O.current?O.current.click():De()},className:"toolbar-btn",title:"Take photo",children:"📷"}),t.jsx("button",{onClick:()=>{var e;return(e=ce.current)==null?void 0:e.click()},className:"toolbar-btn",title:"Attach file",children:"📎"}),t.jsx("button",{onClick:ze,className:"toolbar-btn",title:"Import note",children:"⬆"}),t.jsx("button",{onClick:Ee,className:"toolbar-btn",title:"Export note",children:"⬇"}),t.jsx("span",{className:"toolbar-sep"}),t.jsx("button",{onClick:U?Ae:Le,className:"toolbar-btn",style:U?{background:"#fee2e2",color:"#ef4444"}:{},title:U?"Stop":"Read aloud",children:U?"⏹":"🔊"})]}),w==="text"&&t.jsx("div",{ref:i,className:"note-editor",contentEditable:!0,onInput:M,"data-placeholder":"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}),w==="draw"&&t.jsxs("div",{style:{position:"relative",minHeight:"300px",background:"#f8f8f8",borderRadius:"8px",overflow:"hidden"},children:[t.jsx(fe,{ref:R,onChange:e=>{A(e),$(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>z(!0),2e3)},initialData:L,overlayMode:!1,isWritingMode:k}),t.jsxs("div",{className:"draw-palette",children:[["pen","marker","highlighter","eraser"].map(e=>t.jsx("button",{onClick:()=>{var r;we(e),(r=R.current)==null||r.setTool(e)},className:"toolbar-btn",style:ve===e?{background:e==="eraser"?"#fee2e2":"#e0e7ff"}:{},title:e,children:e==="pen"?"✏️":e==="marker"?"🖊️":e==="highlighter"?"🖍️":"🧹"},e)),t.jsx("button",{onClick:()=>{var e;return(e=R.current)==null?void 0:e.undo()},className:"toolbar-btn",title:"Undo",children:"↩️"}),t.jsx("button",{onClick:()=>{var e;return(e=R.current)==null?void 0:e.clear()},className:"toolbar-btn",title:"Clear",children:"🗑️"}),t.jsx("span",{className:"toolbar-sep"}),tt.map(e=>t.jsx("button",{onClick:()=>{var r;ke(e),(r=R.current)==null||r.setColor(e)},style:{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:e,border:Ne===e?"2px solid #4f46e5":"2px solid transparent",cursor:"pointer",padding:0},title:e},e)),t.jsx("input",{type:"range",min:"1",max:"20",value:Ce,onChange:e=>{var s;const r=Number(e.target.value);Re(r),(s=R.current)==null||s.setSize(r)},style:{width:"60px",marginLeft:"4px"}})]})]}),w==="overlay"&&t.jsxs("div",{style:{position:"relative",minHeight:"300px"},children:[t.jsx("div",{ref:i,className:"note-editor",contentEditable:void 0,onInput:M,"data-placeholder":"Write your notes here...",style:{minHeight:"300px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6",pointerEvents:k?"none":"auto"}}),t.jsx("div",{style:{position:"absolute",inset:0,zIndex:10,pointerEvents:k?"auto":"none"},children:t.jsx(fe,{ref:R,onChange:e=>{A(e),$(!1),N.current&&clearTimeout(N.current),N.current=window.setTimeout(()=>z(!0),2e3)},initialData:L,overlayMode:!0,isWritingMode:k})}),t.jsx("div",{style:{position:"absolute",bottom:"8px",right:"8px",zIndex:20},children:t.jsx("button",{onClick:()=>Te(!k),className:"toolbar-btn",style:k?{background:"#e0e7ff",color:"#4f46e5"}:{},children:k?"✏️ Draw":"👆 Navigate"})})]}),t.jsxs("div",{className:"note-toolbar",children:[t.jsxs("div",{style:{display:"flex",gap:"8px"},children:[t.jsx("button",{onClick:()=>z(!1),className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"Save"}),(G||L)&&t.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(i.current&&(i.current.innerHTML=""),A(""),z(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"Delete"})]}),!ye&&t.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},Ue=()=>{const a=ue();return t.jsx("div",{className:"research-tab",children:p!=null&&p.aiResearch&&p.aiResearch.length>0?t.jsx("div",{className:"research-list",children:p.aiResearch.map(e=>t.jsxs("div",{className:"research-entry",children:[t.jsxs("div",{className:"research-header",children:[t.jsxs("div",{className:"research-query",children:[t.jsx("strong",{children:"Q:"})," ",e.query]}),t.jsxs("div",{className:"research-actions",children:[t.jsx("span",{className:"timestamp",children:pe(e.timestamp)}),t.jsx("button",{onClick:()=>$e(e.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),e.image&&t.jsxs("div",{className:"research-image",children:[t.jsx("img",{src:`data:${e.image.mimeType};base64,${e.image.data}`,alt:e.image.caption||"Research image",className:"research-img",onClick:()=>{const r=window.open("");r&&r.document.write(`
                          <html>
                            <head>
                              <title>${e.query}</title>
                              <style>
                                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                              </style>
                            </head>
                            <body>
                              <img src="data:${e.image.mimeType};base64,${e.image.data}" alt="${e.query}" />
                            </body>
                          </html>
                        `)},title:"Click to view full size"}),e.image.caption&&t.jsx("div",{className:"image-caption",children:e.image.caption})]}),t.jsx("div",{className:"research-response",children:t.jsx(xe,{components:a,children:de(e.response)})}),e.tags&&e.tags.length>0&&t.jsx("div",{className:"research-tags",children:e.tags.map((r,s)=>t.jsxs("span",{className:"tag",children:["#",r]},s))})]},e.id))}):t.jsxs("div",{className:"empty-state",children:[t.jsx("p",{children:"No AI research yet"}),t.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})})},Oe=()=>{const a=ue(),e=[];return p!=null&&p.personalNote&&e.push({type:"note",timestamp:p.personalNote.updatedAt,content:p.personalNote}),p!=null&&p.aiResearch&&p.aiResearch.forEach(r=>{e.push({type:"research",timestamp:r.timestamp,content:r})}),e.sort((r,s)=>s.timestamp-r.timestamp),t.jsx("div",{className:"all-tab",children:e.length>0?t.jsx("div",{className:"timeline",children:e.map((r,s)=>t.jsxs("div",{className:`timeline-item ${r.type}`,children:[t.jsx("div",{className:"timeline-marker",children:r.type==="note"?"📝":"🤖"}),t.jsxs("div",{className:"timeline-content",children:[t.jsxs("div",{className:"timeline-header",children:[t.jsx("span",{className:"timeline-type",children:r.type==="note"?"Personal Note":"AI Research"}),t.jsx("span",{className:"timeline-time",children:pe(r.timestamp)})]}),r.type==="note"?t.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:r.content.text}}):t.jsxs("div",{className:"research-preview",children:[r.content.image&&t.jsx("div",{className:"research-image",children:t.jsx("img",{src:`data:${r.content.image.mimeType};base64,${r.content.image.data}`,alt:r.content.image.caption||"Research image",className:"research-img",onClick:()=>{const o=r.content.image,f=window.open("");f&&f.document.write(`
                                  <html>
                                    <head>
                                      <title>${r.content.query}</title>
                                      <style>
                                        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                                      </style>
                                    </head>
                                    <body>
                                      <img src="data:${o.mimeType};base64,${o.data}" alt="${r.content.query}" />
                                    </body>
                                  </html>
                                `)},title:"Click to view full size"})}),t.jsxs("div",{className:"research-q",children:["Q: ",r.content.query]}),t.jsx("div",{className:"research-a",children:t.jsx(xe,{components:a,children:de(r.content.response)})})]})]})]},s))}):t.jsx("div",{className:"empty-state",children:t.jsx("p",{children:"No content yet"})})})};return n?t.jsxs("div",{className:"enhanced-notebook",children:[t.jsxs("div",{className:"notebook-header",children:[t.jsxs("h3",{children:[n.bookName," ",n.chapter,":",n.verseNums.join("-")]}),t.jsxs("div",{className:"tab-selector",children:[t.jsxs("button",{className:`tab ${b==="research"?"active":""}`,onClick:()=>{I("research")},children:["🤖 AI Research ",(me=p==null?void 0:p.aiResearch)!=null&&me.length?`(${p.aiResearch.length})`:""]}),t.jsx("button",{className:`tab ${b==="notes"?"active":""}`,onClick:()=>{I("notes")},children:"📝 My Notes"}),t.jsx("button",{className:`tab ${b==="all"?"active":""}`,onClick:()=>{I("all")},children:"📚 All"})]})]}),t.jsxs("div",{className:"notebook-content",children:[b==="notes"&&Fe(),b==="research"&&Ue(),b==="all"&&Oe()]}),t.jsx("style",{children:`
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
      `})]}):t.jsx("div",{className:"notebook-empty",children:t.jsx("p",{children:"Select a verse to add notes"})})};export{lt as default};
