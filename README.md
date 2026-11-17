# Ottho Quest

Le jeu Ottho Quest dans Claude Code, dans un panneau à côté de la conversation. Tu l'actives projet par projet : ton travail avec Claude dans ce projet et ton activité à l'Ottho Academy font avancer ton builder.

## Installer

Dans une session Claude Code ouverte dans un terminal :

```
/plugin install ottho-quest --marketplace ottho-nocode/ottho-quest-mod
```

Réponds `y` pour ajouter la marketplace, puis choisis la portée : `user` pour l'avoir dans tous tes projets.

Depuis un terminal, hors de Claude Code :

```
claude plugin install ottho-quest --marketplace ottho-nocode/ottho-quest-mod
```

Dans l'app Claude (onglet Code), où `/plugin` ne marche pas : clique sur + à côté de la zone de saisie, puis Plugins, Add marketplace avec `ottho-nocode/ottho-quest-mod`, puis Add plugin.

## Il te faut

L'Academy branchée sur ton Claude, une fois pour tous tes projets, depuis Mon IA : https://academy.ottho.co/profile?tab=ia (bouton « Ajouter à Claude », ou la commande Claude Code).

## Jouer

1. Ouvre Claude Code dans ton projet.
2. Tape `/quest` : le jeu s'active dans ce projet et s'ouvre. Il se rouvre ensuite à chaque session dans ce projet. Ailleurs, il ne s'affiche pas.
3. Travaille avec Claude. Dans un projet activé, chaque journée rapporte :

| Action | XP | Au plus par jour |
| --- | --- | --- |
| Demande traitée par Claude | 2 | 10 |
| Fichier créé ou modifié (une fois par fichier) | 3 | 8 |
| Commit enregistré | 8 | 3 |
| Agent, skill ou outil lancé | 3 | 5 |

4. L'onglet Chantiers liste les exercices pratiques de l'Academy : fais la tâche dans ton projet, puis « Faire vérifier ». Claude regarde ton travail, rend la preuve à l'Academy, et le butin se récupère dans le jeu.
5. Tes leçons, quiz et lives de l'Academy rapportent aussi.

`/quest pause` met le jeu en pause dans le projet, `/quest` le relance.

## Ce que le mod lit

- Les appels d'outils de la conversation (le nom de l'outil, le chemin du fichier écrit, la sortie de `git commit`) pour compter ton travail. Jamais le contenu de tes fichiers, et rien n'est envoyé : ta partie reste sur ton ordinateur.
- Ton activité et tes exercices à l'Academy, par le connecteur que tu as branché.
