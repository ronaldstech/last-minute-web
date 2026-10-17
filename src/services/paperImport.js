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

function tableToken(id) {
  return `\uE000TABLE-${id}\uE001`
}

function tableFromRows(rows) {
  const normalized = rows.map((row) => row.map((cell) => cell === null || cell === undefined ? '' : String(cell).trim()))
  const width = Math.max(1, ...normalized.map((row) => row.length))
  const padded = normalized.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')])
  const firstRow = padded.shift() || []
  return { type: 'table', title: '', columns: firstRow.map((cell, index) => cell || `Column ${index + 1}`), rows: padded }
}

function parseTextIntoQuestions(text, tables = new Map()) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const questions = []
  let active = null
  let activeSub = null
  let pendingTables = []
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
  const flushParagraphs = () => {
    if (!active?.paragraphs.length) return
    const { marks, text: body } = splitMarks(active.paragraphs.join('\n'))
    if (body) active.content.push({ type: 'paragraph', text: body })
    if (!active.marks && marks) active.marks = marks
    active.paragraphs = []
  }
  const flushQuestion = () => {
    flushSub()
    if (!active) return
    flushParagraphs()
    if (active.subquestions.length) {
      const subMarks = active.subquestions.map((part) => part.marks).filter(Number.isFinite)
      if (subMarks.length) active.marks = subMarks.reduce((sum, mark) => sum + mark, 0)
    }
    questions.push(normalizeQuestion(active, questions.length))
    active = null
  }

  for (const line of lines) {
    if (tables.has(line)) {
      if (active) {
        flushSub()
        flushParagraphs()
        active.content.push(tables.get(line))
      } else pendingTables.push(tables.get(line))
      continue
    }
    const header = /^(?:question\s+|q\.?\s*)?(\d{1,3})\s*[).:\]]\s*(.*)$/i.exec(line)
    if (header && Number(header[1]) > lastQuestionNumber) {
      flushQuestion()
      lastQuestionNumber = Number(header[1])
      const { marks, text: title } = splitMarks(header[2])
      active = { id: `q-${crypto.randomUUID()}`, number: header[1], order: questions.length + 1, type: 'structured', marks, content: title ? [{ type: 'paragraph', text: title }] : [], subquestions: [], assets: [], source_location: { page_start: 1, page_end: 1 }, paragraphs: [] }
      active.content.unshift(...pendingTables)
      pendingTables = []
      continue
    }
    const sub = /^\(?([a-h]|\d{1,2})\)?[).:]\s*(.*)$/i.exec(line)
    if (active && sub) {
      flushSub()
      activeSub = { number: sub[1].toLowerCase(), text: [sub[2]] }
    } else if (activeSub) activeSub.text.push(line)
    else if (active) active.paragraphs.push(line)
  }
  flushQuestion()
  if (!questions.length && lines.length) {
    const content = []
    const paragraphs = []
    const flush = () => {
      if (paragraphs.length) content.push({ type: 'paragraph', text: paragraphs.join('\n') })
      paragraphs.length = 0
    }
    for (const line of lines) {
      if (tables.has(line)) { flush(); content.push(tables.get(line)) }
      else paragraphs.push(line)
    }
    flush()
    questions.push(normalizeQuestion({ number: '1', content, subquestions: [] }, 0))
  }
  return questions
}

function splitMarks(text = '') {
  const match = /\s*[([]\s*(\d+)\s*marks?\s*[)\]]\s*$/i.exec(text)
  return match
    ? { marks: Number(match[1]), text: text.slice(0, match.index).trim() }
    : { marks: null, text: text.trim() }
}

function textImportPaper(text, fileName, tables = new Map()) {
  if (!text.trim()) throw new Error('No readable text was found in this file.')
  return {
    title: paperTitleFromFile(fileName), course: '', year: '', semester: '',
    questions: parseTextIntoQuestions(text, tables),
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
  const readParagraph = (paragraph) => {
    const output = []
    for (const node of paragraph.getElementsByTagName('*')) {
      if (node.localName === 't') output.push(node.textContent || '')
      else if (node.localName === 'tab') output.push('\t')
      else if (node.localName === 'br' || node.localName === 'cr') output.push('\n')
    }
    return output.join('').trim()
  }
  const body = document.getElementsByTagNameNS(wordNamespace, 'body')[0]
  const tables = new Map()
  const lines = []
  for (const node of [...(body?.children || [])]) {
    if (node.localName === 'p') {
      const text = readParagraph(node)
      if (text) lines.push(text)
      continue
    }
    if (node.localName !== 'tbl') continue
    const rows = [...node.getElementsByTagNameNS(wordNamespace, 'tr')].map((row) => (
      [...row.getElementsByTagNameNS(wordNamespace, 'tc')].map((cell) => (
        [...cell.getElementsByTagNameNS(wordNamespace, 'p')].map(readParagraph).filter(Boolean).join('\n')
      ))
    )).filter((row) => row.some((cell) => cell.trim()))
    if (!rows.length) continue
    const token = tableToken(crypto.randomUUID())
    tables.set(token, tableFromRows(rows))
    lines.push(token)
  }
  return textImportPaper(lines.join('\n'), file.name, tables)
}

function bytesToBinary(bytes) {
  let result = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) result += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return result
}

async function pdfStreams(bytes) {
  const binary = bytesToBinary(bytes)
  const streams = []
  let searchAt = 0
  while (true) {
    const streamAt = binary.indexOf('stream', searchAt)
    if (streamAt < 0) break
    const dictionaryStart = binary.lastIndexOf('<<', streamAt)
    const dictionary = dictionaryStart >= 0 && streamAt - dictionaryStart < 4096 ? binary.slice(dictionaryStart, streamAt) : ''
    let dataStart = streamAt + 6
    if (binary[dataStart] === '\r' && binary[dataStart + 1] === '\n') dataStart += 2
    else if (binary[dataStart] === '\n' || binary[dataStart] === '\r') dataStart++
    const length = /\/Length\s+(\d+)\b/.exec(dictionary)
    const endAt = length ? dataStart + Number(length[1]) : binary.indexOf('endstream', dataStart)
    if (endAt < dataStart || endAt < 0 || endAt > binary.length) { searchAt = streamAt + 6; continue }
    const raw = bytes.subarray(dataStart, endAt)
    let decoded = raw
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { decoded = await inflate(raw, 'deflate') } catch {
        try { decoded = await inflate(raw, 'deflate-raw') } catch { searchAt = endAt + 9; continue }
      }
    }
    const text = bytesToBinary(decoded)
    if (/\/Subtype\s*\/Image/.test(dictionary)) { searchAt = endAt + 9; continue }
    if ((text.includes('BT') && /\bT[Jj]\b/.test(text)) || text.includes('begincmap')) streams.push(text)
    searchAt = endAt + 9
  }
  return streams
}

function decodePdfLiteral(value, characterMap = new Map()) {
  const output = []
  for (let index = 1; index < value.length - 1; index++) {
    const char = value[index]
    if (char !== '\\') { output.push(char); continue }
    const next = value[++index]
    if (next === 'n') output.push('\n')
    else if (next === 'r') output.push('\r')
    else if (next === 't') output.push('\t')
    else if (next === 'b') output.push('\b')
    else if (next === 'f') output.push('\f')
    else if (next === '\r' || next === '\n') { if (next === '\r' && value[index + 1] === '\n') index++ }
    else if (/[0-7]/.test(next || '')) {
      let octal = next
      for (let count = 0; count < 2 && /[0-7]/.test(value[index + 1] || ''); count++) octal += value[++index]
      output.push(String.fromCharCode(parseInt(octal, 8)))
    } else output.push(next || '')
  }
  return decodePdfCodes(output.join(''), characterMap)
}

function decodePdfHex(value, characterMap = new Map()) {
  let hex = value.slice(1, -1).replace(/\s/g, '')
  if (hex.length % 2) hex += '0'
  const bytes = Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  return decodePdfCodes(bytesToBinary(bytes), characterMap)
}

function unicodeFromHex(hex) {
  let normalized = hex.replace(/\s/g, '')
  if (normalized.length % 4) normalized = normalized.padStart(Math.ceil(normalized.length / 4) * 4, '0')
  const bytes = Uint8Array.from(normalized.match(/../g) || [], (pair) => parseInt(pair, 16))
  return new TextDecoder('utf-16be').decode(bytes)
}

function decodePdfCodes(value, characterMap) {
  if (!characterMap.size) return new TextDecoder('windows-1252').decode(Uint8Array.from(value, (character) => character.charCodeAt(0) & 255))
  const lengths = [...new Set([...characterMap.keys()].map((key) => key.length))].sort((a, b) => b - a)
  let output = ''
  for (let index = 0; index < value.length;) {
    let mapped
    let consumed = 0
    for (const length of lengths) {
      const byteLength = Math.ceil(length / 2)
      const source = Array.from(value.slice(index, index + byteLength), (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()
      if (characterMap.has(source)) { mapped = characterMap.get(source); consumed = byteLength; break }
    }
    if (consumed) { output += mapped; index += consumed }
    else {
      output += new TextDecoder('windows-1252').decode(Uint8Array.of(value.charCodeAt(index) & 255))
      index++
    }
  }
  return output
}

function parsePdfCharacterMap(streams) {
  const characterMap = new Map()
  for (const stream of streams.filter((item) => item.includes('begincmap'))) {
    for (const section of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) characterMap.set(pair[1].toUpperCase(), unicodeFromHex(pair[2]))
    }
    for (const section of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const ranges = /<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]*)\])/gi
      for (const range of section[1].matchAll(ranges)) {
        const start = parseInt(range[1], 16)
        const end = parseInt(range[2], 16)
        const width = range[1].length
        if (end - start > 4096) continue
        if (range[5] !== undefined) {
          const targets = [...range[5].matchAll(/<([\da-f]+)>/gi)].map((item) => item[1])
          for (let offset = 0; offset <= end - start && offset < targets.length; offset++) characterMap.set((start + offset).toString(16).padStart(width, '0').toUpperCase(), unicodeFromHex(targets[offset]))
        } else {
          const destination = parseInt(range[4], 16)
          for (let code = start; code <= end; code++) characterMap.set(code.toString(16).padStart(width, '0').toUpperCase(), unicodeFromHex((destination + code - start).toString(16).padStart(range[4].length, '0')))
        }
      }
    }
  }
  return characterMap
}

function pdfStringsInArray(array, characterMap) {
  const items = array.match(/\((?:\\.|[^\\)])*\)|<[\da-f\s]*>/gi) || []
  return items.map((item) => item.startsWith('(') ? decodePdfLiteral(item, characterMap) : decodePdfHex(item, characterMap)).join('')
}

function extractPdfText(stream, characterMap, tables) {
  const positioned = []
  const number = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[Ee][-+]?\\d+)?'
  const operationPattern = new RegExp(`(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+Tm|(${number})\\s+(${number})\\s+(Td|TD)|T\\*|\\[((?:[^\\]\\\\]|\\\\.)*)\\]\\s*TJ|(<[\\da-f\\s]*>|\\((?:\\\\.|[^\\\\)])*\\))\\s*Tj|\\((?:\\\\.|[^\\\\)])*\\)\\s*['\"]`, 'gi')
  for (const textObject of stream.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = textObject[1]
    const font = /(?:^|\s)(\d+(?:\.\d+)?)\s+Tf\b/.exec(body)
    const fontSize = Math.max(5, Number(font?.[1] || 10))
    let x = 0
    let y = 0
    let lineX = 0
    let lineY = 0
    for (const match of body.matchAll(operationPattern)) {
      if (match[1] !== undefined) { x = Number(match[5]); y = Number(match[6]); lineX = x; lineY = y; continue }
      if (match[7] !== undefined) { x += Number(match[7]); y += Number(match[8]); lineX = x; lineY = y; continue }
      if (match[0] === 'T*') { x = lineX; y = lineY - fontSize * 1.2; lineY = y; continue }
      const token = match[10] !== undefined ? `[${match[10]}]` : match[11] || match[0].trim().slice(0, -1).trim()
      const text = token.startsWith('[') ? pdfStringsInArray(token, characterMap) : token.startsWith('<') ? decodePdfHex(token, characterMap) : decodePdfLiteral(token, characterMap)
      const clean = text.split('').filter((character) => {
        const code = character.charCodeAt(0)
        return code >= 32 || code === 9 || code === 10 || code === 13
      }).join('').trim()
      if (clean) positioned.push({ x, y, text: clean, fontSize })
    }
  }

  positioned.sort((left, right) => right.y - left.y || left.x - right.x)
  const lines = []
  for (const item of positioned) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5)
    if (!line) { line = { y: item.y, cells: [] }; lines.push(line) }
    line.cells.push(item)
  }
  lines.sort((left, right) => right.y - left.y)
  const rows = lines.map((line) => {
    line.cells.sort((left, right) => left.x - right.x)
    const cells = []
    const cellPositions = []
    for (const item of line.cells) {
      const previous = cells[cells.length - 1]
      const previousItem = line.cells[cells.length - 1]
      const gap = previousItem ? item.x - (previousItem.x + previousItem.text.length * previousItem.fontSize * 0.48) : 0
      if (!previous || gap > Math.max(18, item.fontSize * 1.6)) { cells.push(item.text); cellPositions.push(item.x) }
      else cells[cells.length - 1] = `${previous} ${item.text}`
    }
    return { cells, cellPositions, text: cells.join(' ') }
  })

  const output = []
  for (let index = 0; index < rows.length;) {
    if (rows[index].cells.length < 2) { if (rows[index].text) output.push(rows[index].text); index++; continue }
    let end = index + 1
    while (end < rows.length && rows[end].cells.length === rows[index].cells.length && rows[end].cellPositions.every((position, column) => Math.abs(position - rows[index].cellPositions[column]) <= 24)) end++
    if (end - index < 2) { output.push(rows[index].text); index++; continue }
    const token = tableToken(crypto.randomUUID())
    tables.set(token, tableFromRows(rows.slice(index, end).map((row) => row.cells)))
    output.push(token)
    index = end
  }
  return output
}

async function importPdf(file) {
  if (file.size > PDF_LIMIT) throw new Error('PDF is larger than 35 MB. Split it into smaller files and import them separately.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = new TextDecoder().decode(bytes.subarray(0, 5))
  if (!signature.startsWith('%PDF-')) throw new Error('This file is not a valid PDF.')
  const streams = await pdfStreams(bytes)
  const characterMap = parsePdfCharacterMap(streams)
  const tables = new Map()
  const pages = streams.filter((stream) => stream.includes('BT')).flatMap((stream) => extractPdfText(stream, characterMap, tables)).filter(Boolean)
  const text = pages.join('\n')
  if (!text.trim()) throw new Error('No selectable text was found. This PDF may be scanned; use a text-based PDF, Word document, or JSON import.')
  return textImportPaper(text, file.name, tables)
}

export async function importPaperFile(file) {
  if (!file) throw new Error('Choose a file to import.')
  const extension = fileExtension(file.name)
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error('Choose a Word document (.docx), PDF (.pdf), or JSON (.json) file.')
  if (extension === '.json') return parseJsonPaper(await file.text(), file.name)
  if (extension === '.docx') return importDocx(file)
  return importPdf(file)
}
