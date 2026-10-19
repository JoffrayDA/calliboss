// Onglet Groupe : défi commun de la semaine, où en est chacun, fil avec applaudissements.
// Tout ce qui vient des autres membres est échappé à l'affichage.
import { prettyDate, ymd } from "../core/dates.js";
import { activity } from "../core/catalog.js";
import { sanitizeProgram } from "../core/model.js";
import { fmtKm, fmtPace } from "../core/run.js";
import { PHOTO_MAX, challenge, feedEvents, groupStreak, readMember, summary, validImage } from "../core/share.js";
import * as store from "../store.js";
import { enabled, message } from "../cloud/firebase.js";
import * as Account from "../cloud/account.js";
import * as Group from "../cloud/group.js";
import * as Sync from "../cloud/sync.js";
import { $, avatar, closeSheet, esc, fr, nav, openSheet, plural, shrinkImage, toast } from "./dom.js";
import { flame, groupArt, icon, kindIcon } from "./icons.js";

const view = { code: null, info: null, members: null, feed: null, error: "", busy: false };

// Téléphone vide (réinstallé, données effacées) : on n'écrase pas ce que le groupe a gardé de toi.
export function publishNow() {
  if (store.isEmpty()) return Promise.resolve(false);
  const state = store.getState();
  return Group.publish(JSON.stringify(summary(state)), feedEvents(state)).catch(() => false);
}

// Lance une action réseau ; l'écran n'est redessiné qu'en cas de succès pour ne pas perdre la saisie.
async function run(fn, okMsg) {
  if (view.busy) return;
  view.busy = true;
  toast("Un instant…");
  let ok = false;
  try {
    ok = (await fn()) !== null;
    if (ok && okMsg) toast(okMsg);
  } catch (e) {
    toast(message(e));
  }
  view.busy = false;
  if (ok) nav.redraw();
}

async function load() {
  const code = view.code;
  if (!code) return;
  try {
    await publishNow();
    const [info, members, feed] = await Promise.all([Group.groupInfo(code), Group.members(code), Group.feed(code).catch(() => [])]);
    if (view.code !== code) return;
    Object.assign(view, { info, members: members.map(readMember), feed, error: "" });
  } catch (e) {
    if (view.code !== code) return;
    view.error = message(e);
  }
  nav.redraw();
}

// Résumé du défi sur l'écran Aujourd'hui, si le groupe est déjà chargé.
export function teaser() {
  if (!view.members || !view.info) return "";
  const c = challenge(view.members, view.info.challenge);
  if (!c.goal) return "";
  return `<button class="block" data-act="tab" data-tab="group">
    <div class="row between"><span class="eyebrow">Défi du groupe</span><span class="num" style="font-size:20px">${c.done} / ${c.goal}</span></div>
    <div class="bar"><i style="width:${c.pct}%"></i></div>
    <p class="small muted">${c.won ? "Défi réussi cette semaine." : `Encore ${plural(c.goal - c.done, "séance")} à vous tous.`}</p></button>`;
}

function loginForm() {
  return `<div class="block">
    <h2>Se connecter ou créer un compte</h2>
    <p class="small muted">Déjà un compte : ton pseudo et ton code, puis Entrer. Sinon, invente un pseudo et un code secret. Pas de mail.</p>
    <label class="label">Pseudo<input class="text" id="lpseudo" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
    <label class="label">Code secret (6 chiffres ou plus pour un nouveau compte)<input class="text" id="lpin" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••••"></label>
    <button class="btn main wide" data-act="g-login">Entrer</button>
    <p class="small muted">Tes séances, sorties, pesées et programmes sont enregistrés sur ton compte, lisibles par toi seul : tu les retrouves sur n'importe quel téléphone. Les membres d'un groupe voient ta semaine, tes dernières séances et sorties, tes programmes, et ton poids si tu le veux. Retiens ton code : sans mail, il ne peut pas être récupéré.</p>
  </div>`;
}

// Écran d'accueil sans compte : l'app ne s'ouvre qu'une fois connecté, sauf « plus tard ».
export function renderGate(root) {
  root.innerHTML = `<section class="screen">
    ${loginForm()}
    <button class="link" data-act="acc-later">Plus tard : mes données restent seulement sur ce téléphone</button>
  </section>`;
}

function memberRow(m, me) {
  return `<button class="member" data-act="g-member" data-uid="${esc(m.uid)}">
    ${avatar(m.avatar, m.pseudo, me ? "o" : "s")}
    <span><span class="row between small"><b>${esc(m.pseudo)}${me ? ` <span class="tag">toi</span>` : ""}</b><span class="muted">${m.done} sur ${m.goal}</span></span><span class="bar ${me ? "" : "s"}" style="display:block;margin-top:6px"><i style="width:${m.pct}%"></i></span></span>
    <span class="num">${m.pct}%</span></button>`;
}

function feedRow(f, uid, members) {
  const m = members.find((x) => x.uid === f.uid);
  const mine = f.claps.includes(uid);
  const verb = f.type === "session" ? " · " : " ";
  return `<div class="feed">
    ${avatar(m ? m.avatar : "", f.pseudo, f.uid === uid ? "o" : "s")}
    <div class="grow"><b>${esc(f.pseudo)}</b>${verb}${esc(f.text)}<br><span class="small muted">${esc(f.date ? prettyDate(f.date) : "")}</span></div>
    <button class="clap" data-act="g-clap" data-id="${esc(f.id)}" aria-pressed="${mine}" aria-label="Applaudir">${icon("clap")}<span>${f.claps.length}</span></button>
  </div>`;
}

export function render(root, state) {
  if (!enabled) {
    root.innerHTML = `<section class="screen"><h1>Groupe</h1><div class="block"><p class="muted">Les groupes ne sont pas activés sur cette version de l'app.</p></div></section>`;
    return;
  }
  const acc = Account.getAccount();
  if (!acc) {
    root.innerHTML = `<section class="screen"><h1>Groupe</h1>${loginForm()}</section>`;
    return;
  }
  if (!acc.groups.some((g) => g.code === view.code)) Object.assign(view, { code: acc.groups.length ? acc.groups[0].code : null, info: null, members: null, feed: null, error: "" });
  const group = acc.groups.find((g) => g.code === view.code);
  const typed = ["#gcode", "#gname"].map((s) => ($(s) ? $(s).value : ""));
  const owner = view.info && view.info.owner === acc.uid;
  let body = "";
  if (group) {
    const photo = view.info && validImage(view.info.photo, PHOTO_MAX) ? `<img src="${view.info.photo}" alt="Photo du groupe">` : groupArt();
    body += `<div class="banner">${photo}<div class="cap">
      <div><h2>${esc(group.name)}</h2><p class="small muted">${view.members ? plural(view.members.length, "membre") : "Chargement…"} · code <span class="code">${esc(group.code)}</span></p></div>
      <div class="row wrap"><button class="btn main sm" data-act="g-invite">Inviter</button><button class="btn quiet sm" data-act="g-refresh">Actualiser</button>
        ${owner ? `<label class="btn quiet sm file">${icon("camera")}Photo<input type="file" accept="image/*" data-ch="g-photo"></label>` : ""}</div>
    </div></div>`;
    if (view.error) body += `<div class="block"><p class="small bad">${esc(view.error)}</p></div>`;
    if (view.members) {
      const c = challenge(view.members, view.info.challenge);
      const gs = groupStreak(view.members, view.info.challenge);
      const sorted = [...view.members].sort((a, b) => (b.uid === acc.uid) - (a.uid === acc.uid) || a.pseudo.localeCompare(b.pseudo));
      body += `<div class="block ${c.won ? "accent" : ""}">
        <div class="row between"><span class="eyebrow">Défi de la semaine</span>${gs ? `<span class="row" style="gap:6px">${flame()}<span class="small muted">${gs} sem. réussie${gs > 1 ? "s" : ""}</span></span>` : ""}</div>
        <div class="row between" style="align-items:baseline"><div class="num ${c.won ? "pop" : ""}" style="font-size:44px;line-height:.9">${c.done}<small class="muted" style="font-size:22px"> / ${c.goal}</small></div><span class="small muted">séances à vous tous</span></div>
        <div class="bar"><i style="width:${c.pct}%"></i></div>
        <p class="small muted">${c.won ? "Défi réussi. Bien joué à tous." : view.info.challenge ? "Objectif fixé par le créateur du groupe." : "Objectif : la somme de vos objectifs de la semaine."}</p>
        ${owner ? `<button class="link" data-act="g-target">Changer l'objectif du défi</button>` : ""}
      </div>
      <div class="block"><span class="eyebrow">Où en est chacun</span>${sorted.map((m) => memberRow(m, m.uid === acc.uid)).join("")}<p class="small muted">Chacun est mesuré sur son propre objectif. Touche un membre pour voir ses séances.</p></div>
      <div class="block"><span class="eyebrow">Fil du groupe</span><div>${(view.feed || []).map((f) => feedRow(f, acc.uid, view.members)).join("") || `<p class="small muted">Rien pour l'instant. Les séances et les paliers débloqués apparaîtront ici.</p>`}</div></div>`;
    } else if (!view.error) body += `<p class="note">Chargement du groupe…</p>`;
  }
  root.innerHTML = `<section class="screen">
    <h1>Groupe</h1>
    ${acc.groups.length > 1 ? `<div class="seg">${acc.groups.map((g) => `<button data-act="g-switch" data-code="${esc(g.code)}" aria-pressed="${g.code === view.code}">${esc(g.name)}</button>`).join("")}</div>` : ""}
    ${body}
    <div class="block">
      <h2>${acc.groups.length ? "Un autre groupe" : "Ton premier groupe"}</h2>
      <p class="small muted">Rejoins avec le code d'un pote, ou crée un groupe et donne-lui le code.</p>
      <div class="row"><input class="text" id="gcode" maxlength="20" placeholder="Code du groupe" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Code du groupe"><button class="btn quiet sm" data-act="g-join">Rejoindre</button></div>
      <div class="row"><input class="text" id="gname" maxlength="40" placeholder="Nom d'un nouveau groupe" autocomplete="off" aria-label="Nom du nouveau groupe"><button class="btn quiet sm" data-act="g-create">Créer</button></div>
      ${group ? `<button class="link bad" data-act="g-leave">Quitter « ${esc(group.name)} »</button>` : ""}
    </div>
  </section>`;
  $("#gcode").value = typed[0];
  $("#gname").value = typed[1];
  if (group && !view.members && !view.error && !view.loading) {
    view.loading = true;
    load().finally(() => (view.loading = false));
  }
}

function memberSheet(m, me) {
  const sess = m.sessions
    .slice(-3)
    .reverse()
    .map((s) => `<p class="small"><b>${esc(prettyDate(s.date))}</b> <span class="muted">· ${esc(s.name || activity(s.activity).label)}${s.complete ? "" : " · partielle"}</span></p>
      <div>${(Array.isArray(s.lines) ? s.lines : []).map((l) => `<div class="line nodelta"><span>${esc(l.name)}</span><span class="num">${esc(l.text || (l.sets || []).map(Number).join(" · "))}</span></div>`).join("")}</div>`)
    .join("");
  const runs = m.runs
    .slice(-3)
    .reverse()
    .map((r) => {
      const km = +r.km || 0, sec = +r.sec || 0;
      return `<div class="line nodelta"><span>${esc(prettyDate(r.date))}</span><span class="num">${fmtKm(km)} km${km > 0 && sec > 0 ? ` · ${fmtPace(sec / km)}/km` : ""}</span></div>`;
    })
    .join("");
  const w = m.weights;
  const weight = w.length ? `<div class="line nodelta"><span>Poids</span><span class="num">${fr((+w[w.length - 1].kg || 0).toFixed(1))} kg</span></div>` : "";
  const progs = me
    ? ""
    : m.programs.map((p, i) => `<div class="row"><span class="grow">${esc(p.name)} <span class="small muted">· ${plural(p.exercises.length, "exo")}</span></span><button class="btn quiet sm" data-act="g-copy" data-uid="${esc(m.uid)}" data-i="${i}">${icon("copy")}Copier</button></div>`).join("");
  openSheet(`<div class="row">${avatar(m.avatar, m.pseudo, me ? "o" : "s")}<div class="grow"><h2>${esc(m.pseudo)}</h2><p class="small muted">${m.updated ? `À jour le ${esc(prettyDate(ymd(new Date(m.updated))))}` : ""}${m.streak ? ` · ${m.streak} sem. d'affilée` : ""}</p></div></div>
    ${sess || `<p class="small muted">Pas encore de séance.</p>`}
    ${runs ? `<p class="eyebrow">Sorties</p><div>${runs}</div>` : ""}${weight}
    ${progs ? `<p class="eyebrow">Ses programmes</p>${progs}` : ""}
    <button class="btn quiet wide" data-act="close">Fermer</button>`);
}

export const changes = {
  async "g-photo"(el) {
    const file = el.files[0];
    if (!file) return;
    let photo;
    try {
      photo = await shrinkImage(file, 640, 240, PHOTO_MAX);
    } catch (e) {
      return toast(e.message);
    }
    run(async () => {
      await Group.updateGroup(view.code, { photo });
      view.info.photo = photo;
    }, "Photo du groupe enregistrée");
  },
};

export const actions = {
  "g-login"() {
    run(async () => {
      const a = await Account.login($("#lpseudo").value, $("#lpin").value.trim(), (name) => confirm(`Pas de compte « ${name} » avec ce code.\n\nCréer ce pseudo avec ce code ?`));
      if (!a) return null;
      // Récupère tout ce qui est sur le compte et y envoie ce qui n'est que sur ce téléphone.
      // En cas d'échec, l'erreur s'affiche dans les réglages et l'échange est retenté au prochain enregistrement.
      await Sync.now(true);
      publishNow();
      return a;
    }, "Connecté");
  },
  "g-switch"(el) {
    Object.assign(view, { code: el.dataset.code, info: null, members: null, feed: null, error: "" });
    nav.redraw();
  },
  "g-join"() {
    run(async () => {
      const g = await Group.joinGroup($("#gcode").value, JSON.stringify(summary(store.getState())));
      Object.assign(view, { code: g.code, info: null, members: null, feed: null, error: "" });
      $("#gcode").value = "";
    }, "Groupe rejoint");
  },
  "g-create"() {
    run(async () => {
      const g = await Group.createGroup($("#gname").value, JSON.stringify(summary(store.getState())));
      Object.assign(view, { code: g.code, info: null, members: null, feed: null, error: "" });
      $("#gname").value = "";
    }, "Groupe créé");
  },
  "g-leave"() {
    const g = Account.getAccount().groups.find((x) => x.code === view.code);
    if (!g || !confirm(`Quitter « ${g.name} » ? Les autres ne verront plus tes séances.`)) return;
    run(() => Group.leaveGroup(g.code), "Groupe quitté");
  },
  "g-refresh"() {
    Object.assign(view, { members: null, feed: null, error: "" });
    nav.redraw();
  },
  async "g-invite"() {
    const g = Account.getAccount().groups.find((x) => x.code === view.code);
    const text = `Rejoins mon groupe « ${g.name} » sur Calliboss : ${location.origin}${location.pathname} → onglet Groupe : crée ton compte (pseudo + code secret), puis saisis le code du groupe ${g.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Invitation copiée");
      }
    } catch (e) {}
  },
  "g-target"() {
    openSheet(`<h2>Objectif du défi</h2><p class="small muted">Nombre de séances à faire à vous tous dans la semaine. Laisse vide pour utiliser la somme des objectifs de chacun.</p>
      <input class="text" id="g-target-in" inputmode="numeric" value="${view.info.challenge || ""}" placeholder="Automatique" autofocus aria-label="Objectif du défi">
      <button class="btn main wide" data-act="g-target-ok">Enregistrer</button>`);
  },
  "g-target-ok"() {
    const n = Math.max(0, Math.min(200, parseInt($("#g-target-in").value, 10) || 0));
    closeSheet();
    run(async () => {
      await Group.updateGroup(view.code, { challenge: n });
      view.info.challenge = n;
    }, "Objectif enregistré");
  },
  "g-member"(el) {
    const m = (view.members || []).find((x) => x.uid === el.dataset.uid);
    if (m) memberSheet(m, m.uid === Account.getAccount().uid);
  },
  "g-copy"(el) {
    const m = (view.members || []).find((x) => x.uid === el.dataset.uid);
    const raw = m && m.programs[+el.dataset.i];
    if (!raw) return;
    const act = ["cali", "muscu"].includes(raw.activity) ? raw.activity : "cali";
    const p = store.addProgram(sanitizeProgram(raw, act));
    if (!store.getState().settings.activities.includes(act)) store.setActivities([...store.getState().settings.activities, act]);
    closeSheet();
    toast(`« ${p.name} » ajouté à tes programmes`);
  },
  // Applaudir : affiché tout de suite, annulé si le serveur refuse.
  async "g-clap"(el) {
    const uid = Account.getAccount().uid;
    const f = (view.feed || []).find((x) => x.id === el.dataset.id);
    if (!f) return;
    const on = !f.claps.includes(uid);
    const apply = (v) => {
      f.claps = v ? [...f.claps, uid] : f.claps.filter((x) => x !== uid);
      nav.redraw();
    };
    apply(on);
    try {
      await Group.clap(view.code, f.id, on);
    } catch (e) {
      apply(!on);
      toast(message(e));
    }
  },
};
