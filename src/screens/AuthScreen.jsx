import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { createAccount, sendPasswordReset, signInWithEmail } from '../services/authApi.js'
import './AuthScreen.css'

const phonePattern = /^(?:\+?265)?(?:0)?9\d{8}$/

function AuthBrand() {
  return <a className="auth-brand" href="#signin"><img src="/logo.png" alt="" /><span><strong>Last Minute</strong><small>EXAM PAPER LIBRARY</small></span></a>
}

export default function AuthScreen({ onAuthenticated, showNotice }) {
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isSignup = mode === 'signup'

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (isSignup && !phonePattern.test(phone.replace(/[\s-]/g, ''))) {
      setError('Enter a valid 10-digit Malawi mobile number.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email)
        showNotice('If an account exists for that email, a reset link has been sent.')
        setMode('signin')
      } else if (isSignup) {
        onAuthenticated(await createAccount({ name, email, phone, password }))
      } else {
        onAuthenticated(await signInWithEmail(email, password))
      }
    } catch (submitError) {
      setError(submitError.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <AuthBrand />
    <div className="auth-layout">
      <section className="auth-promo"><span className="promo-overline"><Icon name="spark" size={14} /> YOUR STUDY SPACE</span><h1>Make your next<br />exam your best.</h1><p>Find past papers, practise at your pace, and feel ready for what’s next.</p><div className="promo-paper"><span className="promo-paper-brand"><img src="/logo.png" alt="" /> LAST MINUTE <i>MSCE · BIOLOGY</i></span><div className="promo-paper-rule wide"/><div className="promo-paper-rule"/><div className="promo-paper-rule short"/><div className="promo-stamp"><Icon name="check" size={18} /> READY</div></div><div className="promo-footnote"><Icon name="book" size={15} /> Your papers. Your progress. All in one place.</div></section>
      <section className="auth-card">
        <div className="auth-mode-switch"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError('') }}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Create account</button></div>
        <span className="auth-eyebrow">{mode === 'forgot' ? 'ACCOUNT RECOVERY' : isSignup ? 'START YOUR JOURNEY' : 'WELCOME BACK'}</span>
        <h2>{mode === 'forgot' ? 'Reset your password' : isSignup ? 'Create your account' : 'Ready to pick up?'}</h2>
        <p className="auth-description">{mode === 'forgot' ? 'We’ll email you a secure link to reset your password.' : isSignup ? 'Save papers and keep your exam prep in one place.' : 'Sign in and get back to your revision.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {isSignup && <>
            <label htmlFor="auth-name">Full name</label><div className="auth-input"><Icon name="users" size={17} /><input id="auth-name" required autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} /></div>
            <label htmlFor="auth-phone">Phone number</label><div className="auth-input"><span className="country-code">+265</span><input id="auth-phone" required autoComplete="tel" inputMode="tel" placeholder="0990 944 406" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          </>}
          <label htmlFor="auth-email">Email address</label><div className="auth-input"><Icon name="file" size={17} /><input id="auth-email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {mode !== 'forgot' && <><label htmlFor="auth-password">Password</label><div className="auth-input"><Icon name="lock" size={17} /><input id="auth-password" type={showPassword ? 'text' : 'password'} required minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'} value={password} onChange={(event) => setPassword(event.target.value)} /><button className="show-password" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {mode === 'signin' && <button type="button" className="forgot-link" onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</button>}
          <button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : isSignup ? 'Create account' : 'Sign in'} <Icon name="right" size={16} /></button>
        </form>
        <div className="auth-divider"><span/>OR<span/></div>
        <button className="auth-secondary google-button" type="button" onClick={() => showNotice('Google sign-in is not connected yet. Use your email and password for now.')}><span className="google-mark">G</span>Continue with Google</button>
        <p className="auth-switch-copy">{isSignup ? 'Already have an account?' : 'New to Last Minute?'} <button onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError('') }}>{isSignup ? 'Sign in' : 'Sign up'}</button></p>
        <small className="auth-terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</small>
      </section>
    </div>
    <footer className="auth-footer">Made for curious minds <span>✦</span></footer>
  </main>
}
