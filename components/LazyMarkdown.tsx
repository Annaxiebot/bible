import React, { lazy, Suspense, ComponentType } from 'react';

// Lazy load the entire markdown rendering module
const MarkdownRenderer = lazy(() => 
  Promise.all([
    import('react-markdown'),
    import('remark-math'),
    import('rehype-katex')
  ]).then(([ReactMarkdownModule, remarkMathModule, rehypeKatexModule]) => {
    const ReactMarkdown = ReactMarkdownModule.default;
    const remarkMath = remarkMathModule.default;
    const rehypeKatex = rehypeKatexModule.default;
    
    // Create a component that wraps ReactMarkdown with the plugins
    const Component: ComponentType<any> = ({ katexOptions, ...props }) => {
      return (
        <ReactMarkdown 
          remarkPlugins={[remarkMath]} 
          rehypePlugins={katexOptions ? [[rehypeKatex, katexOptions]] : [rehypeKatex]}
          {...props}
        />
      );
    };
    
    return { default: Component };
  })
);

interface LazyMarkdownProps {
  children: string;
  katexOptions?: any;
  className?: string;
  components?: any;
}

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
