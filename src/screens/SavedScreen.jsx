import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'
import './SavedScreen.css'

function searchText(paper) {
  return [paper.title, paper.course, paper.subject, paper.departmentName, paper.year, paper.semester,
    ...(paper.programmeAssignments || []).flatMap((item) => [item.programmeName, item.studyYear])]
    .filter(Boolean).join(' ').toLowerCase()
}

export default function SavedScreen({ papers, savedIds, loading, onToggleSaved, onOpenPaper, onBrowse }) {
  const [query, setQuery] = useState('')
  const [selectedModule, setSelectedModule] = useState('all')
  const [selectedYear, setSelectedYear] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const savedPapers = papers.filter((paper) => savedIds.includes(paper.id))
  const modules = useMemo(() => [...new Set(savedPapers.map((paper) => paper.course || paper.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [savedPapers])
  const years = useMemo(() => [...new Set(savedPapers.map((paper) => String(paper.year || '')).filter((year) => year && year !== '0'))].sort((a, b) => Number(b) - Number(a)), [savedPapers])
  const filteredPapers = useMemo(() => savedPapers.filter((paper) =>
    (!query.trim() || searchText(paper).includes(query.trim().toLowerCase()))
    && (selectedModule === 'all' || (paper.course || paper.subject) === selectedModule)
    && (selectedYear === 'all' || String(paper.year || '') === selectedYear)),
  [savedPapers, query, selectedModule, selectedYear])
  const sortedPapers = useMemo(() => [...filteredPapers].sort((a, b) => {
    if (sortBy === 'year') return Number(b.year || 0) - Number(a.year || 0) || Number(b.id || 0) - Number(a.id || 0)
    if (sortBy === 'module') return String(a.course || a.subject || '').localeCompare(String(b.course || b.subject || ''))
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0)
  }), [filteredPapers, sortBy])
  const clearFilters = () => { setQuery(''); setSelectedModule('all'); setSelectedYear('all') }
  const hasFilters = Boolean(query || selectedModule !== 'all' || selectedYear !== 'all')

  return <div className="saved-screen">
    <ScreenHeader kicker="YOUR COLLECTION" title="Saved papers" description="Keep your study papers together and return to them whenever you’re ready." action={<span className="library-count"><Icon name="bookmark" size={16} /> {savedPapers.length.toLocaleString()} saved</span>} />
    {loading ? <div className="notification-state"><span className="notification-spinner"/><p>Loading your saved papers…</p></div> : savedPapers.length === 0 ? (
      <div className="empty-panel"><span className="empty-icon"><Icon name="bookmark" size={24} /></span><h3>No saved papers yet</h3><p>Bookmark papers from the library and they’ll show up here.</p><button className="primary-button" onClick={onBrowse}>Explore papers <Icon name="right" size={15} /></button></div>
    ) : <>
      <div className="saved-overview" aria-label="Saved papers overview">
        <article><span className="saved-overview-icon violet"><Icon name="bookmark" size={16}/></span><div><small>Saved papers</small><strong>{savedPapers.length.toLocaleString()}</strong></div></article>
        <article><span className="saved-overview-icon blue"><Icon name="book" size={16}/></span><div><small>Modules</small><strong>{modules.length.toLocaleString()}</strong></div></article>
        <article><span className="saved-overview-icon mint"><Icon name="check" size={16}/></span><div><small>Unlocked</small><strong>{savedPapers.filter((paper) => paper.isUnlocked).length.toLocaleString()}</strong></div></article>
      </div>
      <section className="saved-library" aria-label="Your saved papers">
        <div className="saved-search-wrap search-wrap"><Icon name="search" size={20}/><input aria-label="Search saved papers" placeholder="Search by title, module, department, programme, or year" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button type="button" className="saved-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={15}/></button>}<button type="button" className={`saved-filter-toggle ${filtersOpen ? 'active' : ''}`} aria-label={filtersOpen ? 'Hide saved paper filters' : 'Show saved paper filters'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Icon name="sliders" size={17}/><span>Filters</span></button></div>
        {filtersOpen && <div className="saved-filter-selectors"><label><span>Module</span><select aria-label="Filter saved papers by module" value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)}><option value="all">All modules</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label><label><span>Exam year</span><select aria-label="Filter saved papers by year" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">Any year</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>}
        <div className="saved-results-heading"><div><strong>{sortedPapers.length.toLocaleString()} {sortedPapers.length === 1 ? 'paper' : 'papers'}</strong><span>{hasFilters ? `matching ${savedPapers.length} saved` : 'in your collection'}</span>{hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div><label>Sort by <select aria-label="Sort saved papers" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">Recently added</option><option value="year">Exam year</option><option value="module">Module name</option></select></label></div>
        {sortedPapers.length ? <PaperList layout="table" papers={sortedPapers} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave /> : <div className="empty-panel saved-no-results"><span className="empty-icon"><Icon name="search" size={22}/></span><h3>No saved papers match</h3><p>Try another search, module, or exam year.</p><button type="button" className="primary-button" onClick={clearFilters}>Clear filters</button></div>}
      </section>
    </>}
  </div>
}
