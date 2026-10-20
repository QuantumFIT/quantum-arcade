window.QA_CS = {
  'Qu2048 · 2048 with phases': 'Qu2048 · 2048 s fázemi',

  // ---- static page
  'q2.back': '← kvantová herna',
  'q2.sub': '2048, kde je každá dlaždice amplituda s fází',
  'q2.new': 'NOVÁ HRA',
  'q2.undo': 'ZPĚT',
  'q2.score': 'SKÓRE',
  'q2.best': 'REKORD',
  'q2.max': 'MAX',
  'q2.annih': 'ANIHIL.',
  'q2.aria': 'Hrací deska Qu2048',
  'q2.hint': 'šipky / WASD / tah prstem posunou všechny dlaždice',
  'q2.h.rules': 'Pravidla interference',
  'q2.r.merge': '<b>Konstruktivní.</b> Dvě stejné dlaždice se <b>stejnou fází</b> se spojí do další hodnoty: <code>|8⟩ + |8⟩ → |16⟩</code>, a stejně tak dvě dlaždice <code>−</code>.',
  'q2.r.annih': '<b>Destruktivní.</b> Dvě stejné dlaždice s <b>opačnou fází</b> se vyruší, <code>|8⟩ − |8⟩ = 0</code>. Obě zmizí, za uvolněnou energii dostaneš body a na desce se uvolní místo.',
  'q2.r.z': '<b>Dlaždice Z.</b> Vjede-li do ní jakákoli dlaždice, nebo ona do dlaždice, ta dlaždice si překlopí fázi: <code>Z|v⟩ = −|v⟩</code>. Dlaždice Z se tím spotřebuje.',
  'q2.r.h': '<b>Dlaždice H.</b> Rozdělí dlaždici 4 a víc na dvě poloviny s opačnou fází, <code>|2v⟩ → |v⟩, −|v⟩</code>. Polovina <code>−</code> se objeví na volném poli. Hodí se k výrobě antidlaždice, která vyruší překážku.',
  'q2.r.danger': '<b>Pozor:</b> dlaždice <code>−</code> se spojují i mezi sebou. Velká <code>−|64⟩</code> ti může smazat tvoji <code>|64⟩</code>.',
  'q2.r.goal': '<b>Cíl:</b> vyrob <code>|2048⟩</code>. Platí obě fáze, protože globální fázi nejde změřit.',
  'q2.h.spawn': 'Co se objevuje',
  'q2.spawn': 'Po každém tahu se objeví <code>|2⟩</code>, občas <code>|4⟩</code>, a zhruba jednou z osmi s fází <code>−</code>. Od 300 bodů se může objevit dlaždice Z a jakmile máš 128, i dlaždice H. Na desce je od každé nejvýš jedna.',
  'q2.h.controls': 'Ovládání',
  'q2.k.move': '<kbd>←↑↓→</kbd>/<kbd>WASD</kbd> nebo tah prstem: posun',
  'q2.k.more': '<kbd>U</kbd> vrátit poslední tah (3× za hru) · <kbd>N</kbd> nová hra · <kbd>M</kbd> zvuk',
  'q2.footer': 'Statická stránka: žádné sestavování a žádné sledování. Jen canvas a JavaScript.',

  // ---- status lines
  'Slide the tiles. Equal tiles with the same phase merge; opposite phases annihilate.':
    'Posouvej dlaždice. Stejné dlaždice se stejnou fází se spojí, s opačnou fází se anihilují.',
  'Destructive interference: |{v}⟩ − |{v}⟩ = 0. +{v} points and a free cell.':
    'Destruktivní interference: |{v}⟩ − |{v}⟩ = 0. +{v} bodů a volné pole.',
  'Phase flip: the tile is now {tile}.': 'Překlopení fáze: z dlaždice je teď {tile}.',
  'Hadamard split: |{v2}⟩ → |{v}⟩ and −|{v}⟩.': 'Hadamardovo rozdělení: |{v2}⟩ → |{v}⟩ a −|{v}⟩.',
  'A Z tile appeared: push a tile into it to flip its phase.': 'Objevila se dlaždice Z: vjeď do ní dlaždicí a překlopíš jí fázi.',
  'An H tile appeared: push a 4 or more into it to split it in two.': 'Objevila se dlaždice H: vjeď do ní dlaždicí 4 a víc a rozdělíš ji na dvě.',
  'Undone. Undos left: {n}.': 'Vráceno. Zbývá vrácení: {n}.',
  'UNDO': 'ZPĚT',
  '♪ ON': '♪ ZAP',
  '♪ OFF': '♪ VYP',

  // ---- overlays
  'You built a |2048⟩ with {n} annihilations along the way.': 'Máš |2048⟩! Cestou proběhlo anihilací: {n}.',
  'KEEP PLAYING': 'HRÁT DÁL',
  'NEW GAME': 'NOVÁ HRA',
  'NO MOVES LEFT': 'ŽÁDNÝ TAH',
  'Nothing can merge or cancel any more. Annihilations: {n}.': 'Už se nemá co spojit ani vyrušit. Anihilací: {n}.',
};
