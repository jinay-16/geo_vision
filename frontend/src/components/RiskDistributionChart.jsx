import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };

export default function RiskDistributionChart({ distribution = {}, title = 'Risk Distribution' }) {
  const data = [
    { name: 'Low (0-39)', value: distribution.low || 0 },
    { name: 'Medium (40-69)', value: distribution.medium || 0 },
    { name: 'High (70-100)', value: distribution.high || 0 },
  ].filter(d => d.value > 0);

  if (!data.length) return <p className="text-sm text-gray-400 py-4">No data.</p>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-surface-800 mb-2">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">Risk categories (not official government classifications)</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
            paddingAngle={3} dataKey="value" label={({ name, value }) => `${value}`}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name.split(' ')[0]]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
