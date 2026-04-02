import{K as h}from"./index-BuWXsWbR.js";import{journalStorage as f}from"./journalStorage-Bf9B62e3.js";import{spiritualMemory as m}from"./spiritualMemory-DK1UDWrf.js";import"./vendor-react-CFhoJv6l.js";import"./vendor-google-BD6ai2ur.js";import"./vendor-anthropic-CkMCgFtn.js";import"./vendor-supabase-D-SUoaNb.js";const w=new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","is","it","its","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","not","no","nor","so","too","very","just","about","above","after","again","all","also","am","any","are","as","because","before","between","both","each","few","get","got","he","her","here","him","his","how","i","if","into","me","more","most","my","myself","new","now","only","other","our","out","own","same","she","some","such","than","that","their","them","then","there","these","they","this","those","through","up","us","what","when","where","which","while","who","whom","why","you","your","much","many","we","like","over","really","think","thing","things","going","make","way","know","even","well","back","still","day","see","come","take","one","two"]);function T(n){return n.toLowerCase().replace(/[^a-z0-9\s'-]/g,"").split(/\s+/).filter(r=>r.length>2&&!w.has(r))}function $(n){const e=new Map;for(const r of n)e.set(r,(e.get(r)||0)+1);return e}function S(n,e,r=120){const t=n.toLowerCase();let a=-1,s="";for(const l of e){const u=t.indexOf(l);if(u!==-1){a=u,s=l;break}}if(a===-1)return n.slice(0,r);const i=Math.max(0,a-40),c=Math.min(n.length,a+s.length+80);let o=(i>0?"...":"")+n.slice(i,c)+(c<n.length?"...":"");return o.length>r&&(o=o.slice(0,r)+"..."),o}const A='Analyze this journal entry and suggest 3-5 tags. Categories: themes (forgiveness, faith, doubt, gratitude, prayer, love, hope, patience, wisdom, trust), emotions (joy, peace, struggle, hope, anxiety, comfort), and any Bible references mentioned. Return ONLY a JSON array of lowercase strings, e.g. ["faith","gratitude","romans 8"]. No other text.';async function F(n){const e=n.plainText||n.title||"";if(e.trim().length<10)return[];try{const r=await h(`${A}

Journal entry:
${e.slice(0,2e3)}`,[],{fast:!0}),a=(typeof r=="string"?r:r.text).match(/\[[\s\S]*?\]/);if(!a)return[];const s=JSON.parse(a[0]);return Array.isArray(s)?s.filter(i=>typeof i=="string").map(i=>i.toLowerCase().trim()).filter(i=>i.length>0&&i.length<50).slice(0,7):[]}catch(r){return console.warn("[JournalAI] Tag suggestion failed:",r),[]}}async function U(n,e=3){const r=`${n.title} ${n.plainText}`,t=T(r);if(t.length===0)return[];const s=[...$(t).entries()].sort((o,l)=>l[1]-o[1]).map(([o])=>o).slice(0,20),i=await f.getAllEntries(),c=[];for(const o of i){if(o.id===n.id)continue;const l=`${o.title} ${o.plainText}`.toLowerCase();if(!l.trim())continue;let u=0;const p=[];for(let g=0;g<s.length;g++){const y=s[g];if(l.includes(y)){const d=(s.length-g)/s.length;u+=d,p.push(y)}}u>0&&p.length>=2&&c.push({id:o.id,title:o.title||"Untitled",createdAt:o.createdAt,snippet:S(o.plainText||o.title,p),score:u})}return c.sort((o,l)=>l.score-o.score).slice(0,e)}const j="Summarize these journal reflections from the past week. Highlight recurring themes, emotional patterns, and spiritual growth areas. Keep it concise (3-5 bullet points). Use markdown bullet points.";function k(n){const e=new Date(n.getFullYear(),0,1),r=Math.ceil(((n.getTime()-e.getTime())/864e5+e.getDay()+1)/7);return`${n.getFullYear()}-${String(r).padStart(2,"0")}`}const O="journal_weekly_digest_";async function B(n=!1){const e=new Date,r=k(e),t=`${O}${r}`;if(!n)try{const o=localStorage.getItem(t);if(o)return JSON.parse(o)}catch{}const a=new Date(e.getTime()-10080*60*1e3).toISOString(),i=(await f.getAllEntries()).filter(o=>o.createdAt>=a);if(i.length===0)return null;const c=i.map((o,l)=>{const u=new Date(o.createdAt).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});return`Entry ${l+1} (${u}):
${(o.plainText||o.title||"").slice(0,500)}`}).join(`

`);try{const o=await h(`${j}

${c}`,[],{fast:!0}),u={summary:typeof o=="string"?o:o.text,entryCount:i.length,weekKey:r,generatedAt:e.toISOString()};try{localStorage.setItem(t,JSON.stringify(u))}catch{}return u}catch(o){return console.warn("[JournalAI] Weekly digest failed:",o),null}}async function W(){const n=await f.getAllEntries(),e=new Map;for(const r of n){const t=r.createdAt.slice(0,10);e.has(t)||e.set(t,[]),e.get(t).push(r)}return[...e.entries()].sort(([r],[t])=>t.localeCompare(r)).map(([r,t])=>({date:r,label:new Date(r+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"}),entries:t}))}const P='You are a thoughtful spiritual companion. Based on the context below, generate ONE reflective question or prompt that would help the writer go deeper in their spiritual reflection. Keep it warm, open-ended, and 1-2 sentences max. Do not use quotes around the prompt. Do not add a prefix like "Prompt:" — just the prompt itself.';async function Y(n,e,r){var a;const t=[];if((a=n==null?void 0:n.plainText)!=null&&a.trim()&&t.push(`Current entry:
${n.plainText.slice(0,500)}`),e!=null&&e.bookName&&(e!=null&&e.chapter)&&t.push(`Currently reading: ${e.bookName} ${e.chapter}`),r.length>0){const s=r.slice(0,3).map((i,c)=>`Recent entry ${c+1}: ${(i.plainText||i.title).slice(0,200)}`).join(`
`);t.push(s)}t.length===0&&t.push("The user is starting a new journal entry with no previous context.");try{const s=await h(`${P}

${t.join(`

`)}`,[],{fast:!0});return(typeof s=="string"?s:s.text).trim()}catch(s){return console.warn("[JournalAI] Reflection prompt failed:",s),"What is one thing you are grateful for today?"}}const R="The user wrote this spiritual reflection. Gently extend their thinking — what deeper meaning might this have? How does it connect to broader spiritual themes? Keep the same tone and language. Write 2-3 short paragraphs.";async function z(n,e){if(!n.trim())return"";let r=`${R}

User's writing:
${n.slice(0,2e3)}`;e!=null&&e.bookName&&(e!=null&&e.chapter)&&(r+=`

They are currently reading: ${e.bookName} ${e.chapter}`);try{const t=await h(r,[],{fast:!0});return(typeof t=="string"?t:t.text).trim()}catch(t){return console.warn("[JournalAI] Extend thinking failed:",t),""}}const M="Summarize this journal entry into 2-3 key insights or takeaways. Use bullet points (markdown). Be concise — each point should be 1 sentence. Capture the spiritual/emotional essence.";async function G(n){if(!n.trim()||n.trim().length<20)return"";try{const e=await h(`${M}

Journal entry:
${n.slice(0,3e3)}`,[],{fast:!0});return(typeof e=="string"?e:e.text).trim()}catch(e){return console.warn("[JournalAI] Summarize failed:",e),""}}const N=`Based on this journal entry, suggest 3-5 relevant Bible verses. For each, provide:
1. The reference (e.g. "Philippians 4:6-7")
2. A brief explanation (1 sentence) of why it's relevant

Return as a JSON array of objects with "reference" and "reason" fields. Example:
[{"reference":"Philippians 4:6-7","reason":"Speaks to finding peace through prayer instead of anxiety."}]
Return ONLY the JSON array. No other text.`;async function H(n){if(!n.trim()||n.trim().length<10)return[];try{const e=await h(`${N}

Journal entry:
${n.slice(0,2e3)}`,[],{fast:!0}),t=(typeof e=="string"?e:e.text).match(/\[[\s\S]*?\]/);if(!t)return[];const a=JSON.parse(t[0]);return Array.isArray(a)?a.filter(s=>typeof s=="object"&&s!==null&&typeof s.reference=="string"&&typeof s.reason=="string").slice(0,5):[]}catch(e){return console.warn("[JournalAI] Scripture finder failed:",e),[]}}async function X(n,e,r){if(!n.trim())return"";const t=["You are a thoughtful spiritual companion. The user is asking about their journal entry. Answer warmly and concisely."];if(e.trim()&&t.push(`Current journal entry:
${e.slice(0,1500)}`),r.length>0){const a=r.slice(0,3).map((s,i)=>`Recent entry ${i+1}: ${(s.plainText||s.title).slice(0,300)}`).join(`
`);t.push(`Recent entries:
${a}`)}t.push(`User's question: ${n}`);try{const a=await h(t.join(`

`),[],{fast:!0});return(typeof a=="string"?a:a.text).trim()}catch(a){return console.warn("[JournalAI] Chat about entry failed:",a),"Sorry, I could not process your question right now. Please try again."}}const I=`Analyze this journal entry and extract any items worth remembering about the user. Categories:
- "theme": recurring spiritual themes (e.g. "forgiveness", "seeking God's will")
- "prayer": specific prayer requests or answered prayers
- "growth": areas of spiritual growth or goals
- "question": open spiritual questions the user is wrestling with

Return a JSON array of objects with "category" and "content" fields. Only include genuinely meaningful items (not every detail). Return an empty array [] if nothing stands out.
Example: [{"category":"prayer","content":"Praying for healing for their mother"},{"category":"theme","content":"Finding peace through surrender"}]
Return ONLY the JSON array.`;async function Q(n,e){if(!n.trim()||n.trim().length<30)return[];try{const r=await h(`${I}

Journal entry:
${n.slice(0,2e3)}`,[],{fast:!0}),a=(typeof r=="string"?r:r.text).match(/\[[\s\S]*?\]/);if(!a)return[];const s=JSON.parse(a[0]);if(!Array.isArray(s))return[];const i=new Set(["theme","prayer","growth","question"]),c=s.filter(o=>typeof o=="object"&&o!==null&&typeof o.category=="string"&&i.has(o.category)&&typeof o.content=="string"&&o.content.trim().length>0).slice(0,10);for(const o of c)await m.addItem({category:o.category,content:o.content,source:e});return c}catch(r){return console.warn("[JournalAI] Memory extraction failed:",r),[]}}async function V(){return m.getAllItems()}const v=`Based on these memory items about a person's spiritual journey, generate a brief spiritual profile. Organize into sections:

**Key Themes**: The recurring spiritual themes in their journey (2-3 items)
**Active Prayer Requests**: Current prayers and petitions (list each)
**Growth Areas**: Where they are growing or want to grow (2-3 items)
**Open Questions**: Spiritual questions they are exploring (list each)

If a category has no items, write "None recorded yet." Be warm and encouraging. Use markdown formatting.`;async function Z(n){if(n.length===0)return"No spiritual memory recorded yet. Keep journaling and your profile will be built over time!";const e={theme:[],prayer:[],growth:[],question:[]};for(const t of n)e[t.category]&&e[t.category].push(t.content);const r=Object.entries(e).map(([t,a])=>`${t}: ${a.length>0?a.join("; "):"none"}`).join(`
`);try{const t=await h(`${v}

Memory items:
${r}`,[],{fast:!0});return(typeof t=="string"?t:t.text).trim()}catch(t){return console.warn("[JournalAI] Spiritual profile failed:",t),"Could not generate profile at this time. Please try again later."}}const J="You are a thoughtful spiritual companion. Based on the user's context below, generate a brief, encouraging suggestion for their journaling session today. Keep it to 2-3 sentences. Be warm and specific (reference their actual themes/prayers if available). Do not use generic platitudes.";async function C(n,e,r){const t=[];if(n.length>0){const a=n.filter(c=>c.category==="theme").slice(0,3).map(c=>c.content),s=n.filter(c=>c.category==="prayer").slice(0,3).map(c=>c.content),i=n.filter(c=>c.category==="growth").slice(0,2).map(c=>c.content);a.length>0&&t.push(`Key themes: ${a.join(", ")}`),s.length>0&&t.push(`Active prayers: ${s.join(", ")}`),i.length>0&&t.push(`Growth areas: ${i.join(", ")}`)}if(e){const a=Math.floor((Date.now()-new Date(e.createdAt).getTime())/864e5);t.push(`Last journal entry was ${a} day(s) ago: "${(e.plainText||e.title).slice(0,200)}"`)}else t.push("This is potentially their first journal entry.");r!=null&&r.bookName&&(r!=null&&r.chapter)&&t.push(`Currently reading: ${r.bookName} ${r.chapter}`);try{const a=await h(`${J}

${t.join(`
`)}`,[],{fast:!0});return(typeof a=="string"?a:a.text).trim()}catch(a){return console.warn("[JournalAI] Proactive suggestion failed:",a),""}}export{X as chatAboutEntry,z as extendThinking,T as extractKeywords,Q as extractMemoryItems,S as extractSnippet,U as findRelatedEntries,H as findRelatedScripture,C as generateProactiveSuggestion,Y as generateReflectionPrompt,Z as generateSpiritualProfile,B as generateWeeklyDigest,V as getMemoryContext,W as getTimelineGroups,F as suggestTags,G as summarizeEntry};
