import type { EngineInterface } from 'claude-code'

// L'accès à l'Academy : son connecteur MCP, déjà branché sur le Claude du
// joueur. Aucun identifiant ni mot de passe ici : le connecteur porte le compte.

/** Le nom d'un outil de serveur MCP, tel que le modèle l'appelle. */
export type McpToolName = `mcp__${string}__${string}`

/**
 * L'outil qui désigne le connecteur de l'Academy, quel que soit le nom sous
 * lequel il est branché : l'app Claude lui donne un identifiant interne
 * (`mcp__<identifiant>__list_my_exercises`), le terminal le nom choisi.
 */
const LIST_TOOL = /^mcp__(.+)__list_my_exercises$/

/**
 * Si aucun outil ne le désigne encore (connecteur pas encore joint à la
 * session) : les noms sous lesquels il s'installe d'habitude, celui de la
 * commande donnée dans « Mon IA », puis celui d'un connecteur claude.ai.
 */
const SERVERS = ['ottho-academy', 'claude.ai Ottho-academy', 'claude.ai Ottho Academy', 'claude.ai Ottho academy']

/** Une erreur rendue par l'Academy elle-même (outil inconnu, refus, panne). */
export class AcademyError extends Error {}

/** Au-delà, un appel à l'Academy compte comme une panne : le panneau le dit au lieu d'attendre. */
const CALL_TIMEOUT_MS = 20_000

/** Rejette si `work` n'a pas répondu à temps. */
async function withTimeout<T>($: EngineInterface, work: Promise<T>, what: string): Promise<T> {
  let done = false
  const late = $.clock.sleep(CALL_TIMEOUT_MS).then(() => {
    if (!done) throw new AcademyError(`L'Academy ne répond pas (${what})`)
    return undefined as never
  })
  try {
    return await Promise.race([work, late])
  } finally {
    done = true
  }
}

/** Le serveur trouvé, gardé tant que le module tourne. */
let server: string | null = null
/** Ses outils tels que la session les montre, par nom court ; `null` : liste inconnue. */
let tools: Map<string, McpToolName> | null = null

/** Le serveur a pu changer de nom ou se déconnecter : on le recherchera. */
export function forgetServer(): void {
  server = null
  tools = null
}

export async function findServer($: EngineInterface): Promise<string | null> {
  if (server) return server
  const listed = await $.tool.list().catch(() => [])
  const all = Array.isArray(listed) ? listed : []
  for (const tool of all) {
    const match = tool.mcp ? LIST_TOOL.exec(tool.name) : null
    if (match?.[1]) {
      server = match[1]
      break
    }
  }
  if (server) {
    const prefix = `mcp__${server}__`
    tools = new Map()
    for (const tool of all) {
      // Le préfixe vient de vérifier la forme `mcp__<serveur>__<outil>`.
      if (tool.mcp && tool.name.startsWith(prefix)) tools.set(tool.name.slice(prefix.length), tool.name as McpToolName)
    }
    return server
  }
  for (const name of SERVERS) {
    const found = await withTimeout($, $.mcp.connect(name), 'connexion').catch(() => ({ isConnected: false as const }))
    if (found.isConnected && 'server' in found) {
      server = found.server
      return server
    }
  }
  return null
}

/** Le connecteur a-t-il cet outil ? `null` quand la session n'en montre pas la liste. */
export function hasTool(name: string): boolean | null {
  return tools === null ? null : tools.has(name)
}


/** Le texte d'un résultat d'outil, tel que le modèle le lit. */
function resultText(ran: { text?: string; result?: unknown }): string {
  if (typeof ran.text === 'string') return ran.text
  if (typeof ran.result === 'string') return ran.result
  if (Array.isArray(ran.result)) {
    return ran.result
      .map(block => (block && typeof block === 'object' && 'text' in block ? String(block.text) : ''))
      .join('')
  }
  return ''
}

/**
 * Appelle un outil du connecteur et rend son texte. D'abord par le connecteur ;
 * s'il refuse le nom trouvé, par l'outil lui-même, comme le modèle l'appellerait.
 */
export async function callAcademy(
  $: EngineInterface,
  name: string,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  let text: string
  let isError: boolean
  try {
    const result = await withTimeout($, $.mcp.call(name, tool, args), tool)
    text = result.content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('')
    isError = result.isError
  } catch (error) {
    const full = tools?.get(tool)
    if (!full) throw error
    const ran = await withTimeout($, $.tool.call({ tool: full, ...args }), tool)
    if (typeof ran.deny === 'string') throw new AcademyError(ran.deny)
    text = resultText(ran)
    isError = ran.isError === true
  }
  if (isError) throw new AcademyError(text || "L'Academy a refusé la demande")
  return text
}
