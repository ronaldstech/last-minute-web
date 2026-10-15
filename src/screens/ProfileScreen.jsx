import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { updateAccountProfile } from '../services/authApi.js'
import { updateUserProfile } from '../services/studyRepository.js'
import { listCollectionPage } from '../services/firestore.js'
import { listAcademicCatalog } from '../services/adminAcademics.js'
import './ProfileScreen.css'

const fields = [
  { name: 'username', label: 'Full name', placeholder: 'Your name', maxLength: 120 },
  { name: 'email', label: 'Email address', placeholder: 'you@example.com', type: 'email' },
  { name: 'phoneNumber', label: 'Phone number', placeholder: '0990 944 406', type: 'tel', maxLength: 32 },
  { name: 'college', label: 'College', placeholder: 'College or institution', maxLength: 160 },
  { name: 'school', label: 'School', placeholder: 'School or faculty', maxLength: 160 },
  { name: 'department', label: 'Department', placeholder: 'Department', maxLength: 160 },
  { name: 'program', label: 'Programme', placeholder: 'Programme of study', maxLength: 160 },
  { name: 'yearOfStudy', label: 'Year of study', choices: [1, 2, 3, 4, 5, 6] },
  { name: 'semesterNumber', label: 'Semester', choices: [1, 2] },
]

export default function ProfileScreen({ session, profile, onProfileChange, onSignOut, onOpenAdmin, showNotice }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(({ name }) => [name, profile?.[name] || (name === 'email' ? session.email : '') || ''])))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [academicOptions, setAcademicOptions] = useState({ colleges: [], schools: [], departments: [], programmes: [] })
  const [loadingAcademic, setLoadingAcademic] = useState({})

  const loadAcademic = useCallback(async (type, parentId, path) => {
    setLoadingAcademic((current) => ({ ...current, [type]: true }))
    try {
      const records = session.authProvider === 'php-mysql'
        ? await listAcademicCatalog(session.token, type, parentId)
        : (await listCollectionPage(session.idToken, path, { pageSize: 100, fields: ['name', 'alias', 'code'] })).documents
      setAcademicOptions((current) => ({ ...current, [type]: records }))
    } catch (error) {
      showNotice(error.message || 'Could not load academic choices.')
      setAcademicOptions((current) => ({ ...current, [type]: [] }))
    } finally {
      setLoadingAcademic((current) => ({ ...current, [type]: false }))
    }
  }, [session.authProvider, session.idToken, session.token, showNotice])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAcademic('colleges', '', 'colleges')
  }, [loadAcademic])

  const findAcademic = useCallback((items, value) => items.find((item) => [item.name, item.alias, item.code].some((part) => part && String(part).toLowerCase() === String(value || '').toLowerCase())), [])
  const selectedCollege = findAcademic(academicOptions.colleges, form.college)
  const selectedSchool = findAcademic(academicOptions.schools, form.school)
  const selectedDepartment = findAcademic(academicOptions.departments, form.department)

  useEffect(() => {
    if (!selectedCollege) return
    const path = `colleges/${selectedCollege.id}/schools`
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAcademic('schools', selectedCollege.id, path)
  }, [selectedCollege, loadAcademic])

  useEffect(() => {
    if (!selectedCollege || !selectedSchool) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAcademic('departments', selectedSchool.id, `colleges/${selectedCollege.id}/schools/${selectedSchool.id}/departments`)
  }, [selectedCollege, selectedSchool, loadAcademic])

  useEffect(() => {
    if (!selectedCollege || !selectedSchool || !selectedDepartment) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAcademic('programmes', selectedDepartment.id, `colleges/${selectedCollege.id}/schools/${selectedSchool.id}/departments/${selectedDepartment.id}/programmes`)
  }, [selectedCollege, selectedSchool, selectedDepartment, loadAcademic])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setForm(Object.fromEntries(fields.map(({ name }) => [name, profile?.[name] || (name === 'email' ? session.email : '') || ''])))
  }, [profile, session.email, editing])

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value, ...(name === 'college' ? { school: '', department: '', program: '' } : {}), ...(name === 'school' ? { department: '', program: '' } : {}), ...(name === 'department' ? { program: '' } : {}) }))
    if (name === 'college') setAcademicOptions((current) => ({ ...current, schools: [], departments: [], programmes: [] }))
    if (name === 'school') setAcademicOptions((current) => ({ ...current, departments: [], programmes: [] }))
    if (name === 'department') setAcademicOptions((current) => ({ ...current, programmes: [] }))
  }
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
      let updatedProfile
      if (session.authProvider === 'php-mysql') {
        updatedProfile = (await updateAccountProfile(session.token, editableProfile)).user
      } else {
        await updateUserProfile(session.idToken, session.userId, editableProfile)
        updatedProfile = { ...profile, ...editableProfile, uid: session.userId }
      }
      onProfileChange(updatedProfile)
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
  const academicFields = { college: ['colleges', null], school: ['schools', selectedCollege], department: ['departments', selectedSchool], program: ['programmes', selectedDepartment] }
  const renderFields = (fieldSet) => fieldSet.map((field) => {
    const academic = academicFields[field.name]
    const options = academic ? academicOptions[academic[0]] : []
    const hasStoredValue = academic && form[field.name] && !findAcademic(options, form[field.name])
    const studyChoice = field.choices && Number.parseInt(String(form[field.name] || '').match(/\d+/)?.[0], 10)
    const normalizedStudyChoice = field.choices?.includes(studyChoice) ? String(studyChoice) : ''
    const studyDisplayValue = normalizedStudyChoice ? `${field.name === 'yearOfStudy' ? 'Year' : 'Semester'} ${normalizedStudyChoice}` : form[field.name] || ''
    return <label className="profile-field" key={field.name}><span>{field.label}{field.name === 'email' && <small className="profile-locked-label">Account email</small>}</span>{editing && academic ? <><select className="profile-editable-input" value={form[field.name] || ''} disabled={loadingAcademic[academic[0]] || (field.name !== 'college' && !academic[1])} onChange={(event) => updateField(field.name, event.target.value)}><option value="">{loadingAcademic[academic[0]] ? 'Loading choices…' : `Select ${field.label.toLowerCase()}`}</option>{hasStoredValue && <option value={form[field.name]}>{form[field.name]} (not in directory)</option>}{options.map((item) => <option key={item.id} value={item.name}>{item.name}{(item.alias || item.code) ? ` (${item.alias || item.code})` : ''}</option>)}</select>{!loadingAcademic[academic[0]] && !options.length && <small className="profile-field-hint">No directory choices available{field.name !== 'college' ? ' until a parent is selected' : ''}.</small></> : editing && field.choices ? <select className="profile-editable-input" value={normalizedStudyChoice} onChange={(event) => updateField(field.name, event.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{field.choices.map((choice) => <option key={choice} value={choice}>{field.name === 'yearOfStudy' ? `Year ${choice}` : `Semester ${choice}`}</option>)}</select> : <input className={field.name === 'email' ? 'profile-locked-input' : editing ? 'profile-editable-input' : ''} type={field.type || 'text'} maxLength={field.maxLength} required={['username', 'phoneNumber'].includes(field.name)} value={field.choices ? studyDisplayValue : form[field.name] || ''} placeholder={field.placeholder} readOnly={!editing || field.name === 'email' || Boolean(academic) || Boolean(field.choices)} onChange={(event) => updateField(field.name, event.target.value)} />}{field.name === 'email' && <small className="profile-field-hint">Email is linked to your sign-in and cannot be changed here.</small>}</label>
  })

  return <>
    <ScreenHeader kicker="YOUR ACCOUNT" title="My profile" description="Manage your account details and personalize your study profile." action={<button type="button" className="profile-edit-button" disabled={saving} onClick={() => editing ? cancelEditing() : beginEditing()}><Icon name={editing ? 'close' : 'file'} size={15} /> {editing ? 'Discard changes' : 'Edit profile'}</button>} />
    <section className="profile-summary"><div className="profile-large-avatar">{(form.username || session.email || 'S').trim().slice(0, 1).toUpperCase()}</div><div className="profile-summary-copy"><strong>{form.username || 'Student account'}</strong><span>{profile?.email || session.email}</span><small><Icon name="check" size={13} /> Account profile</small></div><div className="profile-progress"><span>PROFILE COMPLETION</span><strong>{completion}%</strong><i><b style={{ width: `${completion}%` }} /></i><small>Add your study details to complete your profile.</small></div></section>
    <form className="profile-form" onSubmit={save}>
      <div className="profile-section-title"><div><span className="section-kicker">ACCOUNT DETAILS</span><h2>Your information</h2><p>{editing ? 'Update the details you use across your study space.' : 'Your details are private and visible only to you.'}</p></div><span className={`profile-mode-badge ${editing ? 'editing' : ''}`}>{editing ? 'Editing profile' : 'View mode'}</span></div>
      <section className="profile-field-group"><div className="profile-group-heading"><span className="profile-group-icon"><Icon name="users" size={16}/></span><div><strong>Personal details</strong><small>Your basic account information</small></div></div><div className="profile-fields">{renderFields(fields.slice(0, 3))}</div></section>
      <section className="profile-field-group study-details-group"><div className="profile-group-heading"><span className="profile-group-icon study"><Icon name="book" size={16}/></span><div><strong>Study details</strong><small>Your academic background and current studies</small></div></div><div className="profile-fields">{renderFields(fields.slice(3))}</div></section>
      {editing && <div className="profile-actions"><button className="profile-cancel" type="button" onClick={cancelEditing}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>}
    </form>
    <section className="profile-account-actions"><div><strong>Account security</strong><p>Email address is your sign-in identity. Contact support if it needs to change.</p></div><div className="profile-account-buttons">{(profile?.isAdmin === true || String(profile?.role || '').toLowerCase() === 'admin') && <button className="profile-admin-button" onClick={onOpenAdmin}><Icon name="lock" size={15}/> Admin panel</button>}<button onClick={onSignOut}>Sign out</button></div></section>
  </>
}
