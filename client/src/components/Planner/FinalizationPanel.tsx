import React, { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Crosshair, Flag, MapPin, Navigation, Sparkles, Tag as TagIcon } from 'lucide-react'
import PlaceAvatar from '../shared/PlaceAvatar'
import type { Assignment, AssignmentsMap, Day, Place, Tag } from '../../types'

interface FinalizationPanelProps {
  tripId: number | string
  days: Day[]
  places: Place[]
  assignments: AssignmentsMap
  tags: Tag[]
  onCreateTag: (data: Partial<Tag>) => Promise<Tag>
  onUpdatePlace: (placeId: number, data: Partial<Place> & { tags?: number[] }) => Promise<Place>
  onPlaceClick: (placeId: number) => void
}

const PRIORITY_TAGS = [
  { name: 'Must do', color: '#ef4444' },
  { name: 'Maybe', color: '#f59e0b' },
  { name: 'Food backup', color: '#10b981' },
  { name: 'Rainy day', color: '#3b82f6' },
]

const BRANCH_LATER = [
  'blank street',
  'ichiran',
  'brooklyn bagel',
  'playa bowls',
  'joe & the juice',
  'whole foods',
  'shake shack',
  'chipotle',
  'panda express',
]

function distanceKm(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0
  const toRad = (n: number) => n * Math.PI / 180
  const earthKm = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthKm * Math.asin(Math.sqrt(h))
}

function formatKm(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`
}

function hasTag(place: Place, name: string): boolean {
  return (place.tags || []).some(tag => tag.name.toLowerCase() === name.toLowerCase())
}

function getPlaceTags(place: Place): Tag[] {
  return place.tags || []
}

function sectionStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-faint)',
    borderRadius: 18,
    padding: 16,
    boxShadow: '0 16px 40px rgba(0,0,0,0.08)',
  }
}

function cardStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--border-faint)',
    borderRadius: 14,
    padding: 12,
    background: 'var(--bg-secondary)',
  }
}

export default function FinalizationPanel({
  days,
  places,
  assignments,
  tags,
  onCreateTag,
  onUpdatePlace,
  onPlaceClick,
}: FinalizationPanelProps) {
  const [nearbyOrigin, setNearbyOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyError, setNearbyError] = useState<string | null>(null)
  const [taggingPlaceId, setTaggingPlaceId] = useState<number | null>(null)

  const assignedPlaceIds = useMemo(() => new Set(
    Object.values(assignments).flatMap(dayAssignments => dayAssignments.map(a => a.place?.id).filter(Boolean))
  ), [assignments])

  const chainPlaces = useMemo(() => places.filter(place => {
    const haystack = `${place.name} ${place.notes || ''}`.toLowerCase()
    return BRANCH_LATER.some(keyword => haystack.includes(keyword))
  }), [places])

  const dayStats = useMemo(() => days.map(day => {
    const dayAssignments = [...(assignments[String(day.id)] || [])]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .filter((assignment): assignment is Assignment & { place: Place } => Boolean(assignment.place))
    const totalKm = dayAssignments.reduce((sum, assignment, index) => {
      if (index === 0) return sum
      return sum + distanceKm(dayAssignments[index - 1].place, assignment.place)
    }, 0)
    const untimed = dayAssignments.filter(a => !a.place.place_time).length
    const status = dayAssignments.length === 0 ? 'empty' : totalKm > 10 || dayAssignments.length > 8 ? 'ambitious' : totalKm > 5 || dayAssignments.length > 5 ? 'busy' : 'easy'
    return { day, assignments: dayAssignments, totalKm, untimed, status }
  }), [assignments, days])

  const unplanned = places.filter(place => !assignedPlaceIds.has(place.id))
  const missingCoords = places.filter(place => place.lat == null || place.lng == null)
  const missingNotes = places.filter(place => !place.notes || !place.notes.trim())
  const noPriority = places.filter(place => !PRIORITY_TAGS.some(tag => hasTag(place, tag.name)))
  const ambitiousDays = dayStats.filter(day => day.status === 'ambitious')

  const checklist = [
    { label: 'All saved places have notes', done: missingNotes.length === 0, detail: missingNotes.length ? `${missingNotes.length} missing` : 'Clean' },
    { label: 'All saved places have map coordinates', done: missingCoords.length === 0, detail: missingCoords.length ? `${missingCoords.length} missing` : 'Clean' },
    { label: 'Every day has at least one planned stop', done: dayStats.every(day => day.assignments.length > 0), detail: `${dayStats.filter(day => day.assignments.length === 0).length} empty days` },
    { label: 'No overloaded route days', done: ambitiousDays.length === 0, detail: ambitiousDays.length ? `${ambitiousDays.length} ambitious days` : 'Looks balanced' },
    { label: 'Chain locations reviewed', done: chainPlaces.length === 0, detail: chainPlaces.length ? `${chainPlaces.length} decide-later places` : 'No reminders' },
    { label: 'Priority tags assigned', done: noPriority.length < places.length * 0.5, detail: `${places.length - noPriority.length}/${places.length} tagged` },
  ]

  const nearbyPlaces = useMemo(() => {
    if (!nearbyOrigin) return []
    return places
      .filter(place => place.lat != null && place.lng != null)
      .map(place => ({ place, km: distanceKm(nearbyOrigin, place) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 12)
  }, [nearbyOrigin, places])

  const requestNearMe = () => {
    setNearbyError(null)
    if (!navigator.geolocation) {
      setNearbyError('Geolocation is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => setNearbyOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => setNearbyError(error.message || 'Could not read your location.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const ensureTag = async (name: string, color: string) => {
    const existing = tags.find(tag => tag.name.toLowerCase() === name.toLowerCase())
    return existing || onCreateTag({ name, color })
  }

  const togglePriorityTag = async (place: Place, tagName: string, color: string) => {
    setTaggingPlaceId(place.id)
    try {
      const tag = await ensureTag(tagName, color)
      const currentIds = getPlaceTags(place).map(t => t.id)
      const nextIds = currentIds.includes(tag.id)
        ? currentIds.filter(id => id !== tag.id)
        : [...currentIds.filter(id => !PRIORITY_TAGS.some(priority => tags.find(t => t.id === id)?.name.toLowerCase() === priority.name.toLowerCase())), tag.id]
      await onUpdatePlace(place.id, { tags: nextIds })
    } finally {
      setTaggingPlaceId(null)
    }
  }

  const priorityCandidates = [...places]
    .sort((a, b) => {
      const aAssigned = assignedPlaceIds.has(a.id) ? 1 : 0
      const bAssigned = assignedPlaceIds.has(b.id) ? 1 : 0
      return aAssigned - bAssigned || a.name.localeCompare(b.name)
    })
    .slice(0, 18)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 18, background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={sectionStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CheckCircle2 size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Finalization checklist</h2>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {checklist.map(item => (
              <div key={item.label} style={{ ...cardStyle(), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.detail}</div>
                </div>
                {item.done ? <CheckCircle2 size={18} color="#22c55e" /> : <AlertTriangle size={18} color="#f59e0b" />}
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Navigation size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Route sanity</h2>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {dayStats.map(({ day, assignments: dayAssignments, totalKm, untimed, status }) => (
              <div key={day.id} style={cardStyle()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{day.title || `Day ${days.indexOf(day) + 1}`}</strong>
                  <span style={{ color: status === 'ambitious' ? '#f97316' : status === 'busy' ? '#eab308' : '#22c55e', fontSize: 12, fontWeight: 700 }}>{status}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
                  {dayAssignments.length} stops, {formatKm(totalKm)} straight-line movement, {untimed} untimed
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Flag size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Priority tags</h2>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>Quick-tag the most important places so the final route decisions are easier.</div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
            {priorityCandidates.map(place => (
              <div key={place.id} style={{ ...cardStyle(), display: 'grid', gap: 8 }}>
                <button onClick={() => onPlaceClick(place.id)} style={{ border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 9, padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                  <PlaceAvatar place={place} category={place.category || undefined} size={28} />
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650 }}>{place.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{assignedPlaceIds.has(place.id) ? 'Already planned' : 'Unplanned'}</div>
                  </div>
                </button>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRIORITY_TAGS.map(tag => {
                    const active = hasTag(place, tag.name)
                    return (
                      <button
                        key={tag.name}
                        disabled={taggingPlaceId === place.id}
                        onClick={() => togglePriorityTag(place, tag.name, tag.color)}
                        style={{
                          border: `1px solid ${active ? tag.color : 'var(--border-primary)'}`,
                          background: active ? tag.color : 'transparent',
                          color: active ? 'white' : 'var(--text-muted)',
                          borderRadius: 999,
                          padding: '4px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Crosshair size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Near me today</h2>
          </div>
          <button onClick={requestNearMe} style={{ border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Use my location
          </button>
          {nearbyError && <div style={{ color: '#f97316', fontSize: 12, marginTop: 8 }}>{nearbyError}</div>}
          {!nearbyOrigin && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>When you are in NYC, this shows the closest saved places and their notes.</div>}
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {nearbyPlaces.map(({ place, km }) => (
              <button key={place.id} onClick={() => onPlaceClick(place.id)} style={{ ...cardStyle(), display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border-faint)' }}>
                <PlaceAvatar place={place} category={place.category || undefined} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 650 }}>{place.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatKm(km)} away</div>
                </div>
                <MapPin size={14} color="var(--text-muted)" />
              </button>
            ))}
          </div>
        </section>

        <section style={{ ...sectionStyle(), gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Decision reminders</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            {[
              'Pick exact chain branches after the route is built: Blank Street, Ichiran, Brooklyn Bagel, Playa Bowls, Joe & The Juice.',
              'Re-check cherry blossoms 1-3 days before park day.',
              'Re-check JAPAN Fes and Governors Island Earth Day dates before locking a day.',
              'Use Too Good To Go and Happiest Hours opportunistically near where you already are.',
            ].map(text => (
              <div key={text} style={{ ...cardStyle(), display: 'flex', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <TagIcon size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                {text}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
