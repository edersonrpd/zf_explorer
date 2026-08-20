import { OfferFilters } from "../types";

interface OfferFiltersFieldsProps {
  filters: OfferFilters;
  onChange: <K extends keyof OfferFilters>(key: K, value: OfferFilters[K]) => void;
  idPrefix: string;
  disabled?: boolean;
}

/** Campos de filtro de GET /offers, usados tanto na busca quanto no catálogo completo. */
export function OfferFiltersFields({ filters, onChange, idPrefix, disabled }: OfferFiltersFieldsProps) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}Ref`}>productOfferReference</label>
        <input
          id={`${idPrefix}Ref`}
          className="input mono"
          placeholder="offer_MER000002-bosch__..."
          value={filters.productOfferReference}
          disabled={disabled}
          onChange={(e) => onChange("productOfferReference", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}Sku`}>merchantSku</label>
        <input
          id={`${idPrefix}Sku`}
          className="input mono"
          placeholder="MER000002"
          value={filters.merchantSku}
          disabled={disabled}
          onChange={(e) => onChange("merchantSku", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}Brand`}>brand</label>
        <input
          id={`${idPrefix}Brand`}
          className="input"
          placeholder="BOSCH"
          value={filters.brand}
          disabled={disabled}
          onChange={(e) => onChange("brand", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}Part`}>partNumber</label>
        <input
          id={`${idPrefix}Part`}
          className="input mono"
          placeholder="0 280 156 096"
          value={filters.partNumber}
          disabled={disabled}
          onChange={(e) => onChange("partNumber", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}Active`}>isActive</label>
        <select
          id={`${idPrefix}Active`}
          className="input"
          value={filters.isActive}
          disabled={disabled}
          onChange={(e) => onChange("isActive", e.target.value)}
        >
          <option value="">Todas</option>
          <option value="true">Somente ativas</option>
          <option value="false">Somente inativas</option>
        </select>
      </div>
    </>
  );
}
