import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { BUILDERS } from '../hooks/art'
import { fabriqueSvg } from '../hooks/scene'

const PANE = {
  plugin: 'ottho-quest',
  component: 'Pane',
  requestId: 'ottho-quest',
  props: {
    title: 'Ottho Quest',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** Lance `/quest` comme la personne au clavier. */
const RUN = {
  command: 'quest',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const SERVER = '0f3c2a1b-5d6e-4f70-8a9b-0c1d2e3f4a5b'
const ROOT = '/Users/eleve/mon-site'
const ACCOUNT = '11111111-2222-3333-4444-555555555555'
const SKILL = '22222222-3333-4444-8555-666666666666'
const CLAUDE_MD = '33333333-4444-4555-8666-777777777777'
const NOT_LISTED = { isConnected: false, reason: 'unlisted', message: 'pas de serveur' } as const

/** Ce que l'Academy renvoie, tel que `list_my_exercises` le rend. */
const EXERCISES = [
  {
    exercise_id: CLAUDE_MD,
    title: 'Ton premier CLAUDE.md',
    path: 'Introduction à Claude Code › Commandes CLI › Exercice 5 : Mémoire projet',
    status: 'réussi',
    best_score: 80,
    url: 'https://academy.ottho.co/courses/x/y/exercises/ton-premier-claude-md',
  },
  {
    exercise_id: SKILL,
    title: 'Installe ton premier skill',
    path: 'Introduction à Claude Code › Commandes CLI › Exercice 7 : Installer un skill',
    status: 'à faire',
    best_score: null,
    url: 'https://academy.ottho.co/courses/x/z/exercises/installe-ton-premier-skill',
  },
]

/** L'activité du compte, telle que `get_my_activity` la rend. */
const EVENTS = [
  { id: 'e1', rule: 'lesson_completed', at: '2026-11-10T08:00:00Z', course: 'Introduction à Claude Code', resource: 'l1' },
  { id: 'e2', rule: 'lesson_completed', at: '2026-11-11T08:00:00Z', course: 'Introduction à Claude Code', resource: 'l2' },
  { id: 'e3', rule: 'lesson_completed', at: '2026-11-12T08:00:00Z', course: 'Introduction à Claude Code', resource: 'l3' },
  // L'Academy a validé « Ton premier CLAUDE.md » : son butin attend.
  { id: 'e4', rule: 'exercise_validated', at: '2026-11-13T08:00:00Z', course: 'Introduction à Claude Code', resource: CLAUDE_MD },
]

type Academy = {
  /** Les outils que la session montre ; sans `get_my_activity` : Academy pas encore à jour. */
  tools?: string[]
  /** L'Academy refuse `get_my_activity` (serveur pas encore à jour). */
  missingActivity?: boolean
  /** La racine du projet de la session. */
  root?: string
}

/** Un faux connecteur Academy et un magasin en mémoire, lisible par le test. */
function setup(on: On, academy: Academy = {}) {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  const tools = academy.tools ?? ['list_my_exercises', 'get_my_activity', 'submit_exercise']
  on('tool.list', () => ({
    value: [
      { name: 'Read', description: 'Lit un fichier', mcp: false },
      ...tools.map(t => ({ name: `mcp__${SERVER}__${t}`, description: t, mcp: true })),
    ],
  }))
  on('mcp.connect', () => ({ value: NOT_LISTED }))
  const asked: { tool: string; args: Record<string, unknown> }[] = []
  on('mcp.call', (_, e) => {
    asked.push({ tool: e.tool, args: e.args })
    if (e.tool === 'get_my_activity' && academy.missingActivity) {
      return { value: { content: [{ type: 'text', text: 'Tool get_my_activity not found' }], isError: true } }
    }
    const text =
      e.tool === 'list_my_exercises'
        ? JSON.stringify(EXERCISES)
        : e.tool === 'get_my_activity'
          ? JSON.stringify({ user_id: ACCOUNT, events: EVENTS, more: false })
          : ''
    return { value: { content: [{ type: 'text', text }], isError: false } }
  })
  on('command.register', () => ({ value: { command: 'quest' } }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('session.root', () => ({ value: academy.root ?? ROOT }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-13T10:00:00Z') }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { store, asked, toasts, opened }
}

type Found = { text: string }
async function texts(ui: { findAll: (q: { type: string }) => Promise<Found[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text)
}

test("la première partie hérite de l'activité passée, avec le cadeau de départ", async ($, on) => {
  const { store } = setup(on)
  await $.command.run(RUN)

  const save = store.get(`save:${ACCOUNT}`) as { xp: number; coins: number; inventory: string[]; validated: string[] }
  // 3 leçons (10 XP, 3 pièces) et un exercice validé (40 XP, 15 pièces), plus 50 pièces de départ.
  expect(save.xp).toBe(70)
  expect(save.coins).toBe(50 + 9 + 15)
  expect(save.inventory).toContain('tournevis')
  expect(save.validated).toContain(CLAUDE_MD)
  expect(store.get('account')).toBe(ACCOUNT)
  expect(store.get(`since:${ACCOUNT}`)).toBe('2026-11-13T08:00:00Z')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await texts(ui)).toContain('Niv. 1')
    expect(await ui.find({ key: 'onglet-boutique' })).not.toBe(undefined)
    await ui.unmount()
  }
})

test('la lecture suivante ne demande que le nouveau', async ($, on) => {
  const { asked } = setup(on)
  await $.command.run(RUN)
  await $.command.run(RUN)
  const activity = asked.filter(a => a.tool === 'get_my_activity')
  expect(activity.length).toBe(2)
  expect(activity[0]?.args).toEqual({})
  expect(activity[1]?.args).toEqual({ since: '2026-11-13T08:00:00Z' })
})

test("un chantier validé par l'Academy rend son butin, une seule fois", async ($, on) => {
  const { store, toasts } = setup(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'onglet-chantiers' })
  expect(await ui.find({ key: `butin-${CLAUDE_MD}` })).not.toBe(undefined)

  const coins = () => (store.get(`save:${ACCOUNT}`) as { coins: number }).coins
  const before = coins()
  await ui.press({ key: `butin-${CLAUDE_MD}` })
  for (let i = 0; i < 50 && coins() === before; i++) await ui.find({ key: 'onglet-chantiers' })
  // 50 pièces de base, plus 40 : le cours nourrit le talent Code, au niveau 2
  // avec le tournevis de départ (+1).
  expect(coins() - before).toBe(90)
  expect(await ui.find({ key: `butin-${CLAUDE_MD}` })).toBe(undefined)
  expect(await texts(ui)).toContain('Terminé')
  expect(toasts).toEqual(['Butin : +50 XP, +90 pièces'])
  await ui.unmount()
})

test('« Faire vérifier » envoie la demande dans la conversation, sans identifiant', async ($, on) => {
  setup(on)
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'onglet-chantiers' })
  await ui.press({ key: `verifier-${SKILL}` })
  for (let i = 0; i < 50 && sent.length === 0; i++) await ui.find({ key: `verifier-${SKILL}` })
  expect(sent).toEqual(['Vérifie mon exercice Ottho « Installe ton premier skill »'])
  expect((await ui.find({ key: `verifier-${SKILL}` }))?.text).toBe('Vérification en cours')
  await ui.unmount()
})

test('la boutique vend ce que les pièces permettent, et le sac le garde', async ($, on) => {
  const { store } = setup(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'onglet-boutique' })
  // 74 pièces : le carnet (60) se vend, la loupe (150) non.
  expect((await ui.find({ key: 'acheter-loupe' }))?.text).toBe('Il manque 76')
  await ui.press({ key: 'acheter-carnet' })
  const save = () => store.get(`save:${ACCOUNT}`) as { inventory: string[]; coins: number }
  for (let i = 0; i < 50 && !save().inventory.includes('carnet'); i++) await ui.find({ key: 'onglet-boutique' })
  expect(save().inventory).toContain('carnet')
  expect(save().coins).toBe(14)
  await ui.unmount()
})

test("absent de la liste chargée, l'outil d'activité est quand même essayé", async ($, on) => {
  const { store } = setup(on, { tools: ['list_my_exercises', 'submit_exercise'] })
  await $.command.run(RUN)
  expect((store.get(`save:${ACCOUNT}`) as { xp: number }).xp).toBe(70)
})

test("si l'Academy ne connaît pas l'outil, le panneau le dit et les chantiers marchent", async ($, on) => {
  setup(on, { tools: ['list_my_exercises', 'submit_exercise'], missingActivity: true })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).some(t => t.startsWith('Ton Claude ne voit pas encore ton activité'))).toBe(true)
  await ui.unmount()
})

test('sans connecteur Academy, le panneau dit comment le brancher', async ($, on) => {
  setup(on, { tools: [] })
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).some(t => t.startsWith("L'Academy n'est pas branchée"))).toBe(true)
  expect(await ui.find({ type: 'Link', text: /Brancher l'Academy/ })).not.toBe(undefined)
  await ui.unmount()
})

test('la scène de la Fabrique tient dans un SVG, pour chaque builder', async () => {
  for (const builder of BUILDERS) {
    const svg = fabriqueSvg(builder)
    // Le moteur refuse un Svg de plus de 131 072 caractères.
    expect(svg.length < 131072).toBe(true)
    expect(svg.includes('<script')).toBe(false)
    expect(svg.split('<image').length - 1).toBe(4)
  }
})

// --- Activation par projet et travail du projet ---

const START = { cwd: ROOT, surface: 'desktop', isInteractive: true } as const

// Le lanceur de tests fournit setTimeout ; les types du mod n'ont que le langage.
declare const setTimeout: (fn: () => void, ms: number) => unknown

/** Laisse finir le travail que le mod a lancé sans l'attendre. */
const tick = () => new Promise<void>(resolve => setTimeout(() => resolve(), 5))

/** La partie du compte de test, telle que le mod l'a sauvegardée. */
function saved(store: Map<string, unknown>) {
  return store.get(`save:${ACCOUNT}`) as { xp: number; coins: number; talentXp: Record<string, number> }
}

/** Un fichier écrit par Claude, tel que l'outil Write le rend. */
function written(path: string) {
  return { result: { type: 'create', filePath: path, content: 'x', structuredPatch: [], originalFile: null } }
}

test("dans un projet où le jeu n'est pas activé, rien ne s'ouvre et l'Academy n'est pas lue", async ($, on) => {
  const { asked, opened } = setup(on)
  await $.session.start(START)
  expect(opened).toEqual([])
  expect(asked).toEqual([])
})

test('/quest active le jeu dans ce projet : la session suivante le rouvre', async ($, on) => {
  const { opened, store } = setup(on)
  const ran = await $.command.run(RUN)
  expect((ran.text ?? '').includes('activé dans mon-site')).toBe(true)
  expect(store.get('projects')).toEqual([ROOT])
  opened.length = 0
  await $.session.start(START)
  expect(opened).toEqual(['ottho-quest'])
})

test('un fichier écrit dans le projet rapporte, une fois par fichier et par jour', async ($, on) => {
  const { store } = setup(on)
  on('tool.call', () => written(`${ROOT}/index.html`))
  await $.command.run(RUN)
  const before = saved(store)
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/index.html`, content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/index.html`, content: 'y' })
  for (let i = 0; i < 50 && saved(store).xp === before.xp; i++) await tick()
  expect(saved(store).xp - before.xp).toBe(3)
  // Une page HTML nourrit le talent Design.
  expect(saved(store).talentXp.design - before.talentXp.design).toBe(3)
})

test('un commit rapporte ; en pause, le travail du projet ne compte plus', async ($, on) => {
  const { store, toasts } = setup(on)
  on('tool.call', () => ({ result: { stdout: '[main 1a2b3c4] Ajoute la page\n 1 file changed', stderr: '', interrupted: false } }))
  await $.command.run(RUN)
  const before = saved(store).xp
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Ajoute la page"' })
  for (let i = 0; i < 50 && saved(store).xp === before; i++) await tick()
  expect(saved(store).xp - before).toBe(8)
  expect(toasts.includes('Commit encaissé : +8 XP, +3 pièces')).toBe(true)

  const paused = await $.command.run({ ...RUN, args: 'pause' })
  expect((paused.text ?? '').includes('en pause dans mon-site')).toBe(true)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Encore"' })
  await tick()
  expect(saved(store).xp - before).toBe(8)
})

test('les demandes à Claude paient jusqu\'au plafond du jour, pas celles d\'un sous-agent', async ($, on) => {
  const { store } = setup(on)
  await $.command.run(RUN)
  const before = saved(store).xp
  const end = (i: number, agentId?: string) =>
    $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer', ...(agentId ? { agentId } : {}) })
  for (let i = 0; i < 12; i++) await end(i)
  await end(99, 'a1')
  for (let i = 0; i < 50 && saved(store).xp < before + 20; i++) await tick()
  await tick()
  // 10 demandes au plus par jour, 2 XP chacune.
  expect(saved(store).xp - before).toBe(20)
})

test("le travail fait avant la lecture du compte est encaissé ensuite", async ($, on) => {
  const { store } = setup(on)
  store.set('projects', [ROOT])
  on('tool.call', () => written(`${ROOT}/README.md`))
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/README.md`, content: 'x' })
  for (let i = 0; i < 50 && !store.has('work-pending'); i++) await tick()
  expect((store.get('work-pending') as unknown[]).length).toBe(1)
  await $.command.run(RUN)
  // 70 XP d'activité Academy, plus 3 pour le fichier.
  expect(saved(store).xp).toBe(73)
  expect(store.has('work-pending')).toBe(false)
})

test('le panneau montre le projet et le travail du jour', async ($, on) => {
  setup(on)
  await $.command.run(RUN)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const all = await texts(ui)
  expect(all).toContain('Projet mon-site · ton travail ici compte')
  expect(all).toContain('Demandes à Claude')
  expect(await ui.find({ key: 'pause-projet' })).not.toBe(undefined)
  await ui.unmount()
})
