import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AIResponseRenderer, hasMarkdown } from '../../components/ai/AIResponseRenderer'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { AiAnswerSource, streamAiChat } from '../../api/aiStream'
import { toApiFailure } from '../../api/errors'
import { colors } from '../../theme/colors'
import { spacing, radius, shadows } from '../../theme/spacing'
import { fonts } from '../../theme/fonts'
import { aiApi } from '../../api/ai'
import type { ChatConversation, ChatMessage } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  pending?: boolean
  /** Assistant reply still arriving. */
  streaming?: boolean
  /** Ended before completing — either cancelled or interrupted. */
  incomplete?: boolean
  /** Whether the answer used the learner's Eduraa data or general knowledge. */
  source?: AiAnswerSource | null
  /** Server message id; used to keep a retry from duplicating a reply. */
  serverMessageId?: string
  /** The prompt that produced this reply, so it can be retried. */
  promptForRetry?: string
}

const WELCOME_MESSAGE: LocalMessage = {
  id: '__welcome__',
  role: 'assistant',
  content: "Hi! I'm Eduraa AI — your personal study tutor. Ask me anything about your subjects, get explanations, or challenge yourself with questions.",
  timestamp: new Date(),
}

const SUGGESTIONS = [
  'Analyse my performance and tell me where I need to improve',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function msgTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  const reducedMotion = useReducedMotion()
  const anims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ]

  useEffect(() => {
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(a, { toValue: -5, duration: 280, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(560),
        ]),
      ),
    )
    if (reducedMotion) {
      anims.forEach(a => a.setValue(0))
      return
    }
    loops.forEach(l => l.start())
    return () => loops.forEach(l => l.stop())
  }, [reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={td.row} accessible accessibilityLabel="Eduraa AI is writing an answer">
      <View style={td.avatar}>
        <Ionicons name="sparkles" size={13} color={colors.white} />
      </View>
      <View style={[td.bubble, shadows.xs]}>
        {anims.map((a, i) => (
          <Animated.View key={i} style={[td.dot, { transform: [{ translateY: a }] }]} />
        ))}
      </View>
    </View>
  )
}

const td = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], paddingHorizontal: spacing[4] },
  avatar: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubble: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xl, borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.subtle },
})

// ─── Structured response renderer ────────────────────────────────────────────

interface AIBlock {
  type: string
  role?: string
  content?: string
  intent?: string
}

interface AIStructuredResponse {
  type: string
  blocks: AIBlock[]
}

function parseAIContent(content: string): AIStructuredResponse | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed?.type && Array.isArray(parsed?.blocks)) return parsed
    return null
  } catch {
    return null
  }
}

function AIBlocks({ blocks }: { blocks: AIBlock[] }) {
  return (
    <View style={{ gap: spacing[2] }}>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          const isPrimary = block.role === 'primary'
          const isLabel = block.role === 'label'
          const body = block.content ?? ''
          if (isLabel) {
            return (
              <Text key={i} style={mb.blockLabel}>
                {body}
              </Text>
            )
          }
          // Secondary blocks carry markdown bullets, tables and formulas.
          if (hasMarkdown(body)) {
            return (
              <AIResponseRenderer
                key={i}
                content={body}
                textStyle={isPrimary ? mb.blockPrimary : mb.blockSecondary}
              />
            )
          }
          return (
            <Text
              key={i}
              style={[mb.aiText, isPrimary ? mb.blockPrimary : mb.blockSecondary]}
            >
              {body}
            </Text>
          )
        }
        if (block.type === 'callout') {
          const isWarning = block.intent === 'warning'
          const isTip = block.intent === 'tip'
          return (
            <View
              key={i}
              style={[
                mb.callout,
                isWarning && mb.calloutWarning,
                isTip && mb.calloutTip,
              ]}
            >
              <Ionicons
                name={isWarning ? 'warning-outline' : 'bulb-outline'}
                size={13}
                color={isWarning ? colors.warning : colors.accent}
                style={{ marginTop: 1, flexShrink: 0 }}
              />
              <Text style={[mb.calloutText, isWarning && mb.calloutTextWarning]}>
                {block.content}
              </Text>
            </View>
          )
        }
        // fallback for unknown block types
        return block.content ? (
          <Text key={i} style={mb.aiText}>{block.content}</Text>
        ) : null
      })}
    </View>
  )
}

/**
 * Where the answer came from. The backend reports `inside` when it used the
 * learner's own Eduraa data and `outside` when it answered from general
 * knowledge; saying so plainly is more honest than an unqualified answer.
 */
function GroundingNote({ source }: { source: AiAnswerSource }) {
  const inside = source === 'inside'
  return (
    <View style={mb.groundingRow}>
      <Ionicons
        name={inside ? 'shield-checkmark-outline' : 'globe-outline'}
        size={12}
        color={inside ? colors.success : colors.textMuted}
      />
      <Text style={[mb.groundingText, inside && { color: colors.success }]}>
        {inside ? 'Based on your Eduraa data' : 'General knowledge, not your school data'}
      </Text>
    </View>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  msg,
  onRetry,
}: {
  msg: LocalMessage
  onRetry?: (msg: LocalMessage) => void
}) {
  const isUser = msg.role === 'user'
  const reducedMotion = useReducedMotion()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(10)).current

  useEffect(() => {
    if (reducedMotion) {
      // Appear immediately rather than sliding in.
      fadeAnim.setValue(1)
      slideAnim.setValue(0)
      return
    }
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  const structured = !isUser ? parseAIContent(msg.content) : null

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        isUser ? 'You said' : 'Eduraa AI said',
        msg.content,
        msg.streaming ? 'Still writing' : null,
        msg.incomplete ? 'Answer incomplete' : null,
        msg.source === 'inside'
          ? 'Based on your Eduraa data'
          : msg.source === 'outside'
            ? 'General knowledge, not your school data'
            : null,
        msgTime(msg.timestamp),
      ]
        .filter(Boolean)
        .join('. ')}
      style={[
        mb.row,
        isUser ? mb.userRow : mb.aiRow,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {!isUser && (
        <View style={mb.aiAvatar}>
          <Ionicons name="sparkles" size={13} color={colors.white} />
        </View>
      )}
      <View style={[mb.bubble, isUser ? mb.userBubble : mb.aiBubble, !isUser && shadows.xs]}>
        {structured ? (
          <AIBlocks blocks={structured.blocks} />
        ) : !isUser && hasMarkdown(msg.content) ? (
          <>
            <AIResponseRenderer content={msg.content} />
            {msg.streaming ? <Text style={mb.caret}>▍</Text> : null}
          </>
        ) : (
          <Text style={[mb.text, isUser ? mb.userText : mb.aiText]}>
            {msg.content}
            {msg.streaming ? <Text style={mb.caret}>▍</Text> : null}
          </Text>
        )}

        {!isUser && msg.source && !msg.incomplete ? <GroundingNote source={msg.source} /> : null}

        {!isUser && msg.incomplete && !msg.streaming && msg.promptForRetry && onRetry ? (
          <Pressable
            onPress={() => onRetry(msg)}
            accessibilityRole="button"
            accessibilityLabel="Retry this answer"
            style={({ pressed }) => [mb.retryButton, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="refresh" size={13} color={colors.accentStrong} />
            <Text style={mb.retryText}>Try again</Text>
          </Pressable>
        ) : null}

        <Text style={[mb.time, isUser ? mb.userTime : mb.aiTime]}>{msgTime(msg.timestamp)}</Text>
      </View>
    </Animated.View>
  )
})

const mb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
  },
  bubble: { maxWidth: '78%', borderRadius: radius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: 4 },
  userBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  aiBubble: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  text: { fontSize: 14, lineHeight: 22, fontFamily: fonts.regular },
  caret: { color: colors.accent, fontFamily: fonts.regular },
  groundingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  groundingText: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, color: colors.muted, flexShrink: 1 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'flex-start', minHeight: 36, marginTop: 4,
    paddingHorizontal: spacing[3], borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.borderBrand, backgroundColor: colors.accentSurface,
  },
  retryText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accentStrong },
  userText: { color: colors.white },
  aiText: { color: colors.ink, fontSize: 14, lineHeight: 22, fontFamily: fonts.regular },
  blockPrimary: { fontSize: 14, lineHeight: 22, fontWeight: '500', fontFamily: fonts.medium },
  blockSecondary: { fontSize: 13, lineHeight: 20, fontFamily: fonts.regular, color: colors.muted },
  blockLabel: {
    fontSize: 10, lineHeight: 14, fontFamily: fonts.bold, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMid,
  },
  calloutWarning: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  calloutTip: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentMid,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.accentStrong,
  },
  calloutTextWarning: { color: colors.warningText },
  time: { fontSize: 10 },
  userTime: { color: 'rgba(255,255,255,0.55)', textAlign: 'right' },
  aiTime: { color: colors.subtle },
})

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  visible,
  onClose,
  onSelect,
  onNewChat,
  activeConvId,
}: {
  visible: boolean
  onClose: () => void
  onSelect: (conv: ChatConversation) => void
  onNewChat: () => void
  activeConvId?: string
}) {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(0)).current
  const backdropAnim = useRef(new Animated.Value(0)).current

  const { data: conversations = [], isLoading, refetch } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: aiApi.listConversations,
    enabled: visible,
  })

  useEffect(() => {
    if (visible) {
      refetch()
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start()
    }
  }, [visible, slideAnim, backdropAnim, refetch])

  const { width } = useWindowDimensions()
  const panelWidth = Math.min(width * 0.82, 320)

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  })

  // Group conversations by date
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  function getGroup(dateStr: string | null): string {
    if (!dateStr) return 'Older'
    const d = new Date(dateStr)
    if (d >= today) return 'Today'
    if (d >= yesterday) return 'Yesterday'
    if (d >= sevenDaysAgo) return 'Previous 7 days'
    return 'Older'
  }

  const grouped: { label: string; items: ChatConversation[] }[] = []
  const seenGroups = new Map<string, ChatConversation[]>()
  for (const conv of conversations) {
    const g = getGroup(conv.last_message_at)
    if (!seenGroups.has(g)) {
      seenGroups.set(g, [])
      grouped.push({ label: g, items: seenGroups.get(g)! })
    }
    seenGroups.get(g)!.push(conv)
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[hp.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Side panel */}
      <Animated.View
        style={[
          hp.panel,
          { width: panelWidth, paddingTop: insets.top, transform: [{ translateX }] },
        ]}
      >
        {/* Panel header */}
        <View style={hp.header}>
          <View style={hp.headerLeft}>
            <View style={hp.logo}>
              <Ionicons name="sparkles" size={14} color={colors.white} />
            </View>
            <Text style={hp.title}>Eduraa AI</Text>
          </View>
          <TouchableOpacity
          style={hp.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close conversation history"
        >
            <Ionicons name="close" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* New chat button */}
        <TouchableOpacity
          style={hp.newBtn}
          onPress={() => { onNewChat(); onClose() }}
          activeOpacity={0.8}
        >
          <View style={hp.newBtnIcon}>
            <Ionicons name="add" size={16} color={colors.accent} />
          </View>
          <Text style={hp.newBtnText}>New conversation</Text>
        </TouchableOpacity>

        <View style={hp.divider} />

        {/* Conversation list */}
        {isLoading ? (
          <View style={hp.loading}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={hp.empty}>
            <Text style={hp.emptyText}>No past conversations yet</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
            {grouped.map(group => (
              <View key={group.label}>
                <Text style={hp.groupLabel}>{group.label}</Text>
                {group.items.map(conv => {
                  const isActive = conv.id === activeConvId
                  return (
                    <TouchableOpacity
                      key={conv.id}
                      style={[hp.convRow, isActive && hp.convRowActive]}
                      onPress={() => { onSelect(conv); onClose() }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={14}
                        color={isActive ? colors.accent : colors.subtle}
                        style={{ marginTop: 1, flexShrink: 0 }}
                      />
                      <View style={{ flex: 1, overflow: 'hidden' }}>
                        <Text style={[hp.convTitle, isActive && hp.convTitleActive]} numberOfLines={1}>
                          {conv.title || 'New chat'}
                        </Text>
                        {conv.last_message_at ? (
                          <Text style={hp.convTime}>{relativeTime(conv.last_message_at)}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  )
}

const hp = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,25,23,0.4)',
  },
  panel: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: colors.card,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[4], paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  logo: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', fontFamily: fonts.displayBold, color: colors.ink, letterSpacing: -0.2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: radius.md,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
  },

  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    marginHorizontal: spacing[3], marginVertical: spacing[3],
    paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.accentMid,
    backgroundColor: colors.accentLight,
  },
  newBtnIcon: {
    width: 26, height: 26, borderRadius: radius.sm,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  newBtnText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, color: colors.accent },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: spacing[2] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  empty: { paddingTop: spacing[6], alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.subtle },

  groupLabel: {
    fontSize: 10, fontWeight: '700', color: colors.subtle,
    textTransform: 'uppercase', letterSpacing: 0.7,
    paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1],
  },
  convRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3],
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.lg, marginHorizontal: spacing[2],
  },
  convRowActive: { backgroundColor: colors.accentLight },
  convTitle: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, color: colors.ink },
  convTitleActive: { fontWeight: '700', color: colors.accentStrong },
  convTime: { fontSize: 11, color: colors.subtle, marginTop: 2 },
})

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIStudioScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<LocalMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [activeConvTitle, setActiveConvTitle] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const listRef = useRef<FlatList>(null)
  const inputRef = useRef<TextInput>(null)

  const showSuggestions = messages.length === 1 && !loading

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80)
  }, [])

  // ── Send a message (streamed) ───────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const [thinking, setThinking] = useState(false)

  const runStream = useCallback(
    async (content: string, retryOf?: string) => {
      // Guard against a duplicate tap landing a second request.
      if (inFlightRef.current) return
      inFlightRef.current = true

      const controller = new AbortController()
      abortRef.current = controller

      const assistantId = `a_${Date.now()}`
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          streaming: true,
          promptForRetry: content,
        },
      ])
      setLoading(true)
      setThinking(true)
      scrollToEnd()

      const appendToken = (chunk: string) => {
        setThinking(false)
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
        )
      }

      const outcome = await streamAiChat(
        { message: content, conversation_id: conversationId },
        {
          onMeta: convId => {
            if (convId) setConversationId(convId)
          },
          onThinking: () => setThinking(true),
          onToken: appendToken,
        },
        controller.signal,
      )

      setThinking(false)
      setLoading(false)
      inFlightRef.current = false
      abortRef.current = null

      setMessages(prev =>
        prev.map(m => {
          if (m.id !== assistantId) return m
          if (outcome.status === 'completed') {
            return {
              ...m,
              streaming: false,
              source: outcome.done.source ?? null,
              serverMessageId: outcome.done.message_id,
              // An empty completed reply is still a failure to answer.
              content: m.content || 'No answer came back. Send again to retry.',
              incomplete: !m.content,
            }
          }
          if (outcome.status === 'cancelled') {
            // Keep whatever arrived; the learner asked us to stop.
            return { ...m, streaming: false, incomplete: true, content: m.content || 'Stopped before any answer arrived.' }
          }
          if (outcome.status === 'stream_error') {
            return { ...m, streaming: false, incomplete: true, content: m.content ? `${m.content}\n\n${outcome.message}` : outcome.message }
          }
          const failure = toApiFailure(outcome.failure)
          return {
            ...m,
            streaming: false,
            incomplete: true,
            content: m.content ? `${m.content}\n\n${failure.message}` : failure.message,
          }
        }),
      )

      if (outcome.status === 'completed' && outcome.done.conversation_id) {
        setConversationId(outcome.done.conversation_id)
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
      }

      // Streaming text is invisible to a screen reader, so state the outcome.
      AccessibilityInfo.announceForAccessibility(
        outcome.status === 'completed'
          ? 'Answer complete'
          : outcome.status === 'cancelled'
            ? 'Answer stopped'
            : 'Answer failed. A retry button is available.',
      )
      scrollToEnd()
      return retryOf
    },
    [conversationId, queryClient, scrollToEnd],
  )

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim()
      if (!content || inFlightRef.current) return

      setMessages(prev => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', content, timestamp: new Date() },
      ])
      setInput('')
      scrollToEnd()
      await runStream(content)
    },
    [input, runStream, scrollToEnd],
  )

  /** Stop an in-flight reply, keeping the partial text. */
  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /**
   * Retry a failed reply. The failed bubble is replaced rather than appended to,
   * so a retry cannot leave two answers to one question.
   */
  const retryMessage = useCallback(
    async (failed: LocalMessage) => {
      if (!failed.promptForRetry || inFlightRef.current) return
      setMessages(prev => prev.filter(m => m.id !== failed.id))
      await runStream(failed.promptForRetry)
    },
    [runStream],
  )

  // Abort a stream still running when the screen goes away.
  useEffect(() => () => abortRef.current?.abort(), [])

  // ── New chat ────────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([WELCOME_MESSAGE])
    setConversationId(undefined)
    setActiveConvTitle(null)
    setInput('')
    setLoading(false)
  }, [])

  // ── Load a past conversation ────────────────────────────────────────────────
  const loadConversation = useCallback(async (conv: ChatConversation) => {
    setLoadingHistory(true)
    setConversationId(conv.id)
    setActiveConvTitle(conv.title)
    try {
      const msgs = await aiApi.getMessages(conv.id)
      const localMsgs: LocalMessage[] = msgs.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
      }))
      setMessages(localMsgs.length > 0 ? localMsgs : [WELCOME_MESSAGE])
      scrollToEnd(false)
    } catch {
      setMessages([WELCOME_MESSAGE])
    } finally {
      setLoadingHistory(false)
    }
  }, [scrollToEnd])

  const canSend = input.trim().length > 0 && !loading

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing[2] }]}>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => setShowHistory(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open conversation history"
        >
          <Ionicons name="menu" size={20} color={colors.ink} />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {activeConvTitle || 'Eduraa AI'}
          </Text>
          {!activeConvTitle && (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>online</Text>
            </View>
          )}
        </View>

        <View style={{ width: 40 }} />
      </View>

      {/* ─── Keyboard wrapper — KEY FIX ──────────────────────────────────── */}
      {/*
        behavior="padding" pushes content up by keyboard height.
        keyboardVerticalOffset must be 0 here — the KAV is below our
        custom topBar, so there is nothing above it to offset.
        The topBar is OUTSIDE the KAV so it doesn't move.
      */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {loadingHistory ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Loading conversation…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <MessageBubble msg={item} onRetry={retryMessage} />}
            contentContainerStyle={styles.messageList}
            ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
            onContentSizeChange={() => scrollToEnd(false)}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListFooterComponent={
              loading ? (
                <View style={styles.streamFooter}>
                  {thinking ? <TypingDots /> : <View />}
                  <Pressable
                    onPress={cancelStream}
                    accessibilityRole="button"
                    accessibilityLabel="Stop generating"
                    style={({ pressed }) => [styles.stopButton, pressed && { opacity: 0.75 }]}
                  >
                    <Ionicons name="stop" size={13} color={colors.accentStrong} />
                    <Text style={styles.stopText}>Stop</Text>
                  </Pressable>
                </View>
              ) : null
            }
          />
        )}

        {/* Suggestions */}
        {showSuggestions && (
          <View style={styles.suggestions}>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => sendMessage(SUGGESTIONS[0])}
              activeOpacity={0.8}
            >
              <View style={styles.chipIconWrap}>
                <Ionicons name="bar-chart-outline" size={15} color={colors.accent} />
              </View>
              <Text style={styles.chipText}>{SUGGESTIONS[0]}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
            inputFocused && styles.inputBarFocused,
          ]}
        >
          <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Ask Eduraa…"
              placeholderTextColor={colors.placeholder}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
            <TouchableOpacity
              style={[styles.sendBtn, canSend && styles.sendBtnActive]}
              onPress={() => sendMessage()}
              disabled={!canSend}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Waiting for the current answer' : 'Send message'}
              accessibilityState={{ disabled: !canSend, busy: loading }}
            >
              <Ionicons
                name="arrow-up"
                size={17}
                color={canSend ? colors.white : colors.subtle}
              />
            </TouchableOpacity>
          </View>
          {input.length > 200 && (
            <Text style={styles.charCount}>{input.length}/2000</Text>
          )}
          <Text style={styles.disclaimer}>Eduraa AI can make mistakes. Verify important info.</Text>
        </View>
      </KeyboardAvoidingView>

      {/* History panel */}
      <HistoryPanel
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={loadConversation}
        onNewChat={startNewChat}
        activeConvId={conversationId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  streamFooter: {
    marginTop: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  stopText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accentStrong },
  root: { flex: 1, backgroundColor: colors.surface1 },
  kav: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    ...shadows.xs,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  topCenter: { flex: 1, alignItems: 'center', gap: 3 },
  topTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.displaySemibold, color: colors.ink, letterSpacing: -0.2 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  onlineText: { fontSize: 11, color: colors.success, fontWeight: '600' },

  // Messages
  messageList: { padding: spacing[4], paddingBottom: spacing[3] },

  loadingCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3],
  },
  loadingText: { fontSize: 14, color: colors.muted },

  // Suggestions
  suggestions: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.accentMid,
    backgroundColor: colors.accentLight,
  },
  chipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipText: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, color: colors.accentStrong },

  // Input bar
  inputBar: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inputBarFocused: {
    borderTopColor: colors.accentMid,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
    paddingVertical: spacing[2],
    minHeight: 50,
    gap: spacing[2],
  },
  inputWrapFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
    maxHeight: 130,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
    lineHeight: 22,
  },
  sendBtn: {
    width: 36, height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginBottom: 1,
  },
  sendBtnActive: { backgroundColor: colors.accent },
  charCount: { textAlign: 'right', fontSize: 10, color: colors.subtle, marginTop: 3 },
  disclaimer: {
    textAlign: 'center', fontSize: 10, color: colors.subtle,
    marginTop: spacing[2], marginBottom: spacing[1],
  },
})
