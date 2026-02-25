import{r as h,j as t,a as F}from"./vendor-react-CNOxwxsp.js";import{o as ne,v as C,C as H}from"./index-iGSNBH0_.js";import{D as ae}from"./DrawingCanvas-Ca27A3lT.js";import{L as W}from"./LazyMarkdown-bYqZn4gb.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const oe=Object.keys(H).sort((e,u)=>u.length-e.length).map(e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),q=oe.join("|"),ie=`(?:${q})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`,ce="(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*",le=new RegExp(`${ie}|${ce}`,"gi"),X=e=>{const u=[];for(const m of e.split(/[，,]\s*/)){const[f,d]=m.split("-").map(Number);for(let o=f;o<=(d||f);o++)u.push(o)}return u},de=(e,u)=>{const m=new RegExp(`^(${q})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`,"i"),f=new RegExp(`^(${q})\\s*(\\d+)[章篇]$`,"i");let d=e.match(m);if(d){const o=H[d[1]];return o?{bookId:o,chapter:+d[2],verses:X(d[3])}:null}if(d=e.match(f),d){const o=H[d[1]];return o?{bookId:o,chapter:+d[2]}:null}if(u){const o=e.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);if(o)return{bookId:u,chapter:+o[1],verses:X(o[2])}}return null},pe={color:"#2563eb",backgroundColor:"#eff6ff",textDecoration:"underline",textUnderlineOffset:"2px",padding:"0 3px",borderRadius:"3px",cursor:"pointer"},K=(e,u,m)=>{if(!u||typeof e!="string")return e;const f=new RegExp(le.source,"gi"),d=[];let o=0,b;for(;(b=f.exec(e))!==null;){b.index>o&&d.push(e.slice(o,b.index));const g=de(b[0],m);if(g){const R=b[0];d.push(t.jsx("a",{style:pe,onClick:l=>{l.preventDefault(),u(g.bookId,g.chapter,g.verses)},children:R},`r${b.index}`))}else d.push(b[0]);o=f.lastIndex}return o<e.length&&d.push(e.slice(o)),d.length===1?d[0]:t.jsx(t.Fragment,{children:d})},k=(e,u,m)=>{if(typeof e=="string")return K(e,u,m);if(typeof e=="number")return K(String(e),u,m);if(e==null||typeof e=="boolean"||F.isValidElement(e))return e;const f=F.Children.toArray(e);return f.length>0?f.map((d,o)=>t.jsx(F.Fragment,{children:k(d,u,m)},o)):e},ye=({selection:e,onSaveNote:u,initialContent:m,initialTab:f="research",researchUpdateTrigger:d=0,onNavigate:o})=>{var P;const b=ne(),[g,R]=h.useState(f),[l,I]=h.useState(null),[Q,A]=h.useState(""),[G,z]=h.useState(!0),[$,Z]=h.useState("text"),[S,T]=h.useState(""),p=h.useRef(null),J=h.useRef(null),E=h.useRef(null),O=h.useRef(null),_=h.useRef(Date.now()),N=h.useRef(!1);h.useEffect(()=>{R(f)},[f]),h.useEffect(()=>{e&&O.current!==e.id&&(O.current=e.id,_.current=Date.now(),N.current=!1,D())},[e==null?void 0:e.id]),h.useEffect(()=>{e&&D()},[b]);const D=async()=>{if(!e)return;z(!0);const a=e.id.split(":");if(a.length>=3){const r=a[0],i=parseInt(a[1]),s=[parseInt(a[2])],n=await C.getVerseData(r,i,s);I(n),n!=null&&n.personalNote?(A(n.personalNote.text),T(n.personalNote.drawing||""),p.current&&(p.current.innerHTML=n.personalNote.text),n.personalNote.text&&n.personalNote.text.trim()&&(N.current=!0)):m?(A(m),p.current&&(p.current.innerHTML=m),m.trim()&&(N.current=!0)):(A(""),T(""),p.current&&(p.current.innerHTML=""),N.current=!1)}},M=async(a=!1)=>{var i,s,n;if(!e){alert("Please select a verse first before saving a note");return}const r=e.id.split(":");if(r.length>=3){const c=r[0],x=parseInt(r[1]),v=[parseInt(r[2])],y=((i=p.current)==null?void 0:i.innerHTML)||"";if((s=p.current)!=null&&s.textContent,y.trim()||S){const j={text:y,drawing:S,createdAt:((n=l==null?void 0:l.personalNote)==null?void 0:n.createdAt)||Date.now(),updatedAt:Date.now()};await C.savePersonalNote(c,x,v,j),u(e.id,y,a),I(w=>w?{...w,personalNote:j}:null)}else await C.deletePersonalNote(c,x,v),u(e.id,"",a),I(j=>j?{...j,personalNote:void 0}:null);z(!0)}},Y=()=>{if(!p.current||!e)return;const a=new Date,r=a.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:!1}),i=a.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}),s=document.createElement("span");s.contentEditable="false",s.style.fontSize="14px",s.style.color="#94a3b8",s.style.fontWeight="normal",s.style.userSelect="none",s.textContent=`[${i} ${r}]`;const n=document.createTextNode(" "),c=window.getSelection();let x=null,v=0,y=null;c&&c.rangeCount>0&&(x=c.getRangeAt(0).cloneRange(),v=x.startOffset,y=x.startContainer);const j=p.current.firstChild;if(j?(p.current.insertBefore(n,j),p.current.insertBefore(s,n)):(p.current.appendChild(s),p.current.appendChild(n)),c&&x&&y)try{const w=document.createRange();w.setStart(y,v),w.setEnd(y,v),c.removeAllRanges(),c.addRange(w)}catch{const L=document.createRange();L.setStartAfter(n),L.setEndAfter(n),c.removeAllRanges(),c.addRange(L)}p.current.focus(),N.current=!0},U=()=>{var x;const a=Date.now(),r=a-_.current,s=(((x=p.current)==null?void 0:x.innerHTML)||"").replace(/<[^>]*>/g,"").trim(),n=/^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(s);r>120*1e3&&(n||(N.current=!1)),!N.current&&s.length>0&&!n&&Y(),_.current=a,z(!1),E.current&&clearTimeout(E.current),E.current=window.setTimeout(()=>{M(!0)},2e3)},ee=async a=>{if(!e||!l)return;const r=e.id.split(":");if(r.length>=3){const i=r[0],s=parseInt(r[1]),n=[parseInt(r[2])];await C.deleteAIResearch(i,s,n,a),D()}},V=a=>{let r=a;return r=r.replace(/\$\\text\{([^}]+)\}\$/g,(i,s)=>/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(s)?s:i),r=r.replace(/\*([a-zA-Z]+)\*/g,"_$1_"),r},B=a=>{const r=new Date(a),s=new Date().getTime()-r.getTime(),n=Math.floor(s/(1e3*60*60*24));return n===0?r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):n<7?`${n}d ago`:r.toLocaleDateString("en-US",{month:"short",day:"numeric"})},te=()=>{const a=r=>r?r.replace(/^\[.*?\]\s*/,""):"";return t.jsxs("div",{className:"notes-tab",children:[(e==null?void 0:e.selectedRawText)&&t.jsxs("div",{className:"verse-quote-block",children:[t.jsxs("div",{className:"verse-quote-header",children:[e.bookName," ",e.chapter,":",e.verseNums.join("-")]}),t.jsx("div",{className:"verse-quote-text",children:a(e.selectedRawText)})]}),$==="text"?t.jsx("div",{ref:p,className:"note-editor",contentEditable:!0,onInput:U,placeholder:"Write your notes here...",style:{minHeight:"200px",padding:"12px",outline:"none",fontSize:"14px",lineHeight:"1.6"}}):t.jsx(ae,{ref:J,onChange:r=>{T(r),U()},initialData:S}),t.jsxs("div",{className:"note-toolbar",children:[t.jsxs("div",{style:{display:"flex",gap:"8px"},children:[t.jsx("button",{onClick:()=>Z($==="text"?"draw":"text"),className:"toolbar-btn",children:$==="text"?"✏️ Draw":"📝 Text"}),t.jsx("button",{onClick:M,className:"toolbar-btn",style:{background:"#4CAF50",color:"white"},children:"💾 Save"}),(Q||S)&&t.jsx("button",{onClick:()=>{confirm("Are you sure you want to delete this note?")&&(p.current&&(p.current.innerHTML=""),T(""),M(!1))},className:"toolbar-btn",style:{background:"#ef4444",color:"white"},children:"🗑️ Delete"})]}),!G&&t.jsx("span",{className:"save-indicator",children:"Auto-saving..."})]})]})},re=()=>t.jsx("div",{className:"research-tab",children:l!=null&&l.aiResearch&&l.aiResearch.length>0?t.jsx("div",{className:"research-list",children:l.aiResearch.map(a=>t.jsxs("div",{className:"research-entry",children:[t.jsxs("div",{className:"research-header",children:[t.jsxs("div",{className:"research-query",children:[t.jsx("strong",{children:"Q:"})," ",a.query]}),t.jsxs("div",{className:"research-actions",children:[t.jsx("span",{className:"timestamp",children:B(a.timestamp)}),t.jsx("button",{onClick:()=>ee(a.id),className:"delete-btn",title:"Delete research",children:"🗑️"})]})]}),t.jsx("div",{className:"research-response",children:t.jsx(W,{components:{p:({children:r})=>{var s;const i=(s=e==null?void 0:e.id)==null?void 0:s.split(":")[0];return t.jsx("p",{style:{marginBottom:"0.5em"},children:k(r,o,i)})},li:({children:r})=>{var s;const i=(s=e==null?void 0:e.id)==null?void 0:s.split(":")[0];return t.jsx("li",{children:k(r,o,i)})},strong:({children:r})=>{var s;const i=(s=e==null?void 0:e.id)==null?void 0:s.split(":")[0];return t.jsx("strong",{style:{fontWeight:600},children:k(r,o,i)})},code:({inline:r,className:i,children:s})=>{const n=/language-(\w+)/.exec(i||"");return n&&n[1]==="math"||r===!1?t.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:t.jsx("code",{children:s})}):t.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:s})}},children:V(a.response)})}),a.tags&&a.tags.length>0&&t.jsx("div",{className:"research-tags",children:a.tags.map((r,i)=>t.jsxs("span",{className:"tag",children:["#",r]},i))})]},a.id))}):t.jsxs("div",{className:"empty-state",children:[t.jsx("p",{children:"No AI research yet"}),t.jsx("p",{className:"hint",children:'Select text and choose "Research with AI" to add research'})]})}),se=()=>{const a=[];return l!=null&&l.personalNote&&a.push({type:"note",timestamp:l.personalNote.updatedAt,content:l.personalNote}),l!=null&&l.aiResearch&&l.aiResearch.forEach(r=>{a.push({type:"research",timestamp:r.timestamp,content:r})}),a.sort((r,i)=>i.timestamp-r.timestamp),t.jsx("div",{className:"all-tab",children:a.length>0?t.jsx("div",{className:"timeline",children:a.map((r,i)=>t.jsxs("div",{className:`timeline-item ${r.type}`,children:[t.jsx("div",{className:"timeline-marker",children:r.type==="note"?"📝":"🤖"}),t.jsxs("div",{className:"timeline-content",children:[t.jsxs("div",{className:"timeline-header",children:[t.jsx("span",{className:"timeline-type",children:r.type==="note"?"Personal Note":"AI Research"}),t.jsx("span",{className:"timeline-time",children:B(r.timestamp)})]}),r.type==="note"?t.jsx("div",{className:"note-preview",dangerouslySetInnerHTML:{__html:r.content.text}}):t.jsxs("div",{className:"research-preview",children:[t.jsxs("div",{className:"research-q",children:["Q: ",r.content.query]}),t.jsx("div",{className:"research-a",children:t.jsx(W,{components:{p:({children:s})=>{var c;const n=(c=e==null?void 0:e.id)==null?void 0:c.split(":")[0];return t.jsx("p",{style:{marginBottom:"0.5em"},children:k(s,o,n)})},li:({children:s})=>{var c;const n=(c=e==null?void 0:e.id)==null?void 0:c.split(":")[0];return t.jsx("li",{children:k(s,o,n)})},strong:({children:s})=>{var c;const n=(c=e==null?void 0:e.id)==null?void 0:c.split(":")[0];return t.jsx("strong",{style:{fontWeight:600},children:k(s,o,n)})},code:({inline:s,className:n,children:c})=>{const x=/language-(\w+)/.exec(n||"");return x&&x[1]==="math"||s===!1?t.jsx("pre",{style:{backgroundColor:"#f5f5f5",padding:"8px",borderRadius:"4px",overflowX:"auto"},children:t.jsx("code",{children:c})}):t.jsx("code",{style:{backgroundColor:"#f0f0f0",padding:"1px 4px",borderRadius:"3px",fontFamily:"monospace",fontSize:"0.9em"},children:c})}},children:V(r.content.response)})})]})]})]},i))}):t.jsx("div",{className:"empty-state",children:t.jsx("p",{children:"No content yet"})})})};return e?t.jsxs("div",{className:"enhanced-notebook",children:[t.jsxs("div",{className:"notebook-header",children:[t.jsxs("h3",{children:[e.bookName," ",e.chapter,":",e.verseNums.join("-")]}),t.jsxs("div",{className:"tab-selector",children:[t.jsxs("button",{className:`tab ${g==="research"?"active":""}`,onClick:()=>{R("research")},children:["🤖 AI Research ",(P=l==null?void 0:l.aiResearch)!=null&&P.length?`(${l.aiResearch.length})`:""]}),t.jsx("button",{className:`tab ${g==="notes"?"active":""}`,onClick:()=>{R("notes")},children:"📝 My Notes"}),t.jsx("button",{className:`tab ${g==="all"?"active":""}`,onClick:()=>{R("all")},children:"📚 All"})]})]}),t.jsxs("div",{className:"notebook-content",children:[g==="notes"&&te(),g==="research"&&re(),g==="all"&&se()]}),t.jsx("style",{children:`
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

        .note-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid #e0e0e0;
          margin-top: 12px;
        }

        .toolbar-btn {
          padding: 4px 12px;
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
      `})]}):t.jsx("div",{className:"notebook-empty",children:t.jsx("p",{children:"Select a verse to add notes"})})};export{ye as default};
