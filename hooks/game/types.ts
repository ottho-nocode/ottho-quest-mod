// Copie du moteur du jeu Ottho Quest (src/game/types.ts), plus les actions du
// projet, propres au mod : le jeu web ne les connaît pas.

export type TalentKey =
  | "prompt"
  | "code"
  | "automatisation"
  | "agents"
  | "design"
  | "entraide";

/** Clés de `point_rules` dans la base de l'Academy. */
export type RuleKey =
  | "lesson_completed"
  | "quiz_completed"
  | "exercise_validated"
  | "session_attended"
  | "forum_post"
  | "forum_reply"
  | "upvote_received"
  // Actions faites dans un projet où le joueur a activé le jeu (mod seulement).
  | "project_prompt"
  | "project_file"
  | "project_commit"
  | "project_tool";

export type Slot = "outil" | "machine" | "gadget";

/** Une action faite dans l'Academy (une ligne de `point_events`). */
export interface ActivityEvent {
  id: string;
  rule: RuleKey;
  /** Date ISO de l'action. */
  at: string;
  /** Titre du cours concerné, quand il est connu. */
  course?: string;
  /** Identifiant de la ressource dans l'Academy (leçon, quiz, exercice, live). */
  resource?: string;
  /** Talent nourri par une action du projet (sinon déduit du cours). */
  talent?: TalentKey;
}

/**
 * Un chantier : un exercice « preuve par MCP » de l'Academy. Le joueur fait la
 * tâche dans son Claude, l'Academy la vérifie, le jeu paie.
 */
export interface Chantier {
  /** Identifiant de l'exercice dans l'Academy. */
  id: string;
  title: string;
  /** Consigne de l'exercice, en markdown. */
  instructions: string;
  /** Titre du cours qui porte l'exercice. */
  course?: string;
  /** Page de l'exercice dans l'Academy. */
  url?: string;
}

export interface Avatar {
  /** Rang du builder choisi (voir `BUILDERS`). Absent d'une ancienne sauvegarde. */
  character?: number;
  // Réglages de l'ancien éditeur d'avatar : le jeu ne les lit plus.
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  outfit: number;
  accessory: number;
}

/** Une action encaissée, avec ce qu'elle a rapporté. */
export interface LogEntry {
  id: string;
  rule: RuleKey;
  at: string;
  course?: string;
  xp: number;
  coins: number;
  talents: TalentKey[];
}

/** Le butin d'un chantier validé, une fois récupéré. */
export interface ChantierResult {
  chantierId: string;
  title: string;
  at: number;
  coins: number;
  xp: number;
  /** Talents demandés réunis au moment de récupérer le butin. */
  met: number;
  needs: number;
  item: string | null;
}

export interface Profile {
  title: string;
  strengths: [TalentKey, TalentKey];
  growth: TalentKey;
}

export interface GameState {
  version: 2;
  onboarded: boolean;
  name: string;
  avatar: Avatar;
  goals: string[];
  streakGoal: number;
  profile: Profile | null;
  xp: number;
  coins: number;
  talentXp: Record<TalentKey, number>;
  /** Identifiants des actions déjà encaissées. */
  claimed: string[];
  /** Jours (heure de Paris, AAAA-MM-JJ) avec au moins une action. */
  activeDays: string[];
  log: LogEntry[];
  inventory: string[];
  equipped: Partial<Record<Slot, string>>;
  /** Exercices validés par l'Academy (identifiants), chantiers compris. */
  validated: string[];
  /** Chantiers dont le butin a été récupéré. */
  history: ChantierResult[];
  /** Défis dont la récompense a été prise (`période:id`). */
  rewardsClaimed: string[];
}
