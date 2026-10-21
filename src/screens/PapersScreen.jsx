import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import './PapersScreen.css'

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchesName(left, right) {
  const a = normalize(left)
  const b = normalize(right)
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))))
}

function rankPaper(paper, profile) {
  const programMatches = (paper.programmeAssignments || []).filter((assignment) => matchesName(assignment?.programmeName, profile.program))
  const departmentMatches = matchesName(paper.departmentName, profile.department)
    || (paper.programmeAssignments || []).some((assignment) => matchesName(assignment?.departmentName, profile.department))

  if (!programMatches.length && !departmentMatches) return null

  let score = programMatches.length ? 100 : 0
  const reasons = []
  if (programMatches.length) {
    reasons.push(`Matches your programme`)
    if (profile.yearOfStudy) {
      const yearMatches = programMatches.some((assignment) => Number(assignment?.studyYear) === Number(profile.yearOfStudy))
      if (yearMatches) {
        score += 20
        reasons.push(`Year ${profile.yearOfStudy}`)
      }
    }
  }
  if (departmentMatches) {
    score += 60
    if (!programMatches.length) reasons.push('Matches your department')
  }
  if (profile.semesterNumber && Number(paper.semester) === Number(profile.semesterNumber)) {
    score += 8
    reasons.push(`Semester ${profile.semesterNumber}`)
  }
  return { paper, score, reasons }
}

export default function PapersScreen({ query, setQuery, papers, allPapers = papers, profile, onOpenPaper, onOpenProfile, savedIds, onToggleSaved, loading }) {
  const [sortBy, setSortBy] = useState('recent')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState('all')
  const subjects = useMemo(() => [...new Set(allPapers.map((paper) => paper.course || paper.subject).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [allPapers])
  const recommendations = useMemo(() => allPapers
    .map((paper) => rankPaper(paper, profile || {}))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score
      || Number(right.paper.year || 0) - Number(left.paper.year || 0)
      || Number(right.paper.id || 0) - Number(left.paper.id || 0))
    .slice(0, 3), [allPapers, profile])
  const recommendationReasons = useMemo(() => Object.fromEntries(recommendations.map(({ paper, reasons }) => [paper.id, reasons.join(' · ')])), [recommendations])
  const hasStudyProfile = Boolean(profile?.program || profile?.department)
  const visiblePapers = useMemo(() => selectedSubject === 'all'
    ? papers
    : papers.filter((paper) => (paper.course || paper.subject) === selectedSubject), [papers, selectedSubject])
  const sortedPapers = useMemo(() => [...visiblePapers].sort((left, right) => {
    if (sortBy === 'year') return Number(right.year || 0) - Number(left.year || 0) || Number(right.id || 0) - Number(left.id || 0)
    if (sortBy === 'course') return String(left.course || left.subject || '').localeCompare(String(right.course || right.subject || ''))
    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0) || Number(right.id || 0) - Number(left.id || 0)
  }), [visiblePapers, sortBy])

  return <div className="papers-screen">
    <ScreenHeader kicker="THE PAPER LIBRARY" title="Explore papers" description="Find your next practice paper by subject, year, or topic." action={<span className="library-count"><Icon name="file" size={16} /> {allPapers.length} papers</span>} />

    <section className="recommendation-panel" aria-labelledby="recommendations-title">
      <div className="recommendation-heading">
        <span className="recommendation-icon"><Icon name="spark" size={18} /></span>
        <div><span className="section-kicker">PICKED FOR YOUR STUDIES</span><h2 id="recommendations-title">Recommended for you</h2><p>Matched to your programme and department.</p></div>
        {recommendations.length > 0 && <span className="recommendation-count">{recommendations.length} picks</span>}
      </div>
      {loading ? <div className="recommendation-loading"><span className="notification-spinner" /> Finding papers for your profile…</div>
        : recommendations.length > 0 ? <PaperList papers={recommendations.map(({ paper }) => paper)} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave recommendationReasons={recommendationReasons} />
          : <div className="recommendation-empty">
            <span className="recommendation-empty-icon"><Icon name={hasStudyProfile ? 'book' : 'users'} size={19} /></span>
            <div><strong>{hasStudyProfile ? 'No matching papers yet' : 'Add your study details'}</strong><p>{hasStudyProfile ? 'We’ll recommend papers when the library has papers assigned to your programme or department.' : 'Choose your programme or department to get paper recommendations tailored to your studies.'}</p></div>
            {!hasStudyProfile && <button type="button" className="recommendation-profile-link" onClick={onOpenProfile}>Complete profile <Icon name="right" size={14} /></button>}
          </div>}
    </section>

    <section className="paper-library-section" aria-label="Browse all papers">
      <div className="paper-library-heading"><div><span className="section-kicker">THE FULL LIBRARY</span><h2>Browse all papers</h2></div><span className="library-count"><Icon name="file" size={15} /> {allPapers.length} available</span></div>
      <div className="search-wrap screen-search"><Icon name="search" size={20} /><input aria-label="Search papers" placeholder="Search papers, subjects, or years" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label={filtersOpen ? 'Hide subject filters' : 'Show subject filters'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Icon name="sliders" size={17} /></button></div>
      {filtersOpen && <div className="filter-chips" role="group" aria-label="Filter papers by subject"><button type="button" className={selectedSubject === 'all' ? 'active' : ''} aria-pressed={selectedSubject === 'all'} onClick={() => setSelectedSubject('all')}>All subjects</button>{subjects.map((subject) => <button type="button" className={selectedSubject === subject ? 'active' : ''} aria-pressed={selectedSubject === subject} key={subject} onClick={() => setSelectedSubject(subject)}>{subject}</button>)}</div>}
      <div className="results-heading"><strong>{sortedPapers.length} {sortedPapers.length === 1 ? 'paper' : 'papers'}</strong><label>Sort by <select aria-label="Sort papers" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">Recently added</option><option value="year">Exam year</option><option value="course">Course name</option></select></label></div>
      {sortedPapers.length === 0 && !loading && (query || selectedSubject !== 'all')
        ? <div className="empty-panel"><span className="empty-icon"><Icon name="search" size={22}/></span><h3>No papers match those filters</h3><p>Clear your search or choose another subject to see more papers.</p><button type="button" className="primary-button" onClick={() => { setQuery(''); setSelectedSubject('all') }}>Clear search and filters</button></div>
        : <PaperList papers={sortedPapers} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave loading={loading} />}
    </section>
  </div>
}
