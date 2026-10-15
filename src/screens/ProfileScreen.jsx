import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { updateUserProfile } from '../services/studyRepository.js'
import './ProfileScreen.css'

const fields = [
  { name: 'username', label: 'Full name', placeholder: 'Your name' },
  { name: 'email', label: 'Email address', placeholder: 'you@example.com', type: 'email' },
  { name: 'phoneNumber', label: 'Phone number', placeholder: '0990 944 406' },
  { name: 'college', label: 'College', placeholder: 'College or institution' },
  { name: 'school', label: 'School', placeholder: 'School or faculty' },
  { name: 'department', label: 'Department', placeholder: 'Department' },
  { name: 'program', label: 'Programme', placeholder: 'Programme of study' },
  { name: 'yearOfStudy', label: 'Year of study', placeholder: 'e.g. Year 2' },
  { name: 'semesterNumber', label: 'Semester', placeholder: 'e.g. Semester 1' },
]

export default function ProfileScreen({ session, profile, onProfileChange, onSignOut, onOpenAdmin, showNotice }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(({ name }) => [name, profile?.[name] || (name === 'email' ? session.email : '') || ''])))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const updateField = (name, value) => setForm((current) => ({ ...current, [name]: value }))
  const beginEditing = () => {
    setForm(Object.fromEntries(fields.map(({ name }) => [name, profile?.[name] || (name === 'email' ? session.email : '') || ''])))
    setEditing(true)
  }
  const cancelEditing = () => {
    setEditing(false)
    setForm(Object.fromEntries(fields.map(({ name }) => [name, profile?.[name] || (name === 'email' ? session.email : '') || ''])))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const editableProfile = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'email'))
      await updateUserProfile(session.idToken, session.userId, editableProfile)
      onProfileChange({ ...profile, ...editableProfile, uid: session.userId })
      setEditing(false)
      showNotice('Your profile has been saved.')
    } catch (error) {
      showNotice(error.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const completeFields = fields.filter(({ name }) => String(form[name] || '').trim()).length
  const completion = Math.round(completeFields / fields.length * 100)

  return <>
    <ScreenHeader kicker="YOUR ACCOUNT" title="My profile" description="Keep your study details and account information up to date." action={<button className="profile-edit-button" onClick={() => editing ? cancelEditing() : beginEditing()}><Icon name={editing ? 'check' : 'file'} size={15} /> {editing ? 'Cancel edit' : 'Edit profile'}</button>} />
    <section className="profile-summary"><div className="profile-large-avatar">{(form.username || session.email || 'S').slice(0, 1).toUpperCase()}</div><div className="profile-summary-copy"><strong>{form.username || 'Student account'}</strong><span>{session.email}</span><small><Icon name="check" size={13} /> Signed in with PHP account service</small></div><div className="profile-progress"><span>PROFILE COMPLETION</span><strong>{completion}%</strong><i><b style={{ width: `${completion}%` }} /></i></div></section>
    <form className="profile-form" onSubmit={save}>
      <div className="profile-section-title"><div><span className="section-kicker">PERSONAL AND STUDY DETAILS</span><h2>Profile information</h2></div></div>
      <div className="profile-fields">{fields.map((field) => <label className="profile-field" key={field.name}><span>{field.label}</span><input type={field.type || 'text'} value={form[field.name] || ''} placeholder={field.placeholder} readOnly={!editing || field.name === 'email'} onChange={(event) => updateField(field.name, event.target.value)} /></label>)}</div>
      {editing && <div className="profile-actions"><button className="profile-cancel" type="button" onClick={cancelEditing}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>}
    </form>
    <section className="profile-account-actions"><div><strong>Account security</strong><p>Use a strong password and keep your sign-in details private.</p></div><div className="profile-account-buttons">{(profile?.isAdmin === true || String(profile?.role || '').toLowerCase() === 'admin') && <button className="profile-admin-button" onClick={onOpenAdmin}><Icon name="lock" size={15}/> Admin panel</button>}<button onClick={onSignOut}>Sign out</button></div></section>
  </>
}
