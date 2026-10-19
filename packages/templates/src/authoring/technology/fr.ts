import type { TechnologyCopies } from './copy';

export const fr: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Revue d’architecture',
    hero: [
      'Paiements sur',
      '3 régions',
      'Le cœur des paiements migre vers trois régions actives sans interruption.',
    ],
    section: ['Une seule région', 'Une panne suffisait à bloquer tous les paiements.'],
    agenda: {
      title: 'Au programme aujourd’hui',
      lead: [
        'Pourquoi une région ne suffisait plus à notre cœur de paiements.',
        'Comment nous sommes passés à trois régions actives sans interruption.',
      ],
      points: [
        ['Le besoin : ', 'Une seule panne bloquait tous les paiements.'],
        ['L’architecture : ', 'Chaque région peut absorber toute la charge.'],
        ['La migration : ', 'Quatre étapes en décembre, toutes réversibles.'],
        ['Les résultats : ', 'Disponibilité, latence p95 et facture mensuelle.'],
      ],
    },
    figures: {
      title: '90 jours sans arrêt',
      subtitle: 'Minutes d’interruption pendant la migration',
      labels: ['Services migrés', 'Évolution de la latence p95', 'Régions actives simultanément'],
      body: 'Moins de sept minutes de service dégradé sur 90 jours.',
    },
    features: {
      title: 'Trois régions, un seul cœur',
      heads: ['Toujours actives', 'Un registre synchronisé', 'Routage selon l’état'],
      bodies: [
        'Chaque région traite de vrais paiements.',
        'Chaque paiement est d’abord enregistré dans deux régions.',
        'La région saine la plus proche reçoit chaque requête.',
      ],
    },
    timeline: {
      title: 'Quatre étapes sans interruption',
      heads: ['Test interne', 'Premiers marchands', 'La moitié du trafic', 'Tout le monde'],
      bodies: [
        '1er décembre : personnel, retour automatique.',
        '8 décembre : 2 000 marchands volontaires.',
        '15 décembre : 50 % du trafic sur les nouvelles régions.',
        '22 décembre : l’ancienne région devient l’une des trois.',
      ],
    },
    process: {
      title: 'Le parcours d’un paiement en 180 ms',
      steps: ['Périphérie', 'Répartiteur', 'Service', 'Registre', 'Réplication'],
    },
    comparison: {
      title: 'D’une région à trois',
      before: 'Une région et un secours inactif',
      after: 'Trois régions actives',
      old: [
        'Bascule manuelle en quatre heures',
        'Le secours ne voyait aucun trafic réel',
        'Une panne bloquait tous les paiements',
      ],
      next: [
        'Région en panne retirée du routage en 30 s',
        'Chaque région porte du trafic réel',
        'Au plus un tiers touché immédiatement',
      ],
    },
    chart: {
      title: 'Latence p95 en millisecondes',
      note: 'Mesurée en périphérie, de juillet à décembre 2026.',
      series: 'p95',
      body: [
        '38 % de latence en moins grâce à des régions proches.',
        '21 % de coût en moins par million de paiements.',
      ],
    },
    table: {
      title: 'Trois régions en chiffres',
      note: 'Moyennes sur 30 jours au 10 janvier 2027.',
      headers: ['Région', 'Lieu', 'Part du trafic', 'p95', 'Disponibilité'],
      labels: ['Tel Aviv', 'Francfort', 'Irlande', 'Trois régions', 'Total'],
    },
    photo: [
      'Trois régions, 42 services,',
      'une carte',
      'Chaque service tourne partout. Chaque région peut porter toute la charge.',
    ],
    quote: [
      'La nuit de la migration, nous regardions les courbes en attendant un incident. Rien n’est arrivé. C’était le but.',
      'SRE d’astreinte pendant la migration',
    ],
    team: {
      title: 'L’équipe de la migration',
      bios: [
        'A piloté le passage à trois régions.',
        'A créé les procédures et le retour automatique.',
        'A gardé le registre synchronisé.',
        'A construit le routage selon l’état.',
      ],
      roles: ['Plateforme', 'Fiabilité', 'Données', 'Réseau'],
    },
    closing: {
      title: ['Un grand', 'merci !'],
      lines: [
        'Le guide de migration est ouvert à toutes les équipes.',
        'Prochain trimestre : une quatrième région en Amérique du Nord.',
        'Nous pouvons parcourir les données et répondre aux questions.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · Revue EVT',
    hero: [
      'Dix ans,',
      'une seule pile',
      'Le compteur d’eau intelligent WM-10, du prototype à la production.',
    ],
    section: ['Le budget énergétique', 'Chaque microampère compte pendant dix ans.'],
    agenda: {
      title: 'Les questions de cette revue',
      lead: [
        'Quatre réponses mesurables décident du passage en DVT en avril.',
        'Chaque question a une personne responsable au sein de l’équipe.',
      ],
      points: [
        ['Énergie : ', 'Une pile tient-elle dix ans, même en hiver ?'],
        ['Coût : ', 'Le prix d’une carte pour un lot de 10 000 unités.'],
        ['Terrain : ', 'Les leçons des 60 compteurs installés en janvier.'],
        ['Production : ', 'Ce qui manque avant de commander le premier lot.'],
      ],
    },
    figures: {
      title: 'Où passe le courant',
      subtitle: 'Consommation moyenne sur une journée',
      labels: [
        'Courant en veille profonde',
        'Une pile lithium AA',
        'Années d’autonomie avec marge',
      ],
      body: 'Une mesure toutes les 15 minutes, un envoi radio par jour.',
    },
    features: {
      title: 'Trois blocs, un seul budget',
      heads: ['Un processeur en veille', 'Un envoi radio par jour', 'Mesure sans contact'],
      bodies: [
        'Réveil de 40 ms, mesure, puis retour en veille.',
        'Un message par jour, 1,2 s d’émission.',
        'Des ultrasons sans pièces d’usure.',
      ],
    },
    timeline: {
      title: 'De l’EVT à la grande série',
      heads: [
        'Prototype technique',
        'Validation du design',
        'Validation de production',
        'Grande série',
      ],
      bodies: [
        'Janvier 2027 : 60 compteurs sur le terrain.',
        'Avril 2027 : 200 unités pour les essais.',
        'Juin 2027 : 1 000 unités en sortie de ligne.',
        'Septembre 2027 : 10 000 unités par trimestre.',
      ],
    },
    process: {
      title: 'De l’eau au cloud',
      steps: ['Capteur', 'Ampli et ADC', 'Processeur', 'Radio', 'Cloud'],
    },
    comparison: {
      title: 'Révision B et révision C',
      before: 'Rév. B · prototype',
      after: 'Rév. C · carte EVT',
      old: ['Six couches et 52 composants', 'Puce radio NB-IoT séparée', '4,1 ans d’autonomie'],
      next: [
        'Quatre couches et 38 composants',
        'Radio LoRa dans le processeur',
        '10,8 ans d’autonomie',
      ],
    },
    chart: {
      title: 'Une émission à l’oscilloscope',
      note: 'Unité de laboratoire 17, mars 2027. Courant en mA.',
      series: 'mA',
      body: [
        '1,2 seconde d’émission, une fois par jour.',
        '99,3 % des relevés arrivent dans le cloud.',
      ],
    },
    table: {
      title: 'Le coût d’une carte',
      note: 'Devis de mars 2027 pour 10 000 unités.',
      headers: ['Réf.', 'Composant', 'Qté', 'Prix unitaire', 'Total'],
      labels: [
        'Processeur avec LoRa',
        'Circuit ultrasonique',
        'Pile lithium AA',
        'Carte quatre couches',
        'Composants passifs',
        'Total par carte',
      ],
    },
    photo: [
      'Chaque carte testée',
      'avant son scellement',
      'Huit cartes passent les tests de courant, de radio et de capteur en 40 secondes.',
    ],
    quote: [
      'Nous avons choisi les regards les plus humides. Deux mois plus tard, tous les compteurs répondent chaque matin.',
      'Responsable d’exploitation du service d’eau du pilote',
    ],
    team: {
      title: 'L’équipe derrière la carte',
      bios: [
        'A mené la rév. C du schéma à l’EVT.',
        'A réglé l’antenne sous l’eau.',
        'A conçu un logiciel en veille à 99,9 %.',
        'A construit le poste de test.',
      ],
      roles: ['Responsable matériel', 'Radio et antenne', 'Micrologiciel', 'Fabrication'],
    },
    closing: {
      title: ['Prêts pour', 'la production'],
      lines: [
        '200 unités DVT partent en fabrication en avril.',
        'Nous cherchons deux autres services d’eau pour le pilote.',
        'La carte circule dans la salle. Place aux questions.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Soirée de lancement',
    hero: [
      'Opérations',
      'automatiques',
      'Zrima 2.0 relie vos outils et prend en charge les tâches répétitives.',
    ],
    section: ['Les nouveautés', 'Trois demandes de votre part, et une surprise.'],
    agenda: {
      title: 'Le programme de ce soir',
      lead: [
        'Trente minutes sur les nouveautés de Zrima 2.0 et nos choix.',
        'Puis une démo en direct : d’une page vide à un flux autonome.',
      ],
      points: [
        ['L’éditeur : ', 'Tout le flux sur une toile, avec l’aide de l’IA.'],
        ['La bêta : ', 'Les créations et les demandes de 4 200 équipes.'],
        ['Les offres : ', 'Trois formules, du gratuit à Business.'],
        ['La suite : ', 'Validations mobiles en février, flux partagés en 2027.'],
      ],
    },
    figures: {
      title: 'La bêta en chiffres',
      subtitle: 'Flux exécutés automatiquement pendant la bêta',
      labels: [
        'Équipes dans la bêta ouverte',
        'Temps de traitement en moins',
        'Disponibilité sur trois mois',
      ],
      body: 'Les équipes ont créé en moyenne 14 flux dès la première semaine.',
    },
    features: {
      title: 'Trois nouvelles capacités',
      heads: ['Agents IA', '400 intégrations', 'Accès par étape'],
      bodies: [
        'Trier, répondre ou passer la main à une personne.',
        'Des finances au stock : une connexion en deux minutes.',
        'Droits minimaux à chaque étape, chaque action consignée.',
      ],
    },
    timeline: {
      title: 'De la version 1.0 à la 3.0',
      heads: ['Les bases', 'Éditeur et IA', 'Application mobile', 'Flux partagés'],
      bodies: [
        '2025 : 40 intégrations et des flux simples.',
        'Décembre 2026 : éditeur, IA et 400 intégrations.',
        'Février 2027 : validations et alertes mobiles.',
        'Fin 2027 : clients et fournisseurs dans un même flux.',
      ],
    },
    process: {
      title: 'Un premier flux en 15 minutes',
      steps: ['S’inscrire', 'Connecter', 'Inviter', 'Automatiser', 'Mesurer'],
    },
    comparison: {
      title: 'Une commande, deux mondes',
      before: 'Six outils, 40 minutes',
      after: 'Un flux, 4 minutes',
      old: [
        'Recopier les données entre outils',
        'Relancer les validations par téléphone',
        'Découvrir les erreurs à la clôture mensuelle',
      ],
      next: [
        'Les données circulent automatiquement',
        'Valider depuis la notification',
        'Repérer les anomalies immédiatement',
      ],
    },
    chart: {
      title: 'Des équipes qui restent',
      note: 'Données d’usage, de juin à novembre 2026.',
      series: 'Flux',
      body: [
        '13 fois plus de flux actifs depuis juin.',
        '92 % des équipes sont encore actives après 60 jours.',
      ],
    },
    table: {
      title: 'Trois offres, un produit',
      note: 'Tarifs de lancement pour une inscription avant le 31 janvier 2027.',
      headers: ['Inclus', 'Free', 'Pro', 'Business'],
      labels: [
        'Flux actifs',
        'Exécutions par mois',
        'Agents IA',
        'Droits et SSO',
        'Prix / personne / mois',
        'Gratuit',
        'Illimité',
        'De base',
        'Complet',
      ],
    },
    photo: [
      'Un tableau pour',
      'toutes les opérations',
      'Commandes, stocks, fournisseurs et demandes en temps réel sur un écran partagé.',
    ],
    quote: [
      'Avant, nous recopions chaque commande dans six systèmes. Mon équipe ne traite plus que les exceptions. Le reste suit.',
      'Responsable des opérations d’une enseigne sportive · cliente bêta',
    ],
    team: {
      title: 'L’équipe derrière Zrima',
      bios: [
        'A dirigé les opérations de trois logisticiens.',
        'A bâti le moteur de deux millions d’exécutions par jour.',
        'Pilote l’éditeur et les agents IA.',
        'A conçu 2.0 avec quarante équipes métier.',
      ],
      roles: ['Direction générale', 'Direction technique', 'Produit', 'Design'],
    },
    closing: {
      title: ['Passez', 'à l’action'],
      lines: [
        'Ouvrez un compte gratuit sur zrima.example.',
        'Démo sur notre stand jusqu’à 22 h.',
        '30 % de remise jusqu’à fin janvier.',
      ],
    },
  },
};
