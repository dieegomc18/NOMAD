import React, { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, Copy, ExternalLink, MapPin, Navigation, Route, TimerReset } from 'lucide-react'
import PlaceAvatar from '../shared/PlaceAvatar'
import type { Assignment, AssignmentsMap, Day, Place, Reservation } from '../../types'

interface TodayPanelProps {
  days: Day[]
  assignments: AssignmentsMap
  reservations: Reservation[]
  onOpenPlace: (placeId: number, dayId: number, assignmentId?: number) => void
  onSelectDay: (dayId: number) => void
}

type TimedItem = {
  id: string
  dayId: number
  label: string
  type: 'place' | 'reservation'
  start: number
  end: number
  placeId?: number
  assignmentId?: number
}

type Conflict = {
  dayId: number
  severity: 'warning' | 'info'
  title: string
  detail: string
  placeId?: number
  assignmentId?: number
}

function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null
  const time = value.includes('T') ? value.split('T')[1] : value
  const parts = time.split(':').map(Number)
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) return parts[0] * 60 + parts[1]
  return null
}

function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatDayDate(day: Day): string {
  if (!day.date) return ''
  return new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function getLocalDateIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getGoogleMapsRouteUrl(assignments: Array<Assignment & { place: Place }>): string {
  const stops = assignments.map(a => a.place).filter(place => place.lat != null && place.lng != null)
  if (stops.length === 0) return 'https://www.google.com/maps'
  if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${stops[0].lat},${stops[0].lng}`
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'walking',
    origin: `${stops[0].lat},${stops[0].lng}`,
    destination: `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`,
  })
  const waypoints = stops.slice(1, -1).slice(0, 9)
  if (waypoints.length) params.set('waypoints', waypoints.map(place => `${place.lat},${place.lng}`).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function getDayAssignments(assignments: AssignmentsMap, dayId: number): Array<Assignment & { place: Place }> {
  return [...(assignments[String(dayId)] || [])]
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .filter((assignment): assignment is Assignment & { place: Place } => Boolean(assignment.place))
}

function getReservationsForDay(day: Day, reservations: Reservation[], dayAssignments: Assignment[]): Reservation[] {
  const assignmentIds = new Set(dayAssignments.map(a => a.id))
  return reservations.filter(reservation => {
    if (reservation.type === 'hotel') return false
    if (reservation.day_id === day.id) return true
    if (reservation.assignment_id && assignmentIds.has(reservation.assignment_id)) return true
    return reservation.reservation_time?.split('T')[0] === day.date
  })
}

function buildTimedItems(day: Day, assignments: Array<Assignment & { place: Place }>, reservations: Reservation[]): TimedItem[] {
  const placeItems = assignments.flatMap(assignment => {
    const start = parseTimeToMinutes(assignment.place.place_time)
    if (start == null) return []
    const end = parseTimeToMinutes(assignment.place.end_time) ?? start + 60
    return [{
      id: `place-${assignment.id}`,
      dayId: day.id,
      label: assignment.place.name,
      type: 'place' as const,
      start,
      end: Math.max(end, start + 15),
      placeId: assignment.place.id,
      assignmentId: assignment.id,
    }]
  })

  const reservationItems = reservations.flatMap(reservation => {
    const start = parseTimeToMinutes(reservation.reservation_time)
    if (start == null) return []
    const end = parseTimeToMinutes(reservation.reservation_end_time) ?? start + 60
    return [{
      id: `reservation-${reservation.id}`,
      dayId: day.id,
      label: reservation.title || reservation.name || reservation.type,
      type: 'reservation' as const,
      start,
      end: Math.max(end, start + 15),
      placeId: reservation.place_id || undefined,
      assignmentId: reservation.assignment_id || undefined,
    }]
  })

  return [...placeItems, ...reservationItems].sort((a, b) => a.start - b.start)
}

function getConflicts(days: Day[], assignments: AssignmentsMap, reservations: Reservation[]): Conflict[] {
  return days.flatMap(day => {
    const dayAssignments = getDayAssignments(assignments, day.id)
    const dayReservations = getReservationsForDay(day, reservations, dayAssignments)
    const timedItems = buildTimedItems(day, dayAssignments, dayReservations)
    const conflicts: Conflict[] = []

    if (dayAssignments.length === 0) {
      conflicts.push({ dayId: day.id, severity: 'info', title: 'Empty day', detail: 'No stops are planned yet.' })
    }
    if (dayAssignments.length > 8) {
      conflicts.push({ dayId: day.id, severity: 'warning', title: 'Heavy day', detail: `${dayAssignments.length} stops planned. Consider moving a few backups elsewhere.` })
    }

    const timedInRouteOrder = dayAssignments
      .map(assignment => ({ assignment, minutes: parseTimeToMinutes(assignment.place.place_time) }))
      .filter((item): item is { assignment: Assignment & { place: Place }; minutes: number } => item.minutes != null)
    for (let i = 1; i < timedInRouteOrder.length; i += 1) {
      if (timedInRouteOrder[i].minutes < timedInRouteOrder[i - 1].minutes) {
        conflicts.push({
          dayId: day.id,
          severity: 'warning',
          title: 'Time order mismatch',
          detail: `${timedInRouteOrder[i].assignment.place.name} is timed before the previous stop in the route order.`,
          placeId: timedInRouteOrder[i].assignment.place.id,
          assignmentId: timedInRouteOrder[i].assignment.id,
        })
      }
    }

    for (let i = 1; i < timedItems.length; i += 1) {
      const previous = timedItems[i - 1]
      const current = timedItems[i]
      const gap = current.start - previous.end
      if (gap < 0) {
        conflicts.push({
          dayId: day.id,
          severity: 'warning',
          title: 'Overlapping plans',
          detail: `${previous.label} overlaps with ${current.label}.`,
          placeId: current.placeId,
          assignmentId: current.assignmentId,
        })
      } else if (gap < 30) {
        conflicts.push({
          dayId: day.id,
          severity: 'info',
          title: 'Tight gap',
          detail: `${formatMinutes(previous.end)} to ${formatMinutes(current.start)} leaves about ${gap} minutes.`,
          placeId: current.placeId,
          assignmentId: current.assignmentId,
        })
      }
    }

    return conflicts
  })
}

function cardStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--border-faint)',
    borderRadius: 16,
    background: 'var(--bg-card)',
    boxShadow: '0 16px 42px rgba(0,0,0,0.08)',
  }
}

export default function TodayPanel({ days, assignments, reservations, onOpenPlace, onSelectDay }: TodayPanelProps) {
  const todayIso = getLocalDateIso()
  const defaultDay = days.find(day => day.date === todayIso) || days.find(day => day.date > todayIso) || days[0]
  const [activeDayId, setActiveDayId] = useState<number | null>(defaultDay?.id || null)
  const [copied, setCopied] = useState(false)

  const activeDay = days.find(day => day.id === activeDayId) || defaultDay
  const dayAssignments = activeDay ? getDayAssignments(assignments, activeDay.id) : []
  const dayReservations = activeDay ? getReservationsForDay(activeDay, reservations, dayAssignments) : []
  const timedItems = activeDay ? buildTimedItems(activeDay, dayAssignments, dayReservations) : []
  const conflicts = useMemo(() => getConflicts(days, assignments, reservations), [assignments, days, reservations])
  const activeConflicts = activeDay ? conflicts.filter(conflict => conflict.dayId === activeDay.id) : []

  const openDay = (dayId: number) => {
    setActiveDayId(dayId)
    onSelectDay(dayId)
  }

  const copyToday = async () => {
    if (!activeDay || !navigator.clipboard) return
    const lines = [
      `${activeDay.title || 'Today'} (${activeDay.date})`,
      ...dayAssignments.map((assignment, index) => `${index + 1}. ${assignment.place.place_time ? `${assignment.place.place_time} ` : ''}${assignment.place.name}${assignment.place.address ? ` - ${assignment.place.address}` : ''}`),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (!activeDay) return null

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-primary)', padding: 18 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={{ ...cardStyle(), padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalendarCheck2 size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Today</h2>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
            {activeDay.date === todayIso ? 'Matched to today.' : 'Trip day selected because today is outside the trip dates.'}
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            {days.map((day, index) => {
              const count = (assignments[String(day.id)] || []).length
              const dayConflictCount = conflicts.filter(conflict => conflict.dayId === day.id && conflict.severity === 'warning').length
              const selected = day.id === activeDay.id
              return (
                <button
                  key={day.id}
                  onClick={() => openDay(day.id)}
                  style={{
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-faint)'}`,
                    borderRadius: 14,
                    padding: 10,
                    background: selected ? 'var(--bg-secondary)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{day.title || `Day ${index + 1}`}</strong>
                    {dayConflictCount > 0 && <AlertTriangle size={15} color="#f97316" />}
                  </div>
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>{formatDayDate(day)} · {count} stops</div>
                </button>
              )
            })}
          </div>
        </section>

        <main style={{ display: 'grid', gap: 16 }}>
          <section style={{ ...cardStyle(), padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDayDate(activeDay)}</div>
                <h2 style={{ margin: '2px 0 0', color: 'var(--text-primary)', fontSize: 24 }}>{activeDay.title || `Day ${days.indexOf(activeDay) + 1}`}</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'flex-end' }}>
                <a href={getGoogleMapsRouteUrl(dayAssignments)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 11px', background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                  <ExternalLink size={13} />
                  Open route
                </a>
                <button onClick={copyToday} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 11px', border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Copy size={13} />
                  {copied ? 'Copied' : 'Copy day'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 9 }}>
              {dayAssignments.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No stops planned for this day yet.</div>}
              {dayAssignments.map((assignment, index) => (
                <button key={assignment.id} onClick={() => onOpenPlace(assignment.place.id, activeDay.id, assignment.id)} style={{ border: '1px solid var(--border-faint)', background: 'var(--bg-secondary)', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 800 }}>{index + 1}</div>
                  <PlaceAvatar place={assignment.place} category={assignment.place.category || undefined} size={34} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{assignment.place.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{assignment.place.address || 'No address'}</div>
                  </div>
                  {assignment.place.place_time && <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} />{assignment.place.place_time}</span>}
                </button>
              ))}
            </div>
          </section>

          <section style={{ ...cardStyle(), padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={18} color={activeConflicts.some(c => c.severity === 'warning') ? '#f97316' : '#22c55e'} />
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Conflict warnings</h2>
            </div>
            {activeConflicts.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <CheckCircle2 size={16} color="#22c55e" />
                No obvious timing or route conflicts for this day.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {activeConflicts.map((conflict, index) => (
                  <button key={`${conflict.title}-${index}`} onClick={() => conflict.placeId && onOpenPlace(conflict.placeId, conflict.dayId, conflict.assignmentId)} style={{ border: '1px solid var(--border-faint)', borderRadius: 14, padding: 11, background: 'var(--bg-secondary)', color: 'inherit', textAlign: 'left', cursor: conflict.placeId ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>
                      {conflict.severity === 'warning' ? <AlertTriangle size={14} color="#f97316" /> : <TimerReset size={14} color="#eab308" />}
                      {conflict.title}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{conflict.detail}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...cardStyle(), padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Route size={18} color="var(--accent)" />
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Timed agenda</h2>
            </div>
            {timedItems.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No timed stops or bookings yet. Add times to places to make this useful on the day.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {timedItems.map(item => (
                  <button key={item.id} onClick={() => item.placeId && onOpenPlace(item.placeId, item.dayId, item.assignmentId)} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 10, border: '1px solid var(--border-faint)', borderRadius: 14, background: 'var(--bg-secondary)', padding: 10, textAlign: 'left', cursor: item.placeId ? 'pointer' : 'default' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 13 }}>{formatMinutes(item.start)}</div>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{item.type === 'place' ? 'Place' : 'Booking'} · until about {formatMinutes(item.end)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
