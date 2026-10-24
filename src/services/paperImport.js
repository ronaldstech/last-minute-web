const PDF_LIMIT = 35 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['.docx', '.pdf', '.json'])

function fileExtension(fileName = '') {
  return fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
}

function paperTitleFromFile(fileName = '') {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported paper'
}

function normalizeSubquestion(part, index = 0) {
  const marks = part.marks === null || part.marks === undefined || part.marks === ''
    ? null
    : Number.isFinite(Number(part.marks)) ? Number(part.marks) : null
  return {
    ...part,
    id: String(part.id || `sq-${index + 1}`),
    number: String(part.number ?? String.fromCharCode(97 + index)),
    text: String(part.text || part.prompt || ''),
    marks,
    subquestions: Array.isArray(part.subquestions) ? part.subquestions.map(normalizeSubquestion) : [],
  }
}

function normalizeQuestion(question, index) {
  const content = Array.isArray(question.content)
    ? question.content
    : typeof question.content === 'string'
      ? [{ type: 'paragraph', text: question.content }]
      : typeof question.text === 'string' || typeof question.prompt === 'string'
        ? [{ type: 'paragraph', text: question.text || question.prompt }]
        : []
  return {
    ...question,
    id: String(question.id || `q-${index + 1}`),
    number: String(question.number ?? index + 1),
    order: Number(question.order ?? index + 1),
    type: String(question.type || 'structured'),
    marks: question.marks === null || question.marks === undefined || question.marks === ''
      ? null
      : Number.isFinite(Number(question.marks)) ? Number(question.marks) : null,
    content: content.map((block) => typeof block === 'string' ? { type: 'paragraph', text: block } : block),
    subquestions: Array.isArray(question.subquestions) ? question.subquestions.map(normalizeSubquestion) : [],
    assets: Array.isArray(question.assets) ? question.assets : [],
    source_location: question.source_location || { page_start: 1, page_end: 1 },
  }
}

function parseTextIntoQuestions(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const questions = []
  let active = null
  let activeSub = null
  let lastQuestionNumber = 0
  const flushSub = () => {
    if (!activeSub || !active) return
    const rawText = activeSub.text.join(' ').trim()
    // Roman-numbered prompts often follow a marked lettered heading on the same
    // extracted PDF line (for example, "Arrays (5 marks) i. Define...").
    const nestedParts = [...rawText.matchAll(/(?:^|\s)(i{1,3}|iv|v|vi{0,3}|ix|x)[.)]\s+/gi)]
    const part = { id: `sq-${crypto.randomUUID()}`, number: activeSub.number, text: '', marks: null, subquestions: [] }
    if (nestedParts.length) {
      const preamble = rawText.slice(0, nestedParts[0].index).trim()
      const parent = splitMarks(preamble)
      part.text = parent.text
      for (let index = 0; index < nestedParts.length; index++) {
        const marker = nestedParts[index]
        const start = marker.index + marker[0].length
        const end = nestedParts[index + 1]?.index ?? rawText.length
        const child = splitMarks(rawText.slice(start, end))
        part.subquestions.push({ id: `sq-${crypto.randomUUID()}`, number: marker[1].toLowerCase(), text: child.text, marks: child.marks, subquestions: [] })
      }
      const childMarks = part.subquestions.map((child) => child.marks).filter(Number.isFinite)
      part.marks = parent.marks ?? (childMarks.length ? childMarks.reduce((sum, mark) => sum + mark, 0) : null)
    } else {
      const { marks, text: body } = splitMarks(rawText)
      part.text = body
      part.marks = marks
    }
    active.subquestions.push(part)
    activeSub = null
  }
  const flushQuestion = () => {
    flushSub()
    if (!active) return
    const { marks, text: body } = splitMarks(active.paragraphs.join('\n'))
    if (body) active.content.push({ type: 'paragraph', text: body })
    if (!active.marks && marks) active.marks = marks
    if (active.subquestions.length) {
      const subMarks = active.subquestions.map((part) => part.marks).filter(Number.isFinite)
      if (subMarks.length) active.marks = subMarks.reduce((sum, mark) => sum + mark, 0)
    }
    questions.push(normalizeQuestion(active, questions.length))
    active = null
  }

  for (const line of lines) {
    const header = /^(?:question\s+|q\.?\s*)?(\d{1,3})\s*[).:\]]\s*(.*)$/i.exec(line)
    const dottedAddress = /^\d{1,3}(?:\.\d{1,3}){2,3}\b/.test(line)
    if (header && !dottedAddress && Number(header[1]) === lastQuestionNumber + 1) {
      flushQuestion()
      lastQuestionNumber = Number(header[1])
      const { marks, text: title } = splitMarks(header[2])
      active = { id: `q-${crypto.randomUUID()}`, number: header[1], order: questions.length + 1, type: 'structured', marks, content: title ? [{ type: 'paragraph', text: title }] : [], subquestions: [], assets: [], source_location: { page_start: 1, page_end: 1 }, paragraphs: [] }
      continue
    }
    const sub = /^\(?([a-h]|\d{1,2})\)?[).:]\s*(.*)$/i.exec(line)
    if (active && sub && !dottedAddress) {
      flushSub()
      activeSub = { number: sub[1].toLowerCase(), text: [sub[2]] }
    } else if (activeSub) activeSub.text.push(line)
    else if (active) active.paragraphs.push(line)
  }
  flushQuestion()
  if (!questions.length && lines.length) {
    questions.push(normalizeQuestion({ number: '1', content: [{ type: 'paragraph', text: lines.join('\n') }], subquestions: [] }, 0))
  }
  return questions
}

function splitMarks(text = '') {
  const match = /\s*[([]\s*(\d+)\s*marks?\s*[)\]]\s*$/i.exec(text)
  return match
    ? { marks: Number(match[1]), text: text.slice(0, match.index).trim() }
    : { marks: null, text: text.trim() }
}

function textImportPaper(text, fileName) {
  if (!text.trim()) throw new Error('No readable text was found in this file.')
  return {
    title: paperTitleFromFile(fileName), course: '', year: '', semester: '',
    questions: parseTextIntoQuestions(text),
  }
}

function parseJsonPaper(source, fileName) {
  let parsed
  try { parsed = JSON.parse(source) } catch { throw new Error('This JSON file has a syntax error.') }
  const paper = Array.isArray(parsed) ? { questions: parsed } : (parsed.paper || parsed.examPaper || parsed)
  if (!paper || typeof paper !== 'object' || Array.isArray(paper)) throw new Error('JSON must contain a paper object or a questions array.')
  let questions
  if (Array.isArray(paper.questions)) questions = paper.questions.map(normalizeQuestion)
  else if (typeof paper.text === 'string' || typeof paper.content === 'string') questions = parseTextIntoQuestions(paper.text || paper.content)
  else throw new Error('No questions found. Add a "questions" array or a "text" field.')
  if (!questions.length) throw new Error('The JSON paper has no questions to review.')
  return {
    title: String(paper.title || paper.examType || paperTitleFromFile(fileName)),
    course: String(paper.course || ''), year: String(paper.year || ''), semester: String(paper.semester || ''),
    questions,
  }
}

async function inflate(bytes, format = 'deflate') {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the imported document. Use a recent version of Chrome, Edge, or Firefox.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZipEntry(buffer, entryName) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let end = bytes.length - 22
  const searchStart = Math.max(0, bytes.length - 22 - 65535)
  while (end >= searchStart && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < searchStart) throw new Error('This Word file is not a valid DOCX archive.')
  const entryCount = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    if (name === entryName) {
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return compressed
      if (method === 8) return inflate(compressed, 'deflate-raw')
      throw new Error(`DOCX compression method ${method} is not supported.`)
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('Could not find the main document text in this Word file.')
}

async function importDocx(file) {
  const xmlBytes = await readZipEntry(await file.arrayBuffer(), 'word/document.xml')
  const xml = new TextDecoder().decode(xmlBytes)
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('The Word document contains invalid document XML.')
  const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const numbering = new Map()
  try {
    const numberingBytes = await readZipEntry(await file.arrayBuffer(), 'word/numbering.xml')
    const numberingDocument = new DOMParser().parseFromString(new TextDecoder().decode(numberingBytes), 'application/xml')
    const abstracts = new Map([...numberingDocument.getElementsByTagNameNS(wordNamespace, 'abstractNum')].map((item) => [item.getAttributeNS(wordNamespace, 'abstractNumId'), item]))
    for (const item of numberingDocument.getElementsByTagNameNS(wordNamespace, 'num')) {
      const id = item.getAttributeNS(wordNamespace, 'numId')
      const abstractId = item.getElementsByTagNameNS(wordNamespace, 'abstractNumId')[0]?.getAttributeNS(wordNamespace, 'val')
      numbering.set(id, { abstract: abstracts.get(abstractId), overrides: [...item.getElementsByTagNameNS(wordNamespace, 'lvlOverride')] })
    }
  } catch {
    // Some Word documents contain no automatic list numbering.
  }
  const paragraphs = [...document.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p')]
  const wordMathNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
  const listCounters = new Map()
  const wordChild = (node, name) => [...(node?.children || [])].find((child) => child.namespaceURI === wordNamespace && child.localName === name)
  const wordValue = (node, name = 'val') => node?.getAttributeNS(wordNamespace, name) || ''
  const alphaNumber = (number) => {
    let value = ''
    for (let current = number; current > 0; current = Math.floor((current - 1) / 26)) value = String.fromCharCode(97 + ((current - 1) % 26)) + value
    return value
  }
  const romanNumber = (number) => {
    const pairs = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
    let output = ''
    for (const [value, numeral] of pairs) while (number >= value) { output += numeral; number -= value }
    return output
  }
  const formatListNumber = (number, format) => {
    if (format === 'lowerLetter') return alphaNumber(number)
    if (format === 'upperLetter') return alphaNumber(number).toUpperCase()
    if (format === 'lowerRoman') return romanNumber(number).toLowerCase()
    if (format === 'upperRoman') return romanNumber(number)
    if (format === 'decimalZero') return String(number).padStart(2, '0')
    return String(number)
  }
  const paragraphListMarker = (paragraph) => {
    const properties = wordChild(paragraph, 'pPr')
    const listProperties = wordChild(properties, 'numPr')
    const numId = wordValue(wordChild(listProperties, 'numId'))
    if (!numId || numId === '0') return ''
    const level = Number(wordValue(wordChild(listProperties, 'ilvl')) || 0)
    const definition = numbering.get(numId)
    const levelOverride = definition?.overrides.find((item) => Number(wordValue(item, 'ilvl')) === level)
    const levelDefinition = wordChild(levelOverride, 'lvl') || [...(definition?.abstract?.getElementsByTagNameNS(wordNamespace, 'lvl') || [])].find((item) => Number(wordValue(item, 'ilvl')) === level)
    if (!levelDefinition) return ''
    const startOverride = Number(wordValue(wordChild(levelOverride, 'startOverride')))
    const start = startOverride || Number(wordValue(wordChild(levelDefinition, 'start')) || 1)
    const key = `${numId}:${level}`
    const counter = listCounters.has(key) ? listCounters.get(key) + 1 : start
    listCounters.set(key, counter)
    for (const existingKey of listCounters.keys()) {
      const [existingNumId, existingLevel] = existingKey.split(':')
      if (existingNumId === numId && Number(existingLevel) > level) listCounters.delete(existingKey)
    }
    const numberFormat = wordValue(wordChild(levelDefinition, 'numFmt')) || 'decimal'
    return `${formatListNumber(counter, numberFormat)}. `
  }
  const mathChildren = (node) => [...node.children].filter((child) => child.namespaceURI === wordMathNamespace)
  const mathText = (node) => {
    const name = node.localName
    const children = mathChildren(node)
    const child = (childName) => children.find((item) => item.localName === childName)
    const content = (childName) => child(childName) ? mathText(child(childName)) : ''
    if (name === 't') return node.textContent || ''
    if (name === 'r') return [...node.getElementsByTagNameNS(wordMathNamespace, 't')].map((text) => text.textContent || '').join('')
    if (name === 'f') return `\\frac{${content('num')}}{${content('den')}}`
    if (name === 'sSup') return `${content('e')}^{${content('sup')}}`
    if (name === 'sSub') return `${content('e')}_{${content('sub')}}`
    if (name === 'sSubSup') return `${content('e')}_{${content('sub')}}^{${content('sup')}}`
    if (name === 'rad') return `\\sqrt{${content('e')}}`
    if (name === 'nary') {
      const properties = child('naryPr')
      const operator = properties?.getElementsByTagNameNS(wordMathNamespace, 'chr')[0]?.getAttributeNS(wordMathNamespace, 'val') || '∑'
      const lower = content('sub')
      const upper = content('sup')
      return `\\${operator === '∏' ? 'prod' : operator === '∫' ? 'int' : 'sum'}${lower ? `_{${lower}}` : ''}${upper ? `^{${upper}}` : ''}${content('e')}`
    }
    if (name === 'd') {
      const expression = content('e')
      const properties = child('dPr')
      const begin = properties?.getElementsByTagNameNS(wordMathNamespace, 'begChr')[0]?.getAttributeNS(wordMathNamespace, 'val') || '('
      const end = properties?.getElementsByTagNameNS(wordMathNamespace, 'endChr')[0]?.getAttributeNS(wordMathNamespace, 'val') || ')'
      const open = begin === '{' ? '\\{' : begin
      const close = end === '}' ? '\\}' : end
      return `${open}${expression}${close}`
    }
    if (name === 'oMath' || name === 'oMathPara' || name === 'e' || name === 'num' || name === 'den' || name === 'sub' || name === 'sup') return children.map(mathText).join('')
    return children.filter((item) => !['fPr', 'sSupPr', 'sSubPr', 'sSubSupPr', 'radPr', 'dPr', 'rPr'].includes(item.localName)).map(mathText).join('')
  }
  const lines = paragraphs.map((paragraph) => {
    const output = []
    const visit = (node) => {
      if (node.namespaceURI === wordMathNamespace && (node.localName === 'oMath' || node.localName === 'oMathPara')) {
        const equation = mathText(node).trim()
        if (equation) output.push(`\\(${equation}\\)`)
        return
      }
      if (node.namespaceURI === 'http://schemas.openxmlformats.org/wordprocessingml/2006/main') {
        if (node.localName === 't') { output.push(node.textContent || ''); return }
        if (node.localName === 'tab') { output.push('\t'); return }
        if (node.localName === 'br' || node.localName === 'cr') { output.push('\n'); return }
      }
      for (const child of node.children || []) visit(child)
    }
    visit(paragraph)
    const text = output.join('').trim()
    const listMarker = paragraphListMarker(paragraph)
    return listMarker && !text.startsWith(listMarker.trim()) ? `${listMarker}${text}` : text
  }).filter(Boolean)
  return textImportPaper(lines.join('\n'), file.name)
}

async function importPdf(file) {
  if (file.size > PDF_LIMIT) throw new Error('PDF is larger than 35 MB. Split it into smaller files and import them separately.')
  const [pdfjsLib, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  let document
  try {
    document = await loadingTask.promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = []
      let line = ''
      let previousY = null
      const flushLine = () => {
        const value = line.replace(/\uFFFD/g, ' ').replace(/\u01AF/g, 'ff').replace(/\s+/g, ' ').trim()
        if (value) lines.push(value)
        line = ''
      }
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string') continue
        const y = item.transform?.[5]
        if (previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 1) flushLine()
        line += item.str
        previousY = y
        if (item.hasEOL) flushLine()
      }
      flushLine()
      pages.push(lines.join('\n'))
      page.cleanup()
    }
    return textImportPaper(pages.join('\n'), file.name)
  } catch (error) {
    if (error instanceof Error && error.message) throw error
    throw new Error('Could not read text from this PDF. Try exporting it as a searchable PDF or importing a Word document.')
  } finally {
    await loadingTask.destroy()
  }
}
export async function importPaperFile(file) {
  if (!file) throw new Error('Choose a file to import.')
  const extension = fileExtension(file.name)
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error('Choose a Word document (.docx), PDF (.pdf), or JSON (.json) file.')
  if (extension === '.json') return parseJsonPaper(await file.text(), file.name)
  if (extension === '.docx') return importDocx(file)
  return importPdf(file)
}
