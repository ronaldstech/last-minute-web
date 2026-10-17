import { useEffect, useState } from 'react'

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export default function PaperUnlockCountdown({ expiresAt, className = '' }) {
  const expiry = expiresAt == null || expiresAt === '' ? Number.NaN : Number(expiresAt)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!Number.isFinite(expiry)) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiry])

  if (!Number.isFinite(expiry)) return null
  const remaining = Math.max(0, expiry - now)
  return <span className={`paper-unlock-countdown ${remaining <= 60_000 ? 'is-ending' : ''} ${className}`.trim()} aria-live="off">
    <span>{remaining === 0 ? 'Access expired' : 'Access expires in'}</span>
    <strong>{formatRemaining(remaining)}</strong>
  </span>
}
