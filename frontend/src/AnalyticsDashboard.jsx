import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PAY_COLORS = { dinheiro: "#0d9488", pix: "#6366f1", cartao: "#ea580c" };
const TYPE_COLORS = {
  balcao: "#0d9488",
  mesa: "#6366f1",
  retirada: "#7c3aed",
  entrega: "#ea580c",
  outros: "#64748b",
};

const TYPE_LABELS = {
  balcao: "Balcão",
  mesa: "Mesa",
  retirada: "Retirada",
  entrega: "Entrega",
  outros: "Outros",
};

function formatBrl(v) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(v) || 0);
}

function formatDayLabel(ymd) {
  if (!ymd || typeof ymd !== "string") return "";
  const [, m, d] = ymd.split("-");
  if (!d) return ymd;
  return `${d}/${m}`;
}

export default function AnalyticsDashboard({
  data,
  loading,
  days,
  onDaysChange,
  onRefresh,
}) {
  const series = data?.series || [];
  const totals = data?.totals;
  const byType = data?.byType || {};

  const piePayData = totals
    ? ["dinheiro", "pix", "cartao"]
        .map((k) => ({
          name: k === "dinheiro" ? "Dinheiro" : k === "pix" ? "Pix" : "Cartão",
          key: k,
          value: totals.paidByMethod?.[k] || 0,
        }))
        .filter((x) => x.value > 0)
    : [];

  const barTypeData = Object.entries(byType)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      key: k,
      name: TYPE_LABELS[k] || k,
      value: v,
    }));

  return (
    <div className="analytics-dashboard">
      <section className="card card-elevated analytics-toolbar">
        <div className="row wrap analytics-toolbar-inner">
          <label className="field-label inline">
            Período
            <select
              value={String(days)}
              onChange={(e) => onDaysChange(Number(e.target.value))}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="14">Últimos 14 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="60">Últimos 60 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            Atualizar gráficos
          </button>
          {data ? (
            <span className="hint-inline analytics-range">
              {formatDayLabel(data.from)} — {formatDayLabel(data.to)} ·{" "}
              {totals?.ordersCount ?? 0} pedidos no período
            </span>
          ) : null}
        </div>
        {loading ? <p className="analytics-loading">Carregando…</p> : null}
      </section>

      {totals ? (
        <div className="analytics-kpis">
          <div className="stat-card analytics-kpi">
            <h3>Recebido (pagos)</h3>
            <p className="stat-value">{formatBrl(totals.paidTotal)}</p>
          </div>
          <div className="stat-card analytics-kpi">
            <h3>A receber (pendente)</h3>
            <p className="stat-value">{formatBrl(totals.pendingTotal)}</p>
          </div>
          <div className="stat-card analytics-kpi">
            <h3>Pedidos</h3>
            <p className="stat-value">{totals.ordersCount}</p>
          </div>
        </div>
      ) : null}

      {!loading && series.length > 0 ? (
        <>
          <section className="card card-elevated analytics-chart-card">
            <h2 className="section-title">Receita paga por dia</h2>
            <p className="section-desc">
              Valores já registrados como recebidos no caixa.
            </p>
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDayLabel}
                    tick={{ fontSize: 11 }}
                    stroke="var(--text-muted)"
                  />
                  <YAxis
                    tickFormatter={(v) => `R$${v}`}
                    tick={{ fontSize: 11 }}
                    stroke="var(--text-muted)"
                  />
                  <Tooltip
                    formatter={(value) => [formatBrl(value), "Recebido"]}
                    labelFormatter={(l) => (l ? `Dia ${formatDayLabel(l)}` : "")}
                  />
                  <Area
                    type="monotone"
                    dataKey="paidTotal"
                    name="Recebido"
                    stroke="#0d9488"
                    fill="#5eead4"
                    fillOpacity={0.35}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card card-elevated analytics-chart-card">
            <h2 className="section-title">Volume de pedidos por dia</h2>
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDayLabel}
                    tick={{ fontSize: 11 }}
                    stroke="var(--text-muted)"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip
                    formatter={(value) => [value, "Pedidos"]}
                    labelFormatter={(l) => (l ? `Dia ${formatDayLabel(l)}` : "")}
                  />
                  <Bar dataKey="ordersCount" name="Pedidos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="analytics-split">
            <section className="card card-elevated analytics-chart-card">
              <h2 className="section-title">Forma de pagamento (recebido)</h2>
              {piePayData.length === 0 ? (
                <p className="empty-hint">Nenhum valor pago no período.</p>
              ) : (
                <div className="analytics-chart-wrap analytics-pie">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={piePayData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {piePayData.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={PAY_COLORS[entry.key] || "#64748b"}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatBrl(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="card card-elevated analytics-chart-card">
              <h2 className="section-title">Receita por tipo de pedido</h2>
              {barTypeData.length === 0 ? (
                <p className="empty-hint">Nenhum pedido pago no período.</p>
              ) : (
                <div className="analytics-chart-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={barTypeData}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `R$${v}`}
                        tick={{ fontSize: 11 }}
                        stroke="var(--text-muted)"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={88}
                        tick={{ fontSize: 11 }}
                        stroke="var(--text-muted)"
                      />
                      <Tooltip formatter={(value) => formatBrl(value)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {barTypeData.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={TYPE_COLORS[entry.key] || "#64748b"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}

      {!loading && (!data || series.length === 0) ? (
        <p className="empty-hint analytics-empty">
          Sem dados no período ou ainda não há pedidos registrados.
        </p>
      ) : null}
    </div>
  );
}
