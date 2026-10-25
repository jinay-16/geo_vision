export default function StatCard({ title, value, subtitle, icon, color = 'blue' }) {
  const colors = {
    blue: 'border-brand-500 bg-brand-50',
    green: 'border-risk-low bg-green-50',
    yellow: 'border-risk-medium bg-amber-50',
    red: 'border-risk-high bg-red-50',
    gray: 'border-gray-300 bg-gray-50',
  };

  return (
    <div className={`stat-card bg-white rounded-xl border-l-4 ${colors[color]} p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1 text-surface-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  );
}
