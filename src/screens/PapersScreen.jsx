import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'

export default function PapersScreen({ query, setQuery, papers, allPapers = papers, onOpenPaper, savedIds, onToggleSaved, loading }) {
  const [sortBy, setSortBy] = useState('recent')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const filters = useMemo(() => ['All subjects', ...new Set(allPapers.map((paper) => paper.course || paper.subject).filter(Boolean))].slice(0, 6), [allPapers])
  const sortedPapers = useMemo(() => [...papers].sort((left, right) => {
    if (sortBy === 'year') return Number(right.year || 0) - Number(left.year || 0) || Number(right.id || 0) - Number(left.id || 0)
    if (sortBy === 'course') return String(left.course || left.subject || '').localeCompare(String(right.course || right.subject || ''))
    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0) || Number(right.id || 0) - Number(left.id || 0)
  }), [papers, sortBy])
  return <>
    <ScreenHeader kicker="THE PAPER LIBRARY" title="Explore papers" description="Find your next practice paper by subject, year, or topic." action={<span className="library-count"><Icon name="file" size={16} /> {allPapers.length} papers</span>} />
    <div className="search-wrap screen-search"><Icon name="search" size={20} /><input aria-label="Search papers" placeholder="Search papers, subjects, or years" value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label={filtersOpen ? 'Hide subject filters' : 'Show subject filters'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Icon name="sliders" size={17} /></button></div>
    {filtersOpen && <div className="filter-chips">{filters.map((filter) => <button className={query === (filter === 'All subjects' ? '' : filter) ? 'active' : ''} key={filter} onClick={() => setQuery(filter === 'All subjects' ? '' : filter)}>{filter}</button>)}</div>}
    <div className="results-heading"><strong>{papers.length} {papers.length === 1 ? 'paper' : 'papers'}</strong><label>Sort by <select aria-label="Sort papers" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recent">Recently added</option><option value="year">Exam year</option><option value="course">Course name</option></select></label></div>
    <PaperList papers={sortedPapers} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave loading={loading} />
  </>
}
