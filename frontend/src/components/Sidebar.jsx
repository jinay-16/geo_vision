import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: '📊' },
  { path: '/satellite-comparison', label: 'Satellite Comparison', icon: '🛰️' },
  { path: '/aoi', label: 'Custom AOI Analysis', icon: '🎯' },
  { path: '/field-photo', label: 'Field Photo Geotag', icon: '📸' },
  { path: '/analysis', label: 'Temporal Analysis', icon: '📈' },
  { path: '/deforestation', label: 'Deforestation', icon: '🌳' },
  { path: '/mining', label: 'Mining Disturbance', icon: '⛏️' },
  { path: '/flood', label: 'Flood Risk', icon: '🌊' },
  { path: '/map', label: 'Common Map', icon: '🗺️' },
  { path: '/validation', label: 'Validation Benchmark', icon: '🔬' },
  { path: '/reports', label: 'Reports', icon: '📄' },
  { path: '/methodology', label: 'Methodology', icon: '📚' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-surface-900 text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-surface-700">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-brand-500">Geo</span>Vision AI
        </h1>
        <p className="text-xs text-gray-400 mt-1">Environmental Intelligence Platform</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-300 hover:bg-surface-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-surface-700 text-xs text-gray-500">
        <p>GeoVision AI v1.0</p>
        <p className="mt-1">Hackathon MVP</p>
      </div>
    </aside>
  );
}
