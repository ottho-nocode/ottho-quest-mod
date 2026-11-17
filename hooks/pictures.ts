import { ICONS, THUMBS } from './art'
import type { Picture } from './art'

// Les petites images du panneau : une image du jeu dans un SVG, la rangée
// d'ampoules de la série, la vignette d'un chantier.

/** Une image du jeu, grossie par un nombre entier, pixels nets. */
export function pictureSvg(picture: Picture, scale = 1): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${picture.w} ${picture.h}" width="${picture.w * scale}" height="${picture.h * scale}">` +
    `<image href="${picture.src}" x="0" y="0" width="${picture.w}" height="${picture.h}" style="image-rendering:pixelated"/>` +
    '</svg>'
  )
}

/** Une icône par son nom (`coin-20`, `code-32`, `tournevis-48`), ou rien si elle manque. */
export function icon(name: string): Picture | null {
  return ICONS[name] ?? null
}

/** Les sept derniers jours : une ampoule par jour, allumée s'il y a eu une action. */
export function bulbsSvg(days: { letter: string; active: boolean; isToday: boolean }[]): string {
  const on = ICONS['bulb-on-36']
  const off = ICONS['bulb-off-36']
  const step = 44
  const width = days.length * step
  const parts = days.map((day, i) => {
    const bulb = day.active ? on : off
    if (!bulb) return ''
    const cx = i * step + step / 2
    const blink = day.isToday && !day.active ? ' class="blink"' : ''
    return (
      `<image${blink} href="${bulb.src}" x="${cx - bulb.w / 2}" y="${38 - bulb.h}" width="${bulb.w}" height="${bulb.h}"/>` +
      `<text x="${cx}" y="56" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" font-weight="700" fill="${day.isToday ? '#ff8a2a' : '#b3abda'}">${day.letter}</text>`
    )
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 60" width="${width}" height="60">` +
    '<style>image{image-rendering:pixelated}@keyframes blink{50%{opacity:.15}}.blink{animation:blink .7s steps(1) infinite}</style>' +
    parts.join('') +
    '</svg>'
  )
}

/** Où cadrer la vignette de chaque décor (colonne de gauche, en unités de la scène du jeu). */
const THUMB_X: Record<string, number> = { portail: 27, tapis: 22, accueil: 26, vitrine: 27, horloge: 22 }

/** La vignette d'un chantier : son décor, recadré sur le sujet comme dans le jeu. */
export function thumbSvg(kind: string): string {
  const src = THUMBS[kind]
  if (!src) return ''
  // Vignette du jeu : 2 px par unité, image de -10 à 90 unités, cadre de 56 x 40 unités.
  const x = ((THUMB_X[kind] ?? 24) + 10) * 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} 6 112 80" width="112" height="80">` +
    `<image href="${src}" x="0" y="0" width="200" height="90" style="image-rendering:pixelated"/>` +
    '</svg>'
  )
}

/** Une jauge du jeu : un creux sombre, un remplissage, le compte au milieu. */
export function barSvg(value: number, max: number, color: string, label: string, width = 220): string {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const inner = width - 6
  const fill = Math.round(inner * ratio)
  const safe = label.replace(/[<>&]/g, '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 20" width="${width}" height="20" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${width}" height="20" fill="#352d6b"/>` +
    `<rect x="3" y="3" width="${inner}" height="14" fill="#151029"/>` +
    (fill > 0
      ? `<rect x="3" y="3" width="${fill}" height="14" fill="${color}"/>` +
        `<rect x="3" y="3" width="${fill}" height="3" fill="#ffffff" opacity="0.3"/>` +
        `<rect x="3" y="14" width="${fill}" height="3" fill="#000000" opacity="0.22"/>`
      : '') +
    `<text x="${width / 2 + 1}" y="15" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" font-weight="700" fill="#15102b">${safe}</text>` +
    `<text x="${width / 2}" y="14" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" font-weight="700" fill="#f3ecff">${safe}</text>` +
    '</svg>'
  )
}
