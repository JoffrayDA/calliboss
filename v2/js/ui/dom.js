// Outils partagés par tous les écrans : échappement, message, feuille du bas, navigation, images.
import { validImage, AVATAR_MAX } from "../core/share.js";

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function $(sel) {
  return document.querySelector(sel);
}
export function fr(n) {
  return String(n).replace(".", ",");
}
export function unitLabel(u) {
  return u === "s" ? "s" : "reps";
}
export function plural(n, word) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

let toastTimer = null;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

export function openSheet(html) {
  $("#sheet").innerHTML = html;
  $("#scrim").hidden = false;
  const first = $("#sheet [autofocus]");
  if (first) first.focus();
}
export function closeSheet() {
  $("#scrim").hidden = true;
  $("#sheet").innerHTML = "";
}

// Navigation : remplie par main.js, pour que les écrans n'importent pas main.
export const nav = { go() {}, back() {}, redraw() {} };

// Photo de profil : l'image si elle est valide, sinon l'initiale.
export function avatar(src, name, cls = "") {
  if (validImage(src, AVATAR_MAX)) return `<img class="avatar ${cls}" src="${src}" alt="">`;
  return `<div class="avatar ${cls}">${esc((name || "?").trim().charAt(0))}</div>`;
}

// Réduit une photo choisie sur le téléphone : recadrée au centre, en JPEG, sous `maxBytes`.
export function shrinkImage(file, width, height, maxBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const scale = Math.max(width / img.width, height / img.height);
      const w = img.width * scale, h = img.height * scale;
      canvas.getContext("2d").drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      for (let q = 0.85; q >= 0.3; q -= 0.1) {
        const out = canvas.toDataURL("image/jpeg", q);
        if (out.length <= maxBytes * 1.33) return resolve(out);
      }
      reject(new Error("Image trop lourde"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

// ---------- Minuteur de repos ----------
// Calé sur l'heure de fin : reste juste même si le téléphone met la page en veille.
let restTimer = null;
export function startRest(seconds) {
  const bar = $("#restbar");
  const end = Date.now() + seconds * 1000;
  clearInterval(restTimer);
  bar.innerHTML = `<span id="restleft"></span><button data-act="rest-stop">Stop</button>`;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $("#restleft").textContent = `Repos ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (left <= 0) {
      stopRest();
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
      toast("C'est reparti");
    }
  };
  bar.hidden = false;
  tick();
  restTimer = setInterval(tick, 250);
}
export function stopRest() {
  clearInterval(restTimer);
  $("#restbar").hidden = true;
}
