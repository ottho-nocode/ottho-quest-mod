// Copie du moteur du jeu Ottho Quest (src/game/content.ts), plus les actions du
// projet, propres au mod : le jeu web ne les connaît pas.

import type { Chantier, RuleKey, Slot, TalentKey } from "./types.ts";

export const TALENT_KEYS: TalentKey[] = [
  "prompt",
  "code",
  "automatisation",
  "agents",
  "design",
  "entraide",
];

export const TALENTS: Record<
  TalentKey,
  { name: string; color: string; text: string }
> = {
  prompt: {
    name: "Prompt",
    color: "#ff9d3c",
    text: "Parler aux IA, cadrer une demande",
  },
  code: {
    name: "Code",
    color: "#5cc8ff",
    text: "Construire une app, lire et corriger du code",
  },
  automatisation: {
    name: "Automatisation",
    color: "#5fe3a1",
    text: "Faire tourner les tâches toutes seules",
  },
  agents: {
    name: "Agents",
    color: "#b08cff",
    text: "Déléguer à des agents IA",
  },
  design: {
    name: "Design",
    color: "#ff7eb6",
    text: "Interfaces, visuels, identité",
  },
  entraide: {
    name: "Entraide",
    color: "#ffd166",
    text: "Forum, coups de main, partage",
  },
};

/** Barème : ce que rapporte chaque action de l'Academy. */
export const RULES: Record<
  RuleKey,
  { label: string; xp: number; coins: number }
> = {
  lesson_completed: { label: "Leçon terminée", xp: 10, coins: 3 },
  quiz_completed: { label: "Quiz terminé", xp: 20, coins: 7 },
  session_attended: { label: "Live suivi", xp: 30, coins: 10 },
  exercise_validated: { label: "Exercice validé", xp: 40, coins: 15 },
  forum_post: { label: "Post sur le forum", xp: 10, coins: 3 },
  forum_reply: { label: "Réponse sur le forum", xp: 6, coins: 2 },
  upvote_received: { label: "Vote reçu", xp: 4, coins: 1 },
  project_prompt: { label: "Demande traitée par Claude", xp: 2, coins: 1 },
  project_file: { label: "Fichier créé ou modifié", xp: 3, coins: 1 },
  project_commit: { label: "Commit enregistré", xp: 8, coins: 3 },
  project_tool: { label: "Agent, skill ou outil lancé", xp: 3, coins: 1 },
};

/** Les actions de l'Academy, lues par son connecteur. */
export const ACADEMY_RULES: RuleKey[] = [
  "lesson_completed",
  "quiz_completed",
  "session_attended",
  "exercise_validated",
  "forum_post",
  "forum_reply",
  "upvote_received",
];

export type ProjectRule = "project_prompt" | "project_file" | "project_commit" | "project_tool";

/** Les actions du projet, dans l'ordre du panneau. */
export const PROJECT_RULES: ProjectRule[] = ["project_prompt", "project_file", "project_commit", "project_tool"];

export function isProjectRule(rule: RuleKey): rule is ProjectRule {
  return (PROJECT_RULES as RuleKey[]).includes(rule);
}

/**
 * Ce que le travail d'une journée peut rapporter au plus, par action : de quoi
 * avancer chaque jour sans qu'une boucle de demandes remplace les leçons.
 */
export const PROJECT_CAPS: Record<ProjectRule, number> = {
  project_prompt: 10,
  project_file: 8,
  project_commit: 3,
  project_tool: 5,
};

/** Le nom court de chaque action du projet, pour le panneau. */
export const PROJECT_LABELS: Record<ProjectRule, string> = {
  project_prompt: "Demandes à Claude",
  project_file: "Fichiers créés ou modifiés",
  project_commit: "Commits",
  project_tool: "Agents, skills et outils",
};

const FORUM_RULES: RuleKey[] = ["forum_post", "forum_reply", "upvote_received"];

export function isForumRule(rule: RuleKey): boolean {
  return FORUM_RULES.includes(rule);
}

/**
 * Talents nourris par un cours, déduits de son titre.
 * Version test : à remplacer par une table de correspondance par cours.
 */
export function talentsForCourse(course?: string): TalentKey[] {
  const t = (course ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/agent|hermes/.test(t)) return ["agents", "automatisation"];
  if (/n8n|automat|workflow|mcp|zapier/.test(t)) return ["automatisation"];
  if (/design|figma|canva|visuel|image/.test(t)) return ["design"];
  if (/builder|code|app|site|web/.test(t)) return ["code"];
  return ["prompt"];
}

export const LEVEL_TITLES: [number, string][] = [
  [0, "Curieux"],
  [1, "Apprenti"],
  [3, "Bricoleur"],
  [5, "Builder"],
  [8, "Architecte"],
  [12, "Maître d'œuvre"],
];

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  bonus: Partial<Record<TalentKey, number>>;
  text: string;
  /** Hors boutique : gagné sur un chantier ou offert. */
  lootOnly?: boolean;
}

export const SLOTS: Record<Slot, string> = {
  outil: "Outil",
  machine: "Machine",
  gadget: "Gadget",
};

export const ITEMS: Item[] = [
  {
    id: "tournevis",
    name: "Tournevis du premier jour",
    slot: "outil",
    price: 0,
    bonus: { code: 1 },
    text: "Tout le monde commence par démonter quelque chose",
    lootOnly: true,
  },
  {
    id: "carnet",
    name: "Carnet de prompts",
    slot: "gadget",
    price: 60,
    bonus: { prompt: 1 },
    text: "Les bonnes consignes se notent avant de s'oublier",
  },
  {
    id: "thermos",
    name: "Thermos partagé",
    slot: "gadget",
    price: 60,
    bonus: { entraide: 1 },
    text: "Un café offert délie les langues",
  },
  {
    id: "fer",
    name: "Fer à souder",
    slot: "outil",
    price: 80,
    bonus: { automatisation: 1 },
    text: "Deux fils reliés, une tâche en moins",
  },
  {
    id: "palette",
    name: "Palette graphique",
    slot: "outil",
    price: 80,
    bonus: { design: 1 },
    text: "Dessiner avant de construire",
  },
  {
    id: "casque",
    name: "Casque antibruit",
    slot: "gadget",
    price: 90,
    bonus: { agents: 1 },
    text: "Pendant que les agents travaillent, tu réfléchis",
  },
  {
    id: "loupe",
    name: "Loupe de précision",
    slot: "outil",
    price: 150,
    bonus: { prompt: 1, design: 1 },
    text: "Le détail qui change tout",
  },
  {
    id: "clavier",
    name: "Clavier mécanique",
    slot: "machine",
    price: 180,
    bonus: { code: 2 },
    text: "Chaque touche claque comme une décision",
  },
  {
    id: "station",
    name: "Station de montage",
    slot: "machine",
    price: 200,
    bonus: { automatisation: 2 },
    text: "Un bras, trois pinces, zéro pause",
  },
  {
    id: "console",
    name: "Console d'agents",
    slot: "machine",
    price: 220,
    bonus: { agents: 2 },
    text: "Un écran pour suivre toute l'équipe",
  },
  {
    id: "rouage",
    name: "Rouage doré",
    slot: "gadget",
    price: 0,
    bonus: { automatisation: 1, agents: 1 },
    text: "Tombé de la grande horloge, encore tiède",
    lootOnly: true,
  },
];

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

export type SceneKind = "portail" | "tapis" | "accueil" | "vitrine" | "horloge";

/** L'habillage d'un chantier : un coin de la Fabrique à remettre en état. */
export interface ChantierSkin {
  scene: SceneKind;
  place: string;
}

export const CHANTIER_SKINS: ChantierSkin[] = [
  { scene: "portail", place: "La cour" },
  { scene: "tapis", place: "L'entrepôt" },
  { scene: "accueil", place: "Le hall" },
  { scene: "vitrine", place: "La rue des Enseignes" },
  { scene: "horloge", place: "La place centrale" },
];

/** Chantiers du mode démo : mêmes gestes que les vrais, validation simulée. */
export const DEMO_CHANTIERS: Chantier[] = [
  {
    id: "demo-chantier-connexion",
    title: "Connecte l'Academy à ton Claude",
    course: "Claude Mastery",
    instructions:
      "Ajoute le connecteur Ottho Academy dans ton Claude, puis demande-lui la liste de tes cours.\n\n- Ouvre « Mon IA » dans ton profil Academy\n- Copie l'adresse du connecteur dans Claude\n- Autorise la connexion avec ton compte",
  },
  {
    id: "demo-chantier-claude-md",
    title: "Écris ton premier CLAUDE.md",
    course: "Claude Builder",
    instructions:
      "Crée le fichier CLAUDE.md d'un de tes projets. Il dit à Claude ce qu'est le projet et comment y travailler.\n\n- Le but du projet en deux phrases\n- Les commandes pour le lancer et le tester\n- Trois règles que Claude doit suivre",
  },
  {
    id: "demo-chantier-premier-skill",
    title: "Installe ton premier skill",
    course: "Claude Agent",
    instructions:
      "Installe un skill de la marketplace Ottho dans ton Claude, puis sers-t'en une fois.\n\n- Choisis un skill dans la marketplace\n- Installe-le avec la commande indiquée\n- Lance-le sur un vrai besoin",
  },
];

export interface Challenge {
  id: string;
  label: string;
  scope: "day" | "week";
  /** Règles comptées, `any` pour toutes. */
  match: RuleKey[] | "any";
  target: number;
  coins: number;
  easy?: boolean;
}

export const DAILY_POOL: Challenge[] = [
  {
    id: "lecon1",
    label: "Termine 1 leçon",
    scope: "day",
    match: ["lesson_completed"],
    target: 1,
    coins: 30,
    easy: true,
  },
  {
    id: "actions2",
    label: "Fais 2 actions à l'Academy",
    scope: "day",
    match: ACADEMY_RULES,
    target: 2,
    coins: 40,
    easy: true,
  },
  {
    id: "lecon3",
    label: "Termine 3 leçons",
    scope: "day",
    match: ["lesson_completed"],
    target: 3,
    coins: 60,
  },
  {
    id: "quiz",
    label: "Termine 1 quiz",
    scope: "day",
    match: ["quiz_completed"],
    target: 1,
    coins: 50,
  },
  {
    id: "forum",
    label: "Participe au forum",
    scope: "day",
    match: ["forum_post", "forum_reply"],
    target: 1,
    coins: 40,
  },
  {
    id: "exercice",
    label: "Valide 1 exercice",
    scope: "day",
    match: ["exercise_validated"],
    target: 1,
    coins: 70,
  },
  {
    id: "projet5",
    label: "Fais 5 demandes à Claude dans ton projet",
    scope: "day",
    match: ["project_prompt"],
    target: 5,
    coins: 30,
    easy: true,
  },
  {
    id: "commit1",
    label: "Fais 1 commit dans ton projet",
    scope: "day",
    match: ["project_commit"],
    target: 1,
    coins: 40,
  },
];

export const WEEKLY_CHALLENGE: Challenge = {
  id: "semaine10",
  label: "Fais 10 actions à l'Academy cette semaine",
  scope: "week",
  match: ACADEMY_RULES,
  target: 10,
  coins: 150,
};

export const GOALS: string[] = [
  "Automatiser mon travail",
  "Créer ma propre app",
  "Lancer mon activité",
  "Comprendre l'IA pour de bon",
  "Gagner du temps chaque jour",
  "Changer de métier",
];

export interface Scenario {
  text: string;
  answers: { text: string; talent: TalentKey }[];
}

export const SCENARIOS: Scenario[] = [
  {
    text: "La machine à café de la Fabrique tombe en panne. Tu fais quoi ?",
    answers: [
      {
        text: "Je décris la panne à une IA et je suis ses pistes",
        talent: "prompt",
      },
      { text: "J'ouvre le capot et je cherche moi-même", talent: "code" },
      {
        text: "Je bricole un système pour qu'elle se détartre toute seule",
        talent: "automatisation",
      },
      { text: "Je demande qui a déjà réparé ça", talent: "entraide" },
    ],
  },
  {
    text: "On te confie un projet flou, sans consigne claire.",
    answers: [
      {
        text: "Je pose dix questions avant de toucher à quoi que ce soit",
        talent: "prompt",
      },
      {
        text: "Je dessine d'abord à quoi ça doit ressembler",
        talent: "design",
      },
      {
        text: "Je découpe en petites tâches et j'en délègue la moitié",
        talent: "agents",
      },
      { text: "Je monte un premier prototype dans l'heure", talent: "code" },
    ],
  },
  {
    text: "Tu refais la même tâche pour la troisième fois cette semaine.",
    answers: [
      {
        text: "Je la confie à un assistant qui la fera à ma place",
        talent: "agents",
      },
      {
        text: "Je construis un enchaînement qui la lance tout seul",
        talent: "automatisation",
      },
      {
        text: "J'écris un modèle de consigne réutilisable",
        talent: "prompt",
      },
      {
        text: "Je montre ma méthode aux autres, autant qu'elle serve",
        talent: "entraide",
      },
    ],
  },
  {
    text: "Ton premier outil fonctionne, mais il est moche.",
    answers: [
      {
        text: "Je reprends les couleurs, les espacements, tout",
        talent: "design",
      },
      { text: "Tant qu'il marche, je passe à la suite", talent: "code" },
      { text: "Je le montre pour avoir des avis", talent: "entraide" },
      {
        text: "Je demande à une IA trois pistes de refonte",
        talent: "prompt",
      },
    ],
  },
  {
    text: "Quelqu'un bloque depuis une heure sur un bug.",
    answers: [
      { text: "Je m'assois à côté et on cherche ensemble", talent: "entraide" },
      { text: "Je lis son code ligne par ligne", talent: "code" },
      {
        text: "Je lui montre comment faire chercher un agent",
        talent: "agents",
      },
      {
        text: "Je propose un garde-fou pour que ça n'arrive plus",
        talent: "automatisation",
      },
    ],
  },
];

export const PROFILE_TITLES: Record<TalentKey, { title: string; text: string }> =
  {
    prompt: {
      title: "Interprète",
      text: "Tu sais dire ce que tu veux, et les machines te comprennent du premier coup.",
    },
    code: {
      title: "Mécano",
      text: "Tu apprends en ouvrant le capot. Un prototype vaut mieux qu'un long discours.",
    },
    automatisation: {
      title: "Esprit d'horloger",
      text: "Tu ne supportes pas de refaire deux fois la même chose, alors tu la fais faire.",
    },
    agents: {
      title: "Chef d'orchestre",
      text: "Tu découpes, tu délègues, tu gardes la vue d'ensemble.",
    },
    design: {
      title: "Œil de designer",
      text: "Pour toi, un outil n'est fini que lorsqu'il donne envie de s'en servir.",
    },
    entraide: {
      title: "Pilier d'équipe",
      text: "Tu avances plus vite à plusieurs, et les autres aussi quand tu es là.",
    },
  };

export const GROWTH_TIPS: Record<TalentKey, string> = {
  prompt: "Prends le temps de cadrer tes demandes : contexte, objectif, format.",
  code: "Ouvre un projet et casse quelque chose exprès, pour voir comment ça tient.",
  automatisation:
    "Repère une tâche que tu répètes chaque semaine et fais-la tourner seule.",
  agents: "Confie une vraie tâche à un agent et relis ce qu'il a fait.",
  design: "Avant de construire, dessine l'écran sur un coin de feuille.",
  entraide: "Pose une question sur le forum, ou réponds à celle d'un autre.",
};

export const STREAK_GOALS = [3, 7, 21];

export const ACADEMY_URL = "https://academy.ottho.co";
