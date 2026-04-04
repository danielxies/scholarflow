"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileTextIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFiles } from "@/features/projects/hooks/use-files";
import { Id } from "@/lib/local-db/types";

// Strip LaTeX commands/packages that latex.js doesn't support.
// latex.js only supports base LaTeX — strip ALL \usepackage lines and
// unsupported commands so the core content renders cleanly.
function preprocessLatex(source: string): string {
  return (
    source
      // Remove ALL \usepackage lines (latex.js doesn't support any)
      .replace(/\\usepackage(\[.*?\])?\{.*?\}/g, "")
      // Remove documentclass options that aren't "article" base
      .replace(/\\documentclass(\[.*?\])?\{(acmart|IEEEtran|neurips_\d+)\}/g, "\\documentclass{article}")
      // Remove bibliography commands
      .replace(/\\bibliographystyle\{.*?\}/g, "")
      .replace(/\\bibliography\{.*?\}/g, "")
      // Remove \cite{} → [ref]
      .replace(/\\cite\{(.*?)\}/g, "[$1]")
      // Remove IEEE-specific commands
      .replace(/\\IEEEauthorblockN\{/g, "\\textbf{")
      .replace(/\\IEEEauthorblockA\{/g, "\\textit{")
      .replace(/\\begin\{IEEEkeywords\}/g, "\\begin{quote}\\textbf{Keywords:} ")
      .replace(/\\end\{IEEEkeywords\}/g, "\\end{quote}")
      // Simplify \href
      .replace(/\\href\{.*?\}\{(.*?)\}/g, "$1")
      // Remove \maketitle if causing issues (latex.js supports it but just in case)
      // Remove empty lines that result from stripping
      .replace(/\n{3,}/g, "\n\n")
  );
}

export const LaTeXPreview = ({ projectId }: { projectId: Id<"projects"> }) => {
  const files = useFiles(projectId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCompiled, setHasCompiled] = useState(false);

  const compile = useCallback(async () => {
    if (!files) return;

    setIsCompiling(true);
    setError(null);

    try {
      // Find main.tex or the first .tex file
      const texFiles = files.filter(
        (f) => f.type === "file" && f.name.endsWith(".tex")
      );
      const mainTex =
        texFiles.find((f) => f.name === "main.tex") ?? texFiles[0];

      if (!mainTex || !mainTex.content) {
        setError("No .tex file found in project");
        return;
      }

      // Preprocess to remove unsupported packages/commands
      const cleanedSource = preprocessLatex(mainTex.content);

      // Dynamically import latex.js
      const { parse, HtmlGenerator } = await import("latex.js");

      const generator = new HtmlGenerator({
        hyphenate: false,
      });

      const doc = parse(cleanedSource, { generator });
      const htmlDoc = doc.htmlDocument();

      // Inject custom styles for academic paper look
      const style = htmlDoc.createElement("style");
      style.textContent = `
        body {
          max-width: 720px;
          margin: 2rem auto;
          padding: 0 1.5rem;
          font-family: 'Computer Modern Serif', 'Latin Modern Roman', Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.5;
          color: #1a1a1a;
          background: white;
        }
        h1, h2, h3, h4 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-family: inherit;
        }
        h1 { font-size: 1.4em; text-align: center; }
        h2 { font-size: 1.2em; }
        .abstract {
          margin: 1.5em 2.5em;
          font-size: 0.95em;
        }
        .abstract::before {
          content: "Abstract";
          display: block;
          font-weight: bold;
          text-align: center;
          margin-bottom: 0.5em;
        }
        pre, code { font-size: 0.85em; }
        p { text-align: justify; }
      `;
      htmlDoc.head.appendChild(style);

      // Serialize and display in iframe
      const serializer = new XMLSerializer();
      const htmlString = serializer.serializeToString(htmlDoc);

      if (iframeRef.current) {
        const blob = new Blob([htmlString], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        iframeRef.current.src = url;
      }

      setHasCompiled(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to compile LaTeX";
      // Make error messages more helpful
      if (msg.includes("Cannot find module")) {
        setError("Some LaTeX packages in your document aren't supported by the browser preview. The content that is supported will still render. Try simplifying your \\usepackage declarations.");
      } else {
        setError(msg);
      }
    } finally {
      setIsCompiling(false);
    }
  }, [files]);

  // Auto-compile on first load when files are available
  useEffect(() => {
    if (files && !hasCompiled) {
      const texFiles = files.filter(
        (f) => f.type === "file" && f.name.endsWith(".tex")
      );
      if (texFiles.length > 0) {
        compile();
      }
    }
  }, [files, hasCompiled, compile]);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-8.75 flex items-center border-b bg-sidebar shrink-0 px-2 gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-none gap-1.5"
          disabled={isCompiling}
          onClick={compile}
        >
          {isCompiling ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3" />
          )}
          <span className="text-xs">
            {isCompiling ? "Compiling..." : "Compile PDF"}
          </span>
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        {error && (
          <div className="size-full flex items-center justify-center p-6">
            <div className="flex flex-col items-center gap-3 max-w-md text-center">
              <div className="text-destructive text-sm font-medium">
                Compilation Error
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-md w-full overflow-auto max-h-60">
                {error}
              </pre>
              <Button size="sm" variant="outline" onClick={compile}>
                <RefreshCwIcon className="size-3 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {!error && !hasCompiled && !isCompiling && (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <FileTextIcon className="size-8 opacity-50" />
              <p className="text-sm">
                Click &quot;Compile PDF&quot; to preview your paper
              </p>
            </div>
          </div>
        )}

        {isCompiling && !hasCompiled && (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Loader2Icon className="size-6 animate-spin" />
              <p className="text-sm">Compiling LaTeX...</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          className="size-full border-0"
          title="LaTeX Preview"
          style={{
            display: hasCompiled && !error ? "block" : "none",
          }}
        />
      </div>
    </div>
  );
};
