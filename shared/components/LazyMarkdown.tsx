import React, { lazy, Suspense, ComponentType } from 'react';

interface LazyMarkdownProps {
  children: string;
  katexOptions?: object;
  className?: string;
  components?: Record<string, React.ComponentType<unknown>>;
}

// The four modules behind the markdown renderer (one list for lazy() and preload)
const loadMarkdownModules = () => Promise.all([
  import('react-markdown'),
  import('remark-math'),
  import('remark-gfm'),
  import('rehype-katex')
]);

/**
 * Warm the markdown modules ahead of a render. Tests that assert on rendered
 * markdown `await` this at file top level: the first dynamic import of these
 * four modules took 0.3 s idle and over 10 s under heavy CPU load, which blew
 * the 1 s waitFor/findBy budget (and the 10 s hook budget, so not beforeAll).
 * The app itself never needs it — Suspense shows the fallback meanwhile.
 */
export function preloadMarkdown(): Promise<unknown> {
  return loadMarkdownModules();
}

// Lazy load the entire markdown rendering module
const MarkdownRenderer = lazy(() =>
  loadMarkdownModules().then(([ReactMarkdownModule, remarkMathModule, remarkGfmModule, rehypeKatexModule]) => {
    const ReactMarkdown = ReactMarkdownModule.default;
    const remarkMath = remarkMathModule.default;
    const remarkGfm = remarkGfmModule.default;
    const rehypeKatex = rehypeKatexModule.default;

    // Create a component that wraps ReactMarkdown with the plugins
    const Component: ComponentType<LazyMarkdownProps> = ({ katexOptions, ...props }) => {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={katexOptions ? [[rehypeKatex, katexOptions]] : [rehypeKatex]}
          {...props}
        />
      );
    };

    return { default: Component };
  })
);

// Loading fallback component
const MarkdownFallback: React.FC<{ className?: string }> = ({ className }) => (
  <div className={className} style={{ minHeight: '1.5em', opacity: 0.6 }}>
    <span>Loading...</span>
  </div>
);

// Main component with Suspense wrapper
export const LazyMarkdown: React.FC<LazyMarkdownProps> = (props) => {
  return (
    <Suspense fallback={<MarkdownFallback className={props.className} />}>
      <MarkdownRenderer {...props} />
    </Suspense>
  );
};

export default LazyMarkdown;
