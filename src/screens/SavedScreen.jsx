import Icon from '../components/Icon.jsx'
import PaperList from '../components/PaperList.jsx'
import ScreenHeader from '../components/ScreenHeader.jsx'

export default function SavedScreen({ papers, savedIds, loading, onToggleSaved, onOpenPaper, onBrowse }) {
  const savedPapers = papers.filter((paper) => savedIds.includes(paper.id))
  if (loading) return <><ScreenHeader kicker="YOUR COLLECTION" title="Saved papers" description="A handy place for the papers you want to come back to." /><div className="notification-state"><span className="notification-spinner"/><p>Loading your saved papers…</p></div></>
  return <>
    <ScreenHeader kicker="YOUR COLLECTION" title="Saved papers" description="A handy place for the papers you want to come back to." action={<span className="library-count"><Icon name="bookmark" size={16} /> {savedPapers.length} saved</span>} />
    {savedPapers.length > 0 ? <PaperList papers={savedPapers} savedIds={savedIds} onOpen={onOpenPaper} onToggleSaved={onToggleSaved} showSave /> : (
      <div className="empty-panel"><span className="empty-icon"><Icon name="bookmark" size={24} /></span><h3>No saved papers yet</h3><p>Bookmark papers from the library and they’ll show up here.</p><button className="primary-button" onClick={onBrowse}>Explore papers <Icon name="right" size={15} /></button></div>
    )}
  </>
}
