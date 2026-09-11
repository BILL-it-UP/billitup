// Shared 6-month cash-flow bar chart — used on both the Dashboard summary
// and the full Reports page so the two never drift out of sync visually.
export const monthLabel = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

export default function CashFlowChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Number(d.total) || 0));
  return (
    <div className="cash-flow-chart">
      {data.map((d) => (
        <div className="cash-flow-bar" key={d.month}>
          <div className="cash-flow-bar-track">
            <div className="cash-flow-bar-fill" style={{ height: `${Math.max(2, (Number(d.total) / max) * 100)}%` }} />
          </div>
          <span className="cash-flow-value">₹{Number(d.total).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          <span className="cash-flow-label">{monthLabel(d.month)}</span>
        </div>
      ))}
    </div>
  );
}
