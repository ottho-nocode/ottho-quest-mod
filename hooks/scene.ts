import { FABRIQUE, SPRITES } from './art'
import type { BuilderId, Sprite } from './art'

// La scène de la Fabrique, comme dans le jeu : le décor, le builder du joueur
// et Zinc, en un seul SVG. Le panneau d'un mod n'affiche pas de page web, mais
// il dessine un SVG, qui peut porter les images du jeu.

/** Taille du décor, en pixels du jeu. */
export const SCENE = { width: 400, height: 180 } as const

/** Ligne du sol où se posent les pieds (44 unités de 4 px dans le jeu). */
const GROUND = 176
/** Milieu des pieds du builder et de Zinc, comme dans la scène du jeu. */
const BUILDER_X = 128
const ZINC_X = 216

/** Respiration par paliers et clignement de Zinc, comme les animations du jeu. */
const STYLE =
  'image{image-rendering:pixelated}' +
  '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +
  '.bob{animation:bob 1.3s steps(1) infinite}.late{animation-delay:.45s}' +
  '@keyframes eyes{0%,94%{opacity:0}95%,100%{opacity:1}}' +
  '.eyes{opacity:0;animation:eyes 4.6s steps(1) infinite}'

/** Un personnage posé pieds au sol, au milieu `footX`. */
function standing(sprite: Sprite, footX: number, className = ''): string {
  const cls = className ? ` class="${className}"` : ''
  return `<image${cls} href="${sprite.src}" x="${footX - sprite.foot}" y="${GROUND - sprite.h}" width="${sprite.w}" height="${sprite.h}"/>`
}

/** Ombre au sol sous un personnage, de la largeur donnée. */
function shadow(footX: number, width: number): string {
  return (
    `<rect x="${footX - width / 2}" y="${GROUND - 4}" width="${width}" height="4" fill="#000" opacity="0.3"/>` +
    `<rect x="${footX - width / 2 + 4}" y="${GROUND}" width="${width - 8}" height="2" fill="#000" opacity="0.3"/>`
  )
}

/** La Fabrique avec le builder choisi et Zinc. */
export function fabriqueSvg(builder: BuilderId): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE.width} ${SCENE.height}" width="${SCENE.width}" height="${SCENE.height}" shape-rendering="crispEdges">` +
    `<style>${STYLE}</style>` +
    `<image href="${FABRIQUE}" x="0" y="0" width="${SCENE.width}" height="${SCENE.height}"/>` +
    shadow(BUILDER_X, 52) +
    shadow(ZINC_X, 60) +
    `<g class="bob">${standing(SPRITES[builder], BUILDER_X)}</g>` +
    `<g class="bob late">${standing(SPRITES.zinc, ZINC_X)}${standing(SPRITES['zinc-blink'], ZINC_X, 'eyes')}</g>` +
    '</svg>'
  )
}
