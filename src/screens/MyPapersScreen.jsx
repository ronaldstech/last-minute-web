import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import { getProfileCompletion } from '../utils/profileCompletion.js'
import './MyPapersScreen.css'

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchesName(left, right) {
  const a = normalize(left)
  const b = normalize(right)
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))))
}

function assignmentMatches(assignment, paper, profile) {
  const programmeMatches = [assignment.programmeName, assignment.alias, assignment.programmeAlias, assignment.programmeCode]
    .some((name) => matchesName(name, profile.program))
  const departmentMatches = matchesName(paper.departmentName || assignment.departmentName, profile.department)
  const assignedYear = assignment.studyYear || assignment.studyYears?.[0]
  const yearMatches = !assignedYear || Number(assignedYear) === Number(profile.yearOfStudy)
  return programmeMatches && departmentMatches && yearMatches
}

function matchesProfile(paper, profile) {
  const assignments = Array.isArray(paper.programmeAssignments) ? paper.programmeAssignments : []
  const collegeName = paper.collegeName || assignments.find((assignment) => assignment.collegeName)?.collegeName
  const schoolName = paper.schoolName || assignments.find((assignment) => assignment.schoolName)?.schoolName
  if (collegeName && !matchesName(collegeName, profile.college)) return false
  if (schoolName && !matchesName(schoolName, profile.school)) return false
  if (paper.semester && Number(paper.semester) !== Number(profile.semesterNumber)) return false
  if (assignments.length) return assignments.some((assignment) => assignmentMatches(assignment, paper, profile))
  return matchesName(paper.departmentName, profile.department)
}

export default function MyPapersScreen({ papers = [], profile, emailFallback = '', savedIds = [], loading, onOpenPaper, onToggleSaved, onOpenProfile }) {
  const completion = getProfileCompletion(profile || {}, emailFallback)
  const complete = completion === 100
  const waitingForProfile = loading && !profile
  const matches = complete ? papers.filter((paper) => matchesProfile(paper, profile || {})) : []
  const reasons = Object.fromEntries(matches.map((paper) => [paper.id, [profile.program, profile.department, `Year ${profile.yearOfStudy}`, `Semester ${profile.semesterNumber}`].filter(Boolean).join(' · ')]))

  return <div className="my-papers-screen">
    <ScreenHeader kicker="YOUR STUDY PROFILE" title="My papers" description="Papers matched to your programme, department, year, and semester." action={complete ? <span className="library-count"><Icon name="file" size={16}/> {matches.length} matched</span> : null}/>
    {waitingForProfile ? <div className="my-papers-loading"><span className="notification-spinner"/>Loading your profile and papers…</div>
      : !complete ? <section className="my-papers-profile-gate"><span className="my-papers-gate-icon"><Icon name="users" size={21}/></span><div className="my-papers-gate-copy"><span className="section-kicker">PROFILE REQUIRED</span><h2>Complete your profile to see your papers</h2><p>My papers uses your study details to find papers assigned to your programme and current year. Fill in every profile field to reach 100% completion.</p><div className="my-papers-progress" aria-label={`Profile is ${completion}% complete`}><i><b style={{ width: `${completion}%` }}/></i><strong>{completion}%</strong></div><button type="button" className="primary-button" onClick={onOpenProfile}>Complete my profile <Icon name="right" size={14}/></button></div></section>
      : loading ? <div className="my-papers-loading"><span className="notification-spinner"/>Finding papers that match your profile…</div>
        : matches.length ? <PaperList layout="table" papers={matches} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave recommendationReasons={reasons}/>
          : <section className="my-papers-empty"><span><Icon name="file" size={21}/></span><h2>No papers match your study profile yet</h2><p>There are no papers in the library assigned to {profile.program}, {profile.department}, Year {profile.yearOfStudy}, Semester {profile.semesterNumber}.</p><button type="button" onClick={onOpenProfile}>Review my profile</button></section>}
  </div>
}
