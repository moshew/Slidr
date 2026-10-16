import type { AtlasCopy } from './copy';

/** A narrow no-break space, as French sets before % and its high punctuation. */
const N = ' ';

export const fr: AtlasCopy = {
  footer: 'Medwater · Rapport annuel 2026',
  hero: {
    name: 'Ouverture',
    org: 'Medwater · Ports de Méditerranée',
    title: ['L’eau', 'sans frontières'],
    subtitle: [
      'Comment quatorze villes portuaires partagent chaque goutte qu’elles apprennent à économiser',
    ],
    meta: 'Assemblée des partenaires · Valence · 18 mars 2027',
  },
  section: {
    name: 'Où nous agissons',
    part: 'Première partie',
    title: ['Où nous agissons'],
    subtitle: 'Quatorze ports, une seule mer en partage.',
  },
  agenda: {
    name: 'Ordre du jour',
    title: 'Au programme aujourd’hui',
    intro: `Vingt-cinq minutes, puis vos questions${N}:`,
    items: [
      'Où en est le réseau après trois ans',
      `Le projet de l’année${N}: un port qui produit sa propre eau`,
      'Comment une nouvelle ville nous rejoint, en cinq étapes',
      'Ce que nous demandons à chaque partenaire en 2027',
    ],
  },
  figures: {
    name: 'L’année en chiffres',
    kicker: 'L’année en chiffres',
    title: '2026 en quatre chiffres',
    hero: {
      value: `41${N}%`,
      label: 'des eaux usées traitées sont désormais réutilisées',
      note: `Contre 23${N}% au lancement du réseau en 2023.`,
    },
    others: [
      ['14', 'villes portuaires dans le réseau'],
      ['212', 'millions de m³ d’eau économisés'],
      ['380', 'ingénieurs formés dans les laboratoires communs'],
    ],
  },
  project: {
    name: 'Projet de l’année',
    kicker: 'Projet de l’année · Limassol',
    title: 'Un port qui produit sa propre eau',
    items: [
      [
        'Alimenté par le soleil',
        'Des toits solaires couvrent l’électricité de l’usine le jour, et chaque mètre cube coûte un tiers de moins.',
      ],
      [
        'Une saumure rendue en douceur',
        'Des diffuseurs dispersent le sel loin au large, et le suivi des herbiers ne montre aucun changement.',
      ],
      [
        'Construit en quatorze mois',
        'Conçu avec des ingénieurs de Haïfa et d’Izmir, qui avaient déjà bâti la même usine.',
      ],
    ],
  },
  coast: {
    name: 'Chaque côte',
    place: 'Thessalonique, Grèce',
    title: ['Chaque côte,', 'la même question'],
    body: `Comment garder l’eau au robinet pendant un été sec${N}? Quatorze villes y répondent désormais ensemble.`,
  },
  quote: {
    name: 'Le regard d’une partenaire',
    text: `Nos rivages partagent le même soleil et les mêmes étés secs. Pourquoi résoudre quatorze fois le même problème${N}?`,
    who: 'Ana Ferrer',
    role: 'Directrice de l’eau, Ville de Valence',
  },
  programmes: {
    name: 'Programmes',
    kicker: 'Trois programmes',
    title: 'Ce que nous faisons ensemble',
    cards: [
      [
        'Programme 01',
        'Réutilisation',
        'Des eaux usées traitées pour les parcs, l’agriculture et l’industrie, selon une norme commune.',
      ],
      [
        'Programme 02',
        'Dessalement',
        'Des usines solaires, conçues une fois et reconstruites dans chaque port qui en a besoin.',
      ],
      [
        'Programme 03',
        'Détection des fuites',
        'Des capteurs acoustiques qui trouvent une fuite dans une vieille conduite avant que la rue soit inondée.',
      ],
    ],
    note: 'Chaque programme est ouvert aux quatorze villes, et chaque plan est partagé gratuitement.',
  },
  milestones: {
    name: 'Étapes',
    kicker: 'Les grandes étapes',
    title: 'Trois ans, quatre escales',
    stops: [
      [
        '2023',
        'Fondé à Marseille',
        'Cinq villes signent une charte pour partager données et plans.',
      ],
      [
        '2024',
        'Un laboratoire commun',
        'Gênes ouvre un laboratoire d’essais que chaque partenaire peut réserver.',
      ],
      [
        '2025',
        'Dix villes',
        `Tunis, Izmir et Split nous rejoignent, et la réutilisation dépasse 30${N}%.`,
      ],
      ['2026', 'Quatorze villes', 'L’usine du port de Limassol commence à produire de l’eau.'],
    ],
    note: 'Chaque nouvelle ville apporte au réseau un projet à elle dès sa première année.',
  },
  joining: {
    name: 'Adhésion',
    kicker: 'Rejoindre le réseau',
    title: ['Comment une ville nous rejoint,', 'en cinq étapes'],
    steps: [
      ['Candidater', 'Une lettre du maire'],
      ['Diagnostic', 'Deux semaines avec nos ingénieurs'],
      ['Jumelage', 'Une ville qui a déjà trouvé'],
      ['Construire', 'Plans communs, équipes locales'],
      ['Partager', 'Ses données, pour les quatorze'],
    ],
    note: 'De la première lettre à l’eau qui coule, il faut dix-huit mois en moyenne.',
  },
  together: {
    name: 'Seuls ou ensemble',
    kicker: 'Pourquoi un réseau',
    title: 'Seuls, ou ensemble',
    before: [
      'Avant 2023',
      'Chaque ville de son côté',
      'Quatorze études du même problème, quatorze usines conçues à partir de zéro, et des données que personne d’autre ne pouvait utiliser.',
    ],
    after: [
      'Depuis 2023',
      'Quatorze villes comme une seule',
      'Un plan reconstruit partout où il le faut, un laboratoire commun, et chaque résultat ouvert à chaque partenaire.',
    ],
  },
  reuse: {
    name: 'Réutilisation de l’eau',
    kicker: 'Réutilisation de l’eau',
    title: ['La réutilisation progresse', 'dans chaque ville'],
    source: 'Part des eaux usées traitées réutilisées, en pourcentage, 2023–2026.',
    series: ['Moyenne du réseau', 'Limassol'],
    figures: [
      [`41${N}%`, 'des eaux usées traitées réutilisées dans le réseau en 2026.'],
      [`71${N}%`, 'à Limassol, le taux le plus élevé des quatorze villes.'],
    ],
  },
  cities: {
    name: 'Les villes',
    kicker: 'Les villes',
    title: 'Cinq des quatorze, en chiffres',
    note: 'Chiffres de 2026, tels que chaque ville les a déclarés en janvier 2027.',
    header: ['Ville', 'Adhésion', 'Eau réutilisée', 'Économisé, millions de m³', 'Programmes'],
    rows: [
      ['Valence', '2023', `52${N}%`, '31', '3'],
      ['Marseille', '2023', `44${N}%`, '27', '2'],
      ['Gênes', '2024', `39${N}%`, '18', '3'],
      ['Tunis', '2025', `33${N}%`, '22', '2'],
      ['Limassol', '2026', `71${N}%`, '9', '1'],
    ],
  },
  team: {
    name: 'L’équipe',
    kicker: 'L’équipe de coordination',
    title: 'Les personnes qui gardent le lien',
    people: [
      ['Tunis', 'Leila Haddad', 'Ingénieure en chef, dirige le laboratoire commun'],
      ['Gênes', 'Marco Bellini', 'Capitaine de port, préside le réseau'],
      ['Thessalonique', 'Elena Petridou', 'Hydrologue, pilote le programme de réutilisation'],
      ['Izmir', 'Yusuf Demir', 'Analyste de données, veille à la justesse des chiffres'],
    ],
  },
  closing: {
    name: 'Clôture',
    kicker: 'Merci',
    title: ['Rendez-vous', 'à Gênes'],
    lines: [
      `Prochaine assemblée${N}: Gênes, le Vieux-Port`,
      'Du 9 au 11 mars 2028',
      'Le rapport complet est disponible dans chaque mairie partenaire',
    ],
    meta: 'Medwater · Alliance des villes portuaires de la Méditerranée',
  },
};
