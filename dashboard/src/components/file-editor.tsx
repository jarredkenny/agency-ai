"use client";

interface FileEditorProps {
  content: string;
  filename: string;
}

export function FileEditor({ content, filename }: FileEditorProps) {
  const lines = content.split("\n");

  return (
    <div
      className="flex-1 overflow-auto font-mono text-sm"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="p-4">
        {lines.map((line, i) => (
          <div key={i} className="flex leading-6 hover:bg-black/[0.02]">
            <span
              className="w-12 text-right pr-4 select-none shrink-0"
              style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}
            >
              {i + 1}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all">
              {renderMarkdownLine(line)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderMarkdownLine(line: string) {
  if (line.startsWith("# ")) {
    return <span style={{ color: "var(--accent-green)", fontWeight: 700, fontSize: "1.1em" }}>{line}</span>;
  }
  if (line.startsWith("## ")) {
    return <span style={{ color: "var(--accent-blue)", fontWeight: 700 }}>{line}</span>;
  }
  if (line.startsWith("### ")) {
    return <span style={{ color: "var(--accent-olive)", fontWeight: 600 }}>{line}</span>;
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return <span style={{ color: "var(--text-primary)" }}>{line}</span>;
  }
  if (line.startsWith("```")) {
    return <span style={{ color: "var(--text-muted)" }}>{line}</span>;
  }
  // Bold
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length > 1) {
    return (
      <>
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }
  return <span>{line}</span>;
}
