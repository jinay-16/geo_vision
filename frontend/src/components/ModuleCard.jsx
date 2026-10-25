export default function ModuleCard({ title, description, icon, stats = {}, color = 'blue', avgChange = null, indicator = '' }) {
  const borderColors = { blue: 'border-blue-500', green: 'border-green-500', red: 'border-red-500', amber: 'border-amber-500' };

  return (
    <div className={`bg-white rounded-xl shadow-sm border-t-4 ${borderColors[color] || borderColors.blue} p-5 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="font-semibold text-surface-800">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        {avgChange != null && (
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0">
            {indicator}: {avgChange > 0 ? '+' : ''}{avgChange.toFixed(4)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center pt-2 border-t border-gray-100">
        <div>
          <p className="text-lg font-bold text-green-600">{stats.low || 0}</p>
          <p className="text-xs text-gray-400">Low Risk</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-500">{stats.medium || 0}</p>
          <p className="text-xs text-gray-400">Medium Risk</p>
        </div>
        <div>
          <p className="text-lg font-bold text-red-500">{stats.high || 0}</p>
          <p className="text-xs text-gray-400">High Risk</p>
        </div>
      </div>
    </div>
  );
}
