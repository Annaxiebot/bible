import{ax as h}from"./index-DyicJ0De.js";const m="## 中文",p="## English",N=h("无英文部分","no English section"),l=["中文","中文部分","简体中文","chinese","chinese section"],a=["english","english section","english version","english commentary","英文","英文部分"],_="split",c=/[[［]\s*split\s*[\]］]/i,u=new RegExp(c.source,"gi");function E(t){return t.trim().replace(/^#{1,6}\s*/,"").replace(/^(\*\*|__)\s*/,"").replace(/\s*(\*\*|__)$/,"").replace(/\s*[:：]$/,"").replace(/\s*(\*\*|__)$/,"").trim().toLowerCase()}function o(t){const n=t.trim();if(n.length>60)return null;const e=E(n);return e===n.toLowerCase()?null:a.includes(e)?"en":l.includes(e)?"zh":null}function d(t){const n=t.trim();if(!n)return!1;if(/[[［]\s*[a-z]*$/i.test(n)){const r=n.replace(/^.*[[［]\s*/,"").toLowerCase();if(_.startsWith(r))return!0}const e=n.replace(/^#{1,6}\s*/,"").replace(/^(\*\*|__)\s*/,"").toLowerCase();return e?[...l,...a].some(r=>r.startsWith(e)&&e!==r):!0}function g(t){if(!t.some(i=>o(i)==="en"))return null;const n={zh:[],en:[]};let e="zh";for(const i of t){const s=o(i);s?e=s:n[e].push(i)}const r=i=>i.join(`
`).replace(u,"").trim();return{zh:r(n.zh),en:r(n.en)}}function L(t){const n=t.findIndex(r=>r.trim()!=="");return(n>=0&&o(t[n])==="zh"?t.slice(n+1):t).join(`
`).trim()}function z(t,n={}){let e=t.split(`
`);n.partial&&d(e[e.length-1])&&(e=e.slice(0,-1));const r=g(e);if(r)return{zh:r.zh,en:r.en||(n.partial?"":null)};const i=e.join(`
`),s=i.match(c);if(s&&s.index!==void 0){const f=i.slice(s.index+s[0].length).replace(u,"").trim();return{zh:i.slice(0,s.index).trim(),en:f||(n.partial?"":null)}}return{zh:L(e),en:null}}function C(t){if(!c.test(t))return t;const{zh:n,en:e}=z(t);return e===null?n:`${m}
${n}

${p}
${e}`}export{p as E,N,m as Z,z as s,C as t};
