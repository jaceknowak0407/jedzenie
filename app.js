'use strict';
/* Jedzenie do pracy — cała logika aplikacji.
   Stan użytkownika (oceny, zamrażarka, produkty, notatki, plany, ustawienia) trzymamy w localStorage.
   Przepisy, spiżarnię i zamienniki wczytujemy z przepisy.json. */

// ---------- Stałe ----------
const KLUCZ = 'asystent-jedzenie-v1';
const DNI = ['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'sb'];
const DNI_NAZWY = { nd: 'niedziela', pn: 'poniedziałek', wt: 'wtorek', sr: 'środa', cz: 'czwartek', pt: 'piątek', sb: 'sobota' };
const DNI_KROTKO = { pn: 'pn', wt: 'wt', sr: 'śr', cz: 'czw', pt: 'pt' };
const OFFSET_DNIA = { nd: -1, pn: 0, wt: 1, sr: 2, cz: 3, pt: 4, sb: 5 };

const SLOTY = [
  { id: 'na-zab', nazwa: 'Na ząb', pora: 'rano' },
  { id: 'sniadanie', nazwa: 'Śniadanie', pora: 'ok. 10:00' },
  { id: 'przekaska', nazwa: 'Przekąska', pora: 'pod koniec' },
];
const SLOT_NAZWA = Object.fromEntries(SLOTY.map(s => [s.id, s.nazwa]));

// Sesja = dzień gotowania. dni = na które dni pracy gotujesz.
const SESJE = {
  nd: { nazwa: 'Niedziela', opis: 'z resztek → na poniedziałek', dni: ['pn'], zakupy: false },
  pn: { nazwa: 'Poniedziałek', opis: 'zakupy i gotowanie na wt–śr', dni: ['wt', 'sr'], zakupy: true },
  sr: { nazwa: 'Środa', opis: 'gotowanie na czw–pt', dni: ['cz', 'pt'], zakupy: true },
};
const DZIEN_SESJA = { pn: 'nd', wt: 'pn', sr: 'pn', cz: 'sr', pt: 'sr' };

const KATEGORIE = ['Warzywa i owoce', 'Mięso i ryby', 'Nabiał i jajka', 'Pieczywo i makarony', 'Puszki i słoiki', 'Mrożonki', 'Przyprawy i sosy', 'Inne', 'Własne'];
const ZAWSZE_DOMYSLNE = ['jajka', 'makaron', 'masło', 'szynka', 'ser żółty', 'sriracha', 'panko', 'majonez', 'ketchup',
  'sól', 'pieprz', 'olej', 'oliwa', 'cukier', 'mąka', 'papryka ostra', 'papryka wędzona', 'chili',
  'czosnek granulowany', 'oregano', 'bazylia suszona', 'cynamon', 'proszek do pieczenia'];
const TYPY_NOTATEK = { pomysl: '💡 Pomysł na danie', skladnik: '🥕 Składnik do dodania', inne: '📝 Inne' };

// Zaokrąglanie ilości w przepisie po przeliczeniu porcji
const JEDN_CALE = new Set(['opak.', 'puszka', 'słoik', 'pęczek', 'kulka', 'ząbek', 'plaster', 'kawałek']);
const JEDN_CWIARTKI = new Set(['łyżka', 'łyżeczka', 'szklanka', 'tabliczka']);
// Na liście zakupów te jednostki zamieniamy na „1 opak.” (nikt nie kupuje 3 łyżek jogurtu)
const JEDN_OPAK = new Set(['łyżka', 'łyżeczka', 'szklanka', 'garść', 'plaster', '']);
// Odmiana: [1, 2–4, 5+, ułamek]
const ODMIANA = {
  'łyżka': ['łyżka', 'łyżki', 'łyżek', 'łyżki'],
  'łyżeczka': ['łyżeczka', 'łyżeczki', 'łyżeczek', 'łyżeczki'],
  'szklanka': ['szklanka', 'szklanki', 'szklanek', 'szklanki'],
  'puszka': ['puszka', 'puszki', 'puszek', 'puszki'],
  'kulka': ['kulka', 'kulki', 'kulek', 'kulki'],
  'garść': ['garść', 'garście', 'garści', 'garści'],
  'ząbek': ['ząbek', 'ząbki', 'ząbków', 'ząbka'],
  'plaster': ['plaster', 'plastry', 'plastrów', 'plastra'],
  'kawałek': ['kawałek', 'kawałki', 'kawałków', 'kawałka'],
  'tabliczka': ['tabliczka', 'tabliczki', 'tabliczek', 'tabliczki'],
  'pęczek': ['pęczek', 'pęczki', 'pęczków', 'pęczka'],
  'słoik': ['słoik', 'słoiki', 'słoików', 'słoika'],
};

// ---------- Pomocnicze ----------
const pad = n => String(n).padStart(2, '0');
const isoData = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dodajDni = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dzis = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const zIso = s => new Date(s + 'T00:00');
const krotkaData = d => `${d.getDate()}.${pad(d.getMonth() + 1)}`;
const wielka = s => s.charAt(0).toUpperCase() + s.slice(1);
const nowyId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const porcjiTekst = n => `${n} ${n === 1 ? 'porcja' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'porcje' : 'porcji')}`;

// Poniedziałek tygodnia, którego dotyczy plan. W sobotę i niedzielę patrzymy już na następny tydzień.
function poniedzialekPlanu(d) {
  const dow = d.getDay();
  if (dow === 6) return dodajDni(d, 2);
  if (dow === 0) return dodajDni(d, 1);
  return dodajDni(d, -(dow - 1));
}
const dataDnia = (pon, dzien) => dodajDni(pon, OFFSET_DNIA[dzien]);

function ulamek(x) {
  if (x == null) return '';
  const c = Math.floor(x + 1e-9);
  const r = x - c;
  const mapa = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  for (const [v, s] of mapa) {
    if (Math.abs(r - v) < 0.04) {
      const cc = v === 1 ? c + 1 : c;
      return ((cc ? String(cc) : '') + s) || '0';
    }
  }
  return String(Math.round(x * 10) / 10).replace('.', ',');
}
function jednostka(j, ilosc) {
  const f = ODMIANA[j];
  if (!f) return j;
  if (Math.abs(ilosc - Math.round(ilosc)) > 1e-9) return f[3];
  const n = Math.round(ilosc);
  if (n === 1) return f[0];
  const r10 = n % 10, r100 = n % 100;
  if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return f[1];
  return f[2];
}
function zaokraglij(x, j) {
  if (JEDN_CALE.has(j)) return Math.ceil(x - 1e-9);
  if (JEDN_CWIARTKI.has(j)) return Math.ceil(x * 4 - 1e-9) / 4;
  return Math.ceil(x * 2 - 1e-9) / 2;
}
function ileTekst(ilosc, j) {
  if (ilosc == null) return '';
  const r = Math.round(ilosc * 12) / 12; // 0,98 → 1 (po przeliczeniach zamian)
  return `${ulamek(r)} ${jednostka(j, r)}`.trim();
}

// ---------- Dane i stan ----------
let PRZEPISY = [];
let PO_ID = {};
let SPIZARNIA = new Set();
let ZAMIENNIKI = [];
let KATALOG = new Map(); // nazwa produktu → kategoria

const nowyProdukt = (nazwa, opcje = {}) => ({ id: nowyId(), nazwa, zawsze: false, konczySie: false, dodano: isoData(dzis()), ...opcje });

function domyslnyStan() {
  return {
    wersja: 2,
    oceny: {},          // { idPrzepisu: { ocena: 1 | -1 | 0, notatka: '' } }
    zamrazarka: [],     // [{ id, nazwa, przepisId, slot, porcje, dodano }]
    produkty: ZAWSZE_DOMYSLNE.map(n => nowyProdukt(n, { zawsze: true })), // co mam w domu
    notatki: [],        // [{ id, typ, tekst, data }]
    plany: {},          // { 'RRRR-MM-DD' (poniedziałek): plan }
    ustawienia: { osoby: 1, post: false, przekaski: true },
  };
}
function upewnijPlan(p) {
  // Lista zakupów jest wspólna na cały tydzień (stare plany miały osobno pn i sr)
  p.zakupy = p.zakupy || {};
  p.wlasne = p.wlasne || {};
  if (!p.zakupy.all) p.zakupy.all = { ...(p.zakupy.pn || {}), ...(p.zakupy.sr || {}) };
  if (!p.wlasne.all) p.wlasne.all = [...(p.wlasne.pn || []), ...(p.wlasne.sr || [])];
  // dni = zmiany tylko na jeden dzień: { 'cz|sniadanie': { typ: 'wlasne' | 'pomin', ... } }
  for (const k of ['wyjete', 'doZamrazarki', 'zamiany', 'ugotowane', 'dni']) p[k] = p[k] || {};
  return p;
}
function migruj(s) {
  const d = domyslnyStan();
  const w = { ...d, ...s, ustawienia: { ...d.ustawienia, ...(s.ustawienia || {}) } };
  if (!Array.isArray(s.produkty)) {
    const lista = (s.ustawienia && s.ustawienia.zawszeMam) || ZAWSZE_DOMYSLNE;
    w.produkty = lista.map(n => nowyProdukt(n, { zawsze: true }));
  }
  delete w.ustawienia.zawszeMam;
  w.notatki = Array.isArray(s.notatki) ? s.notatki : [];
  w.wersja = 2;
  for (const p of Object.values(w.plany)) upewnijPlan(p);
  return w;
}
function wczytajStan() {
  try {
    const s = JSON.parse(localStorage.getItem(KLUCZ));
    if (s && s.wersja) return migruj(s);
  } catch (e) { /* brak/uszkodzony zapis — zaczynamy od zera */ }
  return domyslnyStan();
}
function zapisz() {
  try { localStorage.setItem(KLUCZ, JSON.stringify(S)); }
  catch (e) { toast('Nie udało się zapisać w telefonie'); }
}

let S = wczytajStan();
let ui = { tydzien: 0, zakupyTydzien: null, zakupyFiltr: 'all', filtrSlot: 'wszystkie', szukaj: '', produktySeg: 'dom', modalCtx: null };

function zaladujDane(d) {
  PRZEPISY = d.przepisy;
  PO_ID = Object.fromEntries(PRZEPISY.map(p => [p.id, p]));
  SPIZARNIA = new Set(d.spizarnia || []);
  ZAMIENNIKI = d.zamienniki || [];
  KATALOG = new Map();
  for (const g of ZAMIENNIKI) for (const o of g.opcje) KATALOG.set(o.nazwa, o.kategoria);
  for (const p of PRZEPISY) for (const s of p.skladniki) if (!KATALOG.has(s.nazwa)) KATALOG.set(s.nazwa, s.kategoria);
}

// ---------- Produkty (co mam w domu) ----------
const normNazwa = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const produkt = nazwa => S.produkty.find(p => p.nazwa === normNazwa(nazwa));
const kategoriaProduktu = p => KATALOG.get(p.nazwa) || p.kategoria || 'Inne';
function dodajProdukt(nazwa) {
  const n = normNazwa(nazwa);
  if (!n) return;
  const p = produkt(n);
  if (p) p.konczySie = false;
  else S.produkty.push(nowyProdukt(n));
}

// ---------- Oceny, sloty ----------
const ocena = id => (S.oceny[id] && S.oceny[id].ocena) || 0;
const aktywneSloty = () => SLOTY.filter(s => !(s.id === 'na-zab' && S.ustawienia.post) && !(s.id === 'przekaska' && !S.ustawienia.przekaski));
// Dni sesji, które nie mają zmiany „tylko na ten dzień” (własne / pominięte)
const dniAktywne = (plan, sk, slot) => SESJE[sk].dni.filter(d => !(plan && slot && plan.dni && plan.dni[d + '|' + slot]));
const potrzebnePorcje = (sk, plan, slot) => dniAktywne(plan, sk, slot).length * S.ustawienia.osoby;

// Ile ugotować: dania do mrożenia robimy całymi partiami (nadwyżka → zamrażarka), resztę przeliczamy.
function ileGotowac(p, sk, plan, slot) {
  const need = potrzebnePorcje(sk, plan, slot);
  if (!need) return { mnoznik: 0, porcje: 0, nadwyzka: 0, need: 0 };
  if (p.mrozenie) {
    const partie = Math.ceil(need / p.porcje);
    return { mnoznik: partie, porcje: partie * p.porcje, nadwyzka: partie * p.porcje - need, need };
  }
  return { mnoznik: need / p.porcje, porcje: need, nadwyzka: 0, need };
}
function ileGotowacTekst(p, sk, plan, slot) {
  const g = ileGotowac(p, sk, plan, slot);
  if (!g.need) return 'Nic do gotowania — wszystkie dni zmienione';
  const ile = Math.abs(g.mnoznik - 1) < 0.01 ? 'cały przepis' : `${ulamek(g.mnoznik)} przepisu`;
  if (g.nadwyzka > 0) return `Zrób ${ile} (${porcjiTekst(g.porcje)}): ${g.need} na plan, ${g.nadwyzka} do zamrażarki`;
  return `Zrób ${ile} (${porcjiTekst(g.porcje)})`;
}

// ---------- Zamiany składników ----------
function grupaDla(nazwa) {
  for (const g of ZAMIENNIKI) {
    const o = g.opcje.find(x => x.nazwa === nazwa);
    if (o) return { grupa: g, opcja: o };
  }
  return null;
}
// Składniki przepisu po zamianach zrobionych w planie
function skladnikiPozycji(p, zam) {
  return p.skladniki.map(s => {
    const z = zam && zam[s.nazwa];
    if (!z) return s;
    if (z.pomin) return null;
    return { ...s, nazwa: z.nazwa, ilosc: z.ilosc, jednostka: z.jednostka, kategoria: z.kategoria, uwaga: z.uwaga || '', oryginal: s.nazwa };
  }).filter(Boolean);
}
function zamianaZGrupy(s, nowaNazwa) {
  const stara = grupaDla(s.nazwa), nowa = grupaDla(nowaNazwa);
  if (!stara || !nowa) return null;
  const ilosc = s.ilosc == null ? null : s.ilosc / stara.opcja.na_porcje * nowa.opcja.na_porcje;
  return { nazwa: nowa.opcja.nazwa, ilosc, jednostka: nowa.opcja.jednostka, kategoria: nowa.opcja.kategoria, wskazowka: nowa.opcja.wskazowka || '' };
}
function opisZamian(zam) {
  if (!zam) return '';
  const l = Object.entries(zam).map(([orig, z]) => z.pomin ? `bez: ${esc(orig)}` : `${esc(z.nazwa)} zamiast: ${esc(orig)}`);
  return l.length ? `<div class="meta zamiana">⇄ ${l.join(' · ')}</div>` : '';
}

// ---------- Plan tygodnia ----------
const kluczPoz = (sk, slot) => sk + '|' + slot;

function planTygodnia(pon) {
  const k = isoData(pon);
  if (!S.plany[k]) {
    S.plany[k] = generujPlan(pon);
    sprzatnijStarePlany();
    zapisz();
  }
  return upewnijPlan(S.plany[k]);
}
function sprzatnijStarePlany() {
  const granica = isoData(dodajDni(dzis(), -35));
  for (const k of Object.keys(S.plany)) if (k < granica) delete S.plany[k];
}
// Przepisy z 2 poprzednich tygodni — żeby się nie powtarzały.
function ostatnioUzyte(pon) {
  const ids = new Set();
  for (const n of [7, 14]) {
    const p = S.plany[isoData(dodajDni(pon, -n))];
    if (p) for (const ses of Object.values(p.sesje)) for (const it of Object.values(ses)) if (it && it.przepisId) ids.add(it.przepisId);
  }
  return ids;
}
function idsWPlanie(plan) {
  const ids = new Set();
  for (const ses of Object.values(plan.sesje)) for (const it of Object.values(ses)) if (it && it.przepisId) ids.add(it.przepisId);
  return ids;
}

function wybierzPrzepis(slot, wyklucz, ostatnie, opcje = {}) {
  const pula = PRZEPISY.filter(p => p.slot === slot && ocena(p.id) !== -1);
  if (!pula.length) return null;
  let kand = pula.filter(p => !wyklucz.has(p.id) && !ostatnie.has(p.id));
  if (!kand.length) kand = pula.filter(p => !wyklucz.has(p.id));
  if (!kand.length) kand = pula;
  if (opcje.szybkie) {
    const szybkie = kand.filter(p => p.czas_min <= 25);
    if (szybkie.length) kand = szybkie;
  }
  const wagi = kand.map(p => {
    let w = ocena(p.id) === 1 ? 3 : 1;                       // 👍 = 3× częściej
    if (opcje.unikajBialek && p.tagi.bialko.some(b => opcje.unikajBialek.has(b))) w *= 0.4; // różnorodność
    return w;
  });
  let los = Math.random() * wagi.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kand.length; i++) { los -= wagi[i]; if (los <= 0) return kand[i]; }
  return kand[kand.length - 1];
}

function zarezerwowane(zid, plan) {
  if (!plan) return 0;
  const aktywne = new Set(aktywneSloty().map(s => s.id));
  let n = 0;
  for (const [sk, ses] of Object.entries(plan.sesje)) {
    for (const [slot, it] of Object.entries(ses)) {
      if (!it || it.typ !== 'zamrazarka' || it.zid !== zid || !aktywne.has(slot)) continue;
      for (const d of dniAktywne(plan, sk, slot)) if (!(plan.wyjete || {})[d + '|' + slot]) n += S.ustawienia.osoby;
    }
  }
  return n;
}
const wolnePorcje = (z, plan) => z.porcje - zarezerwowane(z.id, plan);
const pozycjaZZamrazarki = z => ({ typ: 'zamrazarka', zid: z.id, nazwa: z.nazwa, przepisId: z.przepisId || null });

function zZamrazarkiAuto(slot, plan, sk) {
  const need = potrzebnePorcje(sk);
  const z = S.zamrazarka
    .filter(z => z.slot === slot && wolnePorcje(z, plan) >= need)
    .sort((a, b) => (a.dodano < b.dodano ? -1 : 1))[0]; // najpierw najstarsze
  return z ? pozycjaZZamrazarki(z) : null;
}

function generujPlan(pon) {
  const plan = upewnijPlan({ sesje: {} });
  const ostatnie = ostatnioUzyte(pon);
  const uzyte = new Set();
  const bialkaSniadan = new Set();
  for (const sk of Object.keys(SESJE)) {
    plan.sesje[sk] = {};
    for (const slot of SLOTY) {
      let item = null;
      // Niedziela = z resztek: najpierw sprawdzamy zamrażarkę
      if (sk === 'nd' && slot.id !== 'przekaska') item = zZamrazarkiAuto(slot.id, plan, sk);
      if (!item) {
        const p = wybierzPrzepis(slot.id, uzyte, ostatnie, {
          szybkie: sk === 'nd',
          unikajBialek: slot.id === 'sniadanie' ? bialkaSniadan : null,
        });
        if (p) item = { typ: 'przepis', przepisId: p.id };
      }
      plan.sesje[sk][slot.id] = item;
      if (item && item.przepisId) {
        uzyte.add(item.przepisId);
        const p = PO_ID[item.przepisId];
        if (p && slot.id === 'sniadanie') p.tagi.bialko.forEach(b => bialkaSniadan.add(b));
      }
    }
  }
  return plan;
}
// Gdy zmieniasz danie w planie — kasujemy stare zamiany i odhaczenia
function resetPozycji(plan, key) {
  delete plan.zamiany[key];
  delete plan.ugotowane[key];
  delete plan.doZamrazarki[key];
}

// Co faktycznie jest danego dnia: zmiana na ten dzień albo danie z gotowania
const pozycjaDnia = (plan, dzien, slot) => plan.dni[dzien + '|' + slot] || plan.sesje[DZIEN_SESJA[dzien]][slot];

function infoPozycji(it) {
  if (!it) return null;
  if (it.typ === 'pomin') return { nazwa: 'Pominięte', p: null, pomin: true };
  if (it.typ === 'wlasne') return { nazwa: it.nazwa, p: null, wlasne: true };
  const p = it.przepisId ? PO_ID[it.przepisId] : null;
  return { nazwa: it.typ === 'zamrazarka' ? it.nazwa : (p ? p.nazwa : '?'), p, zamr: it.typ === 'zamrazarka' };
}
function opisKrotki(it) {
  const inf = infoPozycji(it);
  if (!inf) return '—';
  if (inf.pomin) return '⏭ pominięte';
  if (inf.wlasne) return '✍️ ' + inf.nazwa;
  return (inf.zamr ? '🧊 ' : '') + inf.nazwa;
}
function metaPrzepisu(p) {
  if (!p) return '';
  return `💪 ~${p.bialko_g} g białka · ${p.kcal} kcal · ⏱ ${p.czas_min} min${p.mrozenie ? ' · ❄️ mrozi się' : ''}`;
}
// pobierz(slotId) → pozycja planu
function sumaDnia(pobierz) {
  let b = 0, k = 0;
  for (const s of aktywneSloty()) {
    const inf = infoPozycji(pobierz(s.id));
    if (inf && inf.p) { b += inf.p.bialko_g; k += inf.p.kcal; }
  }
  return { b, k };
}

// Odhaczenie „ugotowane”: nadwyżka do zamrażarki + zużyte świeże produkty znikają z Produktów
function oznaczUgotowane(planKey, sk, slot, wartosc) {
  const plan = S.plany[planKey];
  const key = kluczPoz(sk, slot);
  if (!wartosc) { delete plan.ugotowane[key]; zapisz(); render(); return; }
  plan.ugotowane[key] = true;
  const p = PO_ID[plan.sesje[sk][slot].przepisId];
  const komunikaty = [];
  const g = ileGotowac(p, sk, plan, slot);
  if (g.nadwyzka > 0 && !plan.doZamrazarki[key] && confirm(`Włożyć ${porcjiTekst(g.nadwyzka)} „${p.nazwa}” do zamrażarki?`)) {
    dodajDoZamrazarki({ nazwa: p.nazwa, przepisId: p.id, slot: p.slot, porcje: g.nadwyzka });
    plan.doZamrazarki[key] = true;
    komunikaty.push(`🧊 +${g.nadwyzka} do zamrażarki`);
  }
  const zuzyte = [];
  for (const s of skladnikiPozycji(p, plan.zamiany[key])) {
    const pr = produkt(s.nazwa);
    if (pr && !pr.zawsze && !SPIZARNIA.has(pr.nazwa)) { S.produkty = S.produkty.filter(x => x !== pr); zuzyte.push(pr.nazwa); }
  }
  if (zuzyte.length) komunikaty.push(`zużyte: ${zuzyte.join(', ')}`);
  zapisz(); render();
  toast('✓ Ugotowane' + (komunikaty.length ? ' · ' + komunikaty.join(' · ') : ''));
}

// ---------- Lista zakupów ----------
function kupTekst(nazwa, jedn) {
  if (SPIZARNIA.has(nazwa)) return '1 opak.';
  const czesci = new Set();
  for (const [j, x] of Object.entries(jedn)) {
    if (JEDN_OPAK.has(j) || !x) czesci.add('1 opak.');
    else if (j === 'ząbek') czesci.add(x > 10 ? `${Math.ceil(x / 10)} główki` : '1 główka');
    else { const n = Math.ceil(x - 1e-9); czesci.add(`${n} ${jednostka(j, n)}`); }
  }
  return [...czesci].join(' + ');
}
// Ilości „kuchenne” (łyżki itd.) — do sekcji „sprawdź, czy wystarczy”
function kuchnTekst(jedn) {
  return Object.entries(jedn).filter(([, x]) => x > 0).map(([j, x]) => ileTekst(zaokraglij(x, j), j)).join(' + ');
}

// Lista zakupów na tydzień. sesje = które gotowania wziąć (domyślnie pn + śr razem).
function listaZakupow(plan, sesje = ['pn', 'sr']) {
  const zbior = new Map();
  for (const sk of sesje) {
    for (const slot of aktywneSloty()) {
      const it = plan.sesje[sk][slot.id];
      if (!it || it.typ !== 'przepis') continue;
      const p = PO_ID[it.przepisId];
      if (!p) continue;
      const { mnoznik } = ileGotowac(p, sk, plan, slot.id);
      if (!mnoznik) continue;
      for (const s of skladnikiPozycji(p, plan.zamiany[kluczPoz(sk, slot.id)])) {
        const e = zbior.get(s.nazwa) || { nazwa: s.nazwa, kategoria: s.kategoria || KATALOG.get(s.nazwa) || 'Inne', jedn: {}, dla: new Set() };
        const j = s.jednostka || '';
        e.jedn[j] = (e.jedn[j] || 0) + (s.ilosc == null ? 0 : s.ilosc * mnoznik);
        e.dla.add(`${p.nazwa} (${DNI_KROTKO[sk]})`);
        zbior.set(s.nazwa, e);
      }
    }
  }
  const kupic = [], sprawdz = [], pominiete = [];
  for (const e of zbior.values()) {
    e.key = 'k|' + e.nazwa;
    const pr = produkt(e.nazwa);
    if (pr && pr.konczySie) continue;                 // i tak jest w sekcji „kończy się”
    if (pr && (pr.zawsze || SPIZARNIA.has(e.nazwa))) { e.ile = kuchnTekst(e.jedn); pominiete.push(e); }
    else if (pr) { e.ile = kuchnTekst(e.jedn) || kupTekst(e.nazwa, e.jedn); sprawdz.push(e); }
    else { e.ile = kupTekst(e.nazwa, e.jedn); kupic.push(e); }
  }
  const konczy = S.produkty.filter(p => p.konczySie).map(p => ({ key: 'kon|' + p.nazwa, nazwa: p.nazwa, kategoria: kategoriaProduktu(p), ile: '', dla: new Set() }));
  const wlasne = (plan.wlasne.all || []).map(w => ({ key: 'wl|' + w.id, nazwa: w.nazwa, kategoria: 'Własne', ile: '', dla: new Set(), wlasneId: w.id }));
  return { kupic, sprawdz, pominiete, konczy, wlasne };
}

// ---------- Widoki ----------
const WIDOKI = {
  start: widokStart, plan: widokPlan, zakupy: widokZakupy, produkty: widokProdukty,
  zamrazarka: () => { ui.produktySeg = 'zamr'; return widokProdukty(); },
  przepisy: widokPrzepisy, notatki: widokNotatki, ustawienia: widokUstawienia,
};
const ZAKLADKA = { zamrazarka: 'produkty' };

function render() {
  const nazwa = (location.hash || '#start').slice(1);
  const widok = WIDOKI[nazwa] ? nazwa : 'start';
  document.getElementById('app').innerHTML = WIDOKI[widok]();
  const zakl = ZAKLADKA[widok] || widok;
  document.querySelectorAll('.dol a').forEach(a => a.classList.toggle('aktywny', a.dataset.widok === zakl));
}

const ctxAttr = (planKey, sk, slot, dzien) => `data-plan="${planKey}" data-sk="${sk}" data-slot="${slot}"${dzien ? ` data-dzien="${dzien}"` : ''}`;

// Jeden wiersz z daniem. opcje: planKey, sk, dzien, zamiany, dodatki (HTML pod nazwą), menu (true = przycisk ⋯)
function wierszDania(slot, it, opcje = {}) {
  const inf = infoPozycji(it);
  const kropki = opcje.menu ? `<button class="kropki" data-a="menu" ${ctxAttr(opcje.planKey, opcje.sk, slot.id, opcje.dzien)} aria-label="Więcej opcji">⋯</button>` : '';
  let tresc;
  if (!inf) tresc = '<span class="maly">brak dania</span>';
  else if (inf.pomin) tresc = '<span class="maly">⏭ Pominięte</span>';
  else if (inf.wlasne) tresc = `<b>✍️ ${esc(inf.nazwa)}</b><div class="meta">własne</div>`;
  else {
    const ctx = opcje.planKey && !inf.zamr ? ' ' + ctxAttr(opcje.planKey, opcje.sk, slot.id) : '';
    tresc = (inf.p ? `<button class="link" data-a="przepis" data-id="${inf.p.id}"${ctx}>${esc(inf.nazwa)}</button>` : `<b>${esc(inf.nazwa)}</b>`)
      + (inf.zamr ? '<span class="znaczek">🧊 z zamrażarki</span>' : opisZamian(opcje.zamiany))
      + `<div class="meta">${metaPrzepisu(inf.p)}</div>`;
  }
  return `<div class="danie${inf && inf.pomin ? ' pominiety' : ''}">
    <div class="danie-slot"><b>${slot.nazwa}</b>${slot.pora}</div>
    <div class="danie-tresc">${tresc}${opcje.dodatki || ''}</div>${kropki}
  </div>`;
}

// Przycisk „Ugotowane” — tylko dla dania z przepisu, które gotujesz w tej sesji
function przyciskUgotowane(planKey, plan, sk, slot) {
  const it = plan.sesje[sk][slot];
  if (!it || it.typ !== 'przepis') return '';
  const ug = !!plan.ugotowane[kluczPoz(sk, slot)];
  return `<div class="akcje"><label class="btn ${ug ? 'wl' : ''}"><input type="checkbox" data-c="ugot" ${ctxAttr(planKey, sk, slot)} ${ug ? 'checked' : ''} hidden>${ug ? '✓ Ugotowane' : '☐ Ugotowane'}</label></div>`;
}

function widokStart() {
  const d = dzis();
  const jutro = dodajDni(d, 1);
  const jd = DNI[jutro.getDay()];
  let h = `<h1>Co jutro do pracy?</h1><p class="podtytul">${wielka(DNI_NAZWY[jd])}, ${krotkaData(jutro)}</p>`;
  const doWyjecia = [];

  if (jd === 'sb' || jd === 'nd') {
    h += `<div class="karta akcent"><h3>Jutro wolne 🎉</h3><p class="maly" style="margin:0">Czas na ciepłe śniadanie i sok z sokowirówki.</p></div>`;
  } else {
    const pon = poniedzialekPlanu(jutro);
    const planKey = isoData(pon);
    const plan = planTygodnia(pon);
    const sk = DZIEN_SESJA[jd];
    h += `<div class="karta">`;
    for (const slot of aktywneSloty()) {
      const it = pozycjaDnia(plan, jd, slot.id);
      const nadpisane = !!plan.dni[jd + '|' + slot.id];
      h += wierszDania(slot, it, {
        planKey, sk, dzien: jd, menu: true,
        zamiany: plan.zamiany[kluczPoz(sk, slot.id)],
        dodatki: nadpisane ? '' : przyciskUgotowane(planKey, plan, sk, slot.id),
      });
      if (it && it.typ === 'zamrazarka') doWyjecia.push({ it, klucz: jd + '|' + slot.id, planKey });
    }
    const suma = sumaDnia(slot => pozycjaDnia(plan, jd, slot));
    h += `<p class="maly" style="margin:8px 0 0">Razem: ~${suma.b} g białka · ~${suma.k} kcal${S.ustawienia.post ? ' · post: pierwszy posiłek ok. 10:00' : ''}</p></div>`;
  }

  h += `<h2>Co wyjąć z zamrażarki?</h2>`;
  if (!doWyjecia.length) {
    h += `<div class="karta"><p class="maly" style="margin:0">${jd === 'sb' || jd === 'nd' ? 'Nic — jutro weekend.' : 'Nic nie trzeba wyjmować.'}</p></div>`;
  } else {
    h += `<div class="karta zimno">`;
    for (const w of doWyjecia) {
      const plan = S.plany[w.planKey];
      const inf = infoPozycji(w.it);
      const rada = inf.p && inf.p.odmrazanie ? `<div class="meta">${esc(inf.p.odmrazanie)}${inf.p.przepiec ? ' ' + esc(inf.p.przepiec) : ''}</div>` : '';
      h += `<div class="wiersz"><div class="rozciag"><b>${esc(inf.nazwa)}</b> — ${porcjiTekst(S.ustawienia.osoby)}${rada}</div>
        ${plan.wyjete[w.klucz] ? '<span class="znaczek ok">✓ wyjęte</span>' : `<button class="btn zimny" data-a="wyjmij" data-plan="${w.planKey}" data-klucz="${w.klucz}" data-zid="${w.it.zid}">Wyjęte ✓</button>`}</div>`;
    }
    h += `</div>`;
  }

  // Dziś gotujesz?
  const dd = DNI[d.getDay()];
  if (SESJE[dd]) {
    const pon = poniedzialekPlanu(d);
    const planKey = isoData(pon);
    const plan = planTygodnia(pon);
    const ses = plan.sesje[dd];
    h += `<h2>Dziś: ${SESJE[dd].opis}</h2><div class="karta">`;
    for (const slot of aktywneSloty()) {
      h += wierszDania(slot, ses[slot.id], {
        planKey, sk: dd, menu: true, zamiany: plan.zamiany[kluczPoz(dd, slot.id)],
        dodatki: przyciskUgotowane(planKey, plan, dd, slot.id) + nadpisaniaDni(planKey, plan, dd, slot.id),
      });
    }
    h += `<div class="akcje" style="margin-top:12px">${SESJE[dd].zakupy ? `<button class="btn glowny" data-a="idzZakupy" data-sk="${dd}">🛒 Lista zakupów</button>` : ''}</div></div>`;
  }
  return h;
}

// Zmiany na pojedyncze dni (np. „pt: ✍️ resztki”) pokazane pod daniem z gotowania
function nadpisaniaDni(planKey, plan, sk, slot) {
  return SESJE[sk].dni.filter(d => plan.dni[d + '|' + slot]).map(d =>
    `<div class="meta nadpisanie">${DNI_KROTKO[d]}: ${esc(opisKrotki(plan.dni[d + '|' + slot]))}
      <button class="btn maly-btn" data-a="przywrocDzien" ${ctxAttr(planKey, sk, slot, d)}>↺ przywróć</button></div>`).join('');
}

function widokPlan() {
  const pon0 = poniedzialekPlanu(dzis());
  const pon = dodajDni(pon0, ui.tydzien * 7);
  const plan = planTygodnia(pon);
  const k = isoData(pon);
  let h = `<h1>Plan tygodnia</h1>
    <div class="segment">
      <button class="${ui.tydzien === 0 ? 'wl' : ''}" data-a="tydzien" data-v="0">Ten tydzień (od ${krotkaData(pon0)})</button>
      <button class="${ui.tydzien === 1 ? 'wl' : ''}" data-a="tydzien" data-v="1">Następny (od ${krotkaData(dodajDni(pon0, 7))})</button>
    </div>`;
  for (const [sk, sesja] of Object.entries(SESJE)) {
    const ses = plan.sesje[sk];
    const dni = sesja.dni.map(d => DNI_KROTKO[d]).join('–');
    h += `<div class="karta"><h3>${sesja.nazwa} ${krotkaData(dataDnia(pon, sk))} <span class="maly">→ na ${dni}</span></h3>
      <p class="maly" style="margin:0 0 6px">${wielka(sesja.opis)}${sk === 'nd' ? '. Najpierw zajrzyj do lodówki — to tylko propozycja.' : ''}</p>`;
    for (const slot of aktywneSloty()) {
      const it = ses[slot.id];
      const inf = infoPozycji(it);
      const key = kluczPoz(sk, slot.id);
      let dodatki = '';
      if (inf && inf.p && !inf.zamr) {
        const g = ileGotowac(inf.p, sk, plan, slot.id);
        dodatki += `<div class="meta">${ileGotowacTekst(inf.p, sk, plan, slot.id)}${g.nadwyzka > 0 && plan.doZamrazarki[key] ? ' · ✓ nadwyżka w zamrażarce' : ''}</div>`;
      }
      if (inf && inf.zamr) dodatki += `<div class="meta">Wyjmij wieczorem przed każdym dniem (${porcjiTekst(S.ustawienia.osoby)} na dzień).</div>`;
      dodatki += przyciskUgotowane(k, plan, sk, slot.id) + nadpisaniaDni(k, plan, sk, slot.id);
      h += wierszDania(slot, it, { planKey: k, sk, menu: true, zamiany: plan.zamiany[key], dodatki });
    }
    const suma = sumaDnia(slot => ses[slot]);
    h += `<p class="maly" style="margin:8px 0 0">Na dzień: ~${suma.b} g białka · ~${suma.k} kcal</p></div>`;
  }
  h += `<button class="btn szeroki" data-a="nowyPlan" data-plan="${k}">🎲 Wylosuj cały tydzień od nowa</button>
    <p class="maly" style="text-align:center">Porcje dla ${S.ustawienia.osoby} ${S.ustawienia.osoby === 1 ? 'osoby' : 'osób'} — zmienisz w ⚙️ ustawieniach.</p>`;
  return h;
}

function wierszZakupu(e, zazn, d, opcje = {}) {
  const dla = [...e.dla];
  return `<label class="poz ${zazn[e.key] ? 'kupione' : ''}">
    <input type="checkbox" data-c="kup" ${d} data-key="${esc(e.key)}" ${zazn[e.key] ? 'checked' : ''}>
    <span class="nazwa">${esc(e.nazwa)}${dla.length ? `<br><span class="maly">${dla.map(esc).join(', ')}</span>` : ''}</span>
    <span class="ile">${esc(e.ile || '')}</span>
    ${opcje.mam ? `<button class="btn maly-btn" data-a="mam" data-n="${esc(e.nazwa)}" title="Mam w domu">🏠 mam</button>` : ''}
    ${e.wlasneId ? `<button class="btn maly-btn niebezp" data-a="usunWlasne" ${d} data-id="${e.wlasneId}" aria-label="Usuń">✕</button>` : ''}
  </label>`;
}

// Od czwartku zakupy z tego tygodnia są już za Tobą → domyślnie pokazujemy następny tydzień
const domyslnyTydzienZakupow = () => ([4, 5].includes(dzis().getDay()) ? 1 : 0);

function widokZakupy() {
  if (ui.zakupyTydzien == null) ui.zakupyTydzien = domyslnyTydzienZakupow();
  const pon0 = poniedzialekPlanu(dzis());
  const pon = dodajDni(pon0, ui.zakupyTydzien * 7);
  const plan = planTygodnia(pon);
  const k = isoData(pon);
  const f = ui.zakupyFiltr;
  const L = listaZakupow(plan, f === 'all' ? ['pn', 'sr'] : [f]);
  const zazn = plan.zakupy.all;
  const attr = `data-plan="${k}"`;
  const doKupienia = [...L.konczy, ...L.kupic, ...L.wlasne, ...L.sprawdz];
  const kupione = doKupienia.filter(p => zazn[p.key]).length;
  const chip = (v, t) => `<button class="btn ${f === v ? 'wl' : ''}" data-a="zakupyFiltr" data-v="${v}">${t}</button>`;

  let h = `<h1>Lista zakupów</h1>
    <div class="segment">
      <button class="${ui.zakupyTydzien === 0 ? 'wl' : ''}" data-a="zakupyTydzien" data-v="0">Ten tydzień ${krotkaData(pon0)}–${krotkaData(dodajDni(pon0, 4))}</button>
      <button class="${ui.zakupyTydzien === 1 ? 'wl' : ''}" data-a="zakupyTydzien" data-v="1">Następny ${krotkaData(dodajDni(pon0, 7))}–${krotkaData(dodajDni(pon0, 11))}</button>
    </div>
    <div class="chipy">${chip('all', '🛒 Cały tydzień')}${chip('pn', `Tylko pn ${krotkaData(dataDnia(pon, 'pn'))} (na wt–śr)`)}${chip('sr', `Tylko śr ${krotkaData(dataDnia(pon, 'sr'))} (na czw–pt)`)}</div>
    <p class="podtytul">${kupione} / ${doKupienia.length} w koszyku · porcje dla ${S.ustawienia.osoby} os.</p>`;

  if (L.konczy.length) {
    h += `<div class="karta lista-zakupow"><h3 style="margin-top:0">🔻 Kończy się</h3>${L.konczy.map(e => wierszZakupu(e, zazn, attr)).join('')}</div>`;
  }
  h += `<div class="karta lista-zakupow">`;
  const glowne = [...L.kupic, ...L.wlasne];
  if (!glowne.length) h += `<p class="pusto">Do planu nic nie brakuje.</p>`;
  for (const kat of KATEGORIE) {
    const grupa = glowne.filter(p => (p.kategoria || 'Inne') === kat).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
    if (!grupa.length) continue;
    h += `<h3>${kat}</h3>` + grupa.map(e => wierszZakupu(e, zazn, attr, { mam: !e.wlasneId })).join('');
  }
  h += `</div>
    <form class="rzad" data-f="dodajWlasne" ${attr}>
      <input type="text" name="nazwa" placeholder="Dopisz coś (np. kawa)" autocomplete="off">
      <button class="btn glowny" style="flex:none">Dodaj</button>
    </form>`;
  if (L.sprawdz.length) {
    h += `<h2>🏠 Masz w Produktach — sprawdź, czy wystarczy</h2>
      <div class="karta lista-zakupow">${L.sprawdz.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map(e => wierszZakupu(e, zazn, attr)).join('')}</div>`;
  }
  if (L.pominiete.length) {
    h += `<details style="margin-top:12px"><summary>Pominięte — masz w zapasach (${L.pominiete.length})</summary>
      <div class="karta">${L.pominiete.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map(e => `<div class="wiersz"><span class="rozciag">${esc(e.nazwa)}</span><span class="maly">${esc(e.ile) || 'trochę'}</span></div>`).join('')}</div></details>`;
  }
  if (kupione) {
    h += `<button class="btn glowny szeroki" style="margin-top:12px" data-a="koniecZakupow" ${attr}>✔ Zakończ zakupy — dodaj kupione do Produktów</button>
      <button class="btn szeroki" style="margin-top:8px" data-a="odznacz" ${attr}>Odznacz wszystko</button>`;
  }
  return h;
}

function widokProdukty() {
  const seg = ui.produktySeg;
  let h = `<h1>Produkty</h1>
    <div class="segment">
      <button class="${seg === 'dom' ? 'wl' : ''}" data-a="produktySeg" data-v="dom">🏠 W domu (${S.produkty.length})</button>
      <button class="${seg === 'zamr' ? 'wl' : ''}" data-a="produktySeg" data-v="zamr">🧊 Zamrażarka (${S.zamrazarka.reduce((a, z) => a + z.porcje, 0)})</button>
    </div>`;
  return h + (seg === 'zamr' ? czescZamrazarka() : czescDom());
}

function czescDom() {
  let h = `<form class="karta" data-f="dodajProdukty">
      <label class="pole" for="p-nazwy" style="margin-top:0">Dodaj produkty (kilka po przecinku)</label>
      <div class="rzad"><input id="p-nazwy" type="text" name="nazwy" list="katalog" placeholder="np. miód, mleko, płatki owsiane" autocomplete="off">
      <button class="btn glowny" style="flex:none">Dodaj</button></div>
      <datalist id="katalog">${[...KATALOG.keys()].sort((a, b) => a.localeCompare(b, 'pl')).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <p class="maly" style="margin-bottom:0">Po zakupach kliknij „Zakończ zakupy” na liście — kupione dodadzą się same. Świeże produkty znikają same, gdy odhaczysz danie jako ugotowane. 📷 Zdjęcie paragonu — w Etapie 2.</p>
    </form>`;
  const konczy = S.produkty.filter(p => p.konczySie);
  if (konczy.length) h += `<p class="maly">🔻 Kończy się: ${konczy.map(p => esc(p.nazwa)).join(', ')} — są na liście zakupów.</p>`;
  h += `<div class="karta lista-zakupow">`;
  if (!S.produkty.length) h += `<p class="pusto">Pusto — dopisz, co masz w domu.</p>`;
  for (const kat of KATEGORIE) {
    const grupa = S.produkty.filter(p => kategoriaProduktu(p) === kat).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
    if (!grupa.length) continue;
    h += `<h3>${kat}</h3>`;
    for (const p of grupa) {
      h += `<div class="wiersz"><span class="rozciag">${p.zawsze ? '📌 ' : ''}${esc(p.nazwa)}</span>
        <button class="btn maly-btn ${p.zawsze ? 'wl' : ''}" data-a="prodZawsze" data-id="${p.id}" title="Stały zapas">📌</button>
        <button class="btn maly-btn ${p.konczySie ? 'pom' : ''}" data-a="prodKonczy" data-id="${p.id}">${p.konczySie ? '🔻 kończy się' : 'kończy się?'}</button>
        <button class="btn maly-btn niebezp" data-a="prodUsun" data-id="${p.id}" aria-label="Usuń">✕</button></div>`;
    }
  }
  h += `</div><p class="maly">📌 = stały zapas (np. jajka): nie znika po gotowaniu i nie trafia na listę, dopóki nie klikniesz „kończy się?”.</p>`;
  return h;
}

function czescZamrazarka() {
  const plan = S.plany[isoData(poniedzialekPlanu(dzis()))];
  let h = `<p class="podtytul">Co masz w szufladzie. W planie kliknij „🧊 Z zamrażarki”, gdy nie chce Ci się gotować.</p><div class="karta">`;
  if (!S.zamrazarka.length) h += `<p class="pusto">Pusto. Dodaj coś poniżej albo odhacz w planie ugotowane danie do mrożenia.</p>`;
  const dzisIso = isoData(dzis());
  for (const z of [...S.zamrazarka].sort((a, b) => (a.dodano < b.dodano ? -1 : 1))) {
    const rez = zarezerwowane(z.id, plan);
    const dni = Math.round((zIso(dzisIso) - zIso(z.dodano)) / 864e5);
    h += `<div class="wiersz"><div class="rozciag">
        ${z.przepisId && PO_ID[z.przepisId] ? `<button class="link" data-a="przepis" data-id="${z.przepisId}">${esc(z.nazwa)}</button>` : `<b>${esc(z.nazwa)}</b>`}
        <div class="meta">${SLOT_NAZWA[z.slot] || ''} · od ${krotkaData(zIso(z.dodano))}${dni > 90 ? ' · ⚠️ ponad 3 mies.' : ''}${rez ? ` · w planie: ${rez}` : ''}</div>
      </div>
      <div class="licznik">
        <button data-a="porcje" data-id="${z.id}" data-d="-1" aria-label="Mniej">−</button>
        <span>${z.porcje}</span>
        <button data-a="porcje" data-id="${z.id}" data-d="1" aria-label="Więcej">+</button>
      </div></div>`;
  }
  h += `</div><h2>Dodaj do zamrażarki</h2>
    <form class="karta" data-f="dodajZamr">
      <label class="pole" for="z-przepis" style="margin-top:0">Danie</label>
      <select id="z-przepis" name="przepis">
        ${PRZEPISY.filter(p => p.mrozenie).map(p => `<option value="${p.id}">${esc(p.nazwa)}</option>`).join('')}
        <option value="">Inne — wpiszę sam…</option>
      </select>
      <label class="pole" for="z-nazwa">Nazwa (tylko dla „Inne”)</label>
      <input id="z-nazwa" type="text" name="nazwa" placeholder="np. pierogi od mamy">
      <div class="rzad">
        <div><label class="pole" for="z-porcje">Porcji</label><input id="z-porcje" type="number" name="porcje" min="1" value="2" inputmode="numeric"></div>
        <div><label class="pole" for="z-slot">Na</label><select id="z-slot" name="slot">${SLOTY.map(s => `<option value="${s.id}"${s.id === 'sniadanie' ? ' selected' : ''}>${s.nazwa}</option>`).join('')}</select></div>
      </div>
      <p class="maly">Dla przepisu z listy pole „Na” ustawi się samo.</p>
      <button class="btn glowny szeroki">Dodaj</button>
    </form>`;
  return h;
}

function widokPrzepisy() {
  const f = ui.filtrSlot, q = ui.szukaj.trim().toLowerCase();
  const lista = PRZEPISY.filter(p => (f === 'wszystkie' || p.slot === f || (f === 'ulubione' && ocena(p.id) === 1))
    && (!q || (p.nazwa + ' ' + p.tagi.bialko.join(' ') + ' ' + p.tagi.kuchnia).toLowerCase().includes(q)));
  const chip = (v, t) => `<button class="btn ${f === v ? 'wl' : ''}" data-a="filtr" data-v="${v}">${t}</button>`;
  let h = `<h1>Przepisy</h1><p class="podtytul">${PRZEPISY.length} przepisów · 👍 częściej w planie, 👎 znika z rotacji</p>
    <input type="search" placeholder="Szukaj: łosoś, makaron, meksykańska…" value="${esc(ui.szukaj)}" data-c="szukaj" style="margin-bottom:10px">
    <div class="chipy">${chip('wszystkie', 'Wszystkie')}${chip('na-zab', 'Na ząb')}${chip('sniadanie', 'Śniadanie')}${chip('przekaska', 'Przekąska')}${chip('ulubione', '👍 Ulubione')}</div>`;
  if (!lista.length) h += `<p class="pusto">Nic nie pasuje.</p>`;
  for (const p of lista) {
    const o = ocena(p.id);
    h += `<button class="karta przepis-karta" data-a="przepis" data-id="${p.id}">
      <b>${esc(p.nazwa)}</b> ${o === 1 ? '👍' : o === -1 ? '👎' : ''}${p.sprawdzony ? ' <span class="znaczek ok">sprawdzony</span>' : ''}
      <div class="meta">${SLOT_NAZWA[p.slot]} · ${p.tagi.bialko.join(', ')} · ${p.tagi.kuchnia}</div>
      <div class="meta">${metaPrzepisu(p)}</div></button>`;
  }
  return h;
}

function widokNotatki() {
  const przyPrzepisach = Object.entries(S.oceny).filter(([id, o]) => (o.notatka || '').trim() && PO_ID[id]);
  let h = `<h1>Notatki</h1><p class="podtytul">Pomysły na dania, składniki do wypróbowania, uwagi. Trafią do Claude Code z eksportem.</p>
    <form class="karta" data-f="dodajNotatke">
      <select name="typ" aria-label="Rodzaj notatki">${Object.entries(TYPY_NOTATEK).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <textarea name="tekst" placeholder="np. coś z krewetkami i makaronem; spróbować hummusu z buraka…" style="margin-top:8px"></textarea>
      <button class="btn glowny szeroki" style="margin-top:8px">Zapisz notatkę</button>
    </form>`;
  if (S.notatki.length) {
    h += `<div class="karta">` + [...S.notatki].reverse().map(n => `<div class="wiersz"><div class="rozciag">
        <div class="maly">${TYPY_NOTATEK[n.typ] || ''} · ${krotkaData(zIso(n.data))}</div>
        <div class="notatka-tekst">${esc(n.tekst)}</div></div>
        <button class="btn maly-btn niebezp" data-a="usunNotatke" data-id="${n.id}" aria-label="Usuń">✕</button></div>`).join('') + `</div>`;
  }
  if (przyPrzepisach.length) {
    h += `<h2>Notatki przy przepisach</h2><div class="karta">` + przyPrzepisach.map(([id, o]) => `<div class="wiersz"><div class="rozciag">
        <button class="link" data-a="przepis" data-id="${id}">${esc(PO_ID[id].nazwa)}</button> ${o.ocena === 1 ? '👍' : o.ocena === -1 ? '👎' : ''}
        <div class="notatka-tekst">${esc(o.notatka)}</div></div></div>`).join('') + `</div>`;
  }
  h += `<h2>Do Claude Code</h2><div class="karta">
      <p class="maly" style="margin-top:0">Zapisz plik z ocenami, notatkami i produktami i wrzuć go do Claude Code — poprawię profil i dopiszę przepisy.</p>
      <button class="btn glowny szeroki" data-a="eksport">📤 Eksport dla Claude Code</button></div>`;
  return h;
}

function widokUstawienia() {
  const u = S.ustawienia;
  return `<h1>Ustawienia</h1>
    <div class="karta">
      <div class="przelacznik"><span>Gotuję dla</span>
        <div class="segment" style="margin:0;min-width:150px">
          <button class="${u.osoby === 1 ? 'wl' : ''}" data-a="osoby" data-v="1">1 os.</button>
          <button class="${u.osoby === 2 ? 'wl' : ''}" data-a="osoby" data-v="2">2 os.</button>
        </div></div>
      <label class="przelacznik"><span>Post przerywany<br><span class="maly">Pomija „na ząb”, pierwszy posiłek ok. 10:00</span></span>
        <input type="checkbox" data-c="ust" data-k="post" ${u.post ? 'checked' : ''}></label>
      <label class="przelacznik"><span>Planuj przekąski</span>
        <input type="checkbox" data-c="ust" data-k="przekaski" ${u.przekaski ? 'checked' : ''}></label>
    </div>

    <h2>Do Claude Code</h2>
    <div class="karta"><button class="btn glowny szeroki" data-a="eksport">📤 Eksport dla Claude Code</button></div>

    <h2>Kopia zapasowa</h2>
    <div class="karta">
      <p class="maly" style="margin-top:0">Dane są tylko w tym telefonie. Wyczyszczenie danych przeglądarki je usunie — zrób czasem kopię.</p>
      <div class="akcje">
        <button class="btn" data-a="eksportCalosci">💾 Zapisz kopię</button>
        <label class="btn">📂 Wczytaj kopię<input type="file" accept="application/json,.json" data-c="import" hidden></label>
      </div>
    </div>
    <button class="btn niebezp szeroki" data-a="reset" style="margin-top:8px">Wyczyść wszystkie dane</button>
    <p class="maly" style="text-align:center">Baza przepisów: ${PRZEPISY.length}</p>`;
}

// ---------- Modale ----------
function otworzModal(html) {
  document.getElementById('modal-tresc').innerHTML = html;
  document.getElementById('modal').hidden = false;
  document.querySelector('.modal-okno').scrollTop = 0;
}
function zamknijModal() { document.getElementById('modal').hidden = true; ui.modalCtx = null; }

// ctx = { planKey, sk, slot, cale } — gdy przepis otwarty z planu (przeliczone ilości + zamiany)
function modalPrzepis(id, ctx) {
  const p = PO_ID[id];
  if (!p) return;
  const plan = ctx && S.plany[ctx.planKey];
  const it = plan && plan.sesje[ctx.sk][ctx.slot];
  if (!(it && it.typ === 'przepis' && it.przepisId === id)) ctx = null;
  ui.modalCtx = ctx;
  const o = S.oceny[id] || {};
  const key = ctx ? kluczPoz(ctx.sk, ctx.slot) : null;
  const zam = ctx ? plan.zamiany[key] || {} : {};
  const g = ctx ? ileGotowac(p, ctx.sk, plan, ctx.slot) : null;
  const skaluj = g && !ctx.cale && Math.abs(g.mnoznik - 1) > 0.01;
  const m = skaluj ? g.mnoznik : 1;
  const d = ctx ? ctxAttr(ctx.planKey, ctx.sk, ctx.slot) : '';

  const wiersz = s => {
    const z = zam[s.nazwa];
    const btn = ctx ? `<button class="btn maly-btn" data-a="zamianaModal" ${d} data-n="${esc(s.nazwa)}" aria-label="Zamień">⇄</button>` : '';
    if (z && z.pomin) return `<li class="pominiety"><span><s>${esc(s.nazwa)}</s> <span class="maly">pominięty</span></span><span>${btn}</span></li>`;
    const e = z ? { ...s, ...z } : s;
    const ile = e.ilosc == null ? esc(e.uwaga || 'do smaku') : ileTekst(skaluj ? zaokraglij(e.ilosc * m, e.jednostka) : e.ilosc, e.jednostka) + (e.uwaga && !z ? ` <span class="maly">(${esc(e.uwaga)})</span>` : '');
    const pr = produkt(e.nazwa);
    return `<li><span>${z ? '⇄ ' : ''}${esc(e.nazwa)}${z ? ` <span class="maly">zamiast: ${esc(s.nazwa)}</span>` : ''}${pr ? ' <span class="maly">· masz</span>' : ''}</span><span class="ile">${ile} ${btn}</span></li>`;
  };
  const wskazowkiZamian = Object.values(zam).filter(z => z.wskazowka).map(z => `<li>${esc(z.wskazowka)}</li>`).join('');
  const mroz = p.mrozenie
    ? `<p>❄️ <b>Można mrozić.</b> ${esc(p.odmrazanie || '')} ${esc(p.przepiec || '')}</p>`
    : `<p>❄️ Nie nadaje się do mrożenia.</p>`;
  otworzModal(`<h2>${esc(p.nazwa)}</h2>
    <p class="meta">${SLOT_NAZWA[p.slot]} · ${p.tagi.kuchnia} · ${p.tagi.bialko.join(', ')}${p.sprawdzony ? ' · <span class="znaczek ok">sprawdzony</span>' : ''}</p>
    <div class="karta akcent" style="margin-top:10px">
      <div>💪 ~${p.bialko_g} g białka · 🔥 ~${p.kcal} kcal <span class="maly">(1 porcja: ${esc(p.porcja_opis)})</span></div>
      <div>⏱ ${p.czas_min} min · 🍽 ${p.porcje} porcji · 📦 wytrzyma ${p.trwalosc_dni} dni</div>
    </div>
    ${g ? `<div class="segment">
      <button class="${!ctx.cale ? 'wl' : ''}" data-a="przepis" data-id="${id}" ${d}>Na plan (${g.porcje} porc.)</button>
      <button class="${ctx.cale ? 'wl' : ''}" data-a="przepis" data-id="${id}" ${d} data-cale="1">Cały przepis (${p.porcje})</button>
    </div>` : ''}
    <h3>Składniki${skaluj ? ` <span class="maly">— przeliczone (${ulamek(m)}×)</span>` : ''}</h3>
    ${ctx ? '<p class="maly" style="margin:0 0 6px">⇄ = zamień składnik tylko w tym planie (np. łosoś → kurczak, ziemniaki → makaron).</p>' : ''}
    <ul class="skladniki">${p.skladniki.map(wiersz).join('')}</ul>
    ${wskazowkiZamian ? `<div class="karta zimno" style="margin-top:10px"><b>Po zamianie:</b><ul style="margin:4px 0 0;padding-left:20px">${wskazowkiZamian}</ul></div>` : ''}
    <h3 style="margin-top:16px">Jak zrobić</h3>
    <ol class="kroki">${p.kroki.map(k => `<li>${esc(k)}</li>`).join('')}</ol>
    ${p.wskazowka ? `<p>💡 ${esc(p.wskazowka)}</p>` : ''}
    ${mroz}
    <h3 style="margin-top:16px">Twoja ocena</h3>
    <div class="oceny">
      <button class="btn ${o.ocena === 1 ? 'wl' : ''}" data-a="ocen" data-id="${id}" data-v="1" aria-label="Smakuje">👍</button>
      <button class="btn ${o.ocena === -1 ? 'wl' : ''}" data-a="ocen" data-id="${id}" data-v="-1" aria-label="Nie smakuje">👎</button>
    </div>
    <label class="pole" for="notatka">Notatka (np. „za suche”, „więcej chili”)</label>
    <textarea id="notatka" data-c="notatka" data-id="${id}">${esc(o.notatka || '')}</textarea>
    ${p.mrozenie ? `<button class="btn zimny szeroki" style="margin-top:12px" data-a="doZamrModal" data-id="${id}">🧊 Dodaj porcje do zamrażarki</button>` : ''}`);
}

function modalZamiana(ctx, orig) {
  const plan = S.plany[ctx.planKey];
  const p = PO_ID[plan.sesje[ctx.sk][ctx.slot].przepisId];
  const s = p.skladniki.find(x => x.nazwa === orig);
  const key = kluczPoz(ctx.sk, ctx.slot);
  const obecna = (plan.zamiany[key] || {})[orig];
  const gr = grupaDla(orig);
  const d = ctxAttr(ctx.planKey, ctx.sk, ctx.slot) + ` data-n="${esc(orig)}"`;
  const opcje = gr ? gr.grupa.opcje.filter(o => o.nazwa !== orig) : [];
  otworzModal(`<h2>Zamień: ${esc(orig)}</h2>
    <p class="maly">W: ${esc(p.nazwa)}. Zmiana dotyczy tylko tego planu, przepis zostaje bez zmian.</p>
    ${opcje.length ? `<h3>${gr.grupa.grupa} — ilość przeliczy się sama</h3>
      <div class="akcje">${opcje.map(o => `<button class="btn ${obecna && obecna.nazwa === o.nazwa ? 'wl' : ''}" data-a="zamien" ${d} data-nowy="${esc(o.nazwa)}">${esc(o.nazwa)}</button>`).join('')}</div>` : ''}
    <h3 style="margin-top:16px">Albo wpisz inny produkt</h3>
    <form class="rzad" data-f="zamienInne" ${d}>
      <input type="text" name="nazwa" list="katalog-z" placeholder="np. indyk" autocomplete="off">
      <button class="btn glowny" style="flex:none">Zamień</button>
    </form>
    <datalist id="katalog-z">${[...KATALOG.keys()].sort((a, b) => a.localeCompare(b, 'pl')).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <p class="maly">Przy wpisanym produkcie ilość zostaje taka sama (${s.ilosc == null ? 'do smaku' : esc(ileTekst(s.ilosc, s.jednostka))}).</p>
    <div class="akcje" style="margin-top:16px">
      <button class="btn" data-a="pominSkl" ${d}>✕ Pomiń ten składnik</button>
      ${obecna ? `<button class="btn" data-a="przywroc" ${d}>↺ Przywróć oryginał</button>` : ''}
      <button class="btn" data-a="wrocDoPrzepisu" ${d}>← Wróć</button>
    </div>`);
}

function modalWyborZamr(planKey, sk, slot, dzien) {
  const plan = S.plany[planKey];
  // jeśli wybierasz z karty „jutro”, a jutro było zmienione — ten dzień wraca do planu, więc liczymy go też
  const wraca = dzien && plan.dni[dzien + '|' + slot] ? 1 : 0;
  const need = (dniAktywne(plan, sk, slot).length + wraca) * S.ustawienia.osoby || S.ustawienia.osoby;
  const it = plan.sesje[sk][slot];
  const lista = S.zamrazarka.filter(z => wolnePorcje(z, plan) >= need && !(it && it.zid === z.id))
    .sort((a, b) => (a.slot === slot ? 0 : 1) - (b.slot === slot ? 0 : 1));
  otworzModal(`<h2>🧊 Nie chce mi się gotować</h2>
    <p class="maly">${SLOT_NAZWA[slot]} na: ${SESJE[sk].dni.map(d => DNI_NAZWY[d]).join(' + ')} — potrzeba ${porcjiTekst(need)}.</p>
    <div class="karta">${lista.map(z => `<div class="wiersz"><div class="rozciag"><b>${esc(z.nazwa)}</b><div class="meta">${SLOT_NAZWA[z.slot]} · wolne: ${wolnePorcje(z, plan)} porc.</div></div>
      <button class="btn zimny" data-a="ustawZamr" ${ctxAttr(planKey, sk, slot, dzien)} data-zid="${z.id}">Wybierz</button></div>`).join('')
      || `<p class="pusto">W zamrażarce nie ma dania z ${porcjiTekst(need)}.<br>Gdy ugotujesz coś, co się mrozi (❄️), odhacz „Ugotowane” — nadwyżka trafi do zamrażarki. Możesz też dodać ręcznie w Produkty → Zamrażarka.</p>`}</div>`);
}

function modalWybierzPrzepis(planKey, sk, slot, dzien) {
  const plan = S.plany[planKey];
  const it = plan.sesje[sk][slot];
  const lista = PRZEPISY.filter(p => p.slot === slot && ocena(p.id) !== -1).sort((a, b) => ocena(b.id) - ocena(a.id) || a.nazwa.localeCompare(b.nazwa, 'pl'));
  const wPlanie = idsWPlanie(plan);
  otworzModal(`<h2>📖 Wybierz: ${SLOT_NAZWA[slot]}</h2>
    <p class="maly">${SESJE[sk].nazwa} → na ${SESJE[sk].dni.map(d => DNI_KROTKO[d]).join('–')}</p>
    ${lista.map(p => `<button class="karta przepis-karta" data-a="ustawPrzepis" ${ctxAttr(planKey, sk, slot, dzien)} data-id="${p.id}">
      <b>${esc(p.nazwa)}</b> ${ocena(p.id) === 1 ? '👍' : ''}${it && it.przepisId === p.id ? ' <span class="znaczek ok">teraz</span>' : wPlanie.has(p.id) ? ' <span class="znaczek">już w tym tygodniu</span>' : ''}
      <div class="meta">${p.tagi.bialko.join(', ')} · ${p.tagi.kuchnia}</div>
      <div class="meta">${metaPrzepisu(p)}</div></button>`).join('')}`);
}

// Menu ⋯ przy daniu. dzien = otwarte z karty „jutro” (wtedy ten dzień pokazujemy jako pierwszy)
function modalMenu(c) {
  const plan = S.plany[c.planKey];
  const ses = SESJE[c.sk];
  const it = plan.sesje[c.sk][c.slot];
  const inf = infoPozycji(it);
  const dniTxt = ses.dni.map(d => DNI_KROTKO[d]).join('–');
  const nadp = c.dzien && plan.dni[c.dzien + '|' + c.slot];
  const attr = ctxAttr(c.planKey, c.sk, c.slot, c.dzien);
  const btn = (a, tekst, extra = '') => `<button class="menu-btn" data-a="${a}" ${attr} ${extra}>${tekst}</button>`;
  const dniKolejno = c.dzien ? [c.dzien, ...ses.dni.filter(d => d !== c.dzien)] : ses.dni;
  const zakresy = (a, ikona, tekst) => ses.dni.length === 1
    ? btn(a, `${ikona} ${tekst}`, 'data-zakres="wszystkie"')
    : dniKolejno.map(d => btn(a, `${ikona} ${tekst} — tylko ${DNI_NAZWY[d]}`, `data-zakres="${d}"`)).join('') + btn(a, `${ikona} ${tekst} — ${dniTxt}`, 'data-zakres="wszystkie"');

  let h = `<h2>${SLOT_NAZWA[c.slot]} · ${c.dzien ? DNI_NAZWY[c.dzien] : 'na ' + dniTxt}</h2>
    <p class="maly">Teraz: ${esc(opisKrotki(nadp || it))}</p>`;
  if (nadp) h += `<div class="menu">${btn('przywrocDzien', `↺ Przywróć: ${esc(opisKrotki(it))}`)}</div>`;
  h += `<h3>Zmień danie <span class="maly">(gotowanie na ${dniTxt})</span></h3><div class="menu">
    ${btn('wybierzPrzepis', '📖 Wybierz z przepisów')}
    ${btn('losuj', '🎲 Wylosuj inne')}
    ${btn('wybierzZamr', '🧊 Z zamrażarki — nie chce mi się gotować')}
    ${inf && inf.p && !inf.zamr ? btn('przepis', '📄 Przepis i ⇄ zmiana składników', `data-id="${inf.p.id}"`) : ''}
  </div>
  <h3>Coś innego</h3><div class="menu">
    ${btn('wlasneModal', '✍️ Coś własnego / resztki')}
    ${zakresy('pomin', '⏭', 'Pomiń')}
  </div>`;
  otworzModal(h);
}

function modalWlasne(c) {
  const ses = SESJE[c.sk];
  const dniKolejno = c.dzien ? [c.dzien, ...ses.dni.filter(d => d !== c.dzien)] : ses.dni;
  const dniTxt = ses.dni.map(d => DNI_KROTKO[d]).join('–');
  const szybkie = ['Resztki z obiadu', 'Kanapki', 'Coś kupionego', 'Jogurt i owoce', 'Jajka na twardo'];
  const przyciski = ses.dni.length === 1
    ? `<button class="btn glowny szeroki" name="zakres" value="wszystkie">Zapisz</button>`
    : dniKolejno.map(d => `<button class="btn glowny szeroki" name="zakres" value="${d}" style="margin-top:8px">Tylko ${DNI_NAZWY[d]}</button>`).join('')
      + `<button class="btn szeroki" name="zakres" value="wszystkie" style="margin-top:8px">Oba dni (${dniTxt})</button>`;
  otworzModal(`<h2>✍️ Coś własnego</h2>
    <form data-f="wlasneDanie" ${ctxAttr(c.planKey, c.sk, c.slot, c.dzien)}>
      <input type="text" name="nazwa" id="wl-nazwa" placeholder="np. resztki makaronu z obiadu" autocomplete="off">
      <div class="akcje">${szybkie.map(s => `<button type="button" class="btn maly-btn" data-a="wpisz" data-v="${s}">${s}</button>`).join('')}</div>
      <div style="margin-top:12px">${przyciski}</div>
    </form>`);
}

function modalDoZamr(id) {
  const p = PO_ID[id];
  otworzModal(`<h2>🧊 ${esc(p.nazwa)}</h2>
    <form data-f="dodajZamrPrzepis" data-id="${id}">
      <label class="pole" for="m-porcje">Ile porcji wkładasz?</label>
      <input id="m-porcje" type="number" name="porcje" min="1" value="${p.porcje}" inputmode="numeric">
      <button class="btn glowny szeroki" style="margin-top:12px">Dodaj do zamrażarki</button>
    </form>`);
}

// ---------- Zamrażarka: operacje ----------
function dodajDoZamrazarki({ nazwa, przepisId, slot, porcje }) {
  const istn = przepisId && S.zamrazarka.find(z => z.przepisId === przepisId);
  if (istn) istn.porcje += porcje;
  else S.zamrazarka.push({ id: nowyId(), nazwa, przepisId: przepisId || null, slot, porcje, dodano: isoData(dzis()) });
  zapisz();
}
function zmienPorcje(zid, d) {
  const z = S.zamrazarka.find(x => x.id === zid);
  if (!z) return;
  z.porcje += d;
  if (z.porcje <= 0) S.zamrazarka = S.zamrazarka.filter(x => x.id !== zid);
  zapisz();
}

// ---------- Pliki ----------
async function zapiszPlik(nazwa, dane) {
  const tekst = JSON.stringify(dane, null, 2);
  const plik = new File([tekst], nazwa, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [plik] })) {
      await navigator.share({ files: [plik], title: nazwa });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(plik);
  const a = Object.assign(document.createElement('a'), { href: url, download: nazwa });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function eksportDlaClaude() {
  const oceny = Object.entries(S.oceny)
    .filter(([, o]) => o.ocena || (o.notatka || '').trim())
    .map(([id, o]) => ({ id, nazwa: PO_ID[id] ? PO_ID[id].nazwa : id, ocena: o.ocena === 1 ? '👍' : o.ocena === -1 ? '👎' : '—', notatka: o.notatka || '' }));
  zapiszPlik(`dla-claude-${isoData(dzis())}.json`, {
    eksport: new Date().toISOString(),
    ustawienia: S.ustawienia,
    oceny,
    notatki: S.notatki.map(n => ({ typ: TYPY_NOTATEK[n.typ] || n.typ, tekst: n.tekst, data: n.data })),
    produkty: S.produkty.map(p => ({ nazwa: p.nazwa, staly: p.zawsze, konczySie: p.konczySie })),
    zamrazarka: S.zamrazarka.map(z => ({ nazwa: z.nazwa, porcje: z.porcje, od: z.dodano })),
  });
}

// ---------- Akcje (kliknięcia) ----------
const planDo = el => S.plany[el.dataset.plan];
const ctxZ = el => ({ planKey: el.dataset.plan, sk: el.dataset.sk, slot: el.dataset.slot, dzien: el.dataset.dzien });

// Zmiana danie na jeden dzień (zakres = 'cz') albo na całe gotowanie (zakres = 'wszystkie')
function ustawWZakresie(c, zakres, item) {
  const plan = S.plany[c.planKey];
  if (zakres === 'wszystkie') {
    plan.sesje[c.sk][c.slot] = item;
    resetPozycji(plan, kluczPoz(c.sk, c.slot));
    for (const d of SESJE[c.sk].dni) delete plan.dni[d + '|' + c.slot];
  } else {
    plan.dni[zakres + '|' + c.slot] = item;
  }
  zapisz(); zamknijModal(); render();
}
// Gdy zmieniasz danie gotowania z karty „jutro”, ten dzień wraca do wspólnego dania
const wyczyscDzien = el => { if (el.dataset.dzien) delete planDo(el).dni[el.dataset.dzien + '|' + el.dataset.slot]; };

function ustawZamiane(el, z) {
  const ctx = ctxZ(el);
  const plan = S.plany[ctx.planKey];
  const key = kluczPoz(ctx.sk, ctx.slot);
  const zam = plan.zamiany[key] || (plan.zamiany[key] = {});
  if (z) zam[el.dataset.n] = z; else delete zam[el.dataset.n];
  if (!Object.keys(zam).length) delete plan.zamiany[key];
  zapisz(); render();
  modalPrzepis(plan.sesje[ctx.sk][ctx.slot].przepisId, ctx);
}

const AKCJE = {
  zamknij: () => zamknijModal(),
  przepis: el => modalPrzepis(el.dataset.id, el.dataset.plan ? { ...ctxZ(el), cale: !!el.dataset.cale } : null),
  tydzien: el => { ui.tydzien = +el.dataset.v; render(); },
  losuj: el => {
    const plan = planDo(el), { sk, slot } = el.dataset;
    const obecny = plan.sesje[sk][slot];
    const wyklucz = idsWPlanie(plan);
    if (obecny && obecny.przepisId) wyklucz.add(obecny.przepisId);
    const p = wybierzPrzepis(slot, wyklucz, ostatnioUzyte(zIso(el.dataset.plan)), { szybkie: sk === 'nd' });
    if (p) plan.sesje[sk][slot] = { typ: 'przepis', przepisId: p.id };
    resetPozycji(plan, kluczPoz(sk, slot));
    wyczyscDzien(el);
    zapisz(); zamknijModal(); render();
    if (p) toast('🎲 ' + p.nazwa);
  },
  wybierzPrzepis: el => modalWybierzPrzepis(el.dataset.plan, el.dataset.sk, el.dataset.slot, el.dataset.dzien),
  ustawPrzepis: el => {
    const plan = planDo(el), { sk, slot } = el.dataset;
    plan.sesje[sk][slot] = { typ: 'przepis', przepisId: el.dataset.id };
    resetPozycji(plan, kluczPoz(sk, slot));
    wyczyscDzien(el);
    zapisz(); zamknijModal(); render();
  },
  wybierzZamr: el => modalWyborZamr(el.dataset.plan, el.dataset.sk, el.dataset.slot, el.dataset.dzien),
  ustawZamr: el => {
    const plan = planDo(el), z = S.zamrazarka.find(x => x.id === el.dataset.zid);
    if (!z) return;
    plan.sesje[el.dataset.sk][el.dataset.slot] = pozycjaZZamrazarki(z);
    resetPozycji(plan, kluczPoz(el.dataset.sk, el.dataset.slot));
    wyczyscDzien(el);
    zapisz(); zamknijModal(); render(); toast('🧊 Zamienione — pamiętaj wyjąć wieczorem');
  },
  menu: el => modalMenu(ctxZ(el)),
  wlasneModal: el => modalWlasne(ctxZ(el)),
  wpisz: el => { const i = document.getElementById('wl-nazwa'); i.value = el.dataset.v; i.focus(); },
  pomin: el => { ustawWZakresie(ctxZ(el), el.dataset.zakres, { typ: 'pomin' }); toast('⏭ Pominięte'); },
  przywrocDzien: el => { delete planDo(el).dni[el.dataset.dzien + '|' + el.dataset.slot]; zapisz(); zamknijModal(); render(); },
  zamianaModal: el => modalZamiana(ctxZ(el), el.dataset.n),
  zamien: el => {
    const plan = planDo(el);
    const p = PO_ID[plan.sesje[el.dataset.sk][el.dataset.slot].przepisId];
    const s = p.skladniki.find(x => x.nazwa === el.dataset.n);
    ustawZamiane(el, zamianaZGrupy(s, el.dataset.nowy));
  },
  pominSkl: el => ustawZamiane(el, { pomin: true }),
  przywroc: el => ustawZamiane(el, null),
  wrocDoPrzepisu: el => modalPrzepis(planDo(el).sesje[el.dataset.sk][el.dataset.slot].przepisId, ctxZ(el)),
  nowyPlan: el => {
    if (!confirm('Wylosować cały tydzień od nowa? Zmiany, odhaczenia i zakupy z tego tygodnia się wyzerują.')) return;
    delete S.plany[el.dataset.plan];
    planTygodnia(zIso(el.dataset.plan));
    render();
  },
  wyjmij: el => {
    planDo(el).wyjete[el.dataset.klucz] = true;
    zmienPorcje(el.dataset.zid, -S.ustawienia.osoby);
    zapisz(); render(); toast('Wyjęte — smacznego jutro!');
  },
  // W poniedziałek: lista na cały tydzień; w środę: tylko dokupienie na czw–pt
  idzZakupy: el => { ui.zakupyTydzien = 0; ui.zakupyFiltr = el.dataset.sk === 'sr' ? 'sr' : 'all'; location.hash = '#zakupy'; },
  zakupyTydzien: el => { ui.zakupyTydzien = +el.dataset.v; render(); },
  zakupyFiltr: el => { ui.zakupyFiltr = el.dataset.v; render(); },
  odznacz: el => { planDo(el).zakupy.all = {}; zapisz(); render(); },
  koniecZakupow: el => {
    const plan = planDo(el);
    const zazn = plan.zakupy.all;
    let n = 0;
    for (const key of Object.keys(zazn)) {
      const [typ, reszta] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      if (typ === 'k' || typ === 'kon') { dodajProdukt(reszta); n++; }
      else if (typ === 'wl') {
        const w = plan.wlasne.all.find(x => x.id === reszta);
        if (w) { dodajProdukt(w.nazwa); n++; }
        plan.wlasne.all = plan.wlasne.all.filter(x => x.id !== reszta);
      }
    }
    plan.zakupy.all = {};
    zapisz(); render(); toast(`🏠 Dodano do Produktów: ${n}`);
  },
  mam: (el, e) => { e.preventDefault(); dodajProdukt(el.dataset.n); zapisz(); render(); toast(`🏠 ${el.dataset.n} — w Produktach`); },
  usunWlasne: (el, e) => {
    e.preventDefault();
    const plan = planDo(el);
    plan.wlasne.all = plan.wlasne.all.filter(w => w.id !== el.dataset.id);
    zapisz(); render();
  },
  produktySeg: el => { ui.produktySeg = el.dataset.v; if (location.hash === '#zamrazarka') location.hash = '#produkty'; else render(); },
  prodZawsze: el => { const p = S.produkty.find(x => x.id === el.dataset.id); p.zawsze = !p.zawsze; zapisz(); render(); },
  prodKonczy: el => {
    const p = S.produkty.find(x => x.id === el.dataset.id);
    p.konczySie = !p.konczySie; zapisz(); render();
    if (p.konczySie) toast(`🛒 ${p.nazwa} — na liście zakupów`);
  },
  prodUsun: el => { S.produkty = S.produkty.filter(x => x.id !== el.dataset.id); zapisz(); render(); },
  porcje: el => { zmienPorcje(el.dataset.id, +el.dataset.d); render(); },
  filtr: el => { ui.filtrSlot = el.dataset.v; render(); },
  ocen: el => {
    const id = el.dataset.id, v = +el.dataset.v;
    const o = S.oceny[id] || (S.oceny[id] = { ocena: 0, notatka: '' });
    o.ocena = o.ocena === v ? 0 : v;
    zapisz();
    modalPrzepis(id, ui.modalCtx);
    render();
    toast(o.ocena === 1 ? '👍 Będzie częściej' : o.ocena === -1 ? '👎 Znika z rotacji' : 'Ocena usunięta');
  },
  doZamrModal: el => modalDoZamr(el.dataset.id),
  usunNotatke: el => {
    if (!confirm('Usunąć notatkę?')) return;
    S.notatki = S.notatki.filter(n => n.id !== el.dataset.id); zapisz(); render();
  },
  osoby: el => { S.ustawienia.osoby = +el.dataset.v; zapisz(); render(); },
  eksport: () => eksportDlaClaude(),
  eksportCalosci: () => zapiszPlik(`jedzenie-kopia-${isoData(dzis())}.json`, S),
  reset: () => {
    if (!confirm('Na pewno usunąć oceny, notatki, produkty, zamrażarkę i plany z tego telefonu?')) return;
    S = domyslnyStan(); zapisz(); render(); toast('Wyczyszczone');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const f = AKCJE[el.dataset.a];
  if (f) f(el, e);
});

document.addEventListener('change', e => {
  const el = e.target;
  const c = el.dataset.c;
  if (c === 'kup') {
    const plan = planDo(el);
    const z = plan.zakupy.all;
    if (el.checked) z[el.dataset.key] = true; else delete z[el.dataset.key];
    zapisz(); render();
  } else if (c === 'ugot') {
    oznaczUgotowane(el.dataset.plan, el.dataset.sk, el.dataset.slot, el.checked);
  } else if (c === 'ust') {
    S.ustawienia[el.dataset.k] = el.checked; zapisz(); render();
  } else if (c === 'notatka') {
    const o = S.oceny[el.dataset.id] || (S.oceny[el.dataset.id] = { ocena: 0, notatka: '' });
    o.notatka = el.value; zapisz(); toast('Notatka zapisana');
  } else if (c === 'import') {
    const plik = el.files[0];
    if (!plik) return;
    plik.text().then(t => {
      const d = JSON.parse(t);
      if (!d || !d.wersja || !d.ustawienia || !d.plany) throw new Error('zły plik');
      if (!confirm('Zastąpić obecne dane kopią z pliku?')) return;
      S = migruj(d);
      zapisz(); render(); toast('Kopia wczytana');
    }).catch(() => toast('To nie jest plik kopii z tej aplikacji'));
  }
});

document.addEventListener('input', e => {
  if (e.target.dataset.c === 'szukaj') {
    ui.szukaj = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const nowy = document.querySelector('[data-c="szukaj"]');
    nowy.focus(); nowy.setSelectionRange(pos, pos);
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  if (!f.dataset.f) return;
  e.preventDefault();
  const dane = Object.fromEntries(new FormData(f));
  const rodzaj = f.dataset.f;
  if (rodzaj === 'dodajWlasne') {
    const nazwa = (dane.nazwa || '').trim();
    if (!nazwa) return;
    S.plany[f.dataset.plan].wlasne.all.push({ id: nowyId(), nazwa });
    zapisz(); render();
  } else if (rodzaj === 'wlasneDanie') {
    const nazwa = (dane.nazwa || '').trim();
    if (!nazwa) { toast('Wpisz, co będzie'); return; }
    const zakres = (e.submitter && e.submitter.value) || 'wszystkie';
    ustawWZakresie(ctxZ(f), zakres, { typ: 'wlasne', nazwa });
    toast('✍️ ' + nazwa);
  } else if (rodzaj === 'dodajProdukty') {
    const nazwy = String(dane.nazwy || '').split(/[,;\n]+/).map(normNazwa).filter(Boolean);
    if (!nazwy.length) return;
    nazwy.forEach(dodajProdukt);
    zapisz(); render(); toast(`🏠 Dodano: ${nazwy.join(', ')}`);
  } else if (rodzaj === 'zamienInne') {
    const nazwa = normNazwa(dane.nazwa);
    if (!nazwa) return;
    const plan = S.plany[f.dataset.plan];
    const p = PO_ID[plan.sesje[f.dataset.sk][f.dataset.slot].przepisId];
    const s = p.skladniki.find(x => x.nazwa === f.dataset.n);
    const zGrupy = zamianaZGrupy(s, nazwa);
    ustawZamiane(f, zGrupy || { nazwa, ilosc: s.ilosc, jednostka: s.jednostka, kategoria: KATALOG.get(nazwa) || s.kategoria });
  } else if (rodzaj === 'dodajNotatke') {
    const tekst = (dane.tekst || '').trim();
    if (!tekst) return;
    S.notatki.push({ id: nowyId(), typ: dane.typ, tekst, data: isoData(dzis()) });
    zapisz(); render(); toast('📝 Zapisane');
  } else if (rodzaj === 'dodajZamr') {
    const porcje = Math.max(1, parseInt(dane.porcje, 10) || 1);
    const p = PO_ID[dane.przepis];
    if (p) dodajDoZamrazarki({ nazwa: p.nazwa, przepisId: p.id, slot: p.slot, porcje });
    else {
      const nazwa = (dane.nazwa || '').trim();
      if (!nazwa) { toast('Wpisz nazwę dania'); return; }
      dodajDoZamrazarki({ nazwa, przepisId: null, slot: dane.slot, porcje });
    }
    render(); toast('🧊 Dodane');
  } else if (rodzaj === 'dodajZamrPrzepis') {
    const p = PO_ID[f.dataset.id];
    const porcje = Math.max(1, parseInt(dane.porcje, 10) || 1);
    dodajDoZamrazarki({ nazwa: p.nazwa, przepisId: p.id, slot: p.slot, porcje });
    zamknijModal(); render(); toast(`🧊 +${porcjiTekst(porcje)}`);
  }
});

let toastTimer;
function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Start ----------
window.addEventListener('hashchange', () => { zamknijModal(); render(); });

fetch('przepisy.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => { zaladujDane(d); render(); })
  .catch(() => {
    document.getElementById('app').innerHTML = '<p class="pusto">Nie udało się wczytać przepisów. Jeśli otwierasz plik z dysku, uruchom serwer: <code>python3 -m http.server</code></p>';
  });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
