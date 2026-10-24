const mathPatterns = [
  ['Formula', /\\\([\s\S]+?\\\)|\$[^$]+\$/],
  ['Equation', /(?:\\begin\{(?:equation|align|gather)\}|(?<![A-Za-z])(?:[A-Za-z](?:_[A-Za-z0-9]+)?|\d+(?:\.\d+)?[A-Za-z]?)(?:\s*[+\-–*/×÷=<>≤≥]\s*(?:[A-Za-z](?:_[A-Za-z0-9]+)?|\d+(?:\.\d+)?[A-Za-z]?)){1,}(?![A-Za-z]))/],
  ['Fraction', /(?:\\(?:d|t)?frac\s*\{|(?<![A-Za-z])\d+\s*\/\s*\d+(?![A-Za-z])|(?<![A-Za-z])\b[A-Za-z]\s*\/\s*[A-Za-z0-9]+\b)/],
  ['Function', /\b(?:[fgh]|sin|cos|tan|log|ln|sqrt|exp)\s*\(\s*[^)]*\)/i],
  ['Formula', /(?:\\(?:sum|int|sqrt|pi|theta|alpha|beta)\b|[×÷±√∑∫≤≥≠]|\b[A-Za-z][A-Za-z0-9]*\s*[_^]\s*(?:\{[^}]+\}|[A-Za-z0-9]+)|\(\s*[0-9A-F.]+\s*\)\s*(?:2|8|10|16)\b)/i],
]

export function detectMath(text = '') {
  if (typeof text !== 'string' || !text.trim()) return []
  return mathPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
}

export function questionHasMath(question) {
  if (!question) return false
  const contentHasMath = (question.content || []).some((block) => detectMath(block?.text || block?.code || '').length > 0)
  return contentHasMath || detectMath(question.text || question.prompt || '').length > 0 || (question.subquestions || []).some(questionHasMath)
}
