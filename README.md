# Ottho Quest

Le jeu Ottho Quest dans Claude Code, dans un panneau à côté de la conversation. Tu l'installes une fois, tu l'allumes quand tu veux : ton travail avec Claude et ton activité à l'Ottho Academy font avancer ton builder.

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

1. Dans n'importe quelle session Claude Code, tape `/quest` : le jeu s'allume et s'ouvre. Il se rouvre ensuite dans toutes tes sessions, quel que soit le projet.
2. Travaille avec Claude. Jeu allumé, chaque journée rapporte :

| Action | XP | Au plus par jour |
| --- | --- | --- |
| Demande traitée par Claude | 2 | 10 |
| Fichier créé ou modifié (une fois par fichier) | 3 | 8 |
| Commit enregistré | 8 | 3 |
| Agent, skill ou outil lancé | 3 | 5 |

3. L'onglet Chantiers liste les exercices pratiques de l'Academy : fais la tâche dans ton projet, puis « Faire vérifier ». Claude regarde ton travail, rend la preuve à l'Academy, et le butin se récupère dans le jeu.
4. Tes leçons, quiz et lives de l'Academy rapportent aussi.

`/quest pause` éteint le jeu partout : ton travail ne compte plus jusqu'au prochain `/quest`. Fermer le panneau le cache seulement, le jeu reste allumé.

## Ce que le mod lit

- Les appels d'outils de la conversation (le nom de l'outil, le chemin du fichier écrit, la sortie de `git commit`) pour compter ton travail. Jamais le contenu de tes fichiers, et rien n'est envoyé : ta partie reste sur ton ordinateur.
- Ton activité et tes exercices à l'Academy, par le connecteur que tu as branché. En mode auto, Claude Code peut refuser une lecture que le mod lance seul : le panneau te demande alors de cliquer sur « Actualiser », et la lecture se fait à ta demande.
