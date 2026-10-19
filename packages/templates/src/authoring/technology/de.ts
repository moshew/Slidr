import type { TechnologyCopies } from './copy';

export const de: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Architekturbericht',
    hero: [
      'Zahlungen in',
      '3 Regionen',
      'Der Zahlungskern zieht ohne Ausfall in drei aktive Regionen.',
    ],
    section: ['Eine Region', 'Ein Ausfall dort stoppte jede Zahlung.'],
    agenda: {
      title: 'Darüber sprechen wir heute',
      lead: [
        'Warum eine Region für unseren Zahlungskern nicht mehr reichte.',
        'Wie der Wechsel in drei aktive Regionen ohne Ausfall gelang.',
      ],
      points: [
        ['Der Anlass: ', 'Ein einziger Ausfall stoppte alle Zahlungen.'],
        ['Die Architektur: ', 'Jede der drei Regionen trägt die gesamte Last.'],
        ['Der Wechsel: ', 'Vier Schritte im Dezember, jederzeit umkehrbar.'],
        ['Das Ergebnis: ', 'Verfügbarkeit, Antwortzeit und Kosten im Vergleich.'],
      ],
    },
    figures: {
      title: '90 Tage ohne Stillstand',
      subtitle: 'Minuten Ausfall beim Wechsel',
      labels: ['Dienste umgezogen', 'Änderung der p95-Latenz', 'Gleichzeitig aktive Regionen'],
      body: 'In 90 Tagen weniger als sieben Minuten eingeschränkter Betrieb.',
    },
    features: {
      title: 'Drei Regionen, ein Kern',
      heads: ['Immer aktiv', 'Ein gemeinsames Hauptbuch', 'Routing nach Zustand'],
      bodies: [
        'Jede Region verarbeitet echte Zahlungen.',
        'Jede Zahlung wird zuerst in zwei Regionen gespeichert.',
        'Die nächste gesunde Region übernimmt jede Anfrage.',
      ],
    },
    timeline: {
      title: 'Vier Schritte, kein Ausfall',
      heads: ['Testbetrieb', 'Erste Händler', 'Halbe Last', 'Alle Händler'],
      bodies: [
        '1. Dezember: intern, mit automatischer Rückkehr.',
        '8. Dezember: 2.000 freiwillige Händler.',
        '15. Dezember: 50 % der Last in den neuen Regionen.',
        '22. Dezember: die alte Region ist eine von drei.',
      ],
    },
    process: {
      title: 'Der Weg einer Zahlung in 180 ms',
      steps: ['Netzrand', 'Lastverteiler', 'Dienst', 'Hauptbuch', 'Replikation'],
    },
    comparison: {
      title: 'Von einer zu drei Regionen',
      before: 'Eine Region, kalte Reserve',
      after: 'Drei aktive Regionen',
      old: [
        'Umschalten von Hand: vier Stunden',
        'Reserve ohne echten Datenverkehr',
        'Ein Ausfall stoppte alle Zahlungen',
      ],
      next: [
        'Defekte Regionen in 30 s aus dem Routing',
        'Jede Region trägt echten Datenverkehr',
        'Höchstens ein Drittel unmittelbar betroffen',
      ],
    },
    chart: {
      title: 'p95-Latenz in Millisekunden',
      note: 'Am Netzrand gemessen, Juli bis Dezember 2026.',
      series: 'p95',
      body: [
        '38 % kürzere Antwortzeit durch nähere Regionen.',
        '21 % weniger Kosten je Million Zahlungen.',
      ],
    },
    table: {
      title: 'Drei Regionen in Zahlen',
      note: '30-Tage-Mittelwerte zum 10. Januar 2027.',
      headers: ['Region', 'Standort', 'Lastanteil', 'p95', 'Verfügbarkeit'],
      labels: ['Tel Aviv', 'Frankfurt', 'Irland', 'Drei Regionen', 'Gesamt'],
    },
    photo: [
      'Drei Regionen, 42 Dienste,',
      'eine Karte',
      'Jeder Dienst läuft überall. Jede Region kann die ganze Last tragen.',
    ],
    quote: [
      'In der Nacht des Wechsels sahen wir auf die Kurven und warteten. Nichts passierte. Genau das war der Plan.',
      'SRE im Bereitschaftsdienst während des Wechsels',
    ],
    team: {
      title: 'Das Team hinter dem Wechsel',
      bios: [
        'Leitete den Wechsel in drei Regionen.',
        'Baute Leitfäden und automatischen Rollback.',
        'Hielt das gemeinsame Hauptbuch synchron.',
        'Baute das Routing nach Systemzustand.',
      ],
      roles: ['Plattformleitung', 'Zuverlässigkeit', 'Daten', 'Netzwerk'],
    },
    closing: {
      title: ['Vielen', 'Dank!'],
      lines: [
        'Der Migrationsleitfaden steht allen Teams offen.',
        'Nächstes Quartal: eine vierte Region in Nordamerika.',
        'Fragen? Wir gehen die Daten gern gemeinsam durch.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · EVT-Bericht',
    hero: [
      'Zehn Jahre,',
      'eine Batterie',
      'Der intelligente Wasserzähler WM-10: vom Prototyp zur Fertigung.',
    ],
    section: ['Das Strombudget', 'Jedes Mikroampere zählt, zehn Jahre lang.'],
    agenda: {
      title: 'Die Fragen dieser Prüfung',
      lead: [
        'Vier messbare Antworten entscheiden über die DVT im April.',
        'Für jede Frage übernimmt ein Mitglied des Teams die Verantwortung.',
      ],
      points: [
        ['Energie: ', 'Reicht eine Zelle auch im kalten Winter zehn Jahre?'],
        ['Kosten: ', 'Was kostet eine Platine bei 10.000 Stück?'],
        ['Feldtest: ', 'Was zeigen die 60 Zähler seit Januar?'],
        ['Fertigung: ', 'Was fehlt noch vor der ersten Bestellung?'],
      ],
    },
    figures: {
      title: 'Wohin der Strom fließt',
      subtitle: 'Mittlere Stromaufnahme über einen Tag',
      labels: [
        'Strom im Tiefschlaf',
        'Eine Lithiumzelle im AA-Format',
        'Jahre Laufzeit mit Reserve',
      ],
      body: 'Messung alle 15 Minuten, eine Funknachricht am Tag.',
    },
    features: {
      title: 'Drei Teile, ein Strombudget',
      heads: ['Ein schlafender Prozessor', 'Einmal täglich Funk', 'Berührungslose Messung'],
      bodies: [
        '40 ms wach: messen und wieder schlafen.',
        'Eine Nachricht am Tag, 1,2 s Sendezeit.',
        'Ultraschall ohne mechanischen Verschleiß.',
      ],
    },
    timeline: {
      title: 'Von EVT zur Serienfertigung',
      heads: ['Technikmuster', 'Designprüfung', 'Fertigungsprüfung', 'Serienstart'],
      bodies: [
        'Januar 2027: 60 Zähler im Feld.',
        'April 2027: 200 Geräte für Belastungstests.',
        'Juni 2027: 1.000 Geräte vom Band.',
        'September 2027: 10.000 je Quartal.',
      ],
    },
    process: {
      title: 'Vom Wasser in die Cloud',
      steps: ['Sensor', 'Verstärker / ADC', 'Prozessor', 'Funk', 'Cloud'],
    },
    comparison: {
      title: 'Revision B und Revision C',
      before: 'Revision B · Prototyp',
      after: 'Revision C · EVT-Platine',
      old: ['Sechs Lagen, 52 Bauteile', 'Separater NB-IoT-Funkchip', '4,1 Jahre Batterielaufzeit'],
      next: ['Vier Lagen, 38 Bauteile', 'LoRa-Funk im Prozessor', '10,8 Jahre Batterielaufzeit'],
    },
    chart: {
      title: 'Eine Sendung auf dem Oszilloskop',
      note: 'Labormuster 17, März 2027. Strom in mA.',
      series: 'mA',
      body: ['1,2 Sekunden Sendezeit, einmal am Tag.', '99,3 % der Messwerte erreichen die Cloud.'],
    },
    table: {
      title: 'Was eine Platine kostet',
      note: 'Angebote für 10.000 Stück, März 2027.',
      headers: ['Ref.', 'Bauteil', 'Anzahl', 'Stückpreis', 'Gesamt'],
      labels: [
        'Prozessor mit LoRa',
        'Ultraschall-Frontend',
        'AA-Lithiumzelle',
        'Vierlagige Platine',
        'Passive Bauteile',
        'Gesamt je Platine',
      ],
    },
    photo: [
      'Jede Platine geprüft,',
      'bevor sie dicht ist',
      'Acht Platinen durchlaufen Strom-, Funk- und Sensortests in 40 Sekunden.',
    ],
    quote: [
      'Wir wählten die nassesten Schächte. Zwei Monate später meldet sich jeder Zähler noch immer jeden Morgen.',
      'Betriebsleitung des Wasserversorgers im Pilotprojekt',
    ],
    team: {
      title: 'Das Team hinter der Platine',
      bios: [
        'Führte Rev. C vom Schaltplan zur EVT.',
        'Stimmte die Antenne unter Wasser ab.',
        'Entwickelte Firmware mit 99,9 % Schlafzeit.',
        'Baute die Prüfstation der Fertigung.',
      ],
      roles: ['Hardwareleitung', 'Funk und Antenne', 'Firmware', 'Fertigung'],
    },
    closing: {
      title: ['Bereit für', 'die Fertigung'],
      lines: [
        '200 DVT-Geräte gehen im April in die Fertigung.',
        'Wir suchen zwei weitere Versorger für den Pilot.',
        'Die Platine geht herum. Fragen sind willkommen.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Produktstart',
    hero: [
      'Betrieb auf',
      'Autopilot',
      'Zrima 2.0 verbindet Ihre Werkzeuge und übernimmt Routinearbeit.',
    ],
    section: ['Was ist neu?', 'Drei Wünsche von Ihnen, dazu eine Überraschung.'],
    agenda: {
      title: 'Das Programm heute Abend',
      lead: [
        'In 30 Minuten: Was Zrima 2.0 neu kann und warum wir es gebaut haben.',
        'Danach live: von der leeren Seite zum selbstständigen Arbeitsablauf.',
      ],
      points: [
        ['Der Editor: ', 'Ein Ablauf auf einer Fläche, von KI entworfen.'],
        ['Die Beta: ', 'Was 4.200 Teams gebaut und sich gewünscht haben.'],
        ['Die Tarife: ', 'Drei Angebote, vom Gratiseinstieg bis Business.'],
        ['Der Fahrplan: ', 'Mobile Freigaben im Februar, geteilte Abläufe 2027.'],
      ],
    },
    figures: {
      title: 'Die Beta in Zahlen',
      subtitle: 'Automatisch ausgeführte Abläufe in der Beta',
      labels: [
        'Teams in der offenen Beta',
        'Weniger Zeit je Bestellung',
        'Verfügbarkeit in drei Monaten',
      ],
      body: 'In der ersten Woche bauten Teams im Schnitt 14 Abläufe.',
    },
    features: {
      title: 'Drei neue Möglichkeiten',
      heads: ['KI-Agenten', '400 Integrationen', 'Zugriff je Schritt'],
      bodies: [
        'Anfragen sortieren, beantworten oder an Menschen übergeben.',
        'Von Finanzen bis Lager: in zwei Minuten verbunden.',
        'Minimale Rechte für jeden Schritt, jede Aktion protokolliert.',
      ],
    },
    timeline: {
      title: 'Von Version 1.0 zu 3.0',
      heads: ['Grundlage', 'Editor und KI', 'Mobile App', 'Geteilte Abläufe'],
      bodies: [
        '2025: 40 Integrationen und einfache Abläufe.',
        'Dezember 2026: Editor, KI, 400 Integrationen.',
        'Februar 2027: Freigaben und Hinweise am Handy.',
        'Ende 2027: Kunden und Lieferanten in einem Ablauf.',
      ],
    },
    process: {
      title: 'In 15 Minuten zum ersten Ablauf',
      steps: ['Anmelden', 'Verbinden', 'Einladen', 'Automatisieren', 'Auswerten'],
    },
    comparison: {
      title: 'Eine Bestellung, zwei Welten',
      before: 'Sechs Werkzeuge, 40 Minuten',
      after: 'Ein Ablauf, 4 Minuten',
      old: [
        'Daten von Hand übertragen',
        'Freigaben telefonisch einholen',
        'Fehler erst beim Monatsabschluss finden',
      ],
      next: [
        'Daten fließen automatisch',
        'Freigabe direkt aus der Benachrichtigung',
        'Abweichungen sofort erkennen',
      ],
    },
    chart: {
      title: 'Teams kommen und bleiben',
      note: 'Nutzungsdaten von Juni bis November 2026.',
      series: 'Arbeitsabläufe',
      body: [
        '13-mal mehr aktive Abläufe seit Juni.',
        '92 % der Teams sind nach 60 Tagen noch aktiv.',
      ],
    },
    table: {
      title: 'Drei Tarife, ein Produkt',
      note: 'Startpreise bei Anmeldung bis 31. Januar 2027.',
      headers: ['Leistung', 'Free', 'Pro', 'Business'],
      labels: [
        'Aktive Abläufe',
        'Ausführungen / Monat',
        'KI-Agenten',
        'Rechte und SSO',
        'Preis / Person / Monat',
        'Kostenlos',
        'Unbegrenzt',
        'Basis',
        'Vollständig',
      ],
    },
    photo: [
      'Ein Überblick für',
      'den ganzen Betrieb',
      'Bestellungen, Lager, Lieferanten und Anfragen in Echtzeit auf einem gemeinsamen Bildschirm.',
    ],
    quote: [
      'Früher kopierten wir jede Bestellung in sechs Systeme. Heute kümmert sich mein Team um Ausnahmen. Der Rest läuft.',
      'Betriebsleitung einer Sporthandelskette · Beta-Kundin',
    ],
    team: {
      title: 'Das Team hinter Zrima',
      bios: [
        'Leitete drei Logistikbetriebe.',
        'Baute die Engine für zwei Millionen Läufe am Tag.',
        'Verantwortet Editor und KI-Agenten.',
        'Entwarf 2.0 mit vierzig Betriebsteams.',
      ],
      roles: ['Geschäftsführung', 'Technikleitung', 'Produktleitung', 'Designleitung'],
    },
    closing: {
      title: ['Jetzt', 'loslegen'],
      lines: [
        'Kostenloses Konto auf zrima.example eröffnen.',
        'Live-Demo am Stand bis 22 Uhr.',
        '30 % Startrabatt bis Ende Januar.',
      ],
    },
  },
};
