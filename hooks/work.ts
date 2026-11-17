import type { ProjectRule } from './game/content'
import { hashString } from './game/engine'
import type { TalentKey } from './game/types'

// Ce qui, dans le travail fait avec Claude, rapporte au joueur : lu sur les
// appels d'outils de la conversation, jamais sur le contenu des fichiers.

/** Une action du projet repérée, avant le plafond du jour. */
export type Work = {
  rule: ProjectRule
  talent: TalentKey
  /** Ce qui ne paie qu'une fois par jour (un fichier, un commit) ; absent : chaque fois. */
  key?: string
}

/** Le nom du projet : le dernier dossier de sa racine. */
export function projectName(root: string): string {
  const parts = root.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? root
}

/** Le talent qu'un fichier nourrit, d'après son extension. */
export function talentForFile(path: string): TalentKey {
  const ext = (path.toLowerCase().match(/\.([a-z0-9]+)$/) ?? [])[1] ?? ''
  if (['css', 'scss', 'sass', 'less', 'svg', 'html', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'design'
  if (['md', 'mdx', 'txt'].includes(ext)) return 'prompt'
  if (['yml', 'yaml'].includes(ext)) return 'automatisation'
  return 'code'
}

/** Le commit qu'une commande vient d'enregistrer (son identifiant court), ou `null`. */
export function commitOf(command: string, stdout: string): string | null {
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) return null
  // git commit écrit « [branche abc1234] message » quand le commit est fait.
  const match = /^\[[^\]\n]* ([0-9a-f]{7,40})\]/m.exec(stdout)
  return match?.[1] ?? null
}

/** Les outils que le mod appelle lui-même : ils ne comptent pas comme du travail. */
const OWN_TOOLS = /^mcp__.+__(list_my_exercises|get_my_activity)$/

/**
 * Le travail qu'un appel d'outil réussi représente, ou `null`. Les appels d'un
 * sous-agent ne comptent pas un par un : l'agent lancé compte une fois.
 */
export function workFromTool(call: {
  tool: string
  agentId?: string | undefined
  command?: string | undefined
  filePath?: string | undefined
  result: unknown
  failed: boolean
}): Work | null {
  if (call.agentId !== undefined || call.failed) return null
  const result = (call.result && typeof call.result === 'object' ? call.result : {}) as Record<string, unknown>
  if (call.tool === 'Write' || call.tool === 'Edit') {
    // Un fichier soumis à relecture n'est pas écrit.
    if (result.staged === true) return null
    const path = typeof result.filePath === 'string' ? result.filePath : (call.filePath ?? '')
    if (!path) return null
    return { rule: 'project_file', talent: talentForFile(path), key: hashString(path).toString(36) }
  }
  if (call.tool === 'Bash') {
    const sha = commitOf(call.command ?? '', typeof result.stdout === 'string' ? result.stdout : '')
    return sha ? { rule: 'project_commit', talent: 'code', key: sha } : null
  }
  if (call.tool === 'Agent' || call.tool === 'Task' || call.tool === 'Skill') {
    return { rule: 'project_tool', talent: 'agents' }
  }
  if (call.tool.startsWith('mcp__') && !OWN_TOOLS.test(call.tool)) {
    return { rule: 'project_tool', talent: 'automatisation' }
  }
  return null
}
