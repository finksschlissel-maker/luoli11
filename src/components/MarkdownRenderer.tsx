import React from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </Markdown>
    </div>
  );
};
