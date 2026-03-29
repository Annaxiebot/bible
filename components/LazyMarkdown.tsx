import React, { lazy, Suspense, ComponentType } from 'react';

interface LazyMarkdownProps {
  children: string;
  katexOptions?: object;
  className?: string;
  components?: Record<string, React.ComponentType<unknown>>;
}

// Lazy load the entire markdown rendering module
const MarkdownRenderer = lazy(() =>
  Promise.all([
    import('react-markdown'),
    import('remark-math'),
    import('remark-gfm'),
    import('rehype-katex')
  ]).then(([ReactMarkdownModule, remarkMathModule, remarkGfmModule, rehypeKatexModule]) => {
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
