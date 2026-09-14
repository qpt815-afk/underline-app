export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-6" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-line" />
      ))}
    </div>
  )
}
