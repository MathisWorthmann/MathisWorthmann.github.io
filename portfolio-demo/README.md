# Portfolio-Demo der Rätseljagd

Spielbare Mini-Version für das Portfolio: eine Station (der Turm zum
Zusammenschieben), sonst nichts aus dem Spiel. Der Ordner ist eigenständig –
er braucht keine Datei außerhalb von `portfolio-demo/`.

## Ablauf

1. Start mit vorausgefülltem Code „DEMO“, „Jetzt aktivieren“ gibt den Ton frei
   (keine Prüfung, kein Backend)
2. Opening-Sequenz der App mit der Dienstmeldung (überspringbar; nur beim
   frischen Start, nicht beim Wiedereinstieg)
3. Einleitung: Rileys Intro und Dr. Dangers Übernahme (Originalnachrichten
   mit Aufnahme), danach ein sachlicher Hinweis, dass die Demo nur eine
   Station zeigt
4. Station mit 360-Grad-Foto und „Ich bin da“
5. Rileys Sprachnachricht (Originalaufnahme), dann das Turm-Puzzle mit drei
   gestaffelten Hinweisen; „Turm ansehen“ führt zurück ins Rundumfoto
6. Auflösung durch Riley, „Ende der Demo“ mit Link zur Buchungsseite

## Einbetten

```html
<iframe src="…/portfolio-demo/" width="390" height="844"
        style="border:0" allow="autoplay" title="Hidden Waypoint – Demo"></iframe>
```

## Lokal testen

Die Seite braucht einen Webserver (WebGL lädt das Rundumfoto nicht über
`file://`), z. B. `python3 -m http.server` im Ordner `portfolio-demo/` und dann
`http://localhost:8000/`.

## Regeln

- Fortschritt nur unter `hw_demo_fortschritt`; die Speicherschlüssel der App
  werden nie angefasst.
- `support.js` und `vendor/` sind unveränderte Kopien aus dem Projekt-Root.
- `opening/hw-opening.js` und `.css` sind unveränderte Kopien; wie im Projekt
  gilt: außer den Tokens `SCHRIFT` und `FARBE` nichts ändern. Ändert sich das
  Original oder die Aufnahme, neu kopieren.
- Der Server muss `.css` als `text/css` ausliefern, sonst verwirft der Browser
  das Stylesheet der Opening-Sequenz und ihre Knöpfe liegen außerhalb des Bilds.
- Keine Inhalte anderer Stationen: Vor jeder Änderung den Ordner gegen die
  Stationsnamen und Lösungen aus `uploads/Waypoint_Inhaltsstand.md` greppen.
