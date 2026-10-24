import { Fragment, useRef } from 'react'

export function MathInput({ value = '', onChange, ...props }) {
  const textareaRef = useRef(null)
  const formatSelection = () => {
    const textarea = textareaRef.current
    if (!textarea || !value) return
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd
    const start = hasSelection ? textarea.selectionStart : 0
    const end = hasSelection ? textarea.selectionEnd : value.length
    const selected = value.slice(start, end)
    if (!selected.trim() || /^\\\([\s\S]*\\\)$/.test(selected.trim())) return
    const replacement = `\\(${selected}\\)`
    const next = value.slice(0, start) + replacement + value.slice(end || value.length)
    onChange(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start, start + replacement.length)
    })
  }
  return <div className="paper-math-input"><textarea {...props} ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)}/><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={formatSelection} disabled={!value.trim()}>Format selected text as math</button></div>
}

function parseMath(source) {
  let cursor = 0
  const readGroup = () => {
    if (source[cursor] === '{') {
      cursor++
      const value = readSequence('}')
      if (source[cursor] === '}') cursor++
      return value
    }
    return readAtom()
  }
  const readAtom = () => {
    if (source[cursor] === '\\') {
      cursor++
      const command = source.slice(cursor).match(/^[a-zA-Z]+/)?.[0]
      if (command) cursor += command.length
      if (command === 'frac' || command === 'dfrac' || command === 'tfrac') return <mfrac><mrow>{readGroup()}</mrow><mrow>{readGroup()}</mrow></mfrac>
      if (command === 'sqrt') return <msqrt><mrow>{readGroup()}</mrow></msqrt>
      if (!command) return <mo>{source[cursor++]}</mo>
      const symbols = { pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', sum: '∑', prod: '∏', int: '∫', times: '×', cdot: '·', le: '≤', ge: '≥', neq: '≠', infty: '∞' }
      if (command === 'sum' || command === 'prod' || command === 'int') return <mo largeop="true" movablelimits="true">{symbols[command]}</mo>
      return <mi>{symbols[command] || command || source[cursor++]}</mi>
    }
    if (source[cursor] === '(') {
      cursor++
      const contents = readSequence(')')
      if (source[cursor] === ')') cursor++
      return <mrow><mo>(</mo>{contents}<mo>)</mo></mrow>
    }
    if (source[cursor] === '{') return <mrow>{readGroup()}</mrow>
    const token = source.slice(cursor).match(/^(?:\d+(?:\.\d+)?|[a-zA-Z]+|.)/)?.[0] || ''
    cursor += token.length
    if (/^\d/.test(token)) return <mn>{token}</mn>
    if (/^[a-zA-Z]+$/.test(token)) return token.length === 1 ? <mi>{token}</mi> : <mi mathvariant="normal">{token}</mi>
    return <mo>{token === '*' ? '×' : token === '<' ? '〈' : token === '>' ? '〉' : token}</mo>
  }
  const readSequence = (end) => {
    const parts = []
    while (cursor < source.length && source[cursor] !== end) {
      if (/\s/.test(source[cursor])) { cursor++; continue }
      if (source[cursor] === '^' || source[cursor] === '_') {
        const operator = source[cursor++]
        const script = readGroup()
        const base = parts.pop() || <mi>□</mi>
        parts.push(operator === '^' ? <msup key={`sup-${cursor}`}>{base}<mrow>{script}</mrow></msup> : <msub key={`sub-${cursor}`}>{base}<mrow>{script}</mrow></msub>)
      } else if (source[cursor] === '/') {
        cursor++
        const numerator = parts.pop() || <mn>1</mn>
        parts.push(<mfrac key={`frac-${cursor}`}><mrow>{numerator}</mrow><mrow>{readAtom()}</mrow></mfrac>)
      } else parts.push(readAtom())
    }
    return parts
  }
  return readSequence('')
}

const baseNumber = String.raw`\(\s*[0-9A-F.]+\s*\)\s*(?:2|8|10|16)`
const mathCandidate = new RegExp([
  String.raw`\\\([\s\S]+?\\\)`,
  String.raw`\\(?:frac|dfrac|tfrac)\s*\{[^{}]+\}\s*\{[^{}]+\}`,
  String.raw`(?:${baseNumber}\s*(?:x|×|÷|/|\+|-)\s*${baseNumber})`,
  String.raw`[A-Za-z]\s*\([^()]*[+*/=<>-][^()]*\)\s*=\s*[A-Za-z0-9]+`,
  String.raw`(?:[A-Za-z](?:_[A-Za-z0-9]+)?|\d+(?:\.\d+)?[A-Za-z]?)(?:\s*[=+\-–*/×÷<>≤≥]\s*(?:[A-Za-z](?:_[A-Za-z0-9]+)?|\d+(?:\.\d+)?[A-Za-z]?)){1,}`,
  String.raw`\b(?:sin|cos|tan|log|ln|sqrt|exp|[fgh])\s*\([^)]*\)`,
  String.raw`\b\d+\s*\/\s*\d+\b`,
  String.raw`\b[A-Za-z]\s*\/\s*[A-Za-z0-9]+`,
  String.raw`\b[A-Za-z][A-Za-z0-9]*\s*[_^]\s*(?:\{[^}]+\}|[A-Za-z0-9]+)`,
  baseNumber,
].join('|'), 'gi')

export default function MathText({ text = '', className = '' }) {
  if (typeof text !== 'string' || !text) return null
  const matches = [...text.matchAll(mathCandidate)]
  if (!matches.length) return <>{text}</>
  const output = []
  let offset = 0
  matches.forEach((match, index) => {
    if (match.index > offset) output.push(<Fragment key={`text-${index}`}>{text.slice(offset, match.index)}</Fragment>)
    const rawExpression = match[0]
    const explicitlyMarked = /^\\\([\s\S]*\\\)$/.test(rawExpression)
    const unwrappedExpression = explicitlyMarked ? rawExpression.slice(2, -2) : rawExpression
    const expression = unwrappedExpression
      .replace(/\(\s*([0-9A-F.]+)\s*\)\s*(2|8|10|16)\b/gi, '($1)_{$2}')
      .replace(/(\)\s*_\{(?:2|8|10|16)\})\s+x\s+(?=\()/gi, '$1 \\times ')
    output.push(<math key={`math-${index}`} className={className} aria-label={`Math expression: ${expression}`}><mrow>{parseMath(expression)}</mrow></math>)
    offset = match.index + rawExpression.length
  })
  if (offset < text.length) output.push(<Fragment key="text-end">{text.slice(offset)}</Fragment>)
  return <>{output}</>
}
