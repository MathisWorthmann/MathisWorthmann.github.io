/* =====================================================================
   Hidden Waypoint: Opening-Sequenz (Version 3)
   Aenderungen nur an den Tokens SCHRIFT und FARBE, siehe CLAUDE.md.
   Laeuft synchron zur Opening-Fassung der Dienstmeldung (Erzaehler_Intro_Opening.mp3,
   1,2 s Vorlauf, -16 LUFS). Die Aufnahme startet der Aufrufer im Tap auf "Jetzt aktivieren".

   Einbindung:  ton.play();
                var seq = HWOpening.starte(container, {
                  onFertig: fn,
                  zeitQuelle: function () { return ton.currentTime; }
                });
                seq.stopp() raeumt alles wieder ab.
   Optionen:    zeitQuelle()      Abspielposition der Aufnahme in Sekunden (ohne: eigene Uhr)
                takt              ueberschreibt einzelne Werte aus TAKT_STANDARD
                onFertig()        nach "Zum Dienst melden" oder "Ueberspringen"
                onCue(name)       Sound-Haken: danger, stoerung, sichtung, stempel, uebernahme, titel
                stoerung:false    schaltet die Hacker-Stoerungen ab
                statusleiste:false  ohne eigene Statusleiste (falls die App ihre zeigt)
                safeArea:false    Notch-Abstaende ignorieren (nur fuer eingebettete Vorschau)
                datum             Date-Objekt fuer Akte, Stempel, Uhr und Statusleiste (Standard: jetzt)
                startZeit, standbild   nur zum Testen einzelner Szenen
   ===================================================================== */
(function (global) {
  'use strict';

  // ---------- Gestaltungs-Tokens, aus den App-Screens abgelesen ----------
  var FARBE = {
    grund: '#0B1526', panel: '#101E33', panelHell: '#16304E', tief: '#0A1220', linie: '#293A53',
    cyan: '#5CC8FF', hell: '#FCFCFC', text: '#C9D7E8', leise: '#8FA6C4', gruen: '#7BE0A3',
    hackGrund: '#170712', hackPanel: '#290B1A', hackLinie: '#5A1730', pink: '#FF2E63', magenta: '#FF2BD6',
    hackText: '#E9C4D8', hackLeise: '#B0688A', kanal: '#2DD4C8', klebeText: '#210915',
    karteGrund: '#00011A', strasse: '#014D7A', hauptstrasse: '#143169', fluss: '#1AB1E4', park: '#0A3138',
    route: '#F43776', blende: '#3A4E68', schwarz: '#000000'
  };
  var SCHRIFT = {
    display: '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  };

  // Sprechtakt der Opening-Fassung in Sekunden. Satzanfaenge aus den Pausen der Aufnahme gemessen,
  // Wortpositionen ueber Silbenkerne geschaetzt (Genauigkeit etwa eine Zehntelsekunde).
  var TAKT_STANDARD = {
    s1: 1.25, ganove: 4.3, doktor: 5.1, unwesen: 6.38,        // Seit geraumer Zeit ... Dr. Danger | sein Unwesen ...
    s2: 9.66, sicherheit: 14.25,                              // Bisher konnte ihm niemand ...
    s3: 16.31, bogen: 17.9, regelrecht: 19.7, einsatz: 20.55, spielen: 22.05,
    s4: 23.76,                                                // Das koennen wir gar nicht gebrauchen.
    s5: 26.96, gesichtet: 29.4,                               // Und nun wurde er ... gesichtet.
    s6: 30.99, heute: 31.7,                                   // Ausgerechnet heute.
    s7: 33.79, kultur: 35.5, gaeste: 38.5,                    // Denn heute ist eine grosse Kulturveranstaltung ...
    s8: 40.37, danger2: 45.4, stoert: 47.5,                   // Nicht auszumalen ... stoert.
    s9: 49.37, team: 52.7,                                    // Es gilt also keine Zeit zu verlieren ...
    s10: 55.64, spur: 59.55,                                  // Meldet euch zum Dienst ...
    ende: 61.05
  };
  // Sichtung: Volkswagen Halle, Europaplatz 1 (52.2578 N, 10.5194 O)
  var SICHTUNG_TEXT = '52,258° N\u200210,519° O';

  var RB = 390, RH = 720, LEISTE = 34;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var STERN4 = 'M0,-13 L2.6,-2.6 L13,0 L2.6,2.6 L0,13 L-2.6,2.6 L-13,0 L-2.6,-2.6 Z';
  var instanz = 0;

  // ---------- Mathe und Easing ----------
  function klemme(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function fort(t, a, b) { return b <= a ? (t >= a ? 1 : 0) : klemme((t - a) / (b - a), 0, 1); }
  function mix(a, b, p) { return a + (b - a) * p; }
  var E = {
    aus2: function (p) { return 1 - (1 - p) * (1 - p); },
    aus3: function (p) { return 1 - Math.pow(1 - p, 3); },
    aus4: function (p) { return 1 - Math.pow(1 - p, 4); },
    ein2: function (p) { return p * p; },
    ein3: function (p) { return p * p * p; },
    einAus3: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    einAusSin: function (p) { return -(Math.cos(Math.PI * p) - 1) / 2; },
    zurueck: function (p) { var c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  };
  function zufall(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function zwei(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- DOM ----------
  function setze(e, attrs) {
    if (!attrs) return;
    for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
  }
  function el(tag, attrs, eltern) { var e = document.createElement(tag); setze(e, attrs); if (eltern) eltern.appendChild(e); return e; }
  function sv(tag, attrs, eltern) { var e = document.createElementNS(SVGNS, tag); setze(e, attrs); if (eltern) eltern.appendChild(e); return e; }

  // ---------- Formen ----------
  // Dr. Danger als Scherenschnitt: Fuesse bei (0,0), Hoehe 200
  function figurDanger(eltern, farbe) {
    var g = sv('g', { fill: farbe }, eltern);
    sv('path', { d: 'M-15,-176 L-13,-194 L-4,-199 L2,-195 L9,-200 L15,-194 L17,-176 Z' }, g);
    sv('path', { d: 'M-31,-171 L30,-178 L32,-174 L-29,-167 Z' }, g);
    sv('path', { d: 'M-12,-169 L14,-172 L14,-157 L8,-147 L-7,-146 L-12,-156 Z' }, g);
    sv('path', { d: 'M-21,-161 L-8,-141 L8,-141 L21,-163 L28,-140 L37,-55 L-35,-53 L-29,-140 Z' }, g);
    sv('path', { d: 'M-21,-56 L-10,-56 L-13,-4 L-24,-4 Z M6,-56 L17,-56 L23,-4 L12,-4 Z' }, g);
    sv('path', { d: 'M-31,-5 L-11,-5 L-11,0 L-31,0 Z M10,-5 L29,-5 L30,0 L10,0 Z' }, g);
    return g;
  }
  // Bueste mit Hut, Kragen und runder Brille (Koordinaten im 390er Rahmen)
  function baueBueste(eltern, f) {
    var gr = sv('g', {}, eltern);
    var koerper = sv('g', { fill: f.koerper }, gr);
    sv('path', { d: 'M-90,1300 L-90,566 L40,490 L150,430 L236,452 L322,428 L440,494 L480,1300 Z' }, koerper);
    sv('path', { d: 'M172,236 L182,180 L204,160 L236,170 L268,158 L294,168 L306,190 L312,236 Z' }, koerper);
    sv('path', { d: 'M116,264 Q236,226 356,244 Q362,252 352,258 Q236,244 126,274 Q110,272 116,264 Z' }, koerper);
    sv('path', { d: 'M186,256 L290,252 Q296,300 286,334 Q270,372 236,380 Q200,372 190,336 Q182,300 186,256 Z' }, koerper);
    var revers = sv('g', { fill: f.koerper, stroke: f.schnitt, 'stroke-width': 3, 'stroke-linejoin': 'round' }, gr);
    sv('path', { d: 'M146,434 L166,298 L206,354 L228,448 Z' }, revers);
    sv('path', { d: 'M326,432 L306,294 L266,354 L244,448 Z' }, revers);
    var brille = sv('g', { fill: f.brille }, gr);
    sv('circle', { cx: 214, cy: 304, r: 17 }, brille);
    sv('circle', { cx: 260, cy: 302, r: 17 }, brille);
    sv('rect', { x: 229, y: 300, width: 16, height: 4 }, brille);
    var glanz = sv('path', { d: STERN4, fill: '#FFFFFF', transform: 'scale(0)' }, gr);
    return { g: gr, brille: brille, glanz: glanz };
  }
  // Spielfigur: Fuss bei (0,0)
  function spielfigur(eltern, farbe) {
    var g = sv('g', { fill: farbe }, eltern);
    sv('path', { d: 'M-24,0 L24,0 L22,-10 L-22,-10 Z M-17,-10 Q-9,-28 -7,-50 L7,-50 Q9,-28 17,-10 Z' }, g);
    sv('ellipse', { cx: 0, cy: -52, rx: 12.5, ry: 4.5 }, g);
    sv('circle', { cx: 0, cy: -68, r: 15 }, g);
    return g;
  }
  function polizeifigur(eltern) {
    var h = sv('g', {}, eltern);
    spielfigur(h, FARBE.cyan);
    sv('path', { d: 'M-15,-80 L15,-80 L18,-90 Q0,-95 -18,-90 Z', fill: FARBE.tief }, h);
    sv('path', { d: 'M-15,-81 L17,-81 L21,-77 L-11,-77 Z', fill: FARBE.tief }, h);
    sv('path', { d: sternPfad(0, -29, 6.5), fill: FARBE.grund }, h);
    return h;
  }
  function sternPfad(cx, cy, r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r, w = -Math.PI / 2 + i * Math.PI / 5;
      d += (i ? 'L' : 'M') + (cx + rr * Math.cos(w)).toFixed(2) + ',' + (cy + rr * Math.sin(w)).toFixed(2);
    }
    return d + 'Z';
  }
  function keil(r, a0, a1) {
    var p = Math.PI / 180;
    return 'M0,0 L' + (r * Math.cos(a0 * p)).toFixed(1) + ',' + (r * Math.sin(a0 * p)).toFixed(1) +
      ' A' + r + ',' + r + ' 0 0 1 ' + (r * Math.cos(a1 * p)).toFixed(1) + ',' + (r * Math.sin(a1 * p)).toFixed(1) + ' Z';
  }

  function starte(wurzel, opt) {
    opt = opt || {};
    var uid = 'hwo' + (++instanz);
    var RM = opt.reduziert === true || !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var stoerungAn = opt.stoerung !== false;
    var mitLeiste = opt.statusleiste !== false;
    var datum = opt.datum || new Date();
    var datumLang = datum.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    var TAKT = {}, k;
    for (k in TAKT_STANDARD) TAKT[k] = TAKT_STANDARD[k];
    if (opt.takt) for (k in opt.takt) TAKT[k] = opt.takt[k];

    // Szenenstarts leiten sich aus dem Sprechtakt ab
    var START = {
      stadt: 0, name: TAKT.doktor - 0.08, akte: TAKT.s2 - 0.35, spiel: TAKT.s3 - 0.35,
      sichtung: TAKT.s5 - 0.35, lage: TAKT.s7 - 0.35, zeit: TAKT.s9 - 0.3, titel: TAKT.s10 - 0.35
    };
    var KNOPF_AB = TAKT.ende - 0.5;
    // Hacker-Stoerungen, von dezent bis deutlich (Szenenindex, Staerke)
    var STOER = [
      { a: TAKT.spielen - 0.15, b: TAKT.spielen + 0.6, sz: 3, st: 1 },
      { a: TAKT.stoert - 0.1, b: TAKT.stoert + 0.75, sz: 5, st: 2 },
      { a: TAKT.ende + 1.6, b: TAKT.ende + 1.85, sz: 7, st: 0.5 }
    ];
    // Zeitraeume, in denen die Statusleiste "Uebernommen" meldet
    var UEBERNOMMEN = [[STOER[0].a, STOER[0].b], [TAKT.danger2 + 0.55, START.zeit], [STOER[2].a, STOER[2].b]];
    var CUES = [
      { t: START.name, n: 'danger' },
      { t: STOER[0].a, n: 'stoerung' },
      { t: TAKT.gesichtet, n: 'sichtung' },
      { t: TAKT.heute, n: 'stempel' },
      { t: STOER[1].a, n: 'uebernahme' },
      { t: START.titel, n: 'titel' }
    ];

    var KOEPFE = [], SZ = [];
    var VB = { x0: 0, y0: 0, x1: RB, y1: RH };
    var t = Math.max(0, opt.startZeit || 0), seitStart = 0, letzte = null, laeuft = true, beendet = false, raf = 0, ro = null;
    var quelle = typeof opt.zeitQuelle === 'function' && !opt.standbild ? opt.zeitQuelle : null, qLetzt = 0, qStill = 0;
    var cueIdx = 0;
    while (cueIdx < CUES.length && CUES[cueIdx].t < t) cueIdx++;

    function bw(lt, a, b, ease) { if (RM) return lt >= a ? 1 : 0; return (ease || E.aus3)(fort(lt, a, b)); }
    function stil(e, p, w) { var c = e.__hws || (e.__hws = {}); if (c[p] !== w) { c[p] = w; e.style[p] = w; } }
    function attr(e, n, w) { var c = e.__hwa || (e.__hwa = {}); if (c[n] !== w) { c[n] = w; e.setAttribute(n, w); } }

    // ---------- Geruest ----------
    var root = el('div', { class: 'hw-opening hw-laedt', role: 'region', 'aria-label': 'Opening-Sequenz' }, wurzel);
    root.style.setProperty('--hw-display', SCHRIFT.display);
    root.style.setProperty('--hw-mono', SCHRIFT.mono);
    var defsSvg = sv('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }, root);
    defsSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    var defs = sv('defs', {}, defsSvg);
    var pRaster = sv('pattern', { id: uid + '-raster', width: 39, height: 39, patternUnits: 'userSpaceOnUse' }, defs);
    sv('path', { d: 'M39,0 L0,0 L0,39', fill: 'none', stroke: FARBE.cyan, 'stroke-opacity': 0.065, 'stroke-width': 1 }, pRaster);
    var pBlende = sv('pattern', { id: uid + '-blende', width: 36, height: 36, patternUnits: 'userSpaceOnUse' }, defs);
    sv('rect', { width: 36, height: 36, fill: FARBE.grund }, pBlende);
    sv('path', { d: 'M36,0 L0,0 L0,36', fill: 'none', stroke: '#16263D', 'stroke-width': 1 }, pBlende);
    var rahmen = el('div', { class: 'hw-rahmen' }, root);

    function neueSzene(grund, wisch, start, mitRaster) {
      var d = el('div', { class: 'hw-szene' }, rahmen);
      el('div', { class: 'hw-grund' }, d).style.background = grund;
      var g = sv('svg', { class: 'hw-svg', width: RB, height: RH, viewBox: '0 0 ' + RB + ' ' + RH, 'aria-hidden': 'true', focusable: 'false' }, d);
      if (mitRaster) sv('rect', { x: -700, y: -900, width: 1790, height: 2520, fill: 'url(#' + uid + '-raster)' }, g);
      var sz = { div: d, svg: g, wisch: wisch, start: start, sicht: true, clip: false, ziele: [], update: function () {} };
      SZ.push(sz);
      return sz;
    }

    // ---------- Text-Bausteine ----------
    // Kopfzeilen: Barlow Condensed in Versalien, Zeilen gleiten aus einer Maske hoch
    function kopf(eltern, zeilen, o) {
      var box = el('div', { class: 'hw-kopf' }, eltern);
      box.style.top = o.y + 'px';
      box.style.left = (o.x === undefined ? 28 : o.x) + 'px';
      box.style.color = o.farbe;
      box.style.fontSize = (o.fs || 44) + 'px';
      var kk = { box: box, o: o, zeilen: [] };
      zeilen.forEach(function (txt) {
        var m = el('span', { class: 'hw-kz' }, box);
        kk.zeilen.push({ m: m, sp: el('span', { text: txt }, m) });
      });
      KOEPFE.push(kk);
      return kk;
    }
    function passeKopf(kk) {
      var fs = kk.o.fs || 44, max = kk.o.breite || 334, w = 0;
      kk.box.style.fontSize = fs + 'px';
      kk.zeilen.forEach(function (z) { w = Math.max(w, z.sp.offsetWidth); });
      if (w > max) kk.box.style.fontSize = (fs * max / w).toFixed(2) + 'px';
    }
    function kopfZeigen(kk, lt, zeiten, raus) {
      for (var i = 0; i < kk.zeilen.length; i++) {
        var z = kk.zeilen[i], a = zeiten[Math.min(i, zeiten.length - 1)];
        var pin = bw(lt, a, a + 0.55, E.aus4);
        var pout = raus === undefined ? 0 : bw(lt, raus + i * 0.05, raus + i * 0.05 + 0.35, E.ein3);
        var sicht = lt >= a && pout < 1;
        stil(z.m, 'visibility', sicht ? 'visible' : 'hidden');
        if (sicht) stil(z.sp, 'transform', 'translate(0,' + ((1 - pin) * 115 - pout * 115).toFixed(2) + '%)');
      }
    }
    // Labels und Werte in IBM Plex Mono, werden getippt
    function label(eltern, text, o) {
      var e = el('div', { class: o.wert ? 'hw-wert' : 'hw-label' }, eltern);
      e.style.left = (o.x === undefined ? 28 : o.x) + 'px';
      e.style.top = o.y + 'px';
      e.style.color = o.farbe;
      if (o.fs) e.style.fontSize = o.fs + 'px';
      var l = { e: e, txt: el('span', {}, e), cur: el('span', { class: 'hw-cursor' }, e), voll: text, n: -1, blinken: !!o.blinken };
      l.e.style.visibility = 'hidden';
      return l;
    }
    function tippen(l, lt, a, cps) {
      cps = cps || 30;
      var n = lt < a ? 0 : (RM ? l.voll.length : klemme(Math.floor((lt - a) * cps), 0, l.voll.length));
      if (n !== l.n) { l.n = n; l.txt.textContent = l.voll.slice(0, n); }
      stil(l.e, 'visibility', lt >= a ? 'visible' : 'hidden');
      var nach = lt - a - l.voll.length / cps;
      var an = lt >= a && (n < l.voll.length || (l.blinken && !RM && nach < 1.6 && Math.floor(nach * 2.6) % 2 === 1));
      stil(l.cur, 'display', an ? 'inline-block' : 'none');
    }
    // Panel im Stil der App-Karten
    function panel(g, x, y, w, h, akzent) {
      var p = { rect: sv('rect', { x: x, y: y, width: w, height: h, rx: 12, fill: FARBE.panel, stroke: FARBE.linie, 'stroke-width': 1.5 }, g) };
      if (akzent) p.akzent = sv('rect', { x: x + 1, y: y + 14, width: 3, height: h - 28, fill: FARBE.cyan }, g);
      return p;
    }

    // ===== Szene 1: Die Stadt (Seit geraumer Zeit ... der beruehmt-beruechtigte Ganove) =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'unten', dauer: 0.6 }, START.stadt, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      var radar = sv('g', { transform: 'translate(250 400)', opacity: 0 }, g);
      [62, 116, 170].forEach(function (r) { sv('circle', { r: r, fill: 'none', stroke: FARBE.cyan, 'stroke-opacity': 0.22, 'stroke-width': 1.2 }, radar); });
      sv('path', { d: 'M-210,0 L210,0 M0,-210 L0,210', stroke: FARBE.cyan, 'stroke-opacity': 0.14, 'stroke-width': 1 }, radar);
      var sweep = sv('g', {}, radar);
      [0.3, 0.18, 0.1, 0.05].forEach(function (o, i) { sv('path', { d: keil(170, -9 * (i + 1), -9 * i), fill: FARBE.cyan, 'fill-opacity': o }, sweep); });
      var hinten = sv('g', { fill: FARBE.panel }, g);
      sv('path', { d: 'M-90,1300 L-90,470 L26,470 L26,452 L74,452 L74,1300 Z' }, hinten);
      sv('path', { d: 'M174,1300 L174,446 L182,446 L182,406 L190,374 L198,406 L198,446 L206,446 L206,406 L214,374 L222,406 L222,446 L230,446 L230,1300 Z' }, hinten);
      sv('path', { d: 'M280,1300 L280,458 L336,458 L336,474 L370,474 L370,438 L392,438 L392,470 L480,470 L480,1300 Z' }, hinten);
      var vorne = sv('g', {}, g);
      var figurG = sv('g', {}, vorne);
      figurDanger(figurG, FARBE.pink);
      var bauten = sv('g', { fill: FARBE.tief, stroke: FARBE.cyan, 'stroke-width': 1.5 }, vorne);
      [
        'M-90,1300 L-90,520 L2,520 L2,506 L40,506 L40,1300 Z',
        'M40,1300 L40,548 L72,548 L72,1300 Z',
        'M70,1300 L70,432 L85,406 L100,432 L100,446 L118,424 L136,446 L136,432 L151,406 L166,432 L166,1300 Z',
        'M166,1300 L166,500 L197,474 L228,500 L228,1300 Z',
        'M228,1300 L228,378 L232,378 L232,370 L238,370 L238,378 L243,378 L243,370 L249,370 L249,378 L254,378 L254,370 L260,370 L260,378 L264,378 L264,1300 Z',
        'M264,1300 L264,512 L268,512 L268,500 L276,500 L276,488 L284,488 L284,476 L296,476 L296,488 L304,488 L304,500 L312,500 L312,512 L316,512 L316,1300 Z',
        'M316,1300 L316,404 L322,404 L331,300 L340,404 L346,404 L346,1300 Z',
        'M346,1300 L346,526 L394,526 L394,512 L480,512 L480,1300 Z'
      ].forEach(function (d) { sv('path', { d: d }, bauten); });
      var fensterG = sv('g', { fill: FARBE.hell }, vorne);
      var rnd = zufall(42);
      var fenster = [[8,548],[22,548],[8,580],[22,612],[52,582],[52,640],[96,500],[136,520],[110,600],[178,530],[194,530],[210,530],[178,562],[210,594],[194,650],[244,416],[244,452],[244,560],[282,540],[298,540],[290,574],[298,640],[362,556],[378,556],[362,590],[378,660]].map(function (p) {
        return { el: sv('rect', { x: p[0], y: p[1], width: 4, height: 6, opacity: 0 }, fensterG), t: 1.1 + rnd() * 2.2 };
      });
      var klammern = sv('g', { fill: 'none', stroke: FARBE.pink, 'stroke-width': 2.5, opacity: 0 }, vorne);
      var KL = [{ x: 224, y: 296, dx: 1, dy: 1 }, { x: 268, y: 296, dx: -1, dy: 1 }, { x: 224, y: 388, dx: 1, dy: -1 }, { x: 268, y: 388, dx: -1, dy: -1 }];
      KL.forEach(function (q) { q.el = sv('path', { d: 'M0,' + 11 * q.dy + ' L0,0 L' + 11 * q.dx + ',0' }, klammern); });
      var marke = label(sz.div, 'Eingehende Dienstmeldung', { y: 26, farbe: FARBE.cyan, blinken: true });
      var kp = kopf(sz.div, ['Seit geraumer Zeit', 'treibt der berühmt-', 'berüchtigte Ganove'], { y: 50, farbe: FARBE.hell, fs: 46 });
      sz.update = function (lt) {
        attr(radar, 'opacity', fort(lt, 0.2, 0.9).toFixed(2));
        attr(sweep, 'transform', 'rotate(' + ((lt * 110) % 360).toFixed(1) + ')');
        attr(hinten, 'transform', 'translate(0 ' + mix(220, 0, bw(lt, 0.25, 1.3, E.aus3)).toFixed(1) + ')');
        attr(vorne, 'transform', 'translate(0 ' + mix(300, 0, bw(lt, 0.4, 1.35, E.aus4)).toFixed(1) + ')');
        var g0 = L(TAKT.ganove);
        attr(figurG, 'transform', 'translate(246 ' + mix(450, 376, bw(lt, g0 - 0.5, g0 - 0.1, E.zurueck)).toFixed(1) + ') scale(0.33)');
        var kpp = bw(lt, g0, g0 + 0.3, E.zurueck);
        attr(klammern, 'opacity', lt >= g0 ? 1 : 0);
        for (var i = 0; i < 4; i++) {
          var q = KL[i], d = mix(16, 0, kpp);
          attr(q.el, 'transform', 'translate(' + (q.x - q.dx * d).toFixed(1) + ' ' + (q.y - q.dy * d).toFixed(1) + ')');
        }
        for (var j = 0; j < fenster.length; j++) {
          var f = fenster[j], dt = lt - f.t;
          attr(f.el, 'opacity', dt < 0 ? 0 : ((!RM && dt < 0.14) ? (Math.floor(dt * 36) % 2 ? 0.9 : 0.2) : 0.9));
        }
        tippen(marke, lt, 0.35, 34);
        kopfZeigen(kp, lt, [L(TAKT.s1) + 0.1, L(TAKT.s1) + 1.0, L(TAKT.s1) + 1.85]);
      };
    })();

    // ===== Szene 2: Dr. Danger (Hacker-Farben) =====
    (function () {
      var sz = neueSzene(FARBE.hackGrund, { art: 'schnitt', dauer: 0 }, START.name, false);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      var scheibe = sv('circle', { cx: 236, cy: 300, r: 150, fill: FARBE.pink }, g);
      var ring = sv('circle', { cx: 236, cy: 300, r: 168, fill: 'none', stroke: FARBE.pink, 'stroke-opacity': 0.55, 'stroke-width': 3 }, g);
      var buesteG = sv('g', {}, g);
      var kanal = sv('g', { transform: 'translate(-6 0)', opacity: 0.9 }, buesteG);
      baueBueste(kanal, { koerper: FARBE.kanal, schnitt: FARBE.kanal, brille: FARBE.kanal });
      var b = baueBueste(buesteG, { koerper: FARBE.schwarz, schnitt: FARBE.pink, brille: FARBE.hell });
      b.brille.setAttribute('opacity', 0);
      var k1 = kopf(sz.div, ['sein Unwesen', 'in unserer Stadt.'], { y: 30, farbe: FARBE.hackText, fs: 46 });
      var dr = kopf(sz.div, ['Dr.'], { y: 494, farbe: FARBE.pink, fs: 48 });
      var name = kopf(sz.div, ['Danger'], { y: 538, farbe: FARBE.pink, fs: 140, breite: 334 });
      var scan = el('div', { class: 'hw-scan' }, sz.div);
      scan.style.opacity = '0.55';
      sz.update = function (lt) {
        var sp = bw(lt, 0, 0.45, E.zurueck);
        attr(scheibe, 'r', (150 * Math.max(0, sp)).toFixed(1));
        attr(ring, 'r', (168 * Math.max(0, bw(lt, 0.1, 0.6, E.aus3))).toFixed(1));
        attr(buesteG, 'transform', 'translate(' + mix(150, 0, bw(lt, 0, 0.5, E.aus4)).toFixed(1) + ' 0)');
        attr(b.brille, 'opacity', lt < 0.32 ? 0 : 1);
        var r = zufall(Math.floor(lt * 14) + 991);
        var zuck = !RM && r() < 0.14;
        attr(kanal, 'transform', 'translate(' + (zuck ? -11 : -6) + ' 0)');
        var sh = zuck ? '-7px 0 ' + FARBE.kanal + ',5px 0 rgba(255,255,255,.5)' : '-3px 0 ' + FARBE.kanal;
        stil(name.zeilen[0].sp, 'textShadow', sh);
        stil(dr.zeilen[0].sp, 'textShadow', '-2px 0 ' + FARBE.kanal);
        var gp = fort(lt, 2.6, 3.05), gs = RM ? 0 : Math.sin(gp * Math.PI);
        attr(b.glanz, 'transform', 'translate(205 295) rotate(' + (gp * 90).toFixed(1) + ') scale(' + gs.toFixed(3) + ')');
        kopfZeigen(dr, lt, [0.12]);
        kopfZeigen(name, lt, [0.22]);
        kopfZeigen(k1, lt, [L(TAKT.unwesen) - 0.05, L(TAKT.unwesen) + 0.65]);
      };
    })();

    // ===== Szene 3: Die Akte (Bisher konnte ihm niemand auf die Schliche kommen ...) =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'rechts', dauer: 0.45 }, START.akte, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      panel(g, 16, 18, 358, 248, true);
      sv('path', { d: 'M34,60 L356,60', stroke: FARBE.linie, 'stroke-width': 1.5 }, g);
      var d3 = sv('defs', {}, g);
      var cpFoto = sv('clipPath', { id: uid + '-foto' }, d3);
      sv('rect', { x: 34, y: 78, width: 116, height: 150, rx: 4 }, cpFoto);
      sv('rect', { x: 34, y: 78, width: 116, height: 150, rx: 4, fill: FARBE.panelHell }, g);
      var foto = sv('g', { 'clip-path': 'url(#' + uid + '-foto)' }, g);
      var fb = sv('g', { transform: 'translate(-10.1 25.7) scale(0.441)' }, foto);
      var b = baueBueste(fb, { koerper: FARBE.tief, schnitt: FARBE.panelHell, brille: FARBE.hell });
      sv('rect', { x: 34, y: 78, width: 116, height: 150, rx: 4, fill: 'none', stroke: FARBE.linie, 'stroke-width': 1.5 }, g);
      sv('path', { d: 'M50,70 L50,96 Q50,104 58,104 Q66,104 66,96 L66,74 Q66,68 60,68 Q54,68 54,74 L54,94', fill: 'none', stroke: FARBE.cyan, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
      // Spurensuche: Fussspuren nur unter der Lupe sichtbar
      var cpLupe = sv('clipPath', { id: uid + '-lupe' }, d3);
      var cpKreis = sv('circle', { cx: -300, cy: -300, r: 56 }, cpLupe);
      var pfad = sv('path', { d: 'M8,704 C70,664 58,594 128,570 S238,598 268,530 S228,444 306,416 S376,388 404,370', fill: 'none' }, g);
      var PL = pfad.getTotalLength();
      var glas = sv('circle', { cx: -300, cy: -300, r: 56, fill: FARBE.cyan, 'fill-opacity': 0.1 }, g);
      var spur = sv('g', { fill: FARBE.hell, 'clip-path': 'url(#' + uid + '-lupe)' }, g);
      for (var dd = 20, n = 0; dd < PL - 8; dd += 30, n++) {
        var pa = pfad.getPointAtLength(dd), pb = pfad.getPointAtLength(Math.min(PL, dd + 1));
        var w = Math.atan2(pb.y - pa.y, pb.x - pa.x), seite = n % 2 ? 1 : -1;
        var fx = pa.x + Math.cos(w + Math.PI / 2) * 8 * seite, fy = pa.y + Math.sin(w + Math.PI / 2) * 8 * seite;
        var fuss = sv('g', { transform: 'translate(' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ') rotate(' + (w * 180 / Math.PI + 90).toFixed(1) + ')' }, spur);
        sv('ellipse', { cx: 0, cy: -5, rx: 6, ry: 10 }, fuss);
        sv('ellipse', { cx: 0, cy: 10, rx: 5, ry: 5 }, fuss);
      }
      var lupe = sv('g', { opacity: 0 }, g);
      sv('rect', { x: 63.4, y: 32.9, width: 18, height: 80, rx: 7, fill: FARBE.cyan, transform: 'rotate(-45 72.4 72.9)' }, lupe);
      sv('circle', { r: 56, fill: 'none', stroke: FARBE.cyan, 'stroke-width': 9 }, lupe);
      // Stempel
      var stempel = sv('g', { opacity: 0 }, g);
      sv('rect', { x: -88, y: -22, width: 176, height: 44, rx: 6, fill: FARBE.panel, 'fill-opacity': 0.85, stroke: FARBE.cyan, 'stroke-width': 2.5 }, stempel);
      sv('text', { x: 0, y: 7, 'text-anchor': 'middle', fill: FARBE.cyan, 'font-family': SCHRIFT.mono, 'font-weight': 600, 'font-size': 19, 'letter-spacing': 4, text: 'UNGELÖST' }, stempel);
      var marke = label(sz.div, 'Ermittlungsakte', { x: 34, y: 34, farbe: FARBE.cyan, blinken: true });
      var felder = [['Name', 'Dr. Danger'], ['Aufenthalt', 'unbekannt'], ['Festnahmen', '0'], ['Spuren', 'keine']].map(function (f, i) {
        return {
          l: label(sz.div, f[0], { x: 168, y: 80 + i * 38, farbe: FARBE.leise, fs: 10 }),
          w: label(sz.div, f[1], { x: 168, y: 94 + i * 38, farbe: FARBE.text, wert: true })
        };
      });
      var kp = kopf(sz.div, ['Niemand kam ihm', 'auf die Schliche.'], { y: 290, farbe: FARBE.hell, fs: 46 });
      sz.update = function (lt) {
        tippen(marke, lt, 0.35);
        for (var i = 0; i < felder.length; i++) {
          var a = L(TAKT.s2) + 0.3 + i * 0.65;
          tippen(felder[i].l, lt, a, 40);
          tippen(felder[i].w, lt, a + 0.25, 22);
        }
        kopfZeigen(kp, lt, [L(TAKT.s2) + 0.9, L(TAKT.s2) + 1.9]);
        var la = L(TAKT.s2) + 1.2, le = L(TAKT.sicherheit) - 0.3;
        var p = RM ? 0.55 : E.einAusSin(fort(lt, la, le));
        var pt = pfad.getPointAtLength(PL * mix(0.04, 0.76, p)), x = pt.x.toFixed(1), y = pt.y.toFixed(1);
        attr(lupe, 'opacity', fort(lt, la - 0.3, la).toFixed(2));
        attr(lupe, 'transform', 'translate(' + x + ' ' + y + ') rotate(' + (RM ? 0 : Math.sin(lt * 5) * 6).toFixed(1) + ')');
        attr(cpKreis, 'cx', x); attr(cpKreis, 'cy', y);
        attr(glas, 'cx', x); attr(glas, 'cy', y);
        var gp = fort(lt, L(TAKT.sicherheit) - 0.45, L(TAKT.sicherheit) - 0.05), gs = RM ? 0 : Math.sin(gp * Math.PI);
        attr(b.glanz, 'transform', 'translate(205 295) rotate(' + (gp * 90).toFixed(1) + ') scale(' + (gs * 1.6).toFixed(3) + ')');
        var s0 = L(TAKT.sicherheit) + 0.1, sp = RM ? (lt >= s0 ? 1 : 0) : fort(lt, s0, s0 + 0.17);
        var wack = (!RM && lt > s0 + 0.17 && lt < s0 + 0.37) ? Math.sin((lt - s0) * 80) * 2 * (1 - fort(lt, s0 + 0.17, s0 + 0.37)) : 0;
        attr(stempel, 'transform', 'translate(' + (270 + wack).toFixed(1) + ' 176) rotate(-9) scale(' + mix(1.9, 1, E.ein3(sp)).toFixed(3) + ')');
        attr(stempel, 'opacity', sp > 0 ? (0.3 + 0.7 * sp).toFixed(2) : 0);
      };
    })();

    // ===== Szene 4: Er spielt mit den Einsatzkraeften / Das koennen wir gar nicht gebrauchen =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'links', dauer: 0.45 }, START.spiel, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      sv('rect', { x: -400, y: 560, width: 1200, height: 2, fill: FARBE.linie }, g);
      var brett = sv('g', { transform: 'translate(28 560) scale(1.2)' }, g);
      var blaue = [76, 128, 180].map(function (x) { return { g: polizeifigur(brett), x: x }; });
      var dg = sv('g', {}, brett);
      spielfigur(dg, FARBE.pink);
      sv('path', { d: 'M-23,-79 L22,-84 L23,-80 L-22,-75 Z', fill: FARBE.schwarz }, dg);
      sv('path', { d: 'M-13,-81 L-11,-96 L-3,-99 L3,-96 L10,-100 L14,-82 Z', fill: FARBE.schwarz }, dg);
      sv('circle', { cx: -6, cy: -67, r: 4.2, fill: FARBE.hell }, dg);
      sv('circle', { cx: 7, cy: -67, r: 4.2, fill: FARBE.hell }, dg);
      var scanlinie = sv('rect', { x: -400, y: 0, width: 1200, height: 3, fill: FARBE.cyan, opacity: 0 }, g);
      var k0 = kopf(sz.div, ['Nun überspannt er', 'den Bogen.'], { y: 34, farbe: FARBE.hell, fs: 46 });
      var kA = kopf(sz.div, ['Er spielt mit den', 'Einsatzkräften.'], { y: 34, farbe: FARBE.hell, fs: 46 });
      var kB = kopf(sz.div, ['Das können wir gar', 'nicht gebrauchen.'], { y: 34, farbe: FARBE.hell, fs: 46 });
      sz.ziele = kA.zeilen.map(function (z) { return z.sp; });
      sz.update = function (lt) {
        var s3 = L(TAKT.s3), bo = L(TAKT.bogen), s4 = L(TAKT.s4);
        for (var i = 0; i < blaue.length; i++) {
          var bl = blaue[i], a0 = s3 - 0.05 + i * 0.08, f0 = bo + 0.55 + i * 0.14, u0 = s4 + 0.5 + i * 0.12;
          var hoch = bw(lt, a0, a0 + 0.4, E.zurueck);
          var fall = RM ? (lt >= f0 ? 1 : 0) : E.ein2(fort(lt, f0, f0 + 0.3));
          var w = fall * (i === blaue.length - 1 ? 78 : 70);
          if (!RM && lt > f0 + 0.3) w -= Math.sin(Math.PI * fort(lt, f0 + 0.3, f0 + 0.52)) * 6;
          w *= 1 - bw(lt, u0, u0 + 0.45, E.zurueck);
          attr(bl.g, 'transform', 'translate(' + bl.x + ' 0) rotate(' + w.toFixed(1) + ' 24 0) scale(1 ' + Math.max(0.01, hoch).toFixed(3) + ')');
          attr(bl.g, 'opacity', lt < a0 ? 0 : 1);
        }
        var x = -80 + 84 * bw(lt, s3 + 0.5, s3 + 0.95, E.aus3) - 10 * bw(lt, bo - 0.15, bo + 0.15, E.einAus3) +
          34 * bw(lt, bo + 0.35, bo + 0.55, E.ein2) - 5 * bw(lt, bo + 0.58, bo + 0.8, E.aus3) - 120 * bw(lt, s4 + 0.35, s4 + 0.85, E.ein2);
        var ei = L(TAKT.einsatz);
        var hopp = RM ? 0 : Math.sin(Math.PI * fort(lt, ei, ei + 0.27)) * 18 + Math.sin(Math.PI * fort(lt, ei + 0.27, ei + 0.47)) * 7;
        attr(dg, 'transform', 'translate(' + x.toFixed(1) + ' ' + (-hopp).toFixed(1) + ')');
        var sl = fort(lt, s4 - 0.3, s4 + 0.25);
        attr(scanlinie, 'opacity', sl > 0 && sl < 1 && !RM ? 0.9 : 0);
        attr(scanlinie, 'y', mix(-60, 760, sl).toFixed(1));
        kopfZeigen(k0, lt, [s3 + 0.35, s3 + 0.55], L(TAKT.regelrecht) - 0.55);
        kopfZeigen(kA, lt, [L(TAKT.regelrecht) - 0.15, L(TAKT.regelrecht) + 0.05], s4 - 0.35);
        kopfZeigen(kB, lt, [s4 + 0.02, s4 + 0.18]);
      };
    })();

    // ===== Szene 5: Gesichtet, ausgerechnet heute (Karte im Stil der App) =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'unten', dauer: 0.45 }, START.sichtung, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      var P = { x: 158, y: 400 };
      var d5 = sv('defs', {}, g);
      var cpKarte = sv('clipPath', { id: uid + '-karte' }, d5);
      sv('rect', { x: 16, y: 144, width: 358, height: 372, rx: 12 }, cpKarte);
      var karte = sv('g', { 'clip-path': 'url(#' + uid + '-karte)' }, g);
      sv('rect', { x: 16, y: 144, width: 358, height: 372, fill: FARBE.karteGrund }, karte);
      // Parks, Strassen, Okerumflut (stilisiert)
      var parks = sv('g', { fill: FARBE.park }, karte);
      ['M40,404 L118,380 L150,452 L96,500 L36,470 Z', 'M282,214 L344,206 L360,262 L300,280 Z', 'M196,470 L258,456 L268,512 L204,520 Z'].forEach(function (d) { sv('path', { d: d }, parks); });
      var neben = sv('g', { stroke: FARBE.strasse, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, karte);
      for (var i = 0; i < 16; i++) {
        var y0 = 156 + i * 23 + (i % 3) * 4;
        sv('path', { d: 'M8,' + y0 + ' L390,' + (y0 + 18 - (i % 4) * 9) }, neben);
      }
      for (var j = 0; j < 12; j++) {
        var x0 = 20 + j * 31 + (j % 3) * 5;
        sv('path', { d: 'M' + x0 + ',136 L' + (x0 - 22 + (j % 4) * 11) + ',530' }, neben);
      }
      var haupt = sv('g', { stroke: FARBE.hauptstrasse, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, karte);
      ['M-10,250 Q120,300 210,286 T400,320', 'M60,520 Q130,420 196,330 T262,140', 'M-10,430 Q150,410 260,450 T400,470', 'M300,530 Q310,400 360,300 L400,260'].forEach(function (d) { sv('path', { d: d }, haupt); });
      var oker = sv('path', { d: 'M120,250 C160,206 250,204 292,232 C330,258 338,310 326,356 C314,404 300,456 246,478 C196,498 128,482 100,444 C74,408 66,348 80,308 C88,284 100,268 120,250 Z M100,444 C76,474 54,500 30,524', fill: 'none', stroke: FARBE.fluss, 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, karte);
      // Rasterblende wie auf der Gesamtkarte, oeffnet sich um die Sichtung
      var maske = sv('mask', { id: uid + '-loch', maskUnits: 'userSpaceOnUse', x: -700, y: -900, width: 1790, height: 2520 }, d5);
      sv('rect', { x: -700, y: -900, width: 1790, height: 2520, fill: '#FFFFFF' }, maske);
      var loch = sv('circle', { cx: P.x, cy: P.y, r: 0, fill: '#000000' }, maske);
      var blende = sv('g', { mask: 'url(#' + uid + '-loch)' }, karte);
      sv('rect', { x: 16, y: 144, width: 358, height: 372, fill: 'url(#' + uid + '-blende)' }, blende);
      sv('text', { x: 195, y: 182, 'text-anchor': 'middle', fill: FARBE.blende, 'font-family': SCHRIFT.mono, 'font-weight': 500, 'font-size': 11, 'letter-spacing': 3, text: '▓▓ BEREICH NICHT FREIGELEGT ▓▓' }, blende);
      var suchlinie = sv('rect', { x: 16, y: 200, width: 358, height: 2, fill: FARBE.cyan, opacity: 0 }, karte);
      sv('rect', { x: 16, y: 144, width: 358, height: 372, rx: 12, fill: 'none', stroke: FARBE.linie, 'stroke-width': 1.5 }, g);
      var lochRand = sv('circle', { cx: P.x, cy: P.y, r: 0, fill: 'none', stroke: FARBE.cyan, 'stroke-width': 1.5, 'stroke-dasharray': '3 5', opacity: 0 }, g);
      var kreuz = sv('g', { stroke: FARBE.hell, 'stroke-width': 1.2, 'stroke-dasharray': '4 5', fill: 'none', opacity: 0, 'clip-path': 'url(#' + uid + '-karte)' }, g);
      var kh = sv('path', { d: 'M0,0' }, kreuz), kv = sv('path', { d: 'M0,0' }, kreuz);
      var ringe = [0, 1, 2].map(function () { return sv('circle', { cx: P.x, cy: P.y, r: 8, fill: 'none', stroke: FARBE.pink, 'stroke-width': 3, opacity: 0 }, g); });
      var punkt = sv('circle', { cx: P.x, cy: P.y, r: 0, fill: FARBE.pink }, g);
      var stempel = sv('g', { opacity: 0 }, g);
      var stRahmen = sv('rect', { x: -110, y: -21, width: 220, height: 42, rx: 6, fill: FARBE.grund, 'fill-opacity': 0.9, stroke: FARBE.cyan, 'stroke-width': 2.5 }, stempel);
      var stText = sv('text', { x: 0, y: 6, 'text-anchor': 'middle', fill: FARBE.cyan, 'font-family': SCHRIFT.mono, 'font-weight': 600, 'font-size': 15, 'letter-spacing': 1.5, text: datumLang.toUpperCase() }, stempel);
      var sicht = label(sz.div, 'Sichtung', { x: P.x + 16, y: P.y - 34, farbe: FARBE.pink, fs: 11 });
      var koord = label(sz.div, SICHTUNG_TEXT, { x: P.x + 16, y: P.y - 18, farbe: FARBE.hell, fs: 10.5 });
      var kA = kopf(sz.div, ['Er wurde in der', 'Stadt gesichtet.'], { y: 30, farbe: FARBE.hell, fs: 46 });
      var kB = kopf(sz.div, ['Ausgerechnet', 'heute.'], { y: 540, farbe: FARBE.hell, fs: 72, breite: 334 });
      sz.messen = function () {
        var w = Math.max(160, stText.getComputedTextLength() + 34);
        stRahmen.setAttribute('x', (-w / 2).toFixed(1));
        stRahmen.setAttribute('width', w.toFixed(1));
      };
      sz.update = function (lt) {
        var ge = L(TAKT.gesichtet), he = L(TAKT.heute);
        var suche = fort(lt, L(TAKT.s5), ge);
        attr(suchlinie, 'opacity', suche > 0 && suche < 1 && !RM ? 0.6 : 0);
        attr(suchlinie, 'y', (150 + ((lt * 160) % 360)).toFixed(1));
        var lp = bw(lt, ge, ge + 0.7, E.aus3);
        attr(loch, 'r', (104 * lp).toFixed(1));
        attr(lochRand, 'r', (104 * lp).toFixed(1));
        attr(lochRand, 'opacity', lp > 0 ? 0.7 : 0);
        var kp = bw(lt, ge, ge + 0.35, E.aus3);
        attr(kreuz, 'opacity', kp > 0 ? 0.45 : 0);
        attr(kh, 'd', 'M' + (P.x - 240 * kp).toFixed(1) + ',' + P.y + ' L' + (P.x + 240 * kp).toFixed(1) + ',' + P.y);
        attr(kv, 'd', 'M' + P.x + ',' + (P.y - 210 * kp).toFixed(1) + ' L' + P.x + ',' + (P.y + 210 * kp).toFixed(1));
        attr(punkt, 'r', Math.max(0, 8 * bw(lt, ge, ge + 0.25, E.zurueck)).toFixed(2));
        for (var i = 0; i < 3; i++) {
          var ph = lt - ge - i * 0.3;
          if (ph < 0 || RM) { attr(ringe[i], 'opacity', 0); continue; }
          var q = (ph % 0.9) / 0.9;
          attr(ringe[i], 'r', (8 + 46 * E.aus2(q)).toFixed(1));
          attr(ringe[i], 'opacity', (0.9 * (1 - q)).toFixed(2));
        }
        tippen(sicht, lt, ge + 0.3, 30);
        tippen(koord, lt, ge + 0.5, 45);
        var sp = RM ? (lt >= he ? 1 : 0) : fort(lt, he, he + 0.17);
        var wack = (!RM && lt > he + 0.17 && lt < he + 0.37) ? Math.sin((lt - he) * 80) * 2.2 * (1 - fort(lt, he + 0.17, he + 0.37)) : 0;
        attr(stempel, 'transform', 'translate(' + (250 + wack).toFixed(1) + ' 486) rotate(-6) scale(' + mix(1.9, 1, E.ein3(sp)).toFixed(3) + ')');
        attr(stempel, 'opacity', sp > 0 ? (0.3 + 0.7 * sp).toFixed(2) : 0);
        kopfZeigen(kA, lt, [L(TAKT.s5) + 0.35, ge - 0.2], L(TAKT.s6) - 0.3);
        kopfZeigen(kB, lt, [L(TAKT.s6) + 0.05, he - 0.12]);
      };
    })();

    // ===== Szene 6: Lagebild, dann greift Dr. Danger ein =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'rechts', dauer: 0.45 }, START.lage, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      var pn = panel(g, 16, 18, 358, 432, true);
      var linien = sv('path', { d: 'M34,62 L356,62 M34,190 L356,190 M34,224 L356,224 M34,258 L356,258', stroke: FARBE.linie, 'stroke-width': 1.5 }, g);
      // Buehnen-Skizze
      var skizze = sv('g', { fill: 'none', stroke: FARBE.cyan, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
      var striche = [
        'M40,288 L350,288', 'M40,288 C70,328 112,332 150,292', 'M350,288 C320,328 278,332 240,292',
        'M150,292 C176,312 214,312 240,292', 'M40,288 L40,388', 'M350,288 L350,388',
        'M58,302 Q52,346 62,388', 'M332,302 Q338,346 328,388', 'M28,388 L362,388'
      ].map(function (d) { var p = sv('path', { d: d }, skizze); var l = p.getTotalLength(); p.setAttribute('stroke-dasharray', l.toFixed(1) + ' ' + (l + 2).toFixed(1)); return { p: p, l: l }; });
      var kegel = sv('g', { fill: FARBE.cyan, 'fill-opacity': 0.07, stroke: FARBE.cyan, 'stroke-opacity': 0.4, 'stroke-width': 1.2, opacity: 0 }, g);
      var k1 = sv('path', { d: 'M0,0 L-24,96 L24,96 Z' }, kegel), k2 = sv('path', { d: 'M0,0 L-24,96 L24,96 Z' }, kegel);
      var publikum = [];
      for (var i = 0; i < 9; i++) {
        var px = 62 + i * 33, pg = sv('g', { opacity: 0 }, skizze);
        sv('circle', { cx: px, cy: 408, r: 6 }, pg);
        sv('path', { d: 'M' + (px - 12) + ',432 Q' + px + ',416 ' + (px + 12) + ',432' }, pg);
        publikum.push(pg);
      }
      var schattenG = sv('g', { opacity: 0.92 }, g);
      figurDanger(schattenG, FARBE.pink);
      var streifen = sv('g', { opacity: 0 }, g);
      sv('rect', { x: 0, y: 0, width: 222, height: 26, fill: FARBE.pink }, streifen);
      sv('text', { x: 12, y: 17.5, fill: FARBE.klebeText, 'font-family': SCHRIFT.mono, 'font-weight': 600, 'font-size': 11, 'letter-spacing': 2.2, text: 'UNBEKANNTE QUELLE ▓▓' }, streifen);
      var marke = label(sz.div, 'Lagebild', { x: 34, y: 34, farbe: FARBE.cyan, blinken: true });
      var titel = kopf(sz.div, ['Große', 'Kulturveranstaltung'], { x: 34, y: 76, farbe: FARBE.hell, fs: 50, breite: 318 });
      var reihen = [['Datum', datumLang], ['Gäste', 'viele, überregional'], ['Status', 'geplant']].map(function (f, j) {
        return {
          l: label(sz.div, f[0], { x: 34, y: 169 + j * 34, farbe: FARBE.leise, fs: 10 }),
          w: label(sz.div, f[1], { x: 128, y: 165 + j * 34, farbe: FARBE.text, wert: true })
        };
      });
      var gefahr = label(sz.div, 'gefährdet', { x: 128, y: 165 + 2 * 34, farbe: FARBE.pink, wert: true });
      gefahr.e.style.fontWeight = '600';
      var kp = kopf(sz.div, ['Nicht auszumalen,', 'wenn er sie stört.'], { y: 474, farbe: FARBE.hell, fs: 46 });
      var scan = el('div', { class: 'hw-scan' }, sz.div);
      scan.style.opacity = '0';
      sz.ziele = kp.zeilen.map(function (z) { return z.sp; }).concat(titel.zeilen.map(function (z) { return z.sp; }));
      sz.update = function (lt) {
        var s7 = L(TAKT.s7), ku = L(TAKT.kultur), ga = L(TAKT.gaeste), d2 = L(TAKT.danger2), st = L(TAKT.stoert);
        tippen(marke, lt, 0.35);
        kopfZeigen(titel, lt, [ku - 0.75, ku - 0.2]);
        tippen(reihen[0].l, lt, s7 + 0.1, 40); tippen(reihen[0].w, lt, s7 + 0.3, 26);
        tippen(reihen[1].l, lt, ga - 0.9, 40); tippen(reihen[1].w, lt, ga - 0.65, 26);
        tippen(reihen[2].l, lt, ga + 0.4, 40);
        var flack = !RM && lt >= st && lt < st + 0.36 && Math.floor((lt - st) * 22) % 2 === 0;
        if (lt >= st && !flack) { stil(reihen[2].w.e, 'visibility', 'hidden'); tippen(gefahr, lt, st, 999); }
        else { tippen(reihen[2].w, lt, ga + 0.6, 26); stil(gefahr.e, 'visibility', 'hidden'); }
        for (var i = 0; i < striche.length; i++) {
          var a = ku - 0.4 + i * 0.12, s = striche[i];
          attr(s.p, 'stroke-dashoffset', (s.l * (1 - bw(lt, a, a + 0.9, E.einAus3))).toFixed(1));
        }
        var sw = RM ? 0 : Math.sin(lt * 1.3);
        attr(kegel, 'opacity', fort(lt, ku + 0.6, ku + 1.2).toFixed(2));
        attr(k1, 'transform', 'translate(70 292) rotate(' + (-24 + sw * 7).toFixed(2) + ')');
        attr(k2, 'transform', 'translate(320 292) rotate(' + (24 - sw * 7).toFixed(2) + ')');
        for (var j = 0; j < publikum.length; j++) {
          var pa = ga - 0.2 + j * 0.07;
          attr(publikum[j], 'opacity', lt >= pa ? 1 : 0);
          attr(publikum[j], 'transform', 'translate(0 ' + mix(10, 0, bw(lt, pa, pa + 0.3, E.zurueck)).toFixed(1) + ')');
        }
        kopfZeigen(kp, lt, [L(TAKT.s8) + 0.15, d2 - 0.25]);
        var sp = bw(lt, d2, d2 + 0.75, E.aus3);
        attr(schattenG, 'transform', 'translate(' + mix(470, 300, sp).toFixed(1) + ' 388) skewX(-6) scale(0.62)');
        // Uebernahme: Klebestreifen, Panel kippt in den Hacker-Modus
        var tp = fort(lt, d2 + 0.55, d2 + 0.67);
        var tflack = !RM && lt > d2 + 0.67 && lt < d2 + 1.0 && Math.floor(lt * 24) % 3 === 0;
        attr(streifen, 'opacity', tp > 0 && !tflack ? 1 : 0);
        attr(streifen, 'transform', 'translate(26 26) rotate(-3) scale(' + (RM ? 1 : Math.max(0.01, tp)).toFixed(3) + ' 1)');
        var hack = lt >= st;
        attr(pn.rect, 'fill', hack ? FARBE.hackPanel : FARBE.panel);
        attr(pn.rect, 'stroke', hack ? FARBE.pink : FARBE.linie);
        attr(pn.akzent, 'fill', hack ? FARBE.pink : FARBE.cyan);
        attr(linien, 'stroke', hack ? FARBE.hackLinie : FARBE.linie);
        attr(skizze, 'stroke', hack ? FARBE.hackLeise : FARBE.cyan);
        stil(scan, 'opacity', (0.75 * fort(lt, d2 + 0.5, st)).toFixed(2));
      };
    })();

    // ===== Szene 7: Keine Zeit zu verlieren, im Team =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'unten', dauer: 0.45 }, START.zeit, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      var uhr = sv('g', { transform: 'translate(195 340) scale(0)' }, g);
      sv('circle', { r: 118, fill: FARBE.panel, stroke: FARBE.cyan, 'stroke-width': 3 }, uhr);
      for (var i = 0; i < 12; i++) {
        sv('rect', { x: -2.5, y: -106, width: 5, height: i % 3 ? 10 : 20, fill: FARBE.hell, transform: 'rotate(' + i * 30 + ')' }, uhr);
      }
      var std = sv('rect', { x: -5, y: -62, width: 10, height: 72, rx: 4, fill: FARBE.hell }, uhr);
      var minute = sv('rect', { x: -3.5, y: -96, width: 7, height: 106, rx: 3, fill: FARBE.cyan }, uhr);
      var sek = sv('rect', { x: -1.5, y: -104, width: 3, height: 122, fill: FARBE.pink }, uhr);
      sv('circle', { r: 9, fill: FARBE.hell }, uhr);
      var h0 = (datum.getHours() % 12 + datum.getMinutes() / 60) * 30, m0 = datum.getMinutes() * 6;
      var team = [111, 167, 223, 279].map(function (x) {
        var h = sv('g', { opacity: 0 }, g);
        polizeifigur(h);
        return { g: h, x: x };
      });
      sv('rect', { x: -400, y: 600, width: 1200, height: 2, fill: FARBE.linie }, g);
      var kA = kopf(sz.div, ['Keine Zeit', 'zu verlieren.'], { y: 34, farbe: FARBE.hell, fs: 58 });
      var kB = kopf(sz.div, ['Stellt euch im Team', 'der Herausforderung.'], { y: 34, farbe: FARBE.hell, fs: 46 });
      sz.update = function (lt) {
        var te = L(TAKT.team);
        attr(uhr, 'transform', 'translate(195 340) scale(' + Math.max(0, bw(lt, 0.1, 0.6, E.zurueck)).toFixed(3) + ')');
        var v = RM ? 0 : lt;
        attr(std, 'transform', 'rotate(' + (h0 + v * 40).toFixed(1) + ')');
        attr(minute, 'transform', 'rotate(' + (m0 + v * 480).toFixed(1) + ')');
        attr(sek, 'transform', 'rotate(' + (v * 1440).toFixed(1) + ')');
        for (var i = 0; i < team.length; i++) {
          var a = te + i * 0.12, s = Math.max(0.01, bw(lt, a, a + 0.4, E.zurueck));
          attr(team[i].g, 'opacity', lt >= a ? 1 : 0);
          attr(team[i].g, 'transform', 'translate(' + team[i].x + ' 600) scale(0.84 ' + (0.84 * s).toFixed(3) + ')');
        }
        kopfZeigen(kA, lt, [L(TAKT.s9) + 0.45, L(TAKT.s9) + 0.65], te - 0.5);
        kopfZeigen(kB, lt, [te - 0.2, te + 0.1]);
      };
    })();

    // ===== Szene 8: Meldet euch zum Dienst (Titel mit Route und neun Wegpunkten) =====
    (function () {
      var sz = neueSzene(FARBE.grund, { art: 'iris', dauer: 0.65, cx: 195, cy: 340 }, START.titel, true);
      var g = sz.svg, L = function (x) { return x - sz.start; };
      // Route wie auf der Gesamtkarte: Wegpunkte 1 bis 9, dazwischen Strassenecken
      var PKT = [[36,590],[62,570],[96,574],[118,540],[150,528],[176,548],[206,552],[232,520],[246,486],[282,476],[306,500],[340,486],[352,452],[330,424],[296,414],[262,396],[236,380]];
      var WP = [0, 2, 4, 6, 8, 10, 12, 14, 16];
      var laengen = [0];
      for (var i = 1; i < PKT.length; i++) laengen.push(laengen[i - 1] + Math.hypot(PKT[i][0] - PKT[i - 1][0], PKT[i][1] - PKT[i - 1][1]));
      var RL = laengen[laengen.length - 1];
      var route = sv('polyline', { points: PKT.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: FARBE.route, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': RL.toFixed(1) + ' ' + (RL + 2).toFixed(1), 'stroke-dashoffset': RL.toFixed(1) }, g);
      var marker = WP.map(function (idx, n) {
        var p = PKT[idx], m = sv('g', { transform: 'translate(' + p[0] + ' ' + p[1] + ') scale(0)' }, g);
        sv('path', { d: 'M-4,9 L-12,18 L4,10 Z', fill: FARBE.hell }, m);
        var kreis = sv('circle', { r: 11, fill: FARBE.grund, stroke: FARBE.hell, 'stroke-width': 2 }, m);
        var zahl = sv('text', { x: 0, y: 4.2, 'text-anchor': 'middle', fill: FARBE.hell, 'font-family': SCHRIFT.mono, 'font-weight': 600, 'font-size': 12, text: String(n + 1) }, m);
        return { g: m, f: laengen[idx] / RL, p: p, kreis: kreis, zahl: zahl };
      });
      var ziel = marker[marker.length - 1];
      var zielBrille = sv('g', { fill: FARBE.hell, opacity: 0 }, ziel.g);
      sv('circle', { cx: -4.6, cy: 0, r: 4 }, zielBrille);
      sv('circle', { cx: 4.6, cy: 0, r: 4 }, zielBrille);
      var zielRing = sv('circle', { r: 11, fill: 'none', stroke: FARBE.route, 'stroke-width': 2.5, opacity: 0 }, ziel.g);
      var marke = label(sz.div, 'Dienstantritt', { y: 26, farbe: FARBE.cyan });
      var titel = kopf(sz.div, ['Hidden', 'Waypoint'], { y: 52, farbe: FARBE.hell, fs: 120, breite: 334 });
      var sub = el('p', { class: 'hw-sub', text: 'Meldet euch zum Dienst und begebt euch auf die rätselhafte Spur des Ganoven.' }, sz.div);
      sub.style.left = '28px';
      sub.style.top = '262px';
      var los = el('button', { class: 'hw-los', type: 'button', text: 'Zum Dienst melden →' }, sz.div);
      los.style.top = '624px';
      los.addEventListener('click', fertig);
      sz.ziele = titel.zeilen.map(function (z) { return z.sp; });
      sz.update = function (lt) {
        var s10 = L(TAKT.s10), spu = L(TAKT.spur), kn = L(KNOPF_AB);
        tippen(marke, lt, 0.1, 30);
        kopfZeigen(titel, lt, [0.15, 0.35]);
        stil(sub, 'opacity', fort(lt, s10 + 0.3, s10 + 0.7).toFixed(3));
        stil(sub, 'transform', 'translate(0,' + ((1 - bw(lt, s10 + 0.3, s10 + 0.8, E.aus3)) * 12).toFixed(1) + 'px)');
        var p = RM ? (lt >= s10 + 0.6 ? 1 : 0) : E.einAusSin(fort(lt, s10 + 0.6, spu + 0.4));
        attr(route, 'stroke-dashoffset', (RL * (1 - p)).toFixed(1));
        for (var j = 0; j < marker.length; j++) {
          var m = marker[j], mp = Math.max(0, E.zurueck(klemme((p - m.f * 0.94) / 0.06, 0, 1)));
          attr(m.g, 'transform', 'translate(' + m.p[0] + ' ' + m.p[1] + ') scale(' + (j === marker.length - 1 ? 1.2 : 1) * mp + ')');
        }
        if (!RM && p >= 1) {
          var rq = ((lt - spu - 0.4) % 1.8) / 1.8;
          attr(zielRing, 'r', (12 + 16 * E.aus2(rq)).toFixed(1));
          attr(zielRing, 'opacity', (0.9 * (1 - rq)).toFixed(2));
        } else attr(zielRing, 'opacity', 0);
        // Zum Schluss blitzt ganz kurz Dr. Danger im Zielpunkt auf
        var b = STOER[2], blip = stoerungAn && !RM && sz.start + lt >= b.a && sz.start + lt < b.b;
        attr(ziel.kreis, 'fill', blip ? FARBE.pink : FARBE.grund);
        attr(ziel.kreis, 'stroke', blip ? FARBE.pink : FARBE.hell);
        attr(ziel.zahl, 'opacity', blip ? 0 : 1);
        attr(zielBrille, 'opacity', blip ? 1 : 0);
        stil(los, 'opacity', fort(lt, kn, kn + 0.3).toFixed(3));
        stil(los, 'transform', 'translate(0,' + ((1 - bw(lt, kn, kn + 0.45, E.aus3)) * 16).toFixed(1) + 'px)');
        stil(los, 'visibility', lt >= kn ? 'visible' : 'hidden');
      };
    })();

    // ---------- Uebergangskante (Scanner-Linie) ----------
    var kanteSvg = sv('svg', { class: 'hw-svg', width: RB, height: RH, viewBox: '0 0 ' + RB + ' ' + RH, 'aria-hidden': 'true', focusable: 'false' }, rahmen);
    kanteSvg.style.pointerEvents = 'none';
    var kanteGlow = sv('line', { stroke: FARBE.cyan, 'stroke-opacity': 0.3, 'stroke-width': 10, opacity: 0 }, kanteSvg);
    var kanteLinie = sv('line', { stroke: FARBE.cyan, 'stroke-width': 2.5, opacity: 0 }, kanteSvg);
    var irisRing = sv('circle', { fill: 'none', stroke: FARBE.cyan, 'stroke-width': 3, opacity: 0 }, kanteSvg);

    // ---------- Stoerung: Dr. Danger greift in die App ein ----------
    var glitch = el('div', { class: 'hw-glitch', 'aria-hidden': 'true' }, root);
    var gTon = el('div', { class: 'hw-gt' }, glitch);
    var streifen = [];
    for (var si = 0; si < 10; si++) streifen.push(el('div', { class: 'hw-gs' }, glitch));
    var gb = sv('svg', { class: 'hw-gb', viewBox: '0 0 100 40' }, glitch);
    var gbKanal = sv('g', { fill: FARBE.kanal, transform: 'translate(-2.5 0)' }, gb);
    var gbVorne = sv('g', { fill: FARBE.pink }, gb);
    [gbKanal, gbVorne].forEach(function (h) {
      sv('circle', { cx: 28, cy: 20, r: 15 }, h);
      sv('circle', { cx: 72, cy: 20, r: 15 }, h);
      sv('rect', { x: 42, y: 18, width: 16, height: 4 }, h);
    });
    var STREIFENFARBEN = [FARBE.pink, FARBE.kanal, FARBE.hackGrund, FARBE.magenta, FARBE.hell];
    var glitchSz = null;
    function stoerungBild(tt) {
      var w = null;
      if (stoerungAn && !RM) for (var i = 0; i < STOER.length; i++) if (tt >= STOER[i].a && tt < STOER[i].b) { w = STOER[i]; break; }
      var sz = w ? SZ[w.sz] : null;
      if (glitchSz && glitchSz !== sz) {
        glitchSz.div.style.transform = '';
        glitchSz.ziele.forEach(function (sp) { sp.style.textShadow = ''; });
        glitchSz = null;
      }
      if (!w) { glitch.style.display = 'none'; return; }
      glitchSz = sz;
      glitch.style.display = 'block';
      var q = Math.floor((tt - w.a) * 22), r = zufall(q * 9973 + 17 + w.sz), hoehe = root.clientHeight, anzahl = Math.round(3 + 3.5 * w.st);
      for (var j = 0; j < streifen.length; j++) {
        var st = streifen[j];
        st.style.display = j < anzahl && r() < 0.8 ? 'block' : 'none';
        st.style.top = Math.round(r() * hoehe) + 'px';
        st.style.height = Math.round(3 + r() * 40 * Math.min(1.4, w.st)) + 'px';
        st.style.transform = 'translateX(' + Math.round((r() - 0.5) * 34 * w.st) + 'px)';
        st.style.background = STREIFENFARBEN[Math.floor(r() * STREIFENFARBEN.length)];
        st.style.opacity = (0.55 + r() * 0.4).toFixed(2);
      }
      gTon.style.opacity = w.st >= 2 && r() < 0.5 ? '0.12' : '0';
      gb.style.display = w.st >= 1 && (q === 4 || q === 5) ? 'block' : 'none';
      sz.div.style.transform = 'translateX(' + ((r() - 0.5) * 14 * w.st).toFixed(1) + 'px)';
      var sh = (-3 - r() * 4 * w.st).toFixed(1) + 'px 0 ' + FARBE.pink + ',' + (3 + r() * 4 * w.st).toFixed(1) + 'px 0 ' + FARBE.kanal;
      sz.ziele.forEach(function (sp) { sp.style.textShadow = sh; });
    }

    // ---------- Statusleiste wie in der App ----------
    var leiste = null, lText = null, lZeit = null;
    if (mitLeiste) {
      leiste = el('div', { class: 'hw-leiste', 'aria-hidden': 'true' }, root);
      el('span', { class: 'hw-l-links', text: 'Hidden Waypoint' }, leiste);
      var lMitte = el('span', { class: 'hw-l-mitte' }, leiste);
      el('span', { class: 'hw-l-punkt' }, lMitte);
      lText = el('span', { text: 'Leitung sicher' }, lMitte);
      lZeit = el('span', { class: 'hw-l-zeit' }, leiste);
    }
    function leisteBild(tt) {
      if (!leiste) return;
      leiste.classList.toggle('da', tt >= 0.05 || RM);
      var hack = false;
      if (stoerungAn) for (var i = 0; i < UEBERNOMMEN.length; i++) {
        var u = UEBERNOMMEN[i];
        if (tt >= u[0] && tt < u[1]) { hack = RM || tt - u[0] > 0.3 || Math.floor((tt - u[0]) * 20) % 2 === 0; break; }
      }
      leiste.classList.toggle('hack', hack);
      var jetzt = new Date(datum.getTime() + tt * 1000), hh = zwei(jetzt.getHours()), mm = zwei(jetzt.getMinutes());
      var txt = hack ? '▌Übernommen▐' : 'Leitung sicher', zeit = hack ? hh.charAt(0) + '?:' + mm.charAt(0) + '▌' : hh + ':' + mm;
      if (lText.textContent !== txt) lText.textContent = txt;
      if (lZeit.textContent !== zeit) lZeit.textContent = zeit;
    }

    // ---------- Ueberspringen ----------
    var skip = el('button', { class: 'hw-skip', type: 'button', text: 'Überspringen' }, root);
    skip.addEventListener('click', fertig);

    // ---------- Layout: Rahmen passt immer ganz hinein, Flaechen laufen randlos weiter ----------
    var probe = el('div', { 'aria-hidden': 'true' }, root);
    probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    function layout() {
      var W = root.clientWidth || RB, Hh = root.clientHeight || RH, sicherOben = 0, unten = 0;
      if (opt.safeArea !== false) {
        var cs = global.getComputedStyle(probe);
        sicherOben = parseFloat(cs.paddingTop) || 0;
        unten = parseFloat(cs.paddingBottom) || 0;
      }
      var oben = sicherOben + (mitLeiste ? LEISTE : 0);
      root.style.setProperty('--hw-oben', sicherOben + 'px');
      var hs = Math.max(200, Hh - oben - unten);
      var S = Math.min(W / RB, hs / RH);
      var ox = (W - RB * S) / 2, oy = oben + (hs - RH * S) / 2;
      rahmen.style.transform = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + S.toFixed(5) + ')';
      VB = { x0: -ox / S, y0: -oy / S, x1: (W - ox) / S, y1: (Hh - oy) / S };
      skip.style.bottom = (14 + unten) + 'px';
    }

    // Uebergaenge: schraeger Wischer mit Scanner-Kante oder Iris
    function uebergang(w, p) {
      var m = 30, x0 = VB.x0 - m, x1 = VB.x1 + m, y0 = VB.y0 - m, y1 = VB.y1 + m, sl = 0.3, pts, kante;
      if (w.art === 'iris') {
        var dx = Math.max(w.cx - x0, x1 - w.cx), dy = Math.max(w.cy - y0, y1 - w.cy), r = Math.sqrt(dx * dx + dy * dy) * p;
        return { clip: 'circle(' + r.toFixed(1) + 'px at ' + w.cx + 'px ' + w.cy + 'px)', iris: { cx: w.cx, cy: w.cy, r: r } };
      }
      if (w.art === 'rechts' || w.art === 'links') {
        var yc = (y0 + y1) / 2, D = (y1 - y0) * sl / 2;
        var e = w.art === 'rechts' ? mix(x1 + D, x0 - D, p) : mix(x0 - D, x1 + D, p);
        var xa = e + sl * (y0 - yc), xb = e + sl * (y1 - yc);
        pts = w.art === 'rechts'
          ? [[xa, y0], [x1 + 2 * D, y0], [x1 + 2 * D, y1], [xb, y1]]
          : [[x0 - 2 * D, y0], [xa, y0], [xb, y1], [x0 - 2 * D, y1]];
        kante = [xa, y0, xb, y1];
      } else {
        var xc = (x0 + x1) / 2, D2 = (x1 - x0) * sl / 2;
        var e2 = w.art === 'unten' ? mix(y1 + D2, y0 - D2, p) : mix(y0 - D2, y1 + D2, p);
        var ya = e2 + sl * (x0 - xc), yb = e2 + sl * (x1 - xc);
        pts = w.art === 'unten'
          ? [[x0, ya], [x1, yb], [x1, y1 + 2 * D2], [x0, y1 + 2 * D2]]
          : [[x0, y0 - 2 * D2], [x1, y0 - 2 * D2], [x1, yb], [x0, ya]];
        kante = [x0, ya, x1, yb];
      }
      return { clip: 'polygon(' + pts.map(function (q) { return q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px'; }).join(',') + ')', kante: kante };
    }

    // ---------- Bild fuer Zeitpunkt tt (rein zeitbasiert, daher spul- und synchronisierbar) ----------
    function bild(tt) {
      var kanteAn = null, irisAn = null;
      for (var i = 0; i < SZ.length; i++) {
        var sz = SZ[i], nx = SZ[i + 1];
        var bis = nx ? nx.start + nx.wisch.dauer : Infinity;
        var sicht = tt >= sz.start && tt < bis;
        if (sicht !== sz.sicht) { sz.div.style.display = sicht ? '' : 'none'; sz.sicht = sicht; }
        if (!sicht) continue;
        var lt = tt - sz.start, w = sz.wisch;
        if (w.dauer > 0 && lt < w.dauer) {
          var p = lt / w.dauer;
          if (RM) stil(sz.div, 'opacity', p.toFixed(3));
          else {
            var u = uebergang(w, E.einAus3(p));
            sz.div.style.webkitClipPath = u.clip;
            sz.div.style.clipPath = u.clip;
            sz.clip = true;
            if (u.kante) kanteAn = u.kante;
            if (u.iris) irisAn = u.iris;
          }
        } else {
          if (sz.clip) { sz.div.style.webkitClipPath = ''; sz.div.style.clipPath = ''; sz.clip = false; }
          if (RM) stil(sz.div, 'opacity', '1');
        }
        sz.update(lt);
      }
      if (kanteAn) {
        ['x1', 'y1', 'x2', 'y2'].forEach(function (n, j) {
          kanteGlow.setAttribute(n, kanteAn[j].toFixed(1));
          kanteLinie.setAttribute(n, kanteAn[j].toFixed(1));
        });
      }
      attr(kanteGlow, 'opacity', kanteAn ? 1 : 0);
      attr(kanteLinie, 'opacity', kanteAn ? 1 : 0);
      if (irisAn) { irisRing.setAttribute('cx', irisAn.cx); irisRing.setAttribute('cy', irisAn.cy); irisRing.setAttribute('r', irisAn.r.toFixed(1)); }
      attr(irisRing, 'opacity', irisAn ? 1 : 0);
      stoerungBild(tt);
      leisteBild(tt);
      var zeigSkip = tt >= 1.2 && tt < KNOPF_AB;
      if (zeigSkip !== skip.__da) {
        skip.__da = zeigSkip;
        skip.classList.toggle('ist-da', zeigSkip);
        skip.style.visibility = tt < KNOPF_AB ? 'visible' : 'hidden';
      }
      while (cueIdx < CUES.length && tt >= CUES[cueIdx].t) {
        var name = CUES[cueIdx++].n;
        if (opt.onCue && !opt.standbild) { try { opt.onCue(name); } catch (err) {} }
      }
    }

    function tick(now) {
      if (!laeuft) return;
      if (letzte === null) letzte = now;
      var dt = Math.min(0.1, (now - letzte) / 1000);   // Tab im Hintergrund = Pause statt Sprung
      letzte = now;
      seitStart += dt;
      if (quelle) {
        var q = Number(quelle()) || 0;
        if (q !== qLetzt) { qStill = 0; qLetzt = q; } else qStill += dt;
        if (qStill < 0.3 && q > 0) {                         // Aufnahme laeuft: weich mitlaufen
          t += dt;
          if (Math.abs(t - q) > 0.2) t = q;
        } else if (t > TAKT.s10 && q > TAKT.s10) {           // Aufnahme zu Ende: intern weiter
          t += dt;
        } else if (seitStart > 3.0 && q < 0.05) {            // Aufnahme startet nicht: eigene Uhr
          quelle = null;
        }                                                    // sonst pausiert: Bild steht
      } else if (!opt.standbild) t += dt;
      bild(t);
      raf = global.requestAnimationFrame(tick);
    }
    function taste(e) { if (e.key === 'Escape') fertig(); }
    function fertig() {
      if (beendet) return;
      beendet = true;
      stopp();
      if (opt.onFertig) opt.onFertig();
    }
    function stopp() {
      laeuft = false;
      if (raf) global.cancelAnimationFrame(raf);
      global.removeEventListener('resize', layout);
      document.removeEventListener('keydown', taste);
      if (ro) ro.disconnect();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function schriftenBereit() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      var laden = Promise.all([
        document.fonts.load('700 46px ' + SCHRIFT.display),
        document.fonts.load('500 15px ' + SCHRIFT.mono),
        document.fonts.load('600 15px ' + SCHRIFT.mono),
        document.fonts.load('400 14px ' + SCHRIFT.mono)
      ]);
      var limit = new Promise(function (r) { global.setTimeout(r, 2500); });
      return Promise.race([laden, limit]).catch(function () {});
    }

    layout();
    global.addEventListener('resize', layout);
    document.addEventListener('keydown', taste);
    if (global.ResizeObserver) { ro = new global.ResizeObserver(layout); ro.observe(root); }
    schriftenBereit().then(function () {
      if (!laeuft) return;
      KOEPFE.forEach(passeKopf);
      SZ.forEach(function (sz) { if (sz.messen) { try { sz.messen(); } catch (err) {} } });
      bild(t);
      root.classList.remove('hw-laedt');
      raf = global.requestAnimationFrame(tick);
    });

    return { stopp: stopp, ueberspringen: fertig, zeit: function () { return t; } };
  }

  global.HWOpening = { starte: starte, FARBE: FARBE, SCHRIFT: SCHRIFT, TAKT: TAKT_STANDARD, version: '3' };
})(window);
