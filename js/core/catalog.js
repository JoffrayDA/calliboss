// Catalogue fixe : activités proposées et programmes modèles.
import { emptyState, sanitizeProgram } from "./model.js";
import { convertProgram } from "./migrate.js";

export const ACTIVITIES = [
  { id: "cali", label: "Calisthénie", icon: "bar", tone: "o" },
  { id: "run", label: "Course", icon: "run", tone: "s" },
  { id: "muscu", label: "Muscu", icon: "weight", tone: "o" },
];
export function activity(id) {
  return ACTIVITIES.find((a) => a.id === id) || ACTIVITIES[0];
}

const lift = (name, sets = 3) => ({ name, unit: "reps", loaded: true, sets });

export const TEMPLATES = [
  { ...convertProgram(null), blurb: "Circuit débutant à paliers : tractions, pompes, dips, squats, abdos, corde" },
  {
    activity: "cali",
    name: "Haut du corps",
    layout: "sets",
    blurb: "Tirer et pousser, sans paliers",
    exercises: [
      { name: "Tractions", unit: "reps", sets: 4 },
      { name: "Pompes", unit: "reps", sets: 4 },
      { name: "Dips", unit: "reps", sets: 3 },
      { name: "Gainage planche", unit: "s", sets: 3 },
    ],
  },
  {
    activity: "muscu",
    name: "Full body A",
    layout: "sets",
    blurb: "Trois mouvements de base et un tirage",
    exercises: [lift("Squat", 4), lift("Développé couché"), lift("Rowing barre"), lift("Développé militaire")],
  },
  {
    activity: "muscu",
    name: "Full body B",
    layout: "sets",
    blurb: "Soulevé de terre, tirage et développé incliné",
    exercises: [lift("Soulevé de terre"), lift("Tirage vertical"), lift("Développé incliné haltères"), lift("Fentes"), { name: "Gainage planche", unit: "s", sets: 3 }],
  },
];
export function templatesOf(activityId) {
  return TEMPLATES.filter((t) => t.activity === activityId);
}
// Programme tout neuf à partir d'un modèle : nouveaux identifiants.
export function instantiate(tpl) {
  return sanitizeProgram(tpl, tpl.activity);
}

// Tout premier lancement, sans données V1 : le programme débutant est déjà là.
export function starterState() {
  const s = emptyState();
  const p = convertProgram(null);
  s.programs = [p];
  s.settings.lastProgram.cali = p.id;
  return s;
}
