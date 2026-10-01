# Fresh Up – Bluetooth-LE-Protokoll

Die App spricht mit der Flasche über einen eigenen GATT-Dienst. Die Demo-Flasche in der App
benutzt exakt dieselben Bytes, deshalb zeigt das Feld „Bluetooth-Datenverkehr“ echte Nutzdaten.
Definiert in [`js/protocol.js`](../js/protocol.js). Alle Mehrbyte-Werte sind Little Endian.

## Werbung (Advertising)

| Feld | Wert |
| --- | --- |
| Gerätename | `Fresh Up FU-750-XXXX` (Präfix `Fresh Up`) |
| Dienst-UUID | `6f1e0001-8c3b-4f2a-9d65-3a7b2c1e5f00` |

## Dienst `6f1e0001-…` (Fresh Up)

| Merkmal | UUID | Richtung | Nutzdaten |
| --- | --- | --- | --- |
| Füllstand | `6f1e0002-8c3b-4f2a-9d65-3a7b2c1e5f00` | Flasche → App (notify, read) | `uint16` Inhalt in ml (0–750) |
| Schluck | `6f1e0003-8c3b-4f2a-9d65-3a7b2c1e5f00` | Flasche → App (notify) | `uint16` ml · `uint32` Unix-Sekunden · `uint16` laufende Nummer |
| Status | `6f1e0004-8c3b-4f2a-9d65-3a7b2c1e5f00` | Flasche → App (notify, read) | `uint8` Flags: Bit 0 Erinnerung aktiv, Bit 1 Deckel offen, Bit 2 dunkel (in der Tasche) |
| Einstellungen | `6f1e0005-8c3b-4f2a-9d65-3a7b2c1e5f00` | App → Flasche (write) | `uint8` Intervall in Minuten · `uint8` Flags (Bit 0 Erinnerung an, Bit 1 rotes Licht an, Bit 2 Ruhezeit an) · `uint8` Ruhezeit-Beginn (Stunde) · `uint8` Ruhezeit-Ende (Stunde) · `uint8` LED-Helligkeit in % |
| LED-Fortschritt | `6f1e0006-8c3b-4f2a-9d65-3a7b2c1e5f00` | App → Flasche (write) | `uint8` Anzahl blauer Balken 0–4 (je 25 % des Tagesziels) |
| Befehl | `6f1e0007-8c3b-4f2a-9d65-3a7b2c1e5f00` | App → Flasche (write) | `uint8` `0x01` Flasche finden (LED blinkt blau), `0x02` Timer zurücksetzen (manuell getrunken) |
| Uhrzeit | `6f1e0008-8c3b-4f2a-9d65-3a7b2c1e5f00` | App → Flasche (write) | `uint32` Unix-Sekunden |

Zusätzlich bietet die Flasche den Standard-**Battery Service** (`0x180F`, Merkmal `0x2A19`, `uint8` Prozent).

## Ablauf

1. App koppelt, liest Füllstand, Status und Akku und abonniert die Benachrichtigungen.
2. App schreibt Uhrzeit, Einstellungen und den aktuellen LED-Fortschritt.
3. Erkennt der Füllstandsensor einen Schluck, sendet die Flasche `Schluck` und den neuen `Füllstand`.
   Ohne Verbindung speichert die Flasche Schlucke und liefert sie beim nächsten Verbinden nach.
   Die laufende Nummer verhindert doppelte Einträge.
4. Die Flasche führt den Erinnerungs-Timer selbst: Nach dem Intervall ohne Schluck setzt sie das
   Status-Bit „Erinnerung aktiv“ und blinkt rot – aber nur, wenn sie hell steht (Lichtsensor).
   In der Tasche bleibt die LED aus, dann erinnert die App per Mitteilung.
5. Nach jedem Schluck berechnet die App den Tagesfortschritt und schreibt die Balkenzahl zurück.

## Beispiel

Schluck von 45 ml am 1.10.2026 um 11:20:00 UTC (Unix 1790853600), laufende Nummer 1:

```
2d 00 | e0 41 be 6a | 01 00
 45ml |  Zeitstempel | Nr. 1
```
