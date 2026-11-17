import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Chantier, ChantierStatus, Play, Tab } from '../types'
import { AcademyError, callAcademy, findServer, forgetServer, hasTool } from './academy'
import { BUILDERS, HEADS, SPRITES } from './art'
import type { BuilderId, Picture } from './art'
import {
  ACADEMY_URL,
  PROJECT_CAPS,
  PROJECT_LABELS,
  PROJECT_RULES,
  RULES,
  SLOTS,
  TALENTS,
  TALENT_KEYS,
  itemById,
} from './game/content'
import type { Challenge, Item } from './game/content'
import {
  HERITAGE_COIN_CAP,
  addDays,
  buy,
  challengeProgress,
  chantierPrime,
  chantierSkin,
  chantierStatus,
  claim,
  claimChallenge,
  collectChantier,
  dailyChallenges,
  dayKey,
  equipmentBonus,
  grantStarter,
  isRewardClaimed,
  lastDays,
  levelInfo,
  migrateSave,
  newGame,
  pruneWork,
  shopItems,
  streak,
  talentProgress,
  toggleEquip,
  weeklyChallenge,
  workCount,
  workEvent,
} from './game/engine'
import type { ActivityEvent, Chantier as GameChantier, GameState, TalentKey } from './game/types'
import { barSvg, bulbsSvg, icon, pictureSvg, thumbSvg } from './pictures'
import { fabriqueSvg } from './scene'
import { projectName, workFromTool } from './work'
import type { Work } from './work'

// Ottho Quest dans un panneau, à côté de la conversation : tout le jeu, sans
// page web. Le joueur l'active projet par projet (/quest) : ailleurs, le mod ne
// montre rien et ne lit rien. Dans un projet activé, son travail avec Claude
// rapporte (demandes, fichiers, commits, agents et outils, plafonnés par jour),
// en plus de l'activité et des chantiers lus par le connecteur de l'Academy déjà
// branché sur son Claude. La partie est gardée sur ce poste, par compte. Le
// moteur (hooks/game) est celui du jeu web, plus les actions du projet.
// « Faire vérifier » envoie la demande dans la conversation en cours : la
// session est déjà ouverte sur le projet.

const PANE = 'ottho-quest'
const TITLE = 'Ottho Quest'
const CONNECT_URL = 'https://academy.ottho.co/profile?tab=ia'

/** Retenu d'une session à l'autre. */
/** Les projets où le joueur a activé le jeu (leur racine). */
const PROJECTS_KEY = 'projects'
/** Le panneau fermé par le joueur, par projet. */
const closedKey = (root: string) => `closed:${root}`
/** Le travail fait avant la première lecture du compte, encaissé dès qu'il est connu. */
const PENDING_KEY = 'work-pending'
const ACCOUNT_KEY = 'account'
/** La partie tenue sur ce poste tant qu'aucun compte Academy n'a pu être lu. */
const LOCAL = 'local'
const saveKey = (account: string) => `save:${account}`
const sinceKey = (account: string) => `since:${account}`

/** Les couleurs du jeu (src/app/globals.css d'Ottho Quest). */
const C = {
  wall: '#2b2156',
  plate: '#1b1539',
  line: '#4b4196',
  ink: '#f3ecff',
  dim: '#b3abda',
  orange: '#ff8a2a',
  mint: '#3ddc97',
  gold: '#ffd166',
  violet: '#7c5cff',
  xp: '#7ef0c9',
  danger: '#ff5a5a',
}

const NOT_CONNECTED =
  "L'Academy n'est pas branchée sur ce Claude, ou pas dans ce projet. Branche-la depuis Mon IA, puis actualise."
const NO_ACTIVITY_TOOL =
  "Ton Claude ne voit pas encore ton activité Academy : ouvre une nouvelle session pour qu'il la charge. En attendant, ton travail ici et tes chantiers comptent déjà."

const TABS: { id: Tab; label: string }[] = [
  { id: 'fabrique', label: 'Fabrique' },
  { id: 'chantiers', label: 'Chantiers' },
  { id: 'builder', label: 'Builder' },
  { id: 'boutique', label: 'Boutique' },
]

const EMPTY_BOARD: Board = { phase: 'idle', items: [], message: null, checking: null }
const EMPTY_PLAY: Play = { tab: 'fabrique', account: null, game: null, phase: 'idle', message: null }

// Changer l'étiquette quand les champs changent : elle écarte ce qu'une version
// précédente a gardé, qui survit à un rechargement.
const board = atom({ plugin: 'ottho-quest', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-1' })
const play = atom({ plugin: 'ottho-quest', key: 'play' } as const, EMPTY_PLAY, { shape: 'play-1' })

// --- Lecture des réponses de l'Academy ---

/** Ce que le joueur demande à son Claude : le titre suffit, Claude retrouve l'exercice. */
export function phrase(chantier: Pick<Chantier, 'title'>): string {
  return `Vérifie mon exercice Ottho « ${chantier.title} »`
}

const STATUSES: Record<string, ChantierStatus> = {
  'à faire': 'todo',
  'à reprendre': 'retry',
  réussi: 'done',
}

/**
 * Lit la réponse de `list_my_exercises` : une liste JSON, ou une phrase quand
 * il n'y a aucun exercice. `null` si elle ne ressemble à rien de connu.
 */
export function parseExercises(text: string): Chantier[] | null {
  if (text.trim().startsWith('Aucun exercice')) return []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null
  const items: Chantier[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (typeof r.exercise_id !== 'string' || typeof r.title !== 'string') continue
    items.push({
      id: r.exercise_id,
      title: r.title,
      path: typeof r.path === 'string' ? r.path : '',
      status: STATUSES[String(r.status)] ?? 'todo',
      score: typeof r.best_score === 'number' ? r.best_score : null,
      url: typeof r.url === 'string' && r.url.startsWith('https://') ? r.url : '',
      draft: r.brouillon === true,
    })
  }
  return items
}

/** Lit la réponse de `get_my_activity`. `null` si elle ne ressemble à rien de connu. */
export function parseActivity(text: string): { account: string; events: ActivityEvent[]; more: boolean } | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.user_id !== 'string' || !Array.isArray(r.events)) return null
  const events: ActivityEvent[] = []
  for (const row of r.events) {
    if (!row || typeof row !== 'object') continue
    const e = row as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.at !== 'string' || typeof e.rule !== 'string') continue
    // Une règle que le jeu ne connaît pas est écartée par le moteur à l'encaissement.
    events.push({
      id: e.id,
      rule: e.rule as ActivityEvent['rule'],
      at: e.at,
      ...(typeof e.course === 'string' ? { course: e.course } : {}),
      ...(typeof e.resource === 'string' ? { resource: e.resource } : {}),
    })
  }
  return { account: r.user_id, events, more: r.more === true }
}

/** Le cours d'un chantier : le début de son chemin (cours › module › chapitre). */
function courseOf(chantier: Chantier): string {
  return chantier.path.split(' › ')[0] ?? ''
}

/** Le chantier tel que le moteur du jeu le lit. */
function asGameChantier(chantier: Chantier): GameChantier {
  return { id: chantier.id, title: chantier.title, instructions: '', course: courseOf(chantier), url: chantier.url }
}

function builderOf(game: GameState): BuilderId {
  const n = Number.isInteger(game.avatar.character) ? (game.avatar.character as number) : 0
  return BUILDERS[((n % BUILDERS.length) + BUILDERS.length) % BUILDERS.length] ?? 'cle'
}

// --- Synchronisation avec l'Academy ---

/**
 * Les écritures de la partie, une à la fois : le travail du projet, les clics
 * et la synchro lisent puis réécrivent la même sauvegarde.
 */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

// --- Projets activés ---

async function activeProjects($: EngineInterface): Promise<string[]> {
  const value = await $.store.get(PROJECTS_KEY)
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

async function isActive($: EngineInterface, root: string): Promise<boolean> {
  return (await activeProjects($)).includes(root)
}

async function setActive($: EngineInterface, root: string, active: boolean): Promise<void> {
  const others = (await activeProjects($)).filter(r => r !== root)
  await $.store.set(PROJECTS_KEY, active ? [...others, root].slice(-50) : others)
}

/** Active ou met en pause le jeu dans le projet de la session. */
async function toggleProject($: EngineInterface, active: boolean): Promise<void> {
  const root = await $.session.root()
  await setActive($, root, active)
  if (!active) {
    await $.ui.close({ id: PANE })
    return
  }
  await $.store.delete(closedKey(root))
  await syncAll($)
}

/** Une lecture à la fois : deux appels rapprochés n'en font qu'une. */
let syncing: Promise<void> | null = null

export function syncAll($: EngineInterface): Promise<void> {
  if (!syncing) {
    syncing = runSync($).finally(() => {
      syncing = null
    })
  }
  return syncing
}

async function runSync($: EngineInterface): Promise<void> {
  await update($, play, (p): Play => ({ ...p, phase: 'loading' }))
  await update($, board, (b): Board => ({ ...b, phase: 'loading' }))
  const name = await findServer($)
  if (!name) {
    await update($, board, (b): Board => ({ ...b, phase: 'error', message: NOT_CONNECTED }))
    await loadWithoutActivity($, NOT_CONNECTED)
    return
  }
  await Promise.all([syncActivity($, name), syncChantiers($, name)])
}

/** Lit l'activité du compte, depuis la dernière lecture si le compte est connu. */
async function readActivity(
  $: EngineInterface,
  name: string,
): Promise<{ account: string; events: ActivityEvent[] }> {
  const stored = await $.store.get(ACCOUNT_KEY)
  const known = typeof stored === 'string' ? stored : null
  const savedSince = known ? await $.store.get(sinceKey(known)) : undefined
  let since = typeof savedSince === 'string' ? savedSince : undefined
  let account: string | null = null
  const events: ActivityEvent[] = []
  for (let page = 0; page < 20; page++) {
    const answer = parseActivity(await callAcademy($, name, 'get_my_activity', since ? { since } : {}))
    if (!answer) throw new Error("réponse de l'Academy illisible")
    if (account === null && since && answer.account !== known) {
      // Un autre compte que la dernière fois : tout relire pour celui-ci.
      account = answer.account
      since = undefined
      continue
    }
    account = answer.account
    events.push(...answer.events)
    const last = answer.events[answer.events.length - 1]
    if (!answer.more || !last) break
    since = last.at
  }
  if (!account) throw new Error('compte Academy introuvable')
  return { account, events }
}

/** Encaisse l'activité nouvelle du compte, et charge sa partie. */
async function syncActivity($: EngineInterface, name: string): Promise<void> {
  // Même absent de la liste que la session a chargée, l'outil peut répondre :
  // le serveur est à jour avant que le Claude du joueur ne relise ses outils.
  try {
    const { account, events } = await readActivity($, name)
    const { out, isNew } = await serial(async () => {
      const saved = await $.store.get(saveKey(account))
      const isNew = saved === undefined || saved === null
      // Première partie de ce compte sur ce poste : la partie tenue sans compte
      // s'il y en a une, sinon le cadeau de départ ; puis l'héritage de
      // l'activité passée, aux pièces plafonnées comme dans le jeu web.
      const local = isNew ? await $.store.get(saveKey(LOCAL)) : undefined
      const start =
        local !== undefined && local !== null
          ? migrateSave(local)
          : grantStarter({ ...newGame(), onboarded: true, name: 'Builder' })
      const out = isNew ? claim(start, events, { coinCap: HERITAGE_COIN_CAP }) : claim(migrateSave(saved), events)
      const state = await claimPending($, out.state)
      await $.store.set(saveKey(account), state)
      if (local !== undefined && local !== null) await $.store.delete(saveKey(LOCAL))
      await $.store.set(ACCOUNT_KEY, account)
      const newest = events.reduce<string | null>((max, e) => (max === null || e.at > max ? e.at : max), null)
      if (newest) await $.store.set(sinceKey(account), newest)
      await update($, play, (p): Play => ({ ...p, account, game: state, phase: 'ready', message: null }))
      return { out, isNew }
    })
    if (!isNew && out.summary.count > 0) {
      $.ui.toast(`Activité encaissée : +${out.summary.xp} XP, +${out.summary.coins} pièces`)
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    const missing =
      hasTool('get_my_activity') === false ||
      (error instanceof AcademyError && /get_my_activity|unknown tool|not found|introuvable/i.test(text))
    if (!(error instanceof AcademyError) && hasTool('get_my_activity') !== false) forgetServer()
    await loadWithoutActivity($, missing ? NO_ACTIVITY_TOOL : `Lecture de ton activité impossible : ${text}`)
  }
}

/**
 * L'activité ne se lit pas : la partie se charge quand même, celle du dernier
 * compte lu sur ce poste ou une partie tenue sans compte, reprise par le
 * premier compte lu ensuite. Le travail du projet et les chantiers comptent.
 */
async function loadWithoutActivity($: EngineInterface, message: string): Promise<void> {
  const state = await serial(async () => {
    const known = await $.store.get(ACCOUNT_KEY)
    const account = typeof known === 'string' ? known : LOCAL
    const saved = await $.store.get(saveKey(account))
    const base =
      saved === undefined || saved === null
        ? grantStarter({ ...newGame(), onboarded: true, name: 'Builder' })
        : migrateSave(saved)
    const next = await claimPending($, base)
    await $.store.set(saveKey(account), next)
    await $.store.set(ACCOUNT_KEY, account)
    return { account, next }
  })
  await update($, play, (p): Play => ({ ...p, account: state.account, game: state.next, phase: 'error', message }))
}

async function syncChantiers($: EngineInterface, name: string): Promise<void> {
  try {
    const items = parseExercises(await callAcademy($, name, 'list_my_exercises'))
    if (!items) throw new Error("réponse de l'Academy illisible")
    await update($, board, (b): Board => ({ ...b, phase: 'ready', items, message: null }))
  } catch (error) {
    if (!(error instanceof AcademyError)) forgetServer()
    const text = error instanceof Error ? error.message : String(error)
    await update($, board, (b): Board => ({ ...b, phase: 'error', message: `Lecture des chantiers impossible : ${text}` }))
  }
}

// --- Actions du joueur ---

/** Change la partie et la sauvegarde ; `null` : rien à changer. */
function mutate($: EngineInterface, change: (game: GameState) => GameState | null): Promise<GameState | null> {
  return serial(async () => {
    const { game, account } = await read($, play)
    if (!game || !account) return null
    const next = change(game as GameState)
    if (!next) return null
    await update($, play, (p): Play => ({ ...p, game: next }))
    await $.store.set(saveKey(account), next)
    return next
  })
}

// --- Le travail fait dans le projet ---

/** Une action du projet, gardée en attendant que le compte soit connu. */
type PendingWork = Work & { at: string; project: string }

function isPendingWork(value: unknown): value is PendingWork {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    (PROJECT_RULES as unknown[]).includes(v.rule) &&
    (TALENT_KEYS as unknown[]).includes(v.talent) &&
    typeof v.at === 'string' &&
    typeof v.project === 'string' &&
    (v.key === undefined || typeof v.key === 'string')
  )
}

/** Encaisse le travail mis de côté avant la première lecture du compte. */
async function claimPending($: EngineInterface, state: GameState): Promise<GameState> {
  const list = await $.store.get(PENDING_KEY)
  if (!Array.isArray(list) || list.length === 0) return state
  let next = state
  for (const item of list.filter(isPendingWork)) {
    const event = workEvent(pruneWork(next, dayKey(item.at)), item)
    if (event) next = claim(next, [event]).state
  }
  await $.store.delete(PENDING_KEY)
  return next
}

/** Encaisse une action du projet, si le jeu est activé dans ce projet. */
async function recordWork($: EngineInterface, work: Work): Promise<void> {
  const root = await $.session.root()
  if (!(await isActive($, root))) return
  const at = new Date(await $.clock.now()).toISOString()
  const item: PendingWork = { ...work, at, project: projectName(root) }
  await serial(async () => {
    const stored = await $.store.get(ACCOUNT_KEY)
    const account = typeof stored === 'string' ? stored : null
    const saved = account ? await $.store.get(saveKey(account)) : undefined
    if (!account || saved === undefined || saved === null) {
      const list = await $.store.get(PENDING_KEY)
      await $.store.set(PENDING_KEY, [...(Array.isArray(list) ? list : []), item].slice(-100))
      return
    }
    const p = await read($, play)
    const base = p.account === account && p.game ? (p.game as GameState) : migrateSave(saved)
    const state = pruneWork(base, dayKey(at))
    const event = workEvent(state, item)
    if (!event) return
    const out = claim(state, [event])
    await $.store.set(saveKey(account), out.state)
    if (p.account === account) await update($, play, (current): Play => ({ ...current, game: out.state }))
    if (work.rule === 'project_commit') {
      $.ui.toast(`Commit encaissé : +${out.summary.xp} XP, +${out.summary.coins} pièces`)
    }
  })
}

async function verify($: EngineInterface, chantier: Chantier): Promise<void> {
  await update($, board, (b): Board => ({ ...b, checking: chantier.id }))
  await $.prompt.submit({ text: phrase(chantier), asUser: true })
}

async function collect($: EngineInterface, chantier: Chantier): Promise<void> {
  const at = await $.clock.now()
  const { game } = await read($, play)
  const out = game ? collectChantier(game as GameState, asGameChantier(chantier), at) : null
  if (!out) return
  await mutate($, () => out.state)
  const item = out.result.item ? itemById(out.result.item) : undefined
  $.ui.toast(`Butin : +${out.result.xp} XP, +${out.result.coins} pièces${item ? `, et ${item.name}` : ''}`)
}

// --- Petits textes ---

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function weekdayLetter(key: string): string {
  return WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()] ?? ''
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

function relativeDay(at: string, now: number): string {
  const day = dayKey(at)
  const today = dayKey(now)
  if (day === today) return "aujourd'hui"
  if (day === addDays(today, -1)) return 'hier'
  for (let n = 2; n <= 6; n++) if (day === addDays(today, -n)) return `il y a ${n} jours`
  const [, month, date] = day.split('-')
  return `le ${Number(date)}/${month}`
}

/** Ce que Zinc dit sur la Fabrique. */
function fabriqueTip(game: GameState, now: number, ready: boolean): string {
  const today = dayKey(now)
  const run = streak(game.activeDays, today)
  const todayCount = game.log.filter(e => dayKey(e.at) === today).length
  if (ready) return "L'Academy a validé ton chantier. Ton butin t'attend dans l'onglet Chantiers !"
  if (todayCount === 0) {
    return run > 0
      ? `Rien encore aujourd'hui. Une demande à Claude dans ton projet ou une leçon, et ta série de ${plural(run, 'jour', 'jours')} continue.`
      : "Rien encore aujourd'hui. Une demande à Claude dans ton projet, ou une leçon à l'Academy, allume l'ampoule du jour."
  }
  return `Belle journée : ${plural(todayCount, 'action encaissée', 'actions encaissées')}. Ton builder te dit merci.`
}

/** Ce que Zinc dit sur les chantiers. */
function chantiersTip(b: Board, ready: boolean): string {
  if (b.phase === 'error') return b.message ?? NOT_CONNECTED
  if (b.checking) return "Claude vérifie ton chantier. Je mets la liste à jour dès qu'il a fini."
  if (ready) return "L'Academy a validé ton chantier. Ton butin t'attend !"
  if (b.phase !== 'ready') return 'Je regarde tes chantiers.'
  if (b.items.length === 0) return "Aucun chantier ouvert pour l'instant. Les premiers arrivent bientôt."
  return "Un chantier, c'est une vraie tâche dans ce projet. Fais-la, demande la vérification : Claude regarde, l'Academy te paie."
}

export const register: Register = on => {
  // Hors d'un projet activé, le mod ne montre rien et ne lit rien.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quest',
      description: 'Active Ottho Quest dans ce projet et ouvre le jeu (/quest pause le met en pause)',
    })
    const root = await $.session.root()
    if (await isActive($, root)) {
      if ((await $.store.get(closedKey(root))) !== true) void $.ui.open({ id: PANE, title: TITLE })
      void syncAll($).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'quest' }, async ($, e) => {
    const root = await $.session.root()
    const name = projectName(root)
    if (/^(pause|stop|off|arr[eê]t)/i.test(e.args.trim())) {
      await toggleProject($, false)
      return { text: `Ottho Quest est en pause dans ${name} : ton travail ici ne compte plus. /quest le relance.` }
    }
    const was = await isActive($, root)
    await setActive($, root, true)
    await $.store.delete(closedKey(root))
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    await syncAll($)

    return {
      text: was
        ? 'Ottho Quest ouvert.'
        : `Ottho Quest est activé dans ${name} : ton travail ici avec Claude rapporte de l'XP.`,
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await $.store.set(closedKey(await $.session.root()), true)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const failed = typeof ran.deny === 'string' || ran.isError === true
    const work = workFromTool({
      tool: e.tool,
      agentId: e.agentId,
      command: e.tool === 'Bash' ? e.command : undefined,
      filePath: e.tool === 'Write' || e.tool === 'Edit' ? e.file_path : undefined,
      result: ran.result,
      failed,
    })
    if (work) void recordWork($, work).catch(() => undefined)
    // Une preuve rendue, d'où qu'elle vienne (le bouton ou une demande tapée) :
    // le statut a changé dans l'Academy.
    if (/^mcp__.+__submit_exercise$/.test(e.tool) && (await isActive($, await $.session.root()))) void syncAll($).catch(() => undefined)

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // Une demande traitée dans la conversation principale (pas un sous-agent).
    if (e.agentId === undefined && e.reason === 'answer') {
      void recordWork($, { rule: 'project_prompt', talent: 'prompt' }).catch(() => undefined)
    }
    const b = await read($, board)
    if (b.checking) {
      await update($, board, (current): Board => ({ ...current, checking: null }))
      void syncAll($).catch(() => undefined)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Link, Input } = table
    // Les images passent par un SVG : partout sauf dans le terminal, qui n'en dessine pas.
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : null
    const p = await read($, play)
    const b = await read($, board)
    const now = await $.clock.now()
    const root = await $.session.root()
    const active = await isActive($, root)
    const projet = projectName(root)
    // Écrit par syncActivity et mutate : toujours un GameState du moteur.
    const game = p.game as GameState | null

    /** Une image du jeu, ou rien dans le terminal. */
    const pic = (picture: Picture | null, alt: string, scale = 1) =>
      Svg && picture ? (
        <Svg source={pictureSvg(picture, scale)} alt={alt} width={picture.w * scale} height={picture.h * scale} />
      ) : null

    /** La bulle de Zinc. */
    const bubble = (tip: string) => (
      <Box flexDirection="row" gap={1} alignItems="flex-start">
        {pic(HEADS.zinc, 'Zinc')}
        <Box
          flexDirection="column"
          flexShrink={1}
          flexGrow={1}
          paddingX={1}
          borderStyle="round"
          borderColor={C.line}
          backgroundColor={C.plate}
        >
          <Text bold color={C.orange}>
            ZINC
          </Text>
          <Text color={C.ink}>{tip}</Text>
        </Box>
      </Box>
    )

    const title = (text: string) => (
      <Text bold color={C.dim}>
        {text}
      </Text>
    )

    const coins = (value: number, plus = false) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        {pic(icon('coin-20'), 'pièces')}
        <Text bold color={C.gold}>
          {plus ? '+' : ''}
          {value}
        </Text>
      </Box>
    )

    const xp = (value: number) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        {pic(icon('bolt-20'), 'XP')}
        <Text bold color={C.xp}>
          +{value} XP
        </Text>
      </Box>
    )

    const talentChip = (talent: TalentKey, value: string) => (
      <Box key={`chip-${talent}`} flexDirection="row" gap={1} alignItems="center">
        {pic(icon(`${talent}-20`), TALENTS[talent].name)}
        <Text color={TALENTS[talent].color}>
          {TALENTS[talent].name} {value}
        </Text>
      </Box>
    )

    /** Une jauge : dessinée en SVG, en texte dans le terminal. */
    const bar = (value: number, max: number, color: string, label: string, width?: number) =>
      Svg ? (
        <Svg source={barSvg(value, max, color, label, width)} alt={label} />
      ) : (
        <Text color={color}>
          {'#'.repeat(Math.round(10 * Math.min(1, max > 0 ? value / max : 0))).padEnd(10, '.')} {label}
        </Text>
      )

    const refresh = (
      <Button
        key="actualiser"
        dimColor
        label={p.phase === 'loading' ? 'Lecture en cours' : 'Actualiser'}
        onPress={() => {
          void syncAll($)
            .then(async () => {
              const after = await read($, play)
              $.ui.toast(after.phase === 'ready' ? 'Ottho Quest est à jour' : 'Lecture terminée, voir le message')
            })
            .catch(() => undefined)
        }}
      />
    )

    /** Le projet de la session : le jeu y est actif ou en pause. */
    const projectBar = (
      <Box key="projet" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Text color={active ? C.mint : C.dim}>
          {active ? `Projet ${projet} · ton travail ici compte` : `Projet ${projet} · en pause`}
        </Text>
        <Button
          key={active ? 'pause-projet' : 'activer-projet'}
          dimColor
          label={active ? 'Mettre en pause ici' : 'Activer ici'}
          onPress={() => {
            void toggleProject($, !active)
          }}
        />
      </Box>
    )

    // --- Sans partie : chargement ou erreur ---
    if (!game) {
      const tip = p.phase === 'error' ? (p.message ?? NOT_CONNECTED) : "Je regarde ton activité à l'Academy."
      return (
        <Box flexDirection="column" gap={1} padding={1} backgroundColor={C.wall}>
          {Svg && <Svg source={fabriqueSvg('cle')} alt="La Fabrique, l'atelier d'Ottho Quest" />}
          {projectBar}
          {bubble(tip)}
          {p.message === NOT_CONNECTED && <Link href={CONNECT_URL} label="Brancher l'Academy (Mon IA)" />}
          {refresh}
        </Box>
      )
    }

    const level = levelInfo(game.xp)
    const ready = b.items.some(c => chantierStatus(game, c.id) === 'validated')

    const header = (
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Text bold color={C.orange}>
          Niv. {level.level}
        </Text>
        <Text color={C.dim}>{level.title}</Text>
        {bar(level.into, level.need, '#2fb890', `${level.into} / ${level.need} XP`, 160)}
        {coins(game.coins)}
      </Box>
    )

    const tabs = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {TABS.map(tab => (
          <Button
            key={`onglet-${tab.id}`}
            variant={p.tab === tab.id ? 'primary' : 'secondary'}
            label={tab.id === 'chantiers' && ready ? `${tab.label} !` : tab.label}
            onPress={() => {
              void update($, play, (current): Play => ({ ...current, tab: tab.id }))
            }}
          />
        ))}
      </Box>
    )

    // --- Fabrique ---
    const fabrique = () => {
      const today = dayKey(now)
      const run = streak(game.activeDays, today)
      const days = lastDays(game.activeDays, today).map(d => ({ ...d, letter: weekdayLetter(d.key) }))
      const challenges: Challenge[] = [...dailyChallenges(today), weeklyChallenge()]
      const recent = game.log.slice(-6).reverse()
      return (
        <Box flexDirection="column" gap={1}>
          {Svg && <Svg source={fabriqueSvg(builderOf(game))} alt="La Fabrique : ton builder et Zinc, l'automate" />}
          {bubble(fabriqueTip(game, now, ready))}

          {title('TA SÉRIE')}
          <Box key="serie" flexDirection="column" borderStyle="round" borderColor={C.line} backgroundColor={C.plate} paddingX={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold color={C.gold}>
                {plural(run, 'jour', 'jours')}
              </Text>
              <Text color={C.dim}>
                objectif {game.streakGoal} jours{run >= game.streakGoal ? ' · atteint' : ''}
              </Text>
            </Box>
            {Svg ? (
              <Svg source={bulbsSvg(days)} alt={`Les sept derniers jours : ${days.filter(d => d.active).length} actifs`} />
            ) : (
              <Text color={C.dim}>{days.map(d => (d.active ? 'o' : '.')).join(' ')}</Text>
            )}
          </Box>

          {title("TON TRAVAIL AUJOURD'HUI")}
          <Box key="travail" flexDirection="column" borderStyle="round" borderColor={C.line} backgroundColor={C.plate} paddingX={1}>
            {!active && (
              <Text color={C.dim}>En pause dans ce projet : « Activer ici » ou /quest, et ton travail y compte.</Text>
            )}
            {PROJECT_RULES.map(rule => {
              const done = workCount(game, rule, today)
              const cap = PROJECT_CAPS[rule]
              return (
                <Box key={`travail-${rule}`} flexDirection="row" justifyContent="space-between" gap={1} alignItems="center">
                  <Box flexDirection="column" flexShrink={1}>
                    <Text color={C.ink}>{PROJECT_LABELS[rule]}</Text>
                    <Text color={C.dim}>
                      +{RULES[rule].xp} XP chacun
                    </Text>
                  </Box>
                  {bar(done, cap, done >= cap ? C.mint : C.violet, `${done} / ${cap}`, 120)}
                </Box>
              )
            })}
          </Box>

          {title('DÉFIS')}
          {challenges.map(challenge => {
            const progress = challengeProgress(game, challenge, today)
            const complete = progress >= challenge.target
            const paid = isRewardClaimed(game, challenge, today)
            return (
              <Box
                key={`defi-${challenge.scope}-${challenge.id}`}
                flexDirection="column"
                borderStyle="round"
                borderColor={C.line}
                backgroundColor={C.plate}
                paddingX={1}
              >
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text bold color={paid ? C.dim : C.ink} strikethrough={paid}>
                    {challenge.label}
                    {challenge.scope === 'week' ? ' (semaine)' : ''}
                  </Text>
                  {coins(challenge.coins, true)}
                </Box>
                <Box flexDirection="row" gap={1} alignItems="center">
                  {bar(progress, challenge.target, complete ? C.mint : C.violet, `${progress} / ${challenge.target}`, 180)}
                  {paid ? (
                    <Text bold color={C.mint}>
                      Récupéré
                    </Text>
                  ) : complete ? (
                    <Button
                      key={`recuperer-${challenge.scope}-${challenge.id}`}
                      variant="primary"
                      label="Récupérer"
                      onPress={() => {
                        void mutate($, g => claimChallenge(g, challenge, today))
                      }}
                    />
                  ) : null}
                </Box>
              </Box>
            )
          })}

          {title('TON ACTIVITÉ')}
          <Box key="activite" flexDirection="column" borderStyle="round" borderColor={C.line} backgroundColor={C.plate} paddingX={1}>
            {recent.length === 0 && (
              <Text color={C.dim}>Aucune action encaissée pour l'instant. Travaille dans ce projet avec Claude, ou termine une leçon à l'Academy.</Text>
            )}
            {recent.map(entry => (
              <Box key={`log-${entry.id}`} flexDirection="row" justifyContent="space-between" gap={1}>
                <Box flexDirection="column" flexShrink={1}>
                  <Text bold color={C.ink}>
                    {RULES[entry.rule]?.label ?? entry.rule}
                  </Text>
                  <Text color={C.dim}>{[entry.course, relativeDay(entry.at, now)].filter(Boolean).join(' · ')}</Text>
                </Box>
                {xp(entry.xp)}
              </Box>
            ))}
            {p.phase === 'error' && p.message && <Text color={C.danger}>{p.message}</Text>}
            {p.message === NOT_CONNECTED && <Link href={CONNECT_URL} label="Brancher l'Academy (Mon IA)" />}
          </Box>
        </Box>
      )
    }

    // --- Chantiers ---
    const chantiers = () => {
      const order: Record<string, number> = { validated: 0, todo: 1, done: 2 }
      const items = [...b.items].sort(
        (a, c) => (order[chantierStatus(game, a.id)] ?? 1) - (order[chantierStatus(game, c.id)] ?? 1),
      )
      return (
        <Box flexDirection="column" gap={1}>
          {bubble(chantiersTip(b, ready))}
          {b.message === NOT_CONNECTED && <Link href={CONNECT_URL} label="Brancher l'Academy (Mon IA)" />}
          {items.map(chantier => {
            const state = chantierStatus(game, chantier.id)
            const prime = chantierPrime(game, asGameChantier(chantier))
            const done = game.history.find(h => h.chantierId === chantier.id)
            const skin = chantierSkin(chantier.id)
            const isChecking = b.checking === chantier.id
            const status =
              state === 'validated'
                ? { text: "Validé par l'Academy : récupère ton butin", color: C.mint }
                : state === 'done'
                  ? { text: 'Terminé', color: C.dim }
                  : chantier.status === 'retry'
                    ? {
                        text: `À reprendre${chantier.score === null ? '' : `, meilleure note ${chantier.score}/100`}`,
                        color: C.gold,
                      }
                    : chantier.status === 'done'
                      ? { text: "Réussi : l'Academy le compte, actualise", color: C.mint }
                      : { text: 'À faire', color: C.orange }
            return (
              <Box
                key={chantier.id}
                flexDirection="column"
                gap={1}
                borderStyle="round"
                borderColor={C.line}
                backgroundColor={C.plate}
                paddingX={1}
              >
                <Box flexDirection="row" gap={1} alignItems="flex-start">
                  {Svg && <Svg source={thumbSvg(skin.scene)} alt={skin.place} />}
                  <Box flexDirection="column" flexShrink={1}>
                    <Text bold color={C.ink}>
                      {chantier.title}
                      {chantier.draft ? ' (brouillon)' : ''}
                    </Text>
                    <Text color={C.dim}>
                      {skin.place}
                      {courseOf(chantier) ? ` · ${courseOf(chantier)}` : ''}
                    </Text>
                    <Text color={status.color}>{status.text}</Text>
                    <Box flexDirection="row" gap={1}>
                      {coins(done ? done.coins : prime.coins, true)}
                      {xp(done ? done.xp : prime.xp)}
                    </Box>
                  </Box>
                </Box>
                {state === 'todo' && prime.needs.length > 0 && (
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {prime.needs.map(n => talentChip(n.talent, n.met ? 'OK' : `${n.have}/2`))}
                  </Box>
                )}
                {state === 'validated' && (
                  <Button
                    key={`butin-${chantier.id}`}
                    variant="primary"
                    label="Récupérer le butin"
                    onPress={() => {
                      void collect($, chantier)
                    }}
                  />
                )}
                {state === 'todo' && (
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    <Button
                      key={`verifier-${chantier.id}`}
                      variant="primary"
                      label={isChecking ? 'Vérification en cours' : 'Faire vérifier'}
                      onPress={() => {
                        if (!b.checking) void verify($, chantier)
                      }}
                    />
                    {chantier.url && <Link href={chantier.url} label="Consigne" />}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )
    }

    // --- Builder ---
    const builderTab = () => {
      const bonus = equipmentBonus(game)
      const owned = game.inventory.map(id => itemById(id)).filter((i): i is Item => i !== undefined)
      const builder = builderOf(game)
      return (
        <Box flexDirection="column" gap={1}>
          <Box key="portrait" flexDirection="row" gap={2} alignItems="center" borderStyle="round" borderColor={C.line} backgroundColor={C.plate} paddingX={1}>
            {pic(SPRITES[builder], 'Ton builder')}
            <Box flexDirection="column" flexShrink={1} gap={1}>
              <Text bold color={C.ink}>
                {game.name || 'Builder'}
              </Text>
              <Text color={C.orange}>
                Niveau {level.level} · {level.title}
              </Text>
              {Svg && (
                <Button
                  key="builder"
                  label="Changer de builder"
                  onPress={() => {
                    void mutate($, g => ({
                      ...g,
                      avatar: { ...g.avatar, character: (BUILDERS.indexOf(builderOf(g)) + 1) % BUILDERS.length },
                    }))
                  }}
                />
              )}
              <Input
                key="nom"
                label="Son nom"
                value={game.name}
                placeholder="Nom du builder"
                submitLabel="Renommer"
                onSubmit={value => {
                  const name = value.trim().slice(0, 20)
                  if (name) void mutate($, g => ({ ...g, name }))
                }}
              />
            </Box>
          </Box>

          {title('TALENTS')}
          {TALENT_KEYS.map(talent => {
            const progress = talentProgress(game.talentXp[talent])
            return (
              <Box
                key={`talent-${talent}`}
                flexDirection="row"
                gap={1}
                alignItems="center"
                borderStyle="round"
                borderColor={C.line}
                backgroundColor={C.plate}
                paddingX={1}
              >
                {pic(icon(`${talent}-32`), TALENTS[talent].name)}
                <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text bold color={TALENTS[talent].color}>
                      {TALENTS[talent].name}
                    </Text>
                    <Text bold color={C.ink}>
                      Niv. {progress.level}
                      {bonus[talent] ? ` +${bonus[talent]}` : ''}
                    </Text>
                  </Box>
                  <Text color={C.dim}>{TALENTS[talent].text}</Text>
                  {bar(progress.into, progress.need, TALENTS[talent].color, `${progress.into} / ${progress.need}`, 200)}
                </Box>
              </Box>
            )
          })}

          {title('ÉQUIPEMENT')}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {(Object.keys(SLOTS) as (keyof typeof SLOTS)[]).map(slot => {
              const id = game.equipped[slot]
              const item = id ? itemById(id) : undefined
              return (
                <Box
                  key={`slot-${slot}`}
                  flexDirection="column"
                  alignItems="center"
                  minWidth={12}
                  borderStyle="round"
                  borderColor={C.line}
                  backgroundColor={C.plate}
                  paddingX={1}
                >
                  <Text bold color={C.dim}>
                    {SLOTS[slot].toUpperCase()}
                  </Text>
                  {item ? pic(icon(`${item.id}-36`), item.name) : null}
                  <Text color={item ? C.ink : C.dim}>{item ? item.name : 'Vide'}</Text>
                </Box>
              )
            })}
          </Box>

          {title('TON SAC')}
          {owned.length === 0 && (
            <Text color={C.dim}>Rien pour l'instant. La boutique et les chantiers remplissent le sac.</Text>
          )}
          {owned.map(item => {
            const worn = game.equipped[item.slot] === item.id
            return (
              <Box
                key={`sac-${item.id}`}
                flexDirection="row"
                gap={1}
                alignItems="center"
                borderStyle="round"
                borderColor={C.line}
                backgroundColor={C.plate}
                paddingX={1}
              >
                {pic(icon(`${item.id}-48`), item.name)}
                <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                  <Text bold color={C.ink}>
                    {item.name}
                  </Text>
                  <Text color={C.dim}>{SLOTS[item.slot]}</Text>
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {TALENT_KEYS.filter(t => item.bonus[t]).map(t => talentChip(t, `+${item.bonus[t]}`))}
                  </Box>
                </Box>
                <Button
                  key={`equiper-${item.id}`}
                  variant={worn ? 'secondary' : 'primary'}
                  label={worn ? 'Retirer' : 'Équiper'}
                  onPress={() => {
                    void mutate($, g => toggleEquip(g, item.id))
                  }}
                />
              </Box>
            )
          })}
        </Box>
      )
    }

    // --- Boutique ---
    const boutique = () => (
      <Box flexDirection="column" gap={1}>
        {bubble(
          'Chaque outil renforce un talent, donc la prime de tes chantiers. Les pièces viennent de ton activité, des chantiers et des défis.',
        )}
        {title('EN RAYON')}
        {shopItems().map(item => {
          const owned = game.inventory.includes(item.id)
          const missing = item.price - game.coins
          return (
            <Box
              key={`rayon-${item.id}`}
              flexDirection="column"
              gap={1}
              borderStyle="round"
              borderColor={C.line}
              backgroundColor={C.plate}
              paddingX={1}
            >
              <Box flexDirection="row" gap={1} alignItems="flex-start">
                {pic(icon(`${item.id}-48`), item.name)}
                <Box flexDirection="column" flexShrink={1}>
                  <Text bold color={C.ink}>
                    {item.name}
                  </Text>
                  <Text color={C.dim}>{SLOTS[item.slot]}</Text>
                  <Text color={C.dim}>{item.text}</Text>
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {TALENT_KEYS.filter(t => item.bonus[t]).map(t => talentChip(t, `+${item.bonus[t]}`))}
                  </Box>
                </Box>
              </Box>
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                {coins(item.price)}
                {owned ? (
                  <Text bold color={C.mint}>
                    Dans ton sac
                  </Text>
                ) : (
                  <Button
                    key={`acheter-${item.id}`}
                    variant={missing > 0 ? 'secondary' : 'primary'}
                    label={missing > 0 ? `Il manque ${missing}` : 'Acheter'}
                    onPress={() => {
                      if (missing > 0) return
                      void mutate($, g => {
                        const out = buy(g, item.id)
                        return out.ok ? out.state : null
                      })
                    }}
                  />
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    const body =
      p.tab === 'chantiers'
        ? chantiers()
        : p.tab === 'builder'
          ? builderTab()
          : p.tab === 'boutique'
            ? boutique()
            : fabrique()

    return (
      <Box flexDirection="column" gap={1} padding={1} backgroundColor={C.wall}>
        {header}
        {projectBar}
        {tabs}
        {body}
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          {refresh}
          <Link href={ACADEMY_URL} label="Aller à l'Academy" />
        </Box>
      </Box>
    )
  }).catch(($, e, next) => {
    // Un dessin qui échoue montre son erreur plutôt qu'un panneau vide.
    const { Box, Text } = $.ui.resolve(e)
    const why = next.error.message ?? (next.error.kind === 'timeout' ? 'trop long à dessiner' : 'erreur inconnue')
    return (
      <Box flexDirection="column" padding={1} backgroundColor={C.wall}>
        <Text bold color={C.orange}>
          ZINC
        </Text>
        <Text color={C.ink}>Le panneau a rencontré un problème : {why}</Text>
      </Box>
    )
  })
}
