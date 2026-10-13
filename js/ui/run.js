// Écran Course : la limite du bloc, la sortie à noter, la mobilité d'après, les dernières sorties.
import { addDays, prettyDate, today } from "../core/dates.js";
import { RUN, fmtKm, fmtPace, longest, paceOf, runLimit, runWarnings, runsBetween } from "../core/run.js";
import * as store from "../store.js";
import { $, esc, fr, nav, toast } from "./dom.js";
import { icon } from "./icons.js";

function coach(state) {
  const lim = runLimit(state.runs, today());
  if (!lim) return `<div class="block"><h2>Pas encore de repère</h2><p class="small muted">Note ta dernière sortie, même ancienne (choisis sa date) : l'app calculera ta limite.</p></div>`;
  const thisBlock = longest(runsBetween(state.runs, lim.start, lim.end));
  const why = lim.capped
    ? `Plafond de ${RUN.capKm} km atteint, garde ce volume.`
    : lim.hold
    ? `Pas de sortie au bloc précédent : pas de hausse, on reprend ${fmtKm(lim.base)} km.`
    : `Ta plus longue du bloc précédent (${fmtKm(lim.base)} km) × ${fr(RUN.growth)}.`;
  return `<div class="block">
    <p class="eyebrow">Limite par sortie</p>
    <div class="row between" style="align-items:baseline"><div class="num" style="font-size:44px;line-height:.9">${fmtKm(lim.km)} <small class="muted" style="font-size:22px">km</small></div>
      <span class="small muted">jusqu'au ${esc(prettyDate(lim.end))}</span></div>
    <p class="small muted">${why} Plus longue ce bloc : ${thisBlock ? `${fmtKm(thisBlock)} km` : "aucune"}.${lim.capped ? "" : ` Prochaine hausse possible le ${esc(prettyDate(addDays(lim.end, 1)))}.`}</p>
    <p class="small muted">Allure où tu peux parler. Une seule chose augmente à la fois : distance ou vitesse. Douleur au tibia, au genou ou au tendon d'Achille : tu restes où tu en es.</p>
  </div>`;
}

export function render(root, state) {
  const t = today();
  const checks = state.runDraft.checks;
  const recent = [...state.runs]
    .reverse()
    .slice(0, 6)
    .map((r) => `<div class="item"><span class="when">${esc(prettyDate(r.date))}</span><span class="grow"><b>${fmtKm(r.km)} km</b> · ${fmtPace(paceOf(r))}/km</span>
      <button class="iconbtn" data-act="r-del" data-date="${r.date}" aria-label="Supprimer la sortie du ${esc(prettyDate(r.date))}">${icon("x")}</button></div>`)
    .join("");
  root.innerHTML = `<section class="screen">
    <div class="row"><button class="iconbtn" data-act="go" data-to="today" aria-label="Retour">${icon("back")}</button>
      <div class="grow"><p class="eyebrow">Course</p><h2>Noter une sortie</h2></div></div>
    ${coach(state)}
    <div class="block">
      <div class="grid2">
        <label class="label">Date<input class="text" type="date" id="rdate" value="${t}" data-in="r-form"></label>
        <label class="label">Distance (km)<input class="text" inputmode="decimal" id="rkm" placeholder="4,5" data-in="r-form"></label>
        <label class="label">Minutes<input class="text" inputmode="numeric" id="rmin" placeholder="30" data-in="r-form"></label>
        <label class="label">Secondes<input class="text" inputmode="numeric" id="rsec" placeholder="00" data-in="r-form"></label>
      </div>
      <p id="rpace" class="num" style="font-size:22px" hidden></p>
      <div id="rwarn" class="stack"></div>
      <p class="eyebrow">C'était comment ? (optionnel)</p>
      <div class="seg" id="rfeel"><button data-act="pick-toggle" data-v="easy" aria-pressed="false">Facile</button><button data-act="pick-toggle" data-v="ok" aria-pressed="false">Bien</button><button data-act="pick-toggle" data-v="hard" aria-pressed="false">Dur</button></div>
      <textarea class="text" id="rnote" rows="2" placeholder="Une note ? (optionnel)" aria-label="Note"></textarea>
    </div>
    <div class="block">
      <p class="eyebrow">Mobilité après la course · environ 15 min</p>
      <p class="small muted">Après la course, jamais juste avant une séance de force.</p>
      ${RUN.mobility.map((m) => `<label class="check"><input type="checkbox" data-ch="r-mob" data-id="${m.id}" ${checks[m.id] ? "checked" : ""}><span class="box">${icon("check")}</span><span>${esc(m.text)}</span></label>`).join("")}
    </div>
    <button class="btn main wide" data-act="r-save">Enregistrer la sortie</button>
    <div class="block"><p class="eyebrow">Dernières sorties</p><div>${recent || `<p class="small muted">Pas encore de sortie.</p>`}</div></div>
  </section>`;
}

function readForm() {
  const km = parseFloat(($("#rkm").value || "").replace(",", "."));
  const sec = (parseInt($("#rmin").value, 10) || 0) * 60 + (parseInt($("#rsec").value, 10) || 0);
  return { date: $("#rdate").value || today(), km, sec };
}

export const inputs = {
  // Allure et alertes du coach, mises à jour pendant la saisie sans redessiner l'écran.
  "r-form"() {
    const { date, km, sec } = readForm();
    const ok = km > 0 && sec > 0;
    $("#rpace").hidden = !ok;
    if (ok) $("#rpace").textContent = `${fmtPace(sec / km)} /km`;
    const w = km > 0 ? runWarnings(store.getState().runs, date, km, ok ? sec / km : Infinity) : [];
    $("#rwarn").innerHTML = w.map((x) => `<p class="small bad">${esc(x)}</p>`).join("");
  },
};
export const changes = {
  "r-mob": (el) => store.runCheck(el.dataset.id, el.checked),
};

export const actions = {
  // Choix facultatif : retoucher le bouton choisi le désélectionne.
  "pick-toggle"(el) {
    const on = el.getAttribute("aria-pressed") === "true";
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    el.setAttribute("aria-pressed", !on);
  },
  "r-save"() {
    const state = store.getState();
    const { date, km, sec } = readForm();
    if (!(km > 0 && km < 100)) return toast("Distance invalide");
    if (!(sec > 0)) return toast("Durée manquante");
    if (date > today()) return toast("Cette date est dans le futur");
    const w = runWarnings(state.runs, date, km, sec / km);
    if (w.length && !confirm(`${w.join("\n")}\n\nEnregistrer quand même ?`)) return;
    if (state.runs.some((r) => r.date === date) && !confirm(`Remplacer la sortie du ${prettyDate(date)} ?`)) return;
    const best = longest(state.runs);
    const picked = document.querySelector("#rfeel [aria-pressed=true]");
    store.addRun({ date, km: Math.round(km * 100) / 100, sec, rpe: null, feel: picked ? picked.dataset.v : null, note: $("#rnote").value.trim().slice(0, 300) });
    nav.go("today");
    toast(best && km > best ? `Record de distance : ${fmtKm(km)} km` : "Sortie enregistrée");
  },
  "r-del"(el) {
    if (!confirm("Supprimer cette sortie ?")) return;
    store.deleteRun(el.dataset.date);
  },
};
