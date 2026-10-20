window.QA_CS = {
  'Quattleship · quantum battleship': 'Quattleship · kvantové lodě',

  // ---- static page
  'qs.back': '← kvantová herna',
  'qs.sub': 'lodě, kde loď najdeš, aniž by se jí cokoli dotklo',
  'qs.new': 'NOVÁ HRA',
  'qs.shuffle': 'PŘEMÍCHAT FLOTILU',
  'qs.turn': 'TAH',
  'qs.energy': 'ENERGIE',
  'qs.alarm': 'POPLACH',
  'qs.enemy': 'NEPŘÍTEL',
  'qs.aria.enemy': 'Nepřátelské vody',
  'qs.aria.mine': 'Tvoje flotila',
  'qs.m.probe': '〰 ZENONOVA SONDA',
  'qs.m.torpedo': '💣 TORPÉDO',
  'qs.steps': 'ZENONOVY KROKY N',
  'qs.h.photon': 'Foton',
  'qs.h.mine': 'Tvoje flotila',
  'qs.h.how': 'Jak to funguje',
  'qs.r.torpedo': '<b>Torpédo:</b> jedno za tah, a tím tah končí. Jen torpédem jde loď potopit, a když mineš, tah propadne.',
  'qs.r.probe': '<b>Zenonova sonda:</b> kolik ti energie dovolí, každá stojí N. Foton začne v <code>|0⟩</code> a v N malých krocích po <code>π/2N</code> se natáčí k <code>|1⟩</code>. Po každém kroku proletí kolem políčka.',
  'qs.r.water': '<b>Voda:</b> foton nic neruší, skončí v <code>|1⟩</code> a detektor hlásí „prázdno“. Tohle je vždycky bezpečné.',
  'qs.r.ship': '<b>Loď:</b> každý průlet je měření. Většinou foton srazí zpátky do <code>|0⟩</code>, to je kvantový Zenonův jev, a detektor hlásí „loď“, i když se jí nic nedotklo. Stane se to s pravděpodobností <code>cos²ᴺ(π/2N)</code>.',
  'qs.r.absorb': '<b>Pohlcení:</b> se zbývající pravděpodobností loď foton pohltí. „Loď“ se dozvíš i tak, ale nepřítel si tě všimne: <b>poplach +4</b>.',
  'qs.r.alarm': '<b>Poplach:</b> nepřítel střílí 1 ránu za tah a za každé 4 body poplachu jednu navíc. Poplach každý tah o 1 opadne.',
  'qs.r.n': '<b>N = 1</b> je obyčejný klasický dotyk: když najde loď, foton je pokaždé pohlcen. Velké N je skoro neviditelné, ale drahé. Tohle je Elitzurův–Vaidmanův test bomb.',
  'qs.footer': 'Statická stránka: žádné sestavování a žádné sledování. Jen canvas a JavaScript.',

  // ---- status lines
  'Find the enemy fleet. Probe silently, then torpedo what you found.': 'Najdi nepřátelskou flotilu. Potichu sonduj a pak torpéduj, co najdeš.',
  'You already know what is in {cell}.': 'Co je na {cell}, už víš.',
  'Not enough energy: an N = {n} probe costs {n}. Lower N or fire a torpedo.': 'Málo energie: sonda s N = {n} stojí {n}. Sniž N, nebo vystřel torpédo.',
  'Probing {cell} with N = {n}…': 'Sonduji {cell} s N = {n}…',
  '{cell}: water. The photon turned all the way to |1⟩, and nothing was there to stop it.': '{cell}: voda. Foton se natočil až do |1⟩ a nic ho nezastavilo.',
  '{cell}: SHIP, found without touching it! The Zeno effect held the photon at |0⟩ ({p}% chance).': '{cell}: LOĎ, a to bez dotyku! Zenonův jev podržel foton v |0⟩ (šance {p} %).',
  '{cell}: the ship absorbed the photon at step {k} of {n}. It is a ship, but they noticed you: alarm +{a}.': '{cell}: loď pohltila foton v kroku {k} z {n}. Je to loď, ale všimli si tě: poplach +{a}.',
  'You already fired at {cell}.': 'Na {cell} už se střílelo.',
  '{cell}: miss.': '{cell}: vedle.',
  '{cell}: hit, and the ship sinks!': '{cell}: zásah a loď se potápí!',
  '{cell}: hit!': '{cell}: zásah!',
  'The enemy is on alert and fires {k} shots…': 'Nepřítel je ve střehu a pálí {k} rány…',
  'The enemy fires…': 'Nepřítel pálí…',
  'The enemy fired {k} shots (alarm). Your move.': 'Nepřítel vypálil {k} rány (poplach). Jsi na tahu.',
  'The enemy fired. Your move.': 'Nepřítel vystřelil. Jsi na tahu.',
  'enemy shots: {k}': 'rány: {k}',
  '<b>N = {n}</b> costs {n} energy. On water it is always safe. On a ship: <b>{p}%</b> silent detection, {q}% absorbed (alarm +{a}).':
    '<b>N = {n}</b> stojí {n} energie. Na vodě je vždy bezpečná. Na lodi: <b>{p} %</b> tichá detekce, {q} % pohlcení (poplach +{a}).',
  '♪ ON': '♪ ZAP',
  '♪ OFF': '♪ VYP',

  // ---- photon panel
  'A photon waits in |0⟩. A probe turns it towards |1⟩ in N small steps.': 'Foton čeká v |0⟩. Sonda ho v N malých krocích natáčí k |1⟩.',
  'Nothing interrupted the photon: after N = {n} steps it reached |1⟩, which means <b>water</b>.': 'Foton nic nepřerušilo: po N = {n} krocích dorazil do |1⟩, a to znamená <b>vodu</b>.',
  'The photon is on its way: N = {n} steps of π/2N, passing the cell after each one.': 'Foton je na cestě: N = {n} kroků po π/2N a po každém proletí kolem políčka.',
  'Every pass measured the photon and knocked it back to |0⟩. It stayed at |0⟩, which means <b>a ship</b>, found without touching it.':
    'Každý průlet foton změřil a srazil zpátky do |0⟩. Zůstal v |0⟩, a to znamená <b>loď</b>, nalezenou bez dotyku.',
  'Step {k}: the measurement went the other way and the ship <b>absorbed</b> the photon.': 'Krok {k}: měření dopadlo opačně a loď foton <b>pohltila</b>.',

  // ---- overlay
  'Turns: {turns} · probes: {probes} (silent detections: {silent}, absorbed: {absorbed}) · torpedoes: {torpedoes}, misses: {misses}':
    'Tahů: {turns} · sond: {probes} (tichých detekcí: {silent}, pohlcení: {absorbed}) · torpéd: {torpedoes}, z toho vedle: {misses}',
  'VICTORY': 'VÍTĚZSTVÍ',
  'FLEET LOST': 'FLOTILA ZTRACENA',
  'The whole enemy fleet is on the bottom.': 'Celá nepřátelská flotila je na dně.',
  'The enemy sank your whole fleet.': 'Nepřítel ti potopil celou flotilu.',
  'PLAY AGAIN': 'HRÁT ZNOVU',
  'SEE THE BOARD': 'UKÁZAT DESKU',
};
