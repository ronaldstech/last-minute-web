import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'

const filters = ['All subjects', 'Biology', 'Chemistry', 'Mathematics', 'Physics']

export default function PapersScreen({ query, setQuery, papers, onOpenPaper, savedIds, onToggleSaved, showNotice, loading }) {
  return <>
    <ScreenHeader kicker="THE PAPER LIBRARY" title="Explore papers" description="Find your next practice paper by subject, year, or topic." action={<span className="library-count"><Icon name="file" size={16} /> 102 papers</span>} />
    <div className="search-wrap screen-search"><Icon name="search" size={20} /><input aria-label="Search papers" placeholder="Search papers, subjects, or years" value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label="Filter papers" onClick={() => showNotice('Filters: All subjects · All years')}><Icon name="sliders" size={17} /></button></div>
    <div className="filter-chips">{filters.map((filter) => <button className={query === (filter === 'All subjects' ? '' : filter) ? 'active' : ''} key={filter} onClick={() => setQuery(filter === 'All subjects' ? '' : filter)}>{filter}</button>)}</div>
    <div className="results-heading"><strong>{papers.length} papers</strong><button onClick={() => showNotice('Sorted by recently added')}>Recently added <Icon name="sliders" size={14} /></button></div>
    <PaperList papers={papers} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave loading={loading} />
  </>
}
