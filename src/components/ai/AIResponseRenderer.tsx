import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing } from '../../theme'
import { fonts } from '../../theme/fonts'

/**
 * Renders the markdown the AI backend actually emits.
 *
 * The B2B and B2C orchestrators put markdown inside `text` blocks and prompt the
 * model for bold, bullet lists, markdown tables, LaTeX, and fenced mermaid
 * diagrams (see backend prompts.py and b2b_response_orchestrator.py). Rendering
 * those as plain text showed students literal `**bold**` and raw fence markers.
 *
 * Deliberate limits, to avoid claiming more than we can do:
 *  - LaTeX is presented as a marked formula block, not typeset. We have no math
 *    engine, and silently mangling notation is worse than showing it plainly.
 *  - A mermaid fence is labelled as a diagram definition rather than drawn.
 */

type Segment = { text: string; bold?: boolean; italic?: boolean; code?: boolean }

type Node =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'heading'; level: number; segments: Segment[] }
  | { kind: 'bullet'; segments: Segment[] }
  | { kind: 'numbered'; index: number; segments: Segment[] }
  | { kind: 'code'; language?: string; content: string }
  | { kind: 'formula'; content: string; display: boolean }
  | { kind: 'table'; header: string[]; rows: string[][] }

/** Inline emphasis and code. Handles **bold**, *italic*, _italic_, `code`. */
function parseInline(raw: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > last) segments.push({ text: raw.slice(last, match.index) })
    const token = match[0]
    if (token.startsWith('**')) segments.push({ text: token.slice(2, -2), bold: true })
    else if (token.startsWith('`')) segments.push({ text: token.slice(1, -1), code: true })
    else segments.push({ text: token.slice(1, -1), italic: true })
    last = match.index + token.length
  }
  if (last < raw.length) segments.push({ text: raw.slice(last) })
  return segments.length ? segments : [{ text: raw }]
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

const TABLE_DIVIDER = /^\s*\|?[\s:-]*-{2,}[\s:|-]*\|?\s*$/

export function parseAIMarkdown(input: string): Node[] {
  const nodes: Node[] = []
  const lines = (input ?? '').replace(/\r\n/g, '\n').split('\n')
  let numberedRun = 0

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      numberedRun = 0
      continue
    }

    // Fenced code / diagram definitions.
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || undefined
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i])
        i += 1
      }
      nodes.push({ kind: 'code', language, content: body.join('\n') })
      numberedRun = 0
      continue
    }

    // Display math on its own line.
    if (trimmed.startsWith('$$')) {
      const single = trimmed.length > 4 && trimmed.endsWith('$$')
      if (single) {
        nodes.push({ kind: 'formula', content: trimmed.slice(2, -2).trim(), display: true })
      } else {
        const body: string[] = []
        i += 1
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          body.push(lines[i])
          i += 1
        }
        if (i < lines.length) body.push(lines[i].trim().replace(/\$\$$/, ''))
        nodes.push({ kind: 'formula', content: body.join('\n').trim(), display: true })
      }
      numberedRun = 0
      continue
    }

    // Markdown table: a header row followed by a divider row.
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header = splitTableRow(trimmed)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      i -= 1
      nodes.push({ kind: 'table', header, rows })
      numberedRun = 0
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      nodes.push({ kind: 'heading', level: heading[1].length, segments: parseInline(heading[2]) })
      numberedRun = 0
      continue
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      nodes.push({ kind: 'bullet', segments: parseInline(bullet[1]) })
      numberedRun = 0
      continue
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed)
    if (numbered) {
      numberedRun += 1
      nodes.push({ kind: 'numbered', index: Number(numbered[1]) || numberedRun, segments: parseInline(numbered[2]) })
      continue
    }

    nodes.push({ kind: 'paragraph', segments: parseInline(trimmed) })
    numberedRun = 0
  }

  return nodes
}

/** True when the text contains markup worth rendering structurally. */
export function hasMarkdown(input: string) {
  return /(\*\*|```|^\s*[-*]\s|\n\s*[-*]\s|\|\s*-{2,}|\$\$|^#{1,4}\s|\n#{1,4}\s|\d+[.)]\s)/.test(input ?? '')
}

function Inline({ segments, style }: { segments: Segment[]; style?: any }) {
  return (
    <>
      {segments.map((segment, index) => (
        <Text
          key={index}
          style={[
            style,
            segment.bold && s.bold,
            segment.italic && s.italic,
            segment.code && s.inlineCode,
          ]}
        >
          {segment.text}
        </Text>
      ))}
    </>
  )
}

function CodeBlock({ language, content }: { language?: string; content: string }) {
  const isDiagram = (language ?? '').toLowerCase() === 'mermaid'
  return (
    <View style={s.codeBlock} accessible accessibilityLabel={isDiagram ? 'Diagram definition' : 'Code block'}>
      <View style={s.codeHeader}>
        <Ionicons name={isDiagram ? 'git-network-outline' : 'code-slash-outline'} size={12} color={colors.textMuted} />
        <Text style={s.codeLabel}>{isDiagram ? 'Diagram definition' : (language || 'code')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={s.codeText}>{content}</Text>
      </ScrollView>
    </View>
  )
}

function FormulaBlock({ content }: { content: string }) {
  return (
    <View style={s.formulaBlock} accessible accessibilityLabel={`Formula: ${content}`}>
      <Text style={s.formulaLabel}>Formula</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={s.formulaText}>{content}</Text>
      </ScrollView>
    </View>
  )
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  const columns = Math.max(header.length, ...rows.map((row) => row.length))
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tableScroll}>
      <View style={s.table}>
        <View style={[s.tableRow, s.tableHeaderRow]}>
          {Array.from({ length: columns }).map((_, c) => (
            <View key={`h-${c}`} style={s.tableCell}>
              <Text style={s.tableHeaderText}>{header[c] ?? ''}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, r) => (
          <View key={`r-${r}`} style={s.tableRow}>
            {Array.from({ length: columns }).map((_, c) => (
              <View key={`c-${r}-${c}`} style={s.tableCell}>
                <Inline segments={parseInline(row[c] ?? '')} style={s.tableCellText} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

export function AIResponseRenderer({ content, textStyle }: { content: string; textStyle?: any }) {
  const nodes = useMemo(() => parseAIMarkdown(content), [content])

  return (
    <View style={s.root}>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'heading':
            return (
              <Text key={index} style={[s.heading, node.level >= 3 && s.headingSmall]}>
                <Inline segments={node.segments} />
              </Text>
            )
          case 'bullet':
            return (
              <View key={index} style={s.listRow}>
                <View style={s.bulletDot} />
                <Text style={[s.body, textStyle, s.listText]}>
                  <Inline segments={node.segments} style={[s.body, textStyle]} />
                </Text>
              </View>
            )
          case 'numbered':
            return (
              <View key={index} style={s.listRow}>
                <Text style={s.numberedIndex}>{node.index}.</Text>
                <Text style={[s.body, textStyle, s.listText]}>
                  <Inline segments={node.segments} style={[s.body, textStyle]} />
                </Text>
              </View>
            )
          case 'code':
            return <CodeBlock key={index} language={node.language} content={node.content} />
          case 'formula':
            return <FormulaBlock key={index} content={node.content} />
          case 'table':
            return <TableBlock key={index} header={node.header} rows={node.rows} />
          default:
            return (
              <Text key={index} style={[s.body, textStyle]}>
                <Inline segments={node.segments} style={[s.body, textStyle]} />
              </Text>
            )
        }
      })}
    </View>
  )
}

const s = StyleSheet.create({
  root: { gap: spacing[2] },
  body: { fontSize: 14, lineHeight: 22, fontFamily: fonts.regular, color: colors.ink },
  bold: { fontFamily: fonts.bold },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: colors.backgroundMuted,
    color: colors.accentStrong,
    fontSize: 13,
  },
  heading: { fontSize: 16, lineHeight: 22, fontFamily: fonts.displaySemibold, color: colors.ink, marginTop: 2 },
  headingSmall: { fontSize: 14, lineHeight: 20 },
  listRow: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  listText: { flex: 1 },
  bulletDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.accent, marginTop: 8, flexShrink: 0,
  },
  numberedIndex: {
    fontSize: 13, lineHeight: 22, fontFamily: fonts.bold,
    color: colors.accentStrong, minWidth: 18, flexShrink: 0,
  },
  codeBlock: {
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing[3],
    gap: spacing[2],
  },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  codeLabel: {
    fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  codeText: { fontFamily: 'Courier', fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  formulaBlock: {
    borderRadius: radius.md,
    backgroundColor: colors.infoSurface,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 2,
  },
  formulaLabel: {
    fontSize: 10, fontFamily: fonts.bold, color: colors.info,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  formulaText: { fontFamily: 'Courier', fontSize: 13, lineHeight: 20, color: colors.ink },
  tableScroll: { borderRadius: radius.md },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableHeaderRow: { backgroundColor: colors.backgroundMuted },
  tableCell: {
    minWidth: 96, maxWidth: 200,
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border,
  },
  tableHeaderText: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink },
  tableCellText: { fontSize: 12, lineHeight: 18, fontFamily: fonts.regular, color: colors.textSecondary },
})

export default AIResponseRenderer
