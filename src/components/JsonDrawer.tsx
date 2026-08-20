import { useEffect } from "react";

interface JsonDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: unknown;
  onToast: (msg: string) => void;
  title?: string;
  subtitle?: string;
}

export function JsonDrawer({ isOpen, onClose, data, onToast, title, subtitle }: JsonDrawerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const jsonString = JSON.stringify(data, null, 2);

  const syntaxHighlight = (json: string) => {
    if (!json) return "";
    const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "jn";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "jk" : "js";
        } else if (/true|false/.test(match)) {
          cls = "jb";
        } else if (/null/.test(match)) {
          cls = "jnull";
        }
        return `<span class="${cls}">${match}</span>`;
      },
    );
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonString);
      onToast("JSON copiado!");
    }
  };

  return (
    <>
      <div className={`overlay ${isOpen ? "open" : ""}`} onClick={onClose}></div>
      <div className={`drawer ${isOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div>
            <h3>{title || "Resposta da API"}</h3>
            {subtitle && <span className="sub">{subtitle}</span>}
          </div>
          <div className="right">
            <button className="icon-btn" title="Copiar tudo" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button className="icon-btn" onClick={onClose} title="Fechar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <pre dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonString) }}></pre>
        </div>
      </div>
    </>
  );
}
