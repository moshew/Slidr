import type { TechnologyCopies } from './copy';

export const it: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Revisione dell’architettura',
    hero: [
      'Pagamenti in',
      '3 regioni',
      'Il nucleo dei pagamenti passa a tre regioni attive senza interruzioni.',
    ],
    section: ['Una sola regione', 'Un guasto fermava tutti i pagamenti.'],
    agenda: {
      title: 'Di cosa parliamo oggi',
      lead: [
        'Perché una regione non bastava più al nucleo dei pagamenti.',
        'Come siamo passati a tre regioni attive senza fermare il servizio.',
      ],
      points: [
        ['Il motivo: ', 'Un solo guasto bloccava tutti i pagamenti.'],
        ['L’architettura: ', 'Ogni regione può sostenere l’intero carico.'],
        ['La migrazione: ', 'Quattro fasi a dicembre, tutte reversibili.'],
        ['I risultati: ', 'Disponibilità, latenza p95 e costi mensili.'],
      ],
    },
    figures: {
      title: '90 giorni senza fermarsi',
      subtitle: 'Minuti di fermo durante la migrazione',
      labels: ['Servizi trasferiti', 'Variazione della latenza p95', 'Regioni attive insieme'],
      body: 'Meno di sette minuti di servizio parziale in 90 giorni.',
    },
    features: {
      title: 'Tre regioni, un solo nucleo',
      heads: ['Sempre attive', 'Un registro sincronizzato', 'Instradamento per stato'],
      bodies: [
        'Ogni regione elabora pagamenti reali.',
        'Ogni pagamento viene salvato prima in due regioni.',
        'La regione sana più vicina riceve la richiesta.',
      ],
    },
    timeline: {
      title: 'Quattro fasi senza interruzioni',
      heads: ['Prova interna', 'Primi esercenti', 'Metà del traffico', 'Tutti'],
      bodies: [
        '1 dicembre: personale, ripristino automatico.',
        '8 dicembre: 2.000 esercenti volontari.',
        '15 dicembre: 50% del traffico nelle nuove regioni.',
        '22 dicembre: la regione originale è una delle tre.',
      ],
    },
    process: {
      title: 'Il percorso di un pagamento in 180 ms',
      steps: ['Edge', 'Bilanciatore', 'Servizio', 'Registro', 'Replica'],
    },
    comparison: {
      title: 'Da una regione a tre',
      before: 'Una regione e riserva inattiva',
      after: 'Tre regioni attive',
      old: [
        'Passaggio manuale in quattro ore',
        'La riserva non riceveva traffico reale',
        'Un guasto fermava tutti i pagamenti',
      ],
      next: [
        'Regioni guaste escluse in 30 s',
        'Ogni regione gestisce traffico reale',
        'Un guasto tocca al massimo un terzo',
      ],
    },
    chart: {
      title: 'Latenza p95 in millisecondi',
      note: 'Misure all’edge, da luglio a dicembre 2026.',
      series: 'p95',
      body: [
        'Latenza ridotta del 38% con regioni più vicine.',
        'Costo per milione di pagamenti ridotto del 21%.',
      ],
    },
    table: {
      title: 'Tre regioni in cifre',
      note: 'Medie su 30 giorni al 10 gennaio 2027.',
      headers: ['Regione', 'Località', 'Traffico', 'p95', 'Disponibilità'],
      labels: ['Tel Aviv', 'Francoforte', 'Irlanda', 'Tre regioni', 'Totale'],
    },
    photo: [
      'Tre regioni, 42 servizi,',
      'una mappa',
      'Ogni servizio opera ovunque. Ogni regione può sostenere tutto il carico.',
    ],
    quote: [
      'La notte della migrazione guardavamo i grafici aspettando un problema. Non è successo nulla. Era proprio l’obiettivo.',
      'SRE di turno durante la migrazione',
    ],
    team: {
      title: 'Il team della migrazione',
      bios: [
        'Ha guidato il passaggio a tre regioni.',
        'Ha creato procedure e ripristino automatico.',
        'Ha mantenuto sincronizzato il registro.',
        'Ha creato le rotte in base allo stato.',
      ],
      roles: ['Piattaforma', 'Affidabilità', 'Dati', 'Rete'],
    },
    closing: {
      title: ['Grazie', 'a tutti!'],
      lines: [
        'La guida alla migrazione è aperta a ogni team.',
        'Prossimo trimestre: quarta regione in Nord America.',
        'Siamo pronti a discutere i dati e le vostre domande.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · Revisione EVT',
    hero: [
      'Dieci anni,',
      'una batteria',
      'Il contatore d’acqua intelligente WM-10, dal prototipo alla produzione.',
    ],
    section: ['Il budget energetico', 'Ogni microampere conta per dieci anni.'],
    agenda: {
      title: 'Le domande della revisione',
      lead: [
        'Quattro risposte misurabili decidono il passaggio a DVT in aprile.',
        'Ogni domanda ha un responsabile all’interno del team.',
      ],
      points: [
        ['Energia: ', 'Una pila dura dieci anni anche al freddo?'],
        ['Costo: ', 'Il prezzo di una scheda su 10.000 unità.'],
        ['Sul campo: ', 'Le lezioni dei 60 contatori attivi da gennaio.'],
        ['Produzione: ', 'Cosa manca prima di ordinare il primo lotto.'],
      ],
    },
    figures: {
      title: 'Dove va la corrente',
      subtitle: 'Assorbimento medio su un’intera giornata',
      labels: [
        'Corrente in riposo profondo',
        'Una pila al litio AA',
        'Anni di autonomia con margine',
      ],
      body: 'Misura ogni 15 minuti e trasmette una volta al giorno.',
    },
    features: {
      title: 'Tre blocchi, un budget',
      heads: ['Un processore che dorme', 'Radio una volta al giorno', 'Misura senza contatto'],
      bodies: [
        'Si sveglia per 40 ms, misura e torna a dormire.',
        'Un messaggio al giorno, 1,2 s di trasmissione.',
        'Ultrasuoni senza componenti soggetti a usura.',
      ],
    },
    timeline: {
      title: 'Da EVT alla produzione in serie',
      heads: [
        'Prototipo tecnico',
        'Verifica del progetto',
        'Verifica produttiva',
        'Produzione in serie',
      ],
      bodies: [
        'Gennaio 2027: 60 contatori sul campo.',
        'Aprile 2027: 200 unità per prove di stress.',
        'Giugno 2027: 1.000 unità dalla linea.',
        'Settembre 2027: 10.000 unità a trimestre.',
      ],
    },
    process: {
      title: 'Dall’acqua al cloud',
      steps: ['Sensore', 'Amplificatore e ADC', 'Processore', 'Radio', 'Cloud'],
    },
    comparison: {
      title: 'Revisione B e revisione C',
      before: 'Rev. B · prototipo',
      after: 'Rev. C · scheda EVT',
      old: ['Sei strati e 52 componenti', 'Chip radio NB-IoT separato', '4,1 anni di autonomia'],
      next: [
        'Quattro strati e 38 componenti',
        'Radio LoRa nel processore',
        '10,8 anni di autonomia',
      ],
    },
    chart: {
      title: 'Una trasmissione all’oscilloscopio',
      note: 'Unità di laboratorio 17, marzo 2027. Corrente in mA.',
      series: 'mA',
      body: [
        '1,2 secondi di trasmissione, una volta al giorno.',
        'Il 99,3% delle letture raggiunge il cloud.',
      ],
    },
    table: {
      title: 'Il costo di una scheda',
      note: 'Preventivi di marzo 2027 per 10.000 unità.',
      headers: ['Rif.', 'Componente', 'Qtà', 'Prezzo unitario', 'Totale'],
      labels: [
        'Processore con LoRa',
        'Circuito a ultrasuoni',
        'Pila al litio AA',
        'Scheda a quattro strati',
        'Componenti passivi',
        'Totale per scheda',
      ],
    },
    photo: [
      'Ogni scheda verificata',
      'prima della sigillatura',
      'Otto schede superano i test di corrente, radio e sensore in 40 secondi.',
    ],
    quote: [
      'Abbiamo scelto i pozzetti più umidi. Dopo due mesi, ogni contatore continua a inviare dati ogni mattina.',
      'Responsabile operativo dell’azienda idrica del progetto pilota',
    ],
    team: {
      title: 'Il team della scheda',
      bios: [
        'Ha portato la rev. C dallo schema all’EVT.',
        'Ha regolato l’antenna sott’acqua.',
        'Ha creato firmware in riposo per il 99,9%.',
        'Ha costruito la stazione di collaudo.',
      ],
      roles: ['Responsabile hardware', 'Radio e antenna', 'Firmware', 'Produzione'],
    },
    closing: {
      title: ['Pronti per', 'la produzione'],
      lines: [
        '200 unità DVT entrano in produzione ad aprile.',
        'Cerchiamo altre due aziende idriche per il pilota.',
        'La scheda passa tra i presenti. Spazio alle domande.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Serata di lancio',
    hero: [
      'Operazioni con il',
      'pilota automatico',
      'Zrima 2.0 collega gli strumenti e gestisce le attività ripetitive.',
    ],
    section: ['Le novità', 'Tre richieste vostre e una sorpresa.'],
    agenda: {
      title: 'Il programma della serata',
      lead: [
        'Trenta minuti sulle novità di Zrima 2.0 e sulle nostre scelte.',
        'Poi una demo dal vivo: da una pagina vuota a un flusso autonomo.',
      ],
      points: [
        ['L’editor: ', 'Tutto il flusso su una tela, con l’aiuto dell’IA.'],
        ['La beta: ', 'Cosa hanno creato e chiesto 4.200 team.'],
        ['I piani: ', 'Tre opzioni, dal gratuito a Business.'],
        ['Il futuro: ', 'Approvazioni mobili a febbraio, flussi condivisi nel 2027.'],
      ],
    },
    figures: {
      title: 'La beta in cifre',
      subtitle: 'Flussi eseguiti automaticamente durante la beta',
      labels: ['Team nella beta aperta', 'Tempo per ordine in meno', 'Disponibilità in tre mesi'],
      body: 'Nella prima settimana ogni team ha creato in media 14 flussi.',
    },
    features: {
      title: 'Tre nuove possibilità',
      heads: ['Agenti IA', '400 integrazioni', 'Accesso per fase'],
      bodies: [
        'Smistano, rispondono o passano la richiesta a una persona.',
        'Dalla contabilità al magazzino: collegati in due minuti.',
        'Permessi minimi per fase, ogni azione registrata.',
      ],
    },
    timeline: {
      title: 'Dalla versione 1.0 alla 3.0',
      heads: ['Le fondamenta', 'Editor e IA', 'App mobile', 'Flussi condivisi'],
      bodies: [
        '2025: 40 integrazioni e flussi semplici.',
        'Dicembre 2026: editor, IA e 400 integrazioni.',
        'Febbraio 2027: approvazioni e avvisi sul telefono.',
        'Fine 2027: clienti e fornitori nello stesso flusso.',
      ],
    },
    process: {
      title: 'Il primo flusso in 15 minuti',
      steps: ['Iscriviti', 'Collega', 'Invita', 'Automatizza', 'Analizza'],
    },
    comparison: {
      title: 'Un ordine, due mondi',
      before: 'Sei strumenti, 40 minuti',
      after: 'Un flusso, 4 minuti',
      old: [
        'Copiare dati tra strumenti',
        'Inseguire approvazioni al telefono',
        'Trovare errori alla chiusura mensile',
      ],
      next: [
        'I dati passano automaticamente',
        'Approvare dalla notifica',
        'Rilevare subito le anomalie',
      ],
    },
    chart: {
      title: 'I team arrivano e restano',
      note: 'Dati d’uso da giugno a novembre 2026.',
      series: 'Flussi',
      body: [
        'Flussi attivi cresciuti di 13 volte da giugno.',
        'Il 92% dei team è attivo dopo 60 giorni.',
      ],
    },
    table: {
      title: 'Tre piani, un prodotto',
      note: 'Prezzi di lancio per iscrizioni entro il 31 gennaio 2027.',
      headers: ['Incluso', 'Free', 'Pro', 'Business'],
      labels: [
        'Flussi attivi',
        'Esecuzioni al mese',
        'Agenti IA',
        'Permessi e SSO',
        'Prezzo / utente / mese',
        'Gratis',
        'Illimitati',
        'Base',
        'Completi',
      ],
    },
    photo: [
      'Un pannello per',
      'tutte le operazioni',
      'Ordini, scorte, fornitori e richieste in tempo reale su una schermata condivisa.',
    ],
    quote: [
      'Prima copiavamo ogni ordine in sei sistemi. Ora il team gestisce solo le eccezioni. Il resto scorre da solo.',
      'Responsabile operativo di una catena sportiva · cliente beta',
    ],
    team: {
      title: 'Chi crea Zrima',
      bios: [
        'Ha diretto tre aziende logistiche.',
        'Ha creato il motore di due milioni di esecuzioni al giorno.',
        'Guida l’editor e gli agenti IA.',
        'Ha progettato 2.0 con quaranta team operativi.',
      ],
      roles: ['Direzione generale', 'Direzione tecnica', 'Prodotto', 'Design'],
    },
    closing: {
      title: ['Inizia', 'a fluire'],
      lines: [
        'Apri un account gratuito su zrima.example.',
        'Demo dal vivo al nostro stand fino alle 22.',
        'Sconto del 30% fino a fine gennaio.',
      ],
    },
  },
};
