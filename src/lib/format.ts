export const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
export const millions = (v: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);
export const percent = (v: number | null) =>
  v === null ? "N/A" : `${(v * 100).toFixed(1)}%`;
