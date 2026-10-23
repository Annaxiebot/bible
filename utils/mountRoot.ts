/**
 * mountRoot.ts — take over #root from the static fallback · 挂载根节点
 *
 * The delivered index.html carries a prerendered homepage inside #root for
 * crawlers and no-JS visitors (scripts/seo/prerender.ts). The app removes it
 * before React mounts, so the page never shows the fallback and the live
 * landing side by side (two skip links, two <main>s, duplicate headings).
 */
export function takeOverRoot(doc: Document = document): HTMLElement {
  const root = doc.getElementById('root');
  if (!root) throw new Error('Could not find root element to mount to');
  root.replaceChildren();
  doc.documentElement.classList.remove('stl-app-route');
  return root;
}
