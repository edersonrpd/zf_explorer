import { ZfOffer } from "../types";
import { formatDate, formatPrice, formatQuantity } from "../lib/utils";

/** Campos já exibidos nos blocos fixos — o resto cai em "Outros campos". */
const KNOWN_FIELDS = new Set([
  "productOfferReference",
  "merchantSku",
  "brand",
  "partNumber",
  "quantity",
  "isNeverOutOfStock",
  "isActive",
  "netPrice",
  "validFrom",
  "validTo",
]);

/**
 * Uma oferta pode estar `isActive: true` e mesmo assim fora de vigência, se
 * validFrom/validTo estiverem definidos. Vale destacar isso porque é a causa
 * mais comum de "a oferta existe mas não aparece no marketplace".
 */
function validityState(offer: ZfOffer): { label: string; tone: string } | null {
  const { validFrom, validTo } = offer;
  if (!validFrom && !validTo) return null;

  const now = Date.now();
  const from = validFrom ? new Date(String(validFrom).replace(" ", "T")).getTime() : null;
  const to = validTo ? new Date(String(validTo).replace(" ", "T")).getTime() : null;

  if (from && Number.isFinite(from) && now < from) return { label: "VIGÊNCIA FUTURA", tone: "amber" };
  if (to && Number.isFinite(to) && now > to) return { label: "VIGÊNCIA EXPIRADA", tone: "rose" };
  return { label: "EM VIGÊNCIA", tone: "green" };
}

interface OfferDetailProps {
  offer: ZfOffer;
  correlationId?: string;
  onCopy: (value: string, label: string) => void;
  onOpenJson: () => void;
}

export function OfferDetail({ offer, correlationId, onCopy, onOpenJson }: OfferDetailProps) {
  const validity = validityState(offer);
  const extraFields = Object.entries(offer).filter(([key]) => !KNOWN_FIELDS.has(key));
  const title = [offer.brand, offer.partNumber].filter(Boolean).join(" · ") || offer.productOfferReference;

  return (
    <div className="grid-layout">
      <div className="stack">
        <section className="card">
          <div className="offer-hero">
            <div className="offer-ref">
              <span className="k">REFERÊNCIA</span>
              <span className="v">{offer.productOfferReference}</span>
              <button
                className="copy-btn"
                title="Copiar referência"
                onClick={() => onCopy(offer.productOfferReference, "Referência copiada!")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>

            <h2 className="offer-title">{title}</h2>
            <p className="offer-sub">
              {offer.merchantSku ? `Merchant SKU ${offer.merchantSku}` : "Sem merchant SKU informado"}
            </p>

            <div className="badges">
              <span className={`badge ${offer.isActive ? "green" : "gray"}`}>
                {offer.isActive ? "ATIVA" : "INATIVA"}
              </span>
              {offer.isNeverOutOfStock && <span className="badge blue">NUNCA SEM ESTOQUE</span>}
              {validity && <span className={`badge ${validity.tone}`}>{validity.label}</span>}
            </div>

            <div className="meta-grid">
              <div className="meta">
                <div className="mk">Marca</div>
                <div className="mv">{offer.brand || "—"}</div>
              </div>
              <div className="meta">
                <div className="mk">Part Number</div>
                <div className="mv mono">{offer.partNumber || "—"}</div>
              </div>
              <div className="meta">
                <div className="mk">Merchant SKU</div>
                <div className="mv mono">{offer.merchantSku || "—"}</div>
              </div>
              <div className="meta">
                <div className="mk">Válido de</div>
                <div className="mv mono">{formatDate(offer.validFrom)}</div>
              </div>
              <div className="meta">
                <div className="mk">Válido até</div>
                <div className="mv mono">{formatDate(offer.validTo)}</div>
              </div>
              <div className="meta">
                <div className="mk">Nunca sem estoque</div>
                <div className="mv">{offer.isNeverOutOfStock ? "Sim" : "Não"}</div>
              </div>
            </div>
          </div>
        </section>

        {extraFields.length > 0 && (
          <section className="card">
            <div className="card-head">
              <span className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              </span>
              <h2>Outros campos retornados</h2>
              <span className="count">{extraFields.length}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {extraFields.map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ width: "220px", color: "var(--muted)", fontWeight: 600 }}>{key}</td>
                      <td className="mono" style={{ wordBreak: "break-word" }}>
                        {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <aside className="stack">
        <section className="price-card">
          <div className="price-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <h2>Preço e estoque</h2>
            <span className="cur">BRL</span>
          </div>
          <div className="price-body">
            <div className="price-main">
              <div className="pk">Net price</div>
              <div className="pv">{formatPrice(offer.netPrice)}</div>
            </div>
            <div className="price-secondary">
              <div className="psec">
                <div className="pk">Quantidade</div>
                <div className="pv">{formatQuantity(offer.quantity)}</div>
                {offer.isNeverOutOfStock && <div className="note">Marcada como estoque infinito</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
            </span>
            <h2>Requisição</h2>
          </div>
          <div className="side-block">
            <div className="side-label">Rastreabilidade</div>
            <div className="line">
              <span className="ln-k">Endpoint</span>
              <span className="ln-v">GET /offers/:ref</span>
            </div>
            {correlationId && (
              <div className="line">
                <span className="ln-k">x-correlation-id</span>
                <span className="ln-v accent" style={{ fontSize: "11px" }}>{correlationId.slice(0, 8)}…</span>
              </div>
            )}
          </div>
          <div className="side-block">
            <button className="btn btn-dark" style={{ width: "100%", justifyContent: "center" }} onClick={onOpenJson}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              Ver JSON completo
            </button>
            {correlationId && (
              <button
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "center", marginTop: "8px" }}
                onClick={() => onCopy(correlationId, "Correlation ID copiado!")}
              >
                Copiar correlation ID
              </button>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
