# Magnolia Traiteur

Site vitrine, boutique de prestations, espace client et back-office de Magnolia Traiteur.
Même méthode que JEPRIVATIZ : Node/Express, base MySQL (ou un simple fichier pour l'essai), e-mails et SMS par Brevo.

## Ce que contient le site

**Le site public**
- Accueil avec les **trois vidéos** du brouillon : trois panneaux sur ordinateur, une vidéo après l'autre (balayage) sur téléphone. Elles se changent dans le back-office.
- Pavé de 3 questions (événement, date, invités), retenu pour toute la visite et jamais reposé.
- Recherche instantanée, avec dictée à la voix.
- Boutique de 355 prestations du brouillon (13 rubriques), prix TTC ou « Sur devis », filtres et tri.
- Fiches avec photos et vidéo, choix (variantes, options, compositions), personnel de service, packs traiteur, minimum, allergènes et total estimé.
- « Ma sélection » : livraison estimée (1 € TTC du km aller-retour depuis Villebon), puis envoi de la demande.
- 22 lieux de réception, témoignages, la maison, livraison, comment commander, contact, pages légales.
- Espace client par lien reçu par e-mail : demandes, devis, factures.
- Devis en ligne avec signature, factures imprimables.
- Mode sombre, adapté au téléphone, adresses du brouillon conservées pour Google.

**Le back-office** (`/admin`)
- Tableau de bord, Demandes, Suivi client (cartes à glisser : Demande → Devis envoyé → Relance → Accord → Réservé → Refusé).
- Devis : lignes du catalogue, lignes libres et titres, prix TTC, coût de revient, TVA par ligne, remise, marge. **Une marge négative est bloquée.** Envoi par e-mail et SMS, relances, factures d'acompte, de solde ou totale.
- Factures, Agenda, Clients.
- Catalogue : bouton « + Créer » dans chaque rubrique, statut Masqué au lieu de supprimer, photos et textes modifiables sans code.
- Lieux, Photos & textes du site (vidéos de l'accueil, chiffres, incontournables, coordonnées, tarifs), Avis, Médiathèque.
- Équipe (Manager / Collaborateur) et journal d'activité infalsifiable, Outils (modèles de relance, pages légales).

## Essayer sur son ordinateur

```bash
npm install
ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD=un-mot-de-passe-long npm start
```

Ouvrir http://localhost:3000 pour le site, et http://localhost:3000/admin pour le back-office.
Sans base MySQL, tout est enregistré dans `var/db.json`. Sans clé Brevo, rien n'est envoyé : les e-mails et SMS apparaissent dans « Équipe & activité ».

Tests : `npm test`.

## Mise en ligne (Hostinger, comme JEPRIVATIZ)

1. Créer une application Node.js (Node 20 ou plus) reliée à ce dépôt, branche `main`, fichier de démarrage `server/index.js`.
2. Créer une base MySQL et recopier les réglages de `.env.example` dans les variables de l'application (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `SITE_URL`, `UPLOAD_DIR`).
3. `UPLOAD_DIR` doit pointer vers un dossier qui ne s'efface pas aux mises à jour (photos envoyées depuis le back-office).
4. Chaque poussée sur `main` met le site à jour.

## Le contenu du brouillon

`scripts/recuperer-brouillon.js` lit le brouillon (textes, prix, options, lieux) et copie toutes les photos et vidéos dans `public/site/`.
GitHub le lance tout seul (`.github/workflows/recuperer-brouillon.yml`) ; le résultat est dans `data/brouillon.json`.
Au premier démarrage, le site importe ce contenu dans sa base. Ensuite, tout se modifie dans le back-office.
