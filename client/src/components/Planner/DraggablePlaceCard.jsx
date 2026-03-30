import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { MapPin, DollarSign, Check, ExternalLink } from 'lucide-react'

export default function DraggablePlaceCard({ place, isAssigned, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `place-${place.id}`,
    data: {
      type: 'place',
      place,
    },
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 999 : undefined,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        group relative bg-white border rounded-lg p-3 cursor-grab active:cursor-grabbing
        transition-all select-none
        ${isDragging
          ? 'opacity-50 shadow-2xl border-slate-400 scale-105'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md place-card-hover'
        }
      `}
      onClick={e => {
        if (!isDragging && onEdit) {
          e.stopPropagation()
          onEdit(place)
        }
      }}
    >
      {/* Category left border accent */}
      {place.category && (
        <div
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r"
          style={{ backgroundColor: place.category.color || '#6366f1' }}
        />
      )}

      <div className="pl-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className="text-sm font-medium text-slate-800 leading-tight line-clamp-2 flex-1">
            {place.name}
          </p>
          {isAssigned && (
            <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center" title="Already assigned to a day">
              <Check className="w-3 h-3 text-emerald-600" />
            </span>
          )}
        </div>

        {/* Address */}
        {place.address && (
          <p className="text-xs text-slate-400 truncate flex items-center gap-1 mb-1.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 underline"
            >
              {place.address}
            </a>
          </p>
        )}

        {/* Category badge */}
        {place.category && (
          <span
            className="inline-block text-[10px] px-1.5 py-0.5 rounded text-white font-medium mr-1"
            style={{ backgroundColor: place.category.color || '#6366f1' }}
          >
            {place.category.name}
          </span>
        )}

        {/* Price */}
        {place.price != null && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            <DollarSign className="w-2.5 h-2.5" />
            {Number(place.price).toLocaleString()} {place.currency || ''}
          </span>
        )}

        {/* Tags */}
        {place.tags && place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {place.tags.slice(0, 3).map(tag => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                style={{ backgroundColor: tag.color || '#6366f1' }}
              >
                {tag.name}
              </span>
            ))}
            {place.tags.length > 3 && (
              <span className="text-[10px] text-slate-400">+{place.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Google Maps Button */}
        <a
          href={place.lat && place.lng 
            ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || '')}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 mt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          Google Maps
        </a>
      </div>
    </div>
  )
}
