# Fresh Up – App zur smarten Trinkflasche

**Schluck für Schluck, bringt dich fit zurück.**

Fresh Up ist die Begleit-App zur (fiktiven) smarten Trinkflasche aus der Werbekampagne
„Fresh Up“ für Schule, Sport und Alltag. Die App läuft im Browser, lässt sich als App aufs Handy
installieren (PWA) und bringt eine simulierte Flasche mit, damit man alles ohne Hardware ausprobieren kann.

**Live:** https://marcelweissgerberit.github.io/FreshUp/

## Funktionen

| Aus der Kampagne | In der App |
| --- | --- |
| Alle 30 Minuten Erinnerung an einen Schluck | Erinnerungs-Timer in Flasche *und* App, Intervall 15/30/45/60 min, Ruhezeit 22–7 Uhr, „In 10 Min. erinnern“ |
| Flasche blinkt rot, wenn sie auf dem Tisch steht | Rotes Licht-Signal am Sockel, nur wenn die Flasche hell steht |
| Handy-App sendet zusätzlich eine Benachrichtigung | In-App-Banner, Systemmitteilung (Service Worker), Signalton, Vibration |
| Praktisch im Rucksack oder in der Sporttasche | Lichtsensor erkennt „dunkel“: LED aus, die App übernimmt |
| App zeigt Tagesziel, Fortschritt und Trinkverlauf | Home mit Tagesziel-Ring, „Nächster Schluck in …“, Flaschen-Karte (Füllstand, Akku), Tages-Zeitleiste; Statistik pro Stunde und für 7 Tage, Verlauf mit Löschen/Rückgängig |
| Fortschritt sichtbar und motivierend | Feedback „+45 ml“ am Ring, Erfolgskarte beim Tagesziel mit Serie, Zahl am App-Symbol bei fälliger Erinnerung |
| Blaue Balken zeigen den Trinkfortschritt | App schreibt 0–4 Balken (je 25 % des Tagesziels) an die Flasche |
| Deckel mit Klappverschluss (ca. 110°) | Deckel öffnen/schließen, Trinken nur bei offenem Deckel |
| 750 ml, transparenter Körper mit Skala | Füllstand live, Auffüllen, Skala 250/500/750 ml |
| Wiederverwendbar statt Einweg | Zähler „Einwegflaschen gespart“ |
| Fresh Up kaufen und App verbinden | Onboarding mit Einsatzbereich, Tagesziel und Bluetooth-Kopplung |
| Aufbau / Bauplan | Geräteseite mit Explosionsansicht, Bauteilen und technischen Daten |

Außerdem: manuelles Eintragen von Getränken ohne Flasche (mit Rückgängig), Hinweise „Flasche fast leer“
und „Akku schwach“, „Flasche finden“, Offline-Speicher der Flasche mit Nachlieferung, automatische
Wiederverbindung, „Als App installieren“, helles und dunkles Farbschema.

## Echte Flasche oder Demo-Flasche

- **Echte Flasche:** `Fresh Up suchen` nutzt Web Bluetooth (Chrome/Edge auf Android, Windows,
  macOS, ChromeOS). Das GATT-Protokoll steht in [docs/BLE-PROTOKOLL.md](docs/BLE-PROTOKOLL.md) –
  eine Flasche mit dieser Firmware lässt sich direkt koppeln.
- **Demo-Flasche:** simuliert die Firmware (Füllstand, Deckel, Lichtsensor, Timer, Akku,
  Offline-Speicher) und spricht über exakt dieselben Bytes mit der App. Auf dem Desktop steht sie
  neben der App, auf dem Handy öffnet sie sich über „Demo-Flasche“ oben rechts. Die Uhr läuft in
  Echtzeit; der Zeitraffer (60×, 300×) lässt 30 Minuten in 30 bzw. 6 Sekunden vergehen, „Echte
  Uhrzeit“ stellt sie zurück. Eine **Demo-Tour** führt durch die fünf wichtigsten Abläufe.

## 3D-Flasche

Die Demo-Flasche und das Bild auf der Geräteseite sind ein Echtzeit-3D-Modell (Three.js):
getöntes Glas mit Kondenstropfen und Spiegelungen, Wasser mit Lichtbrechung, das beim Kippen
waagerecht bleibt und nachschwappt, Bläschen beim Auffüllen, Klappdeckel mit 110°-Animation,
LED-Balken mit Lichtschein auf dem Tisch, Rucksack und Sporttasche. Zum Drehen ziehen.
Ohne WebGL 2 zeigt die App automatisch die SVG-Flasche.

## Lokal starten

Für die Seite selbst ist kein Build nötig – alle Dateien liegen fertig im Repo. Einen beliebigen
statischen Server im Projektordner starten:

```bash
npx serve .            # oder: python3 -m http.server 8080
```

Dann `http://localhost:3000` (bzw. `:8080`) öffnen. Service Worker und Mitteilungen brauchen
`localhost` oder HTTPS.

Nur wer das 3D-Modell ändert (`src/bottle3d.js`), baut das Bündel neu:

```bash
npm install
npm run build          # erzeugt js/bottle3d.js (Three.js + Modell, minifiziert)
```

## Aufbau

```
index.html              App-Oberfläche (Onboarding, Home, Statistik, Flasche, Einstellungen, Kopplung)
css/app.css             Gestaltung, helles und dunkles Farbschema
css/fonts.css           selbst gehostete Schriften (Sora, Source Sans 3, Caveat, JetBrains Mono)
js/protocol.js          BLE-GATT-Protokoll (UUIDs, Kodierung)
js/store.js             Zustand, Speicherung (localStorage), Uhr, Formatierung
js/connection.js        BleConnection (Web Bluetooth) und DemoConnection
js/sim-bottle.js        Firmware der Demo-Flasche
js/bottle-view.js       SVG-Flasche (Rückfall ohne WebGL)
src/bottle3d.js         3D-Flasche (Quelle) → js/bottle3d.js (gebündelt)
js/charts.js            Diagramme
js/demo-panel.js        Bedienfeld der Demo-Flasche
js/app.js               App-Logik
sw.js, manifest.webmanifest   PWA (offline, installierbar, Mitteilungen)
assets/img/             Produktbilder, KI-generiert mit OpenArt (Nano Banana Pro)
```

## Deployment

Jeder Push auf `main` veröffentlicht die Seite über GitHub Actions auf GitHub Pages
(`.github/workflows/pages.yml`). Die Umgebung `github-pages` erlaubt Deployments nur von `main`.

---

Fresh Up ist ein fiktives Produkt aus einer Werbekampagne für Schule, Sport und Alltag.
