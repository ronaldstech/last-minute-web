import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { coinPacks } from '../data/studyData.js'
import { creditCoinsOnce, fetchUserProfile, listMyTransactions } from '../services/studyRepository.js'
import { fetchPaymentOperators, initializePayment, verifyPayment } from '../services/payments.js'
import { patchDocument, setDocument } from '../services/firestore.js'
import { createWalletTransaction, loadWallet, loadWalletOperators, verifyWalletTransaction } from '../services/walletApi.js'
import './CoinsScreen.css'

function transactionLabel(status) {
  if (['paid', 'success', 'successful', 'completed'].includes(String(status).toLowerCase())) return 'Paid'
  if (['failed', 'failure', 'cancelled', 'canceled', 'error'].includes(String(status).toLowerCase())) return 'Failed'
  return 'Pending'
}

function transactionDate(value) {
  if (!value) return ''
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

export default function CoinsScreen({ profile, balance, freeBalance, session, onProfileChange, showNotice }) {
  const usesBackend = session?.authProvider === 'php-mysql'
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkoutPack, setCheckoutPack] = useState(null)
  const [operators, setOperators] = useState([])
  const [operatorId, setOperatorId] = useState('')
  const [mobile, setMobile] = useState(profile?.phoneNumber || '')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutStep, setCheckoutStep] = useState('details')
  const [chargeId, setChargeId] = useState('')
  const [txRef, setTxRef] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    setError('')
    if (usesBackend) {
      return loadWallet(session.token)
        .then(({ user, transactions: freshTransactions }) => {
          if (user) onProfileChange((current) => ({ ...current, ...user }))
          setTransactions(freshTransactions)
        })
        .catch((loadError) => setError(loadError.message || 'Could not load coin activity.'))
        .finally(() => setLoading(false))
    }
    return Promise.all([fetchUserProfile(session.idToken, session.userId), listMyTransactions(session.idToken, session.userId)])
      .then(([freshProfile, freshTransactions]) => {
        if (freshProfile) onProfileChange(freshProfile)
        setTransactions(freshTransactions)
      })
      .catch((loadError) => setError(loadError.message || 'Could not load coin activity.'))
      .finally(() => setLoading(false))
  }, [usesBackend, session.idToken, session.token, session.userId, onProfileChange])

  useEffect(() => {
    let active = true
    if (usesBackend) {
      loadWallet(session.token)
        .then(({ user, transactions: freshTransactions }) => {
          if (!active) return
          if (user) onProfileChange((current) => ({ ...current, ...user }))
          setTransactions(freshTransactions)
        })
        .catch((loadError) => { if (active) setError(loadError.message || 'Could not load coin activity.') })
        .finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    }
    Promise.all([fetchUserProfile(session.idToken, session.userId), listMyTransactions(session.idToken, session.userId)])
      .then(([freshProfile, freshTransactions]) => {
        if (!active) return
        if (freshProfile) onProfileChange(freshProfile)
        setTransactions(freshTransactions)
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load coin activity.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [usesBackend, session.idToken, session.token, session.userId, onProfileChange])

  const totalBalance = Number(profile?.coinBalance ?? balance) + Number(profile?.freeCoinBalance ?? freeBalance)

  const startCheckout = async (event) => {
    event.preventDefault()
    const selected = operators.find((operator) => operator.id === operatorId)
    const normalizedMobile = mobile.replace(/[\s()-]/g, '')
    if (!selected) return setCheckoutError('Choose a mobile money operator.')
    if (!/^(\+265|265|0)\d{9}$/.test(normalizedMobile)) return setCheckoutError('Enter a valid Malawi mobile number.')
    const localMobile = normalizedMobile.startsWith('+265') ? `0${normalizedMobile.slice(4)}` : normalizedMobile.startsWith('265') ? `0${normalizedMobile.slice(3)}` : normalizedMobile
    let id = ''
    const coins = checkoutPack.coins + checkoutPack.bonus
    setCheckoutBusy(true)
    setCheckoutError('')
    try {
      if (usesBackend) {
        const transaction = await createWalletTransaction(session.token, {
          packId: checkoutPack.id,
          operatorId: selected.id,
          operatorName: selected.name,
          mobile: localMobile,
        })
        id = transaction.chargeId
        setChargeId(id)
        setTxRef(transaction.txRef || id)
        setCheckoutStep('verify')
        return
      }
      id = `LM${Date.now()}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
      await setDocument(session.idToken, `transactions/${id}`, {
        chargeId: id, userId: session.userId, operatorId: selected.id, operatorName: selected.name,
        mobile: localMobile, coins, amount: String(coins), status: 'pending', createdAt: new Date(), updatedAt: new Date(),
      })
      setChargeId(id)
      const names = String(profile?.username || session.name || '').trim().split(/\s+/)
      const initialized = await initializePayment({
        mobile: localMobile, operator_id: selected.id, amount: String(coins), charge_id: id,
        email: profile?.email || session.email || '', first_name: names[0] || 'Student', last_name: names.slice(1).join(' ') || 'Account',
      })
      setTxRef(initialized.txRef || id)
      if (initialized.txRef && initialized.txRef !== id) await patchDocument(session.idToken, `transactions/${id}`, { txRef: initialized.txRef, updatedAt: new Date() })
      setCheckoutStep('verify')
    } catch (checkoutFailure) {
      if (id && !usesBackend) {
        try { await patchDocument(session.idToken, `transactions/${id}`, { status: 'failed', failureReason: checkoutFailure.message, updatedAt: new Date() }) } catch { /* Keep the checkout error visible. */ }
      }
      setCheckoutError(checkoutFailure.message || 'Could not start your payment.')
    } finally {
      setCheckoutBusy(false)
      await refresh()
    }
  }

  const checkPayment = async () => {
    setCheckoutBusy(true)
    setCheckoutError('')
    try {
      if (usesBackend) {
        const result = await verifyWalletTransaction(session.token, chargeId)
        if (result.user) onProfileChange((current) => ({ ...current, ...result.user }))
        setTransactions(result.transactions || [])
        if (result.status === 'paid') {
          showNotice('Payment confirmed. Your coins are now in your wallet.')
          setCheckoutPack(null)
        } else {
          setCheckoutError(result.message || 'Payment is still pending. Try verification again in a moment.')
          if (result.status === 'failed') setCheckoutStep('details')
        }
        return
      }
      const result = await verifyPayment(txRef || chargeId)
      if (result.status === 'paid') {
        await patchDocument(session.idToken, `transactions/${chargeId}`, { status: 'paid', txRef: txRef || chargeId, updatedAt: new Date() })
        await creditCoinsOnce(session.idToken, session.userId, chargeId, checkoutPack.coins + checkoutPack.bonus)
        await refresh()
        showNotice('Payment confirmed. Your coins are now in your wallet.')
        setCheckoutPack(null)
      } else {
        if (result.status === 'failed') await patchDocument(session.idToken, `transactions/${chargeId}`, { status: 'failed', failureReason: result.message, updatedAt: new Date() })
        setCheckoutError(result.message)
        if (result.status === 'failed') setCheckoutStep('details')
        await refresh()
      }
    } catch (checkError) {
      setCheckoutError(checkError.message || 'Could not verify this payment.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  const openCheckout = async (pack) => {
    setCheckoutPack(pack)
    setCheckoutStep('details')
    setCheckoutError('')
    setCheckoutBusy(true)
    try {
      const options = usesBackend ? await loadWalletOperators(session.token) : await fetchPaymentOperators()
      setOperators(options)
      setOperatorId((current) => options.some((operator) => operator.id === current) ? current : options[0]?.id || '')
      if (!options.length) setCheckoutError('No mobile money operators are available right now.')
    } catch (loadError) {
      setCheckoutError(loadError.message || 'Could not load mobile money operators.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  return <>
    <ScreenHeader kicker="YOUR WALLET" title="Coins" description="Your balance and top-up history from your Last Minute account." />
    <section className="balance-card"><div><span className="balance-caption">TOTAL AVAILABLE</span><div className="balance-total"><Icon name="coins" size={27} /> {totalBalance} <span>coins</span></div><p>Purchased: {Number(profile?.coinBalance ?? balance)} · Free: {Number(profile?.freeCoinBalance ?? freeBalance)}</p></div><div className="coin-orbit"><span>◉</span></div></section>
    <div className="section-heading coin-heading"><div><span className="section-kicker">TOP UP YOUR WALLET</span><h2>Coin packs</h2></div></div>
    <p className="coin-note">Choose a pack to continue to mobile money checkout. Coin packs are priced in MWK.</p>
    <div className="coin-packs">{coinPacks.map((pack) => <article className={`coin-pack ${pack.featured ? 'popular' : ''}`} key={pack.id}><span className="pack-tag">{pack.featured ? 'POPULAR' : pack.note.toUpperCase()}</span><span className="pack-icon"><Icon name="coins" size={21} /></span><strong>{pack.coins.toLocaleString()}</strong><small>coins{pack.bonus ? ` + ${pack.bonus} bonus` : ''}</small><button onClick={() => openCheckout(pack)}>Buy pack <Icon name="right" size={14} /></button></article>)}</div>
    {checkoutPack && <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !checkoutBusy) setCheckoutPack(null) }}><section className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button className="checkout-close" aria-label="Close checkout" disabled={checkoutBusy} onClick={() => setCheckoutPack(null)}>×</button><span className="section-kicker">SECURE MOBILE MONEY</span><h2 id="checkout-title">{checkoutStep === 'verify' ? 'Complete your payment' : 'Buy coins'}</h2><p>{checkoutStep === 'verify' ? `Approve the request on your phone, then verify to add ${(checkoutPack.coins + checkoutPack.bonus).toLocaleString()} coins.` : `You’re buying ${(checkoutPack.coins + checkoutPack.bonus).toLocaleString()} coins for MWK ${(checkoutPack.coins + checkoutPack.bonus).toLocaleString()}.`}</p>{checkoutStep === 'details' ? <form onSubmit={startCheckout} className="checkout-form"><label>Mobile money operator<select value={operatorId} onChange={(event) => setOperatorId(event.target.value)} disabled={checkoutBusy || !operators.length}><option value="">{checkoutBusy && !operators.length ? 'Loading operators…' : 'Select operator'}</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label><label>Phone number<input type="tel" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="0990 944 406" required /></label><button className="primary-button" disabled={checkoutBusy || !operators.length}>{checkoutBusy ? 'Starting payment…' : 'Continue to payment'}</button></form> : <button className="primary-button checkout-verify" onClick={checkPayment} disabled={checkoutBusy}>{checkoutBusy ? 'Checking payment…' : 'I approved it · Verify payment'}</button>}{checkoutError && <div className="notification-error checkout-error">{checkoutError}</div>}<small className="checkout-footnote">Payment is confirmed by the payment service before coins are credited to your account.</small></section></div>}
    <section className="transaction-section"><div className="groups-subhead"><div><span className="section-kicker">WALLET · ACTIVITY</span><h2>Recent activity</h2></div><button className="notification-refresh" onClick={refresh} disabled={loading}><Icon name="clock" size={15} /> Refresh</button></div>
      {error && <div className="notification-error transaction-error">{error}<button onClick={refresh}>Retry</button></div>}
      {loading ? <div className="content-loader"><span className="notification-spinner"/> Loading your transactions…</div> : transactions.length ? <div className="transaction-list">{transactions.slice(0, 12).map((transaction) => <article className="transaction-row" key={transaction.id || transaction.chargeId}><span className="transaction-icon"><Icon name="coins" size={17} /></span><span className="transaction-info"><strong>{Number(transaction.coins || 0).toLocaleString()} coins</strong><small>{transaction.operatorName || 'Mobile money'} · {transaction.mobile || transaction.chargeId}</small></span><span className={`transaction-status ${transactionLabel(transaction.status).toLowerCase()}`}>{transactionLabel(transaction.status)}</span><span className="transaction-date">{transactionDate(transaction.createdAt)}</span></article>)}</div> : <div className="empty-panel transaction-empty"><span className="empty-icon"><Icon name="coins" size={22} /></span><h3>No coin transactions yet</h3><p>Your payment and top-up history will show here.</p></div>}
    </section>
    <div className="info-callout"><Icon name="lock" size={17} /><span><strong>Paper access lasts 24 hours.</strong> Unlocking a paper costs 20 coins.</span></div>
  </>
}
