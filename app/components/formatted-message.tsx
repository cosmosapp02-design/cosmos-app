"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Terminal } from "lucide-react";

interface FormattedMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function FormattedMessage({ content, isStreaming }: FormattedMessageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(codeText);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="text-xs text-[#1E1F24] leading-relaxed">
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            if (!inline && (match || className || codeString.includes("\n"))) {
              const language = match ? match[1] : "code";
              const isCopied = copiedCode === codeString;

              return (
                <div className="my-3 rounded-2xl overflow-hidden border border-[#2D2E35] bg-[#141518] shadow-md font-mono text-left">
                  {/* Top Bar Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-[#1E1E26] border-b border-[#2D2E35]">
                    <div className="flex items-center gap-2 text-[11px] text-[#A1A1AA] font-semibold">
                      <Terminal size={13} className="text-amber-400" />
                      <span className="uppercase tracking-wider font-mono">{language}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(codeString)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-all font-sans"
                    >
                      {isCopied ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Syntax Highlighted Code */}
                  <SyntaxHighlighter
                    style={oneDark}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: "1rem",
                      background: "#141518",
                      fontSize: "11.5px",
                      lineHeight: "1.6",
                    }}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline Code
            return (
              <code
                className="px-1.5 py-0.5 mx-0.5 rounded bg-black/6 border border-black/10 font-mono text-[11px] text-[#D97706] font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="my-1 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="my-1.5 pl-4 list-disc space-y-0.5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1.5 pl-4 list-decimal space-y-0.5">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          strong({ children }) {
            return <strong className="font-bold text-[#1E1F24]">{children}</strong>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-3 border-amber-500 bg-amber-50/60 p-2.5 rounded-r-lg text-amber-950 italic">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-amber-500 animate-pulse align-middle rounded-xs" />
      )}
    </div>
  );
}
