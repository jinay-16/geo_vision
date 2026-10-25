import RiskBadge from './RiskBadge';

export default function HotspotTable({ hotspots = [], title = 'Risk Hotspots', isDemo = null }) {
  if (!hotspots.length) return <p className="text-sm text-gray-400 py-4">No hotspots to display.</p>;

  const display = hotspots.slice(0, 50);
  const firstSample = hotspots[0] || {};
  const isDemoData = isDemo !== null ? isDemo : (firstSample.is_demo ?? true);
  const provenanceLabel = firstSample.provenance || (isDemoData ? 'Pune Pilot Reference Dataset (2023–2026)' : 'Live Satellite Query');

  const formatChange = (h) => {
    const val = Number(h.change_value);
    if (isNaN(val)) return 'N/A';
    const mod = (h.module || '').toLowerCase();

    if (mod === 'deforestation') {
      const isDecline = val < 0;
      return (
        <span className={isDecline ? 'text-red-600 font-semibold' : 'text-emerald-600 font-medium'}>
          {val > 0 ? '+' : ''}{val.toFixed(4)} <span className="text-[10px] text-gray-400 block font-sans">ΔNDVI {isDecline ? '(Canopy Decline)' : '(Regrowth)'}</span>
        </span>
      );
    } else if (mod === 'mining') {
      const isDisturbed = val > 0;
      return (
        <span className={isDisturbed ? 'text-amber-700 font-semibold' : 'text-gray-600 font-medium'}>
          {val > 0 ? '+' : ''}{val.toFixed(4)} <span className="text-[10px] text-gray-400 block font-sans">ΔNDBI {isDisturbed ? '(Soil Exposure)' : '(Stable)'}</span>
        </span>
      );
    } else if (mod === 'flood') {
      const isWaterExpanded = val > 0;
      return (
        <span className={isWaterExpanded ? 'text-blue-600 font-semibold' : 'text-gray-600 font-medium'}>
          {val > 0 ? '+' : ''}{val.toFixed(4)} <span className="text-[10px] text-gray-400 block font-sans">ΔNDWI {isWaterExpanded ? '(Water Extent Exp.)' : '(Normal Extent)'}</span>
        </span>
      );
    }

    return (
      <span className={val < 0 ? 'text-red-600' : 'text-green-600'}>
        {val > 0 ? '+' : ''}{val.toFixed(4)}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
          <span className="text-xs text-gray-400 font-mono">({hotspots.length} total points)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border bg-amber-50 text-amber-800 border-amber-200" title={provenanceLabel}>
            📍 {isDemoData ? 'Reference Pilot' : 'Live Observation'}
          </span>
          <span className="text-[10px] text-gray-400 hidden md:inline font-mono">
            Observation Window: 2023–2026
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Location / Coordinates</th>
              <th className="px-4 py-2.5 text-center">Obs. Date</th>
              <th className="px-4 py-2.5 text-left">Hazard Module</th>
              <th className="px-4 py-2.5 text-right">Spectral Change (Index)</th>
              <th className="px-4 py-2.5 text-right">Risk Score</th>
              <th className="px-4 py-2.5 text-center">Risk Level</th>
              <th className="px-4 py-2.5 text-center">Field Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {display.map((h, i) => (
              <tr key={h.id || i} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-surface-800">
                  <div className="font-semibold text-gray-900">{h.region}</div>
                  <div className="text-[11px] font-mono text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] bg-gray-100 px-1 py-0.2 rounded font-sans text-gray-600">ID: {h.id || `HOT-${i + 1}`}</span>
                    {h.latitude != null && h.longitude != null && (
                      <span>{Number(h.latitude).toFixed(4)}°N, {Number(h.longitude).toFixed(4)}°E</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-600">
                  {h.date || '2026-03-15'}
                </td>
                <td className="px-4 py-2.5 text-gray-600 capitalize">
                  <span className="inline-flex items-center gap-1 text-xs">
                    {h.module === 'deforestation' && '🌲'}
                    {h.module === 'mining' && '⛏️'}
                    {h.module === 'flood' && '🌊'}
                    {h.module}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {formatChange(h)}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900 font-mono">
                  {h.risk_score}
                  <span className="text-[10px] text-gray-400 font-normal">/100</span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <RiskBadge level={h.risk_level} />
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-amber-700 font-medium">
                  {h.requires_field_verification ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200/80">
                      <span>⚠️</span> Verification Required
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 bg-gray-50/70 border-t border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-1 text-[11px] text-gray-500">
        <div>
          Showing {display.length} of {hotspots.length} total monitored hotspots.
        </div>
        <div className="text-[10px] text-gray-400 italic">
          ℹ️ Negative ΔNDVI indicates vegetation-index decline; does not prove confirmed legal deforestation without ground survey.
        </div>
      </div>
    </div>
  );
}
