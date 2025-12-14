export default function KPICard({ label, value }) {
  const display = value === null || value === undefined ? 'N/A' : String(value)

  return (
    <div className="card cardElevate">
      <p className="cardTitle">{label}</p>
      <p className="cardValue">{display}</p>
    </div>
  )
}
