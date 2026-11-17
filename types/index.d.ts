/** Où en est un chantier, d'après les preuves déjà rendues à l'Academy. */
export type ChantierStatus = 'todo' | 'retry' | 'done'

/** Un chantier : un exercice « preuve par MCP » de l'Academy. */
export type Chantier = {
  id: string
  title: string
  /** Cours › module › chapitre. */
  path: string
  status: ChantierStatus
  /** Meilleure note obtenue, sur 100 ; `null` tant que rien n'a été rendu. */
  score: number | null
  /** Page de l'exercice dans l'Academy. */
  url: string
  /** Visible des seuls admins, pour essayer un exercice avant de le publier. */
  draft: boolean
}

/** Les chantiers lus dans l'Academy. */
export type Board = {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  items: Chantier[]
  /** Ce qui n'a pas marché, en clair. */
  message: string | null
  /** Le chantier que Claude est en train de vérifier. */
  checking: string | null
}

/** Les onglets du jeu. */
export type Tab = 'fabrique' | 'chantiers' | 'builder' | 'boutique'

/** La partie : l'état du jeu, chargé et sauvegardé par compte Academy. */
export type Play = {
  tab: Tab
  /** Le compte Academy de la partie, que le connecteur donne. */
  account: string | null
  /** L'état du jeu (GameState du moteur), sauvegardé tel quel ; le contrat reste autonome. */
  game: object | null
  phase: 'idle' | 'loading' | 'ready' | 'error'
  /** Ce qui n'a pas marché, en clair. */
  message: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'ottho-quest': { board: Shaped<Board>; play: Shaped<Play> }
  }
}
