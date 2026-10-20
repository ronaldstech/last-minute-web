import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'

export default function HomeScreen({ query, setQuery, papers, onNavigate, onOpenPaper, savedIds, onToggleSaved, loading, guest = false }) {
  const subjectStyles = ['mint', 'peach', 'blue', 'violet', 'yellow']
  const subjectIcons = ['flask', 'beaker', 'sigma', 'atom', 'book']
  const subjectCounts = papers.reduce((counts, paper) => {
    const name = paper.course || paper.departmentName || paper.subject || 'Other'
    counts.set(name, (counts.get(name) || 0) + 1)
    return counts
  }, new Map())
  const subjects = [...subjectCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count], index) => ({
    name,
    count: `${count} ${count === 1 ? 'paper' : 'papers'}`,
    icon: subjectIcons[index % subjectIcons.length],
    tone: subjectStyles[index % subjectStyles.length],
  }))
  return <>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="sparkle"><Icon name="spark" size={13} /></span> YOUR STUDY SPACE</div>
        <h1>Ready to study?</h1>
        <p>Find a subject, open a paper, and practise at your pace.</p>
      </div>
    </section>

    <div className="search-wrap">
      <Icon name="search" size={20} />
      <input aria-label="Search subjects and papers" placeholder="Search subjects, papers, or years" value={query} onChange={(event) => setQuery(event.target.value)} />
      <kbd>⌘ K</kbd>
      <button aria-label="Search filters" onClick={() => onNavigate('Papers')}><Icon name="sliders" size={17} /></button>
    </div>

    {!guest && <section className="shortcut-row" aria-label="Study shortcuts">
      <button className="shortcut unlocked" onClick={() => onNavigate('Papers')}><span className="shortcut-icon"><Icon name="clock" /></span><span className="shortcut-copy"><strong>Unlocked papers</strong><small>Pick up where you left off</small></span><span className="arrow"><Icon name="arrow" size={15} /></span></button>
      <button className="shortcut coins" onClick={() => onNavigate('Coins')}><span className="shortcut-icon"><Icon name="coins" /></span><span className="shortcut-copy"><strong>Coins</strong><small>Top up to unlock papers</small></span><span className="arrow"><Icon name="arrow" size={15} /></span></button>
      <button className="shortcut groups" onClick={() => onNavigate('Study groups')}><span className="shortcut-icon"><Icon name="users" /></span><span className="shortcut-copy"><strong>Study groups</strong><small>Learn better together</small></span><span className="arrow"><Icon name="arrow" size={15} /></span></button>
    </section>}

    <section className="feature-banner">
      <div className="banner-content"><span className="banner-label">YOUR NEXT STUDY SESSION</span><h2>Practice makes<br />progress.</h2><p>Build confidence, one paper at a time.</p><button onClick={() => onNavigate('Papers')}>Explore the library <Icon name="right" size={14} /></button></div>
      <div className="banner-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="paper-shadow"/><div className="paper-illustration"><div className="paper-brand"><span>LM</span><i>LAST MINUTE</i></div><div className="paper-line long"/><div className="paper-line"/><div className="paper-gap"/><div className="paper-line long"/><div className="paper-line short"/><div className="paper-check"><Icon name="check" size={13} /></div></div><div className="floating-star">✦</div><div className="floating-dot"/></div>
      <div className="banner-number"><strong>100+</strong><span>papers to explore</span></div>
    </section>

    {!guest && <section className="section-block">
      <div className="section-heading"><div><span className="section-kicker">FIND YOUR FOCUS</span><h2>Browse by subject</h2></div><button className="text-link" onClick={() => onNavigate('Papers')}>See all subjects <Icon name="right" size={13} /></button></div>
      <div className="subject-grid">{subjects.slice(0, 10).map((subject) => <button className="subject-card" key={subject.name} onClick={() => { setQuery(subject.name); onNavigate('Papers') }}><span className={`subject-icon ${subject.tone}`}><Icon name={subject.icon} size={17} /></span><span className="subject-name">{subject.name}</span><span className="subject-count">{subject.count}</span><span className="subject-arrow"><Icon name="arrow" size={12} /></span></button>)}</div>
    </section>}

    {!guest && <section className="section-block recent-section">
      <div className="section-heading"><div><span className="section-kicker">FRESH FROM THE LIBRARY</span><h2>Recently added</h2></div><button className="text-link" onClick={() => onNavigate('Papers')}>Browse all papers <Icon name="right" size={13} /></button></div>
      <PaperList papers={papers.slice(0, 3)} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} loading={loading} />
    </section>}
    {guest && <section className="guest-library-cta"><strong>Explore past papers and study tools</strong><p>Sign in or create an account to browse papers, save your favourites, and track your activity.</p><button onClick={() => onNavigate('Papers')}>Get started</button></section>}
  </>
}
