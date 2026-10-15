const paymentBase = (import.meta.env.VITE_PAYMENT_API_BASE_URL || 'https://apexspacemw.com/rt/last_minute/paychangu').replace(/\/$/, '')

async function request(path, options) {
  let response
  try {
    response = await fetch(`${paymentBase}/${path}`, options)
  } catch {
    throw new Error('Could not reach the payment service. Check your connection and try again.')
  }
  const body = await response.json().catch(() => null)
  if (!body || !response.ok) throw new Error(body?.message || `The payment service returned HTTP ${response.status}.`)
  return body
}

export async function fetchPaymentOperators() {
  const body = await request('get_operators.php', { headers: { Accept: 'application/json' } })
  if (body.status && body.status.toLowerCase() !== 'success') throw new Error(body.message || 'Could not load mobile money operators.')
  if (!Array.isArray(body.data)) throw new Error('The payment service did not return any mobile money operators.')
  return body.data.map((operator) => ({
    id: String(operator.ref_id || ''),
    name: String(operator.name || ''),
    logo: operator.logo || '',
    currency: operator.supported_country?.currency || 'MWK',
  })).filter((operator) => operator.id && operator.name)
}

export async function initializePayment(payload) {
  const body = await request('initialize_payment.php', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (body.status && body.status.toLowerCase() !== 'success') throw new Error(body.message || 'The payment could not be started.')
  const data = body.data || {}
  return { txRef: data.tx_ref || data.txRef || data.charge_id || data.reference || body.tx_ref || payload.charge_id, message: body.message || '' }
}

export async function verifyPayment(txRef) {
  const params = new URLSearchParams({ txRef })
  const body = await request(`verify_payment.php?${params}`, { headers: { Accept: 'application/json' } })
  const data = body.data || {}
  const status = String(data.status || data.payment_status || body.status || '').toLowerCase()
  if (['paid', 'success', 'successful', 'completed'].includes(status)) return { status: 'paid', message: body.message || 'Payment received. Your coins have been added.' }
  if (['failed', 'failure', 'cancelled', 'canceled', 'error'].includes(status)) return { status: 'failed', message: body.message || 'The payment was not completed. Please try again.' }
  return { status: 'pending', message: body.message || 'Payment is still pending. Try verification again in a moment.' }
}
