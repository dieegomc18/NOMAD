#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://nomad-production-a78e.up.railway.app';
const DEFAULT_TRIP_ID = process.env.NOMAD_TRIP_ID || '1';

const CATEGORIES = {
  hotel: 1,
  restaurant: 2,
  attraction: 3,
  shopping: 4,
  transport: 5,
  activity: 6,
  cafe: 7,
  'bar/cafe': 7,
  beach: 8,
  nature: 9,
  other: 10,
};

function usage() {
  console.log(`nomadctl - Codex Cloud helper for live NOMAD/TREK data

Usage:
  node scripts/nomadctl.mjs health
  node scripts/nomadctl.mjs trips
  node scripts/nomadctl.mjs places [--trip 1]
  node scripts/nomadctl.mjs summary [--trip 1]
  node scripts/nomadctl.mjs search-place "query"
  node scripts/nomadctl.mjs add-place --name "Name" --category cafe --notes "Why go" [--address "..."] [--lat 0] [--lng 0] [--google-place-id "..."]
  node scripts/nomadctl.mjs update-place --id 123 --notes "New notes"
  node scripts/nomadctl.mjs delete-place --id 123
  node scripts/nomadctl.mjs add-places-json places.json [--trip 1]
  node scripts/nomadctl.mjs ensure-notes [--trip 1]
  node scripts/nomadctl.mjs clear-images [--trip 1]

Environment:
  NOMAD_BASE_URL       Defaults to ${DEFAULT_BASE_URL}
  NOMAD_TRIP_ID        Defaults to 1
  NOMAD_EMAIL          Required for write/read REST auth unless NOMAD_JWT is set
  NOMAD_PASSWORD       Required for write/read REST auth unless NOMAD_JWT is set
  NOMAD_JWT            Optional pre-issued app JWT

Cloud setup tip:
  Store NOMAD_EMAIL and NOMAD_PASSWORD as Codex Cloud environment variables, or store NOMAD_JWT for short-lived sessions.
`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { positional, flags };
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function categoryId(input) {
  if (input === undefined || input === null || input === '') return CATEGORIES.other;
  if (/^\d+$/.test(String(input))) return Number(input);
  return CATEGORIES[String(input).toLowerCase()] || CATEGORIES.other;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function request(pathname, options = {}) {
  const baseUrl = normalizeBaseUrl(process.env.NOMAD_BASE_URL);
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const detail = data?.error || data?.message || text || response.statusText;
    throw new Error(`${options.method || 'GET'} ${pathname} failed (${response.status}): ${detail}`);
  }

  return data;
}

let cachedToken = null;

async function getJwt() {
  if (process.env.NOMAD_JWT) return process.env.NOMAD_JWT;
  if (cachedToken) return cachedToken;

  const email = process.env.NOMAD_EMAIL;
  const password = process.env.NOMAD_PASSWORD;
  if (!email || !password) {
    throw new Error('Set NOMAD_EMAIL and NOMAD_PASSWORD, or set NOMAD_JWT.');
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  cachedToken = login.token;
  return cachedToken;
}

async function authed(pathname, options = {}) {
  const token = await getJwt();
  return request(pathname, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

async function listTrips() {
  const data = await authed('/api/trips');
  return data.trips || [];
}

async function listPlaces(tripId) {
  const data = await authed(`/api/trips/${tripId}/places`);
  return data.places || [];
}

async function getTrip(tripId) {
  const data = await authed(`/api/trips/${tripId}`);
  return data.trip;
}

async function addPlace(tripId, place) {
  const places = await listPlaces(tripId);
  const wantedName = normalizeName(place.name);
  const duplicate = places.find((existing) => normalizeName(existing.name) === wantedName);

  if (duplicate) {
    const updated = await updatePlace(tripId, duplicate.id, {
      ...place,
      category_id: place.category_id ?? duplicate.category_id,
    });
    return { action: 'updated', place: updated };
  }

  const created = await authed(`/api/trips/${tripId}/places`, {
    method: 'POST',
    body: JSON.stringify(place),
  });
  return { action: 'created', place: created.place };
}

async function updatePlace(tripId, id, patch) {
  const data = await authed(`/api/trips/${tripId}/places/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return data.place;
}

async function deletePlace(tripId, id) {
  return authed(`/api/trips/${tripId}/places/${id}`, {
    method: 'DELETE',
  });
}

async function searchPlace(query) {
  const data = await authed('/api/maps/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  return data;
}

async function addPlacesFromJson(file, tripId) {
  const raw = await fs.readFile(path.resolve(file), 'utf8');
  const input = JSON.parse(raw);
  const entries = Array.isArray(input) ? input : input.places;
  if (!Array.isArray(entries)) throw new Error('JSON must be an array or an object with a places array.');

  const results = [];
  for (const entry of entries) {
    if (!entry.name) throw new Error('Every place needs a name.');
    const place = normalizePlacePayload(entry);
    results.push(await addPlace(tripId, place));
  }
  return results;
}

async function ensureNotes(tripId) {
  const places = await listPlaces(tripId);
  const results = [];

  for (const place of places) {
    if (place.notes && String(place.notes).trim()) continue;
    const notes = `${place.name} is on the shortlist. Add a stronger recommendation note before finalizing the itinerary.`;
    const updated = await updatePlace(tripId, place.id, { notes });
    results.push(updated);
  }

  return { updated: results.length, places: results };
}

async function clearImages(tripId) {
  const places = await listPlaces(tripId);
  const results = [];

  for (const place of places) {
    if (!place.image_url) continue;
    const updated = await updatePlace(tripId, place.id, { image_url: null });
    results.push(updated);
  }

  return { cleared: results.length, places: results.map((place) => ({ id: place.id, name: place.name })) };
}

function normalizePlacePayload(input) {
  return {
    name: input.name,
    address: input.address,
    lat: input.lat === undefined ? undefined : Number(input.lat),
    lng: input.lng === undefined ? undefined : Number(input.lng),
    google_place_id: input.google_place_id || input.googlePlaceId,
    osm_id: input.osm_id || input.osmId,
    category_id: input.category_id || categoryId(input.category || input.categoryName),
    website: input.website,
    phone: input.phone,
    notes: input.notes,
    description: input.description,
    image_url: input.image_url,
  };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const tripId = flags.trip || DEFAULT_TRIP_ID;

  if (!command || flags.help || command === 'help') {
    usage();
    return;
  }

  if (command === 'health') {
    console.log(JSON.stringify(await request('/api/health'), null, 2));
    return;
  }

  if (command === 'trips') {
    console.log(JSON.stringify(await listTrips(), null, 2));
    return;
  }

  if (command === 'places') {
    console.log(JSON.stringify(await listPlaces(tripId), null, 2));
    return;
  }

  if (command === 'summary') {
    const [trip, places] = await Promise.all([getTrip(tripId), listPlaces(tripId)]);
    console.log(JSON.stringify({
      trip,
      place_count: places.length,
      without_notes: places.filter((p) => !p.notes || !String(p.notes).trim()).length,
      without_google_place_id: places.filter((p) => !p.google_place_id).length,
      with_images: places.filter((p) => p.image_url).length,
    }, null, 2));
    return;
  }

  if (command === 'search-place') {
    const query = positional.slice(1).join(' ');
    if (!query) throw new Error('search-place needs a query.');
    console.log(JSON.stringify(await searchPlace(query), null, 2));
    return;
  }

  if (command === 'add-place') {
    if (!flags.name) throw new Error('add-place needs --name.');
    const result = await addPlace(tripId, normalizePlacePayload({
      name: flags.name,
      address: flags.address,
      lat: flags.lat,
      lng: flags.lng,
      google_place_id: flags['google-place-id'],
      osm_id: flags['osm-id'],
      category: flags.category,
      website: flags.website,
      phone: flags.phone,
      notes: flags.notes,
      description: flags.description,
      image_url: flags['image-url'],
    }));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'update-place') {
    if (!flags.id) throw new Error('update-place needs --id.');
    const patch = normalizePlacePayload({
      name: flags.name,
      address: flags.address,
      lat: flags.lat,
      lng: flags.lng,
      google_place_id: flags['google-place-id'],
      osm_id: flags['osm-id'],
      category: flags.category,
      website: flags.website,
      phone: flags.phone,
      notes: flags.notes,
      description: flags.description,
      image_url: flags['clear-image'] ? null : flags['image-url'],
    });
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete patch[key];
    }
    console.log(JSON.stringify(await updatePlace(tripId, flags.id, patch), null, 2));
    return;
  }

  if (command === 'delete-place') {
    if (!flags.id) throw new Error('delete-place needs --id.');
    console.log(JSON.stringify(await deletePlace(tripId, flags.id), null, 2));
    return;
  }

  if (command === 'add-places-json') {
    const file = positional[1];
    if (!file) throw new Error('add-places-json needs a JSON file path.');
    console.log(JSON.stringify(await addPlacesFromJson(file, tripId), null, 2));
    return;
  }

  if (command === 'ensure-notes') {
    console.log(JSON.stringify(await ensureNotes(tripId), null, 2));
    return;
  }

  if (command === 'clear-images') {
    console.log(JSON.stringify(await clearImages(tripId), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
