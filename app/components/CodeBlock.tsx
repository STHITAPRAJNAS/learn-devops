"use client";

import React, { useEffect, useRef, useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import clsx from "clsx";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

// Lazy-load highlight.js only on the client
let hljs: typeof import("highlight.js").default | null = null;

export default function CodeBlock({
  code,
  language = "bash",
  filename,
  showLineNumbers = false,
}: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    async function highlight() {
      if (!hljs) {
        const mod = await import("highlight.js");
        hljs = mod.default;
      }
      if (codeRef.current && !highlighted) {
        codeRef.current.removeAttribute("data-highlighted");
        hljs.highlightElement(codeRef.current);
        setHighlighted(true);
      }
    }
    highlight();
  }, [code, language, highlighted]);

  // Re-highlight when content changes
  useEffect(() => {
    setHighlighted(false);
  }, [code]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code.trim();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const lines = code.trim().split("\n");

  return (
    <div className="relative group my-6 rounded-xl overflow-hidden border border-gray-700/60 bg-[#0d1117]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60 bg-gray-800/60">
        <div className="flex items-center gap-2">
          {/* macOS-style traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>

          {filename ? (
            <span className="ml-2 text-xs font-mono text-gray-400">
              {filename}
            </span>
          ) : (
            <span className="ml-2 flex items-center gap-1 text-xs text-gray-500">
              <Terminal className="w-3 h-3" />
              {language}
            </span>
          )}
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          aria-label="Copy code"
          className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            copied
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-gray-700/60 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          )}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code area */}
      <div className="overflow-x-auto">
        {showLineNumbers ? (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="select-none pl-4 pr-3 py-0 text-xs text-gray-600 text-right w-8 align-top font-mono leading-7 border-r border-gray-700/40">
                    {i + 1}
                  </td>
                  <td className="pl-4 pr-4 py-0 font-mono text-sm leading-7 text-gray-200">
                    {line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="p-0 m-0 bg-transparent">
            <code
              ref={codeRef}
              className={clsx(`language-${language}`, "hljs")}
            >
              {code.trim()}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
