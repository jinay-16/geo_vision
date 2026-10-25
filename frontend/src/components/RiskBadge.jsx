export default function RiskBadge({ level }) {
  const cls = {
    Low: 'risk-low',
    Medium: 'risk-medium',
    High: 'risk-high',
  }[level] || 'risk-low';

  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {level}
    </span>
  );
}
