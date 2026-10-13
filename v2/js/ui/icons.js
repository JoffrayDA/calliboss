// Seul endroit où vivent les icônes et les illustrations. Aucun émoji dans l'interface.
const PATHS = {
  today: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.200-4 4.300-6 8-6s6.800 2 8 6"/>',
  group: '<circle cx="9" cy="9" r="3.5"/><path d="M2.500 20c.800-3.500 3.300-5.500 6.500-5.500s5.700 2 6.500 5.500"/><path d="M16 5.800a3.300 3.300 0 0 1 0 6.400M18.500 14.800c1.600.800 2.600 2.500 3 5.200"/>',
  bar: '<path d="M3 5h18M6 5v15M18 5v15"/><path d="M9.500 5v3.500a2.500 2.500 0 0 0 5 0V5"/>',
  run: '<circle cx="15" cy="4.500" r="2"/><path d="M6 11.500l3.500-3 4 1.500 2 3.500 3.500 1M13.500 10l-2.500 5 3.500 2.500.500 4M11 15l-2 3-4.500.500"/>',
  weight: '<path d="M3 9v6M6 6.500v11M18 6.500v11M21 9v6M6 12h12"/>',
  pen: '<path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500 4 20z"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M14.500 5l-7 7 7 7"/>',
  next: '<path d="M9.500 5l7 7-7 7"/>',
  up: '<path d="M5 14.500l7-7 7 7"/>',
  down: '<path d="M5 9.500l7 7 7-7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M8.500 9h7M8.500 13h4"/>',
  swap: '<path d="M4 8h14l-3.500-3.500M20 16H6l3.500 3.500"/>',
  rows: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  steps: '<path d="M4 19h5v-5h5V9h6"/>',
  trash: '<path d="M5 7h14M10 7V4.500h4V7M7 7l1 12.500h8L17 7"/>',
  clap: '<path d="M7 11V5.500a1.500 1.500 0 0 1 3 0V10M10 10V4a1.500 1.500 0 0 1 3 0v6M13 10V5.500a1.500 1.500 0 0 1 3 0V13c0 4.500-2.500 7.500-6 7.500-3 0-4.500-1.500-6-4.500L3.500 13a1.500 1.500 0 0 1 2.600-1.400L7 13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  timer: '<circle cx="12" cy="13.500" r="7"/><path d="M12 10v3.500l2.500 1.500M9.500 3h5"/>',
  camera: '<path d="M4 8h3l1.500-2.500h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.500"/>',
  medal: '<circle cx="12" cy="14.500" r="5.500"/><path d="M8.500 9.500L6 3h4l2 4 2-4h4l-2.500 6.500"/>',
  bolt: '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>',
  star: '<path d="M12 3.500l2.600 5.400 5.900.800-4.300 4.100 1 5.900L12 16.900 6.800 19.700l1-5.900-4.300-4.100 5.900-.800z"/>',
};

export function icon(name) {
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}

// Flamme de la série de semaines : orange, cœur bleu ciel.
export function flame(cls = "flame") {
  return `<svg class="${cls}" viewBox="0 0 22 26" aria-hidden="true"><path d="M11 1c1.200 4.200 6.500 6.400 6.500 13a6.500 6.500 0 0 1-13 0c0-2.300.900-3.900 2.100-5.200.300 1.900 1.200 2.900 2.300 3.100C8.200 8.500 9 4.400 11 1z" fill="var(--orange)"/><path d="M11 13.500c1 1.700 2.600 2.600 2.600 4.800a2.600 2.600 0 0 1-5.200 0c0-1.900 1.400-2.900 2.600-4.800z" fill="var(--sky)"/></svg>`;
}

// Illustration par défaut du groupe, tant qu'il n'a pas de photo : soleil, relief, barre de traction.
export function groupArt() {
  return `<svg viewBox="0 0 400 150" role="img" aria-label="Pas encore de photo de groupe"><rect width="400" height="150" fill="var(--raised)"/><circle cx="318" cy="46" r="26" fill="var(--orange)"/><path d="M0 150 L0 104 L70 78 L130 108 L205 64 L285 112 L340 92 L400 116 L400 150 Z" fill="var(--bg)"/><g stroke="var(--sky)" stroke-width="5" stroke-linecap="round" fill="none"><path d="M96 150V88M176 150V88M92 88h88"/></g></svg>`;
}

const KIND_ICON = { first: "star", step: "steps", record: "medal", start: "bolt", session: "bar", run: "run" };
export function kindIcon(kind) {
  return icon(KIND_ICON[kind] || "star");
}
