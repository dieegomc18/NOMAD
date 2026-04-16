import { useMemo, useState, type CSSProperties } from 'react'
import { CheckCircle2, Clipboard, Lightbulb, MapPin, Plus, ShoppingBag, Sparkles, Star, Trash2, Utensils } from 'lucide-react'
import { useTripStore } from '../../store/tripStore'
import { useCanDo } from '../../store/permissionsStore'
import { useToast } from '../shared/Toast'
import type { TodoItem } from '../../types'

const INBOX_CATEGORY = 'Inbox'

const QUICK_TYPES = [
  { id: 'Place', label: 'Place', icon: MapPin, color: '#3b82f6', placeholder: 'Add a place idea...' },
  { id: 'Food', label: 'Food', icon: Utensils, color: '#ef4444', placeholder: 'Add a food idea...' },
  { id: 'Shopping', label: 'Shopping', icon: ShoppingBag, color: '#f59e0b', placeholder: 'Add a shopping idea...' },
  { id: 'Reminder', label: 'Reminder', icon: Lightbulb, color: '#10b981', placeholder: 'Add a reminder...' },
  { id: 'Must go', label: 'Must go', icon: Star, color: '#facc15', placeholder: 'Add a must-go idea...' },
]

function getInboxType(item: TodoItem): string {
  const match = item.description?.match(/Type:\s*([^\n]+)/i)
  return match?.[1]?.trim() || 'Idea'
}

function getCleanDescription(item: TodoItem): string {
  return (item.description || '')
    .split('\n')
    .filter(line => !line.trim().toLowerCase().startsWith('type:'))
    .join('\n')
    .trim()
}

function parseIdeaName(value: string): string {
  return value
    .replace(/^add\s+/i, '')
    .replace(/^look\s+into\s+/i, '')
    .replace(/^check\s+/i, '')
    .trim()
}

interface TripInboxPanelProps {
  tripId: number | string
  items: TodoItem[]
  onCreatePlaceIdea: (name: string, notes?: string) => void
}

export default function TripInboxPanel({ tripId, items, onCreatePlaceIdea }: TripInboxPanelProps) {
  const { addTodoItem, updateTodoItem, deleteTodoItem, toggleTodoItem } = useTripStore()
  const canEdit = useCanDo('packing_edit')
  const toast = useToast()
  const [text, setText] = useState('')
  const [details, setDetails] = useState('')
  const [quickType, setQuickType] = useState(QUICK_TYPES[0].id)
  const [saving, setSaving] = useState(false)

  const openItems = useMemo(
    () => items
      .filter(item => item.category === INBOX_CATEGORY && !item.checked)
      .sort((a, b) => (a.priority || 99) - (b.priority || 99) || b.id - a.id),
    [items]
  )

  const doneItems = useMemo(
    () => items.filter(item => item.category === INBOX_CATEGORY && !!item.checked).slice(-8).reverse(),
    [items]
  )

  const activeType = QUICK_TYPES.find(type => type.id === quickType) || QUICK_TYPES[0]

  const addIdea = async () => {
    const name = text.trim()
    if (!name || saving || !canEdit) return
    setSaving(true)
    try {
      await addTodoItem(tripId, {
        name,
        category: INBOX_CATEGORY,
        description: [`Type: ${quickType}`, details.trim()].filter(Boolean).join('\n'),
        priority: quickType === 'Must go' ? 1 : 0,
      } as Partial<TodoItem>)
      setText('')
      setDetails('')
      toast.success('Saved to trip inbox')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save inbox idea')
    } finally {
      setSaving(false)
    }
  }

  const promoteMustGo = async (item: TodoItem) => {
    try {
      await updateTodoItem(tripId, item.id, {
        priority: item.priority === 1 ? 0 : 1,
        description: item.description?.includes('Type:')
          ? item.description
          : [`Type: Must go`, item.description || ''].filter(Boolean).join('\n'),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update idea')
    }
  }

  const copyForCodex = async () => {
    const lines = openItems.map((item, index) => {
      const type = getInboxType(item)
      const note = getCleanDescription(item)
      return `${index + 1}. [${type}${item.priority === 1 ? ', must-go' : ''}] ${item.name}${note ? ` - ${note}` : ''}`
    })
    const prompt = [
      'Process these NOMAD trip inbox ideas:',
      ...lines,
      '',
      'Please deduplicate against existing places, add real places with correct address/coordinates/category/notes, and suggest where they fit in the itinerary.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Copied Codex prompt')
    } catch {
      toast.error('Could not copy prompt')
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-primary)', padding: 16 }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
        <section style={{
          borderRadius: 24,
          padding: 18,
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--bg-card)), var(--bg-card))',
          border: '1px solid var(--border-faint)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: 'var(--text-primary)', color: 'var(--bg-card)', display: 'grid', placeItems: 'center' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>Trip Inbox</h2>
              <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Drop messy ideas from the iPhone. We can clean, map, and schedule them later.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {QUICK_TYPES.map(type => {
              const Icon = type.icon
              const active = quickType === type.id
              return (
                <button key={type.id} onClick={() => setQuickType(type.id)} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: active ? `1px solid ${type.color}` : '1px solid var(--border-faint)',
                  borderRadius: 999,
                  background: active ? `${type.color}22` : 'var(--bg-secondary)',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                  <Icon size={13} color={type.color} fill={type.id === 'Must go' && active ? type.color : 'none'} />
                  {type.label}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addIdea() } }}
              placeholder={activeType.placeholder}
              disabled={!canEdit}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--border-primary)',
                borderRadius: 16,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: '13px 14px',
                fontSize: 16,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Optional notes: why it matters, TikTok rec, location hint, price, etc."
              disabled={!canEdit}
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--border-faint)',
                borderRadius: 16,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: 14,
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <button onClick={addIdea} disabled={!text.trim() || saving || !canEdit} style={{
              border: 'none',
              borderRadius: 16,
              background: !text.trim() || saving || !canEdit ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: !text.trim() || saving || !canEdit ? 'var(--text-faint)' : 'var(--accent-text)',
              padding: '12px 14px',
              fontSize: 14,
              fontWeight: 800,
              cursor: !text.trim() || saving || !canEdit ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}>
              <Plus size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Save idea
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>Open ideas</h3>
              <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>{openItems.length} waiting to be processed.</p>
            </div>
            <button onClick={copyForCodex} disabled={openItems.length === 0} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--border-faint)',
              borderRadius: 999,
              background: 'var(--bg-card)',
              color: openItems.length ? 'var(--text-primary)' : 'var(--text-faint)',
              padding: '8px 11px',
              cursor: openItems.length ? 'pointer' : 'default',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}>
              <Clipboard size={13} />
              Copy for Codex
            </button>
          </div>

          {openItems.length === 0 ? (
            <div style={{ border: '1px dashed var(--border-primary)', borderRadius: 18, padding: 24, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
              No loose ideas. Suspiciously organized. I respect it.
            </div>
          ) : openItems.map(item => {
            const type = getInboxType(item)
            const note = getCleanDescription(item)
            const typeMeta = QUICK_TYPES.find(t => t.id === type) || QUICK_TYPES[0]
            const Icon = typeMeta.icon
            return (
              <article key={item.id} style={{
                border: '1px solid var(--border-faint)',
                borderRadius: 18,
                background: 'var(--bg-card)',
                padding: 14,
                display: 'grid',
                gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 13, background: `${typeMeta.color}22`, color: typeMeta.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={16} fill={type === 'Must go' || item.priority === 1 ? typeMeta.color : 'none'} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{item.name}</strong>
                      {item.priority === 1 && <span style={{ color: '#ca8a04', background: 'rgba(250,204,21,0.18)', borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 800 }}>Must go</span>}
                      <span style={{ color: typeMeta.color, background: `${typeMeta.color}18`, borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>{type}</span>
                    </div>
                    {note && <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.45 }}>{note}</p>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleTodoItem(tripId, item.id, true)} style={actionButtonStyle()}>
                    <CheckCircle2 size={13} /> Done
                  </button>
                  <button onClick={() => promoteMustGo(item)} style={actionButtonStyle(item.priority === 1 ? '#facc15' : undefined)}>
                    <Star size={13} fill={item.priority === 1 ? '#facc15' : 'none'} /> Must go
                  </button>
                  <button onClick={() => onCreatePlaceIdea(parseIdeaName(item.name), note)} style={actionButtonStyle()}>
                    <MapPin size={13} /> Add as place
                  </button>
                  <button onClick={() => deleteTodoItem(tripId, item.id)} style={actionButtonStyle('#ef4444')}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        {doneItems.length > 0 && (
          <section style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 15 }}>Recently done</h3>
            {doneItems.map(item => (
              <button key={item.id} onClick={() => toggleTodoItem(tripId, item.id, false)} style={{
                border: '1px solid var(--border-faint)',
                borderRadius: 14,
                background: 'var(--bg-secondary)',
                color: 'var(--text-muted)',
                padding: 11,
                textAlign: 'left',
                textDecoration: 'line-through',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                {item.name}
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

function actionButtonStyle(accent?: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: `1px solid ${accent || 'var(--border-faint)'}`,
    borderRadius: 999,
    background: accent ? `${accent}18` : 'var(--bg-secondary)',
    color: accent || 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
