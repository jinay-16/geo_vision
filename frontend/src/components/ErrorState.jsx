export default function ErrorState({ message = 'Failed to load data.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-sm font-medium mb-1">Something went wrong</p>
      <p className="text-xs text-gray-400 mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}
