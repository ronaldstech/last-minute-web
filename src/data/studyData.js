export const subjects = [
  { name: 'Biology', count: '24 papers', icon: 'flask', tone: 'mint' },
  { name: 'Chemistry', count: '18 papers', icon: 'beaker', tone: 'peach' },
  { name: 'Mathematics', count: '32 papers', icon: 'sigma', tone: 'blue' },
  { name: 'Physics', count: '16 papers', icon: 'atom', tone: 'violet' },
  { name: 'English', count: '12 papers', icon: 'book', tone: 'yellow' },
]

export const papers = [
  { id: 1, subject: 'BIOLOGY', title: 'Human physiology and health', detail: 'Biology · 2023 · 8 questions', icon: 'flask', tone: 'mint' },
  { id: 2, subject: 'MATHEMATICS', title: 'Algebra & number patterns', detail: 'Mathematics · 2022 · 12 questions', icon: 'sigma', tone: 'blue' },
  { id: 3, subject: 'CHEMISTRY', title: 'Atomic structure and bonding', detail: 'Chemistry · 2023 · 10 questions', icon: 'beaker', tone: 'peach' },
  { id: 4, subject: 'PHYSICS', title: 'Electricity and magnetism', detail: 'Physics · 2021 · 9 questions', icon: 'atom', tone: 'violet' },
  { id: 5, subject: 'ENGLISH', title: 'Reading comprehension', detail: 'English · 2023 · 6 questions', icon: 'book', tone: 'yellow' },
]

export const groups = [
  { name: 'MSCE Biology revision', subject: 'BIOLOGY · MSCE', members: '18 members', initials: ['M', 'T', 'L'], tone: 'mint' },
  { name: 'Maths problem solvers', subject: 'MATHEMATICS · MSCE', members: '12 members', initials: ['K', 'A', 'P'], tone: 'blue' },
  { name: 'Chemistry study circle', subject: 'CHEMISTRY · MSCE', members: '9 members', initials: ['C', 'E', 'J'], tone: 'peach' },
]

export const coinPacks = [
  { id: 'starter', coins: 100, bonus: 0, note: 'A quick boost' },
  { id: 'focus', coins: 250, bonus: 0, note: 'One study session' },
  { id: 'builder', coins: 500, bonus: 0, note: 'Best for regular study' },
  { id: 'scholar', coins: 1000, bonus: 100, note: 'For exam season', featured: true },
  { id: 'achiever', coins: 2500, bonus: 400, note: 'Whole semester' },
  { id: 'champion', coins: 5000, bonus: 1200, note: 'Best value' },
]
