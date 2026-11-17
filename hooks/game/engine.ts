// Copie du moteur du jeu Ottho Quest (src/game/engine.ts), plus les actions du
// projet, propres au mod : le jeu web ne les connaît pas.

import type {
  ActivityEvent,
  Chantier,
  ChantierResult,
  GameState,
  LogEntry,
  Profile,
  RuleKey,
  TalentKey,
} from "./types.ts";
import {
  CHANTIER_SKINS,
  DAILY_POOL,
  ITEMS,
  LEVEL_TITLES,
  PROFILE_TITLES,
  PROJECT_CAPS,
  RULES,
  TALENT_KEYS,
  WEEKLY_CHALLENGE,
  isForumRule,
  isProjectRule,
  itemById,
  talentsForCourse,
} from "./content.ts";
import type { Challenge, ChantierSkin, ProjectRule } from "./content.ts";

/** Plafond de pièces rendu par l'historique encaissé à l'onboarding. */
export const HERITAGE_COIN_CAP = 300;
export const LOG_LIMIT = 300;
export const STARTER_COINS = 50;
export const STARTER_ITEM = "tournevis";

/** Prime d'un chantier validé : une base, plus un supplément par talent réuni. */
export const CHANTIER_XP = 50;
export const CHANTIER_BASE_COINS = 50;
export const CHANTIER_TALENT_COINS = 40;
/** Niveau demandé dans chaque talent du chantier pour toucher le supplément. */
export const CHANTIER_NEED = 2;

function emptyTalents(): Record<TalentKey, number> {
  return {
    prompt: 0,
    code: 0,
    automatisation: 0,
    agents: 0,
    design: 0,
    entraide: 0,
  };
}

export function newGame(): GameState {
  return {
    version: 2,
    onboarded: false,
    name: "",
    avatar: { character: 0, skin: 1, hair: 0, hairColor: 0, eyes: 0, outfit: 0, accessory: 0 },
    goals: [],
    streakGoal: 7,
    profile: null,
    xp: 0,
    coins: 0,
    talentXp: emptyTalents(),
    claimed: [],
    activeDays: [],
    log: [],
    inventory: [],
    equipped: {},
    validated: [],
    history: [],
    rewardsClaimed: [],
  };
}

/**
 * Reprend une sauvegarde. Une partie de la première version (chantiers à
 * minuteur) garde sa progression ; son chantier en cours et son historique,
 * qui n'ont plus de sens, sont laissés de côté.
 */
export function migrateSave(saved: unknown): GameState {
  if (!saved || typeof saved !== "object") return newGame();
  const raw = { ...(saved as Record<string, unknown>) };
  if (raw.version === 2) return { ...newGame(), ...(raw as Partial<GameState>) };
  if (raw.version !== 1) return newGame();
  delete raw.mission;
  delete raw.missionStartDays;
  delete raw.history;
  return { ...newGame(), ...(raw as Partial<GameState>), version: 2 };
}

// --- Dates (toujours en heure de Paris) ---

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour de Paris au format AAAA-MM-JJ. */
export function dayKey(date: Date | number | string): string {
  return PARIS_DAY.format(new Date(date));
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine du jour donné. */
export function weekKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return addDays(key, -((d.getUTCDay() + 6) % 7));
}

// --- Niveaux ---

/** XP à gagner pour passer du niveau donné au suivant. */
export function xpForStep(level: number): number {
  return level === 0 ? 10 : 60 + 40 * level;
}

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1];
  for (const [min, name] of LEVEL_TITLES) if (level >= min) title = name;
  return title;
}

export function levelInfo(xp: number): {
  level: number;
  into: number;
  need: number;
  title: string;
} {
  let level = 0;
  let rest = Math.max(0, xp);
  while (rest >= xpForStep(level)) {
    rest -= xpForStep(level);
    level++;
  }
  return { level, into: rest, need: xpForStep(level), title: levelTitle(level) };
}

export function talentLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 20));
}

export function talentProgress(xp: number): {
  level: number;
  into: number;
  need: number;
} {
  const level = talentLevel(xp);
  const floor = 20 * level * level;
  return { level, into: xp - floor, need: 20 * (level + 1) ** 2 - floor };
}

// --- Encaissement de l'activité ---

export function rewardFor(event: ActivityEvent): {
  xp: number;
  coins: number;
  talents: TalentKey[];
} {
  const rule = RULES[event.rule];
  const talents: TalentKey[] = isProjectRule(event.rule)
    ? [event.talent ?? "code"]
    : isForumRule(event.rule)
      ? ["entraide"]
      : talentsForCourse(event.course);
  return { xp: rule.xp, coins: rule.coins, talents };
}

export interface ClaimSummary {
  count: number;
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  byRule: Partial<Record<RuleKey, number>>;
  talents: Partial<Record<TalentKey, number>>;
  entries: LogEntry[];
}

/**
 * Encaisse les actions pas encore comptées. Une action ne rapporte qu'une
 * fois : la rejouer ne change rien. Les exercices validés sont notés à part
 * (sur toute l'activité lue, pas seulement la nouvelle) : c'est ce qui ouvre
 * le butin d'un chantier.
 */
export function claim(
  state: GameState,
  events: ActivityEvent[],
  opts: { coinCap?: number } = {},
): { state: GameState; summary: ClaimSummary } {
  const seen = new Set(state.claimed);
  const fresh: ActivityEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id) || !RULES[e.rule]) continue;
    seen.add(e.id);
    fresh.push(e);
  }
  fresh.sort((a, b) => a.at.localeCompare(b.at));

  const talentXp = { ...state.talentXp };
  const byRule: Partial<Record<RuleKey, number>> = {};
  const talents: Partial<Record<TalentKey, number>> = {};
  const days = new Set(state.activeDays);
  const entries: LogEntry[] = [];
  let xp = 0;
  let coins = 0;

  for (const e of fresh) {
    const r = rewardFor(e);
    xp += r.xp;
    coins += r.coins;
    byRule[e.rule] = (byRule[e.rule] ?? 0) + 1;
    const share = Math.round(r.xp / r.talents.length);
    for (const t of r.talents) {
      talentXp[t] += share;
      talents[t] = (talents[t] ?? 0) + share;
    }
    days.add(dayKey(e.at));
    entries.push({
      id: e.id,
      rule: e.rule,
      at: e.at,
      course: e.course,
      xp: r.xp,
      coins: r.coins,
      talents: r.talents,
    });
  }

  if (opts.coinCap !== undefined) coins = Math.min(coins, opts.coinCap);

  const validated = new Set(state.validated);
  for (const e of events)
    if (e.rule === "exercise_validated" && e.resource) validated.add(e.resource);

  const next: GameState = {
    ...state,
    xp: state.xp + xp,
    coins: state.coins + coins,
    talentXp,
    claimed: [...state.claimed, ...fresh.map((e) => e.id)],
    validated:
      validated.size === state.validated.length ? state.validated : [...validated],
    activeDays: [...days].sort(),
    log: [...state.log, ...entries].slice(-LOG_LIMIT),
  };

  return {
    state: next,
    summary: {
      count: fresh.length,
      xp,
      coins,
      levelBefore: levelInfo(state.xp).level,
      levelAfter: levelInfo(next.xp).level,
      byRule,
      talents,
      entries,
    },
  };
}

/** Cadeau de fin de mini-récit : quelques pièces et un premier outil. */
export function grantStarter(state: GameState): GameState {
  if (state.inventory.includes(STARTER_ITEM)) return state;
  return {
    ...state,
    coins: state.coins + STARTER_COINS,
    inventory: [...state.inventory, STARTER_ITEM],
    equipped: { ...state.equipped, outil: STARTER_ITEM },
  };
}

// --- Série ---

/** Nombre de jours actifs d'affilée, en comptant aujourd'hui ou hier. */
export function streak(activeDays: string[], today: string): number {
  const set = new Set(activeDays);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function lastDays(
  activeDays: string[],
  today: string,
  n = 7,
): { key: string; active: boolean; isToday: boolean }[] {
  const set = new Set(activeDays);
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(today, i - (n - 1));
    return { key, active: set.has(key), isToday: key === today };
  });
}

// --- Talents et équipement ---

export function equipmentBonus(state: GameState): Record<TalentKey, number> {
  const bonus = emptyTalents();
  for (const id of Object.values(state.equipped)) {
    const item = id ? itemById(id) : undefined;
    if (!item) continue;
    for (const t of TALENT_KEYS) bonus[t] += item.bonus[t] ?? 0;
  }
  return bonus;
}

/** Niveau de chaque talent, équipement compris. */
export function effectiveTalents(state: GameState): Record<TalentKey, number> {
  const bonus = equipmentBonus(state);
  const out = emptyTalents();
  for (const t of TALENT_KEYS)
    out[t] = talentLevel(state.talentXp[t]) + bonus[t];
  return out;
}

// --- Tirages ---

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Chantiers ---

export type ChantierStatus = "todo" | "validated" | "done";

/** À faire, validé par l'Academy (butin à récupérer), ou terminé. */
export function chantierStatus(state: GameState, chantierId: string): ChantierStatus {
  if (state.history.some((h) => h.chantierId === chantierId)) return "done";
  return state.validated.includes(chantierId) ? "validated" : "todo";
}

/** Le coin de la Fabrique associé au chantier, toujours le même pour un chantier donné. */
export function chantierSkin(chantierId: string): ChantierSkin {
  return CHANTIER_SKINS[hashString(chantierId) % CHANTIER_SKINS.length];
}

export interface ChantierPrime {
  coins: number;
  /** Ce que rapporterait le chantier avec tous les talents réunis. */
  maxCoins: number;
  xp: number;
  needs: { talent: TalentKey; have: number; met: boolean }[];
  /** Tous les talents demandés sont réunis. */
  full: boolean;
}

/**
 * Ce que paie un chantier validé. Les talents demandés sont ceux du cours de
 * l'exercice : chacun, s'il atteint CHANTIER_NEED (équipement compris),
 * ajoute un supplément. C'est là que servent les outils de la boutique.
 */
export function chantierPrime(state: GameState, chantier: Chantier): ChantierPrime {
  const talents = effectiveTalents(state);
  const needs = talentsForCourse(chantier.course).map((talent) => ({
    talent,
    have: talents[talent],
    met: talents[talent] >= CHANTIER_NEED,
  }));
  const met = needs.filter((n) => n.met).length;
  return {
    coins: CHANTIER_BASE_COINS + met * CHANTIER_TALENT_COINS,
    maxCoins: CHANTIER_BASE_COINS + needs.length * CHANTIER_TALENT_COINS,
    xp: CHANTIER_XP,
    needs,
    full: met === needs.length,
  };
}

/** L'objet hors boutique qu'un chantier peut rendre, travail soigné seulement. */
export function chantierDrop(state: GameState, chantier: Chantier): string | null {
  const needs = talentsForCourse(chantier.course);
  const found = ITEMS.find(
    (i) =>
      i.lootOnly &&
      i.id !== STARTER_ITEM &&
      !state.inventory.includes(i.id) &&
      needs.some((t) => i.bonus[t]),
  );
  return found ? found.id : null;
}

/**
 * Récupère le butin d'un chantier validé par l'Academy. Une seule fois par
 * chantier, et jamais avant la validation.
 */
export function collectChantier(
  state: GameState,
  chantier: Chantier,
  now: number,
): { state: GameState; result: ChantierResult } | null {
  if (chantierStatus(state, chantier.id) !== "validated") return null;
  const prime = chantierPrime(state, chantier);
  const item = prime.full ? chantierDrop(state, chantier) : null;
  const result: ChantierResult = {
    chantierId: chantier.id,
    title: chantier.title,
    at: now,
    coins: prime.coins,
    xp: prime.xp,
    met: prime.needs.filter((n) => n.met).length,
    needs: prime.needs.length,
    item,
  };
  return {
    result,
    state: {
      ...state,
      xp: state.xp + prime.xp,
      coins: state.coins + prime.coins,
      inventory: item ? [...state.inventory, item] : state.inventory,
      history: [...state.history, result].slice(-200),
    },
  };
}

// --- Boutique ---

export type BuyOutcome =
  | { ok: true; state: GameState }
  | { ok: false; reason: "unknown" | "owned" | "coins" };

export function buy(state: GameState, itemId: string): BuyOutcome {
  const item = itemById(itemId);
  if (!item || item.lootOnly) return { ok: false, reason: "unknown" };
  if (state.inventory.includes(itemId)) return { ok: false, reason: "owned" };
  if (state.coins < item.price) return { ok: false, reason: "coins" };
  return {
    ok: true,
    state: {
      ...state,
      coins: state.coins - item.price,
      inventory: [...state.inventory, itemId],
    },
  };
}

/** Équipe un objet possédé, ou le retire s'il est déjà en place. */
export function toggleEquip(state: GameState, itemId: string): GameState {
  const item = itemById(itemId);
  if (!item || !state.inventory.includes(itemId)) return state;
  const equipped = { ...state.equipped };
  if (equipped[item.slot] === itemId) delete equipped[item.slot];
  else equipped[item.slot] = itemId;
  return { ...state, equipped };
}

export function shopItems() {
  return ITEMS.filter((i) => !i.lootOnly);
}

// --- Défis ---

/** Trois défis du jour, les mêmes pour tout le monde ce jour-là. */
export function dailyChallenges(day: string): Challenge[] {
  const rand = mulberry32(hashString(day));
  const pick = <T>(list: T[]): T =>
    list.splice(Math.floor(rand() * list.length), 1)[0];
  const easy = DAILY_POOL.filter((c) => c.easy);
  const first = pick(easy);
  const rest = DAILY_POOL.filter((c) => c.id !== first.id);
  return [first, pick(rest), pick(rest)];
}

export function weeklyChallenge(): Challenge {
  return WEEKLY_CHALLENGE;
}

function periodKey(challenge: Challenge, day: string): string {
  return challenge.scope === "day" ? day : weekKey(day);
}

export function challengeProgress(
  state: GameState,
  challenge: Challenge,
  day: string,
): number {
  const period = periodKey(challenge, day);
  let count = 0;
  for (const entry of state.log) {
    const d = dayKey(entry.at);
    if ((challenge.scope === "day" ? d : weekKey(d)) !== period) continue;
    if (challenge.match === "any" || challenge.match.includes(entry.rule)) count++;
  }
  return Math.min(count, challenge.target);
}

export function rewardKey(challenge: Challenge, day: string): string {
  return `${periodKey(challenge, day)}:${challenge.id}`;
}

export function isRewardClaimed(
  state: GameState,
  challenge: Challenge,
  day: string,
): boolean {
  return state.rewardsClaimed.includes(rewardKey(challenge, day));
}

export function claimChallenge(
  state: GameState,
  challenge: Challenge,
  day: string,
): GameState | null {
  if (isRewardClaimed(state, challenge, day)) return null;
  if (challengeProgress(state, challenge, day) < challenge.target) return null;
  return {
    ...state,
    coins: state.coins + challenge.coins,
    rewardsClaimed: [...state.rewardsClaimed, rewardKey(challenge, day)].slice(
      -200,
    ),
  };
}

// --- Profil ---

/** Deux forces et un axe de progrès, d'après les réponses au test. */
export function scoreProfile(answers: TalentKey[]): Profile {
  const score = emptyTalents();
  for (const a of answers) score[a]++;
  const ranked = [...TALENT_KEYS].sort(
    (a, b) =>
      score[b] - score[a] || TALENT_KEYS.indexOf(a) - TALENT_KEYS.indexOf(b),
  );
  const strengths: [TalentKey, TalentKey] = [ranked[0], ranked[1]];
  const growth = [...ranked].reverse().find((t) => !strengths.includes(t))!;
  return { title: PROFILE_TITLES[ranked[0]].title, strengths, growth };
}

// --- Le travail fait dans un projet (mod) ---

const WORK_PREFIX = "projet:";

/** Combien d'actions de ce type ont déjà payé ce jour-là. */
export function workCount(state: GameState, rule: ProjectRule, day: string): number {
  const prefix = `${WORK_PREFIX}${rule}:${day}:`;
  let n = 0;
  for (const id of state.claimed) if (id.startsWith(prefix)) n++;
  return n;
}

/**
 * Une action du projet, prête à encaisser, ou `null` quand elle ne paie pas :
 * plafond du jour atteint, ou même `key` déjà payée ce jour-là (le même
 * fichier, le même commit). Sans `key`, chaque action compte.
 */
export function workEvent(
  state: GameState,
  input: { rule: ProjectRule; talent: TalentKey; at: string; project: string; key?: string },
): ActivityEvent | null {
  const day = dayKey(input.at);
  const count = workCount(state, input.rule, day);
  if (count >= PROJECT_CAPS[input.rule]) return null;
  const id = `${WORK_PREFIX}${input.rule}:${day}:${input.key ?? String(count + 1)}`;
  if (state.claimed.includes(id)) return null;
  return { id, rule: input.rule, at: input.at, course: input.project, talent: input.talent };
}

/**
 * Oublie les actions du projet payées avant hier : leur identifiant porte
 * leur jour, elles ne peuvent plus revenir, et la liste ne grossit pas.
 */
export function pruneWork(state: GameState, today: string): GameState {
  const keep = addDays(today, -1);
  const claimed = state.claimed.filter((id) => {
    if (!id.startsWith(WORK_PREFIX)) return true;
    const day = id.split(":")[2] ?? "";
    return day >= keep;
  });
  return claimed.length === state.claimed.length ? state : { ...state, claimed };
}
