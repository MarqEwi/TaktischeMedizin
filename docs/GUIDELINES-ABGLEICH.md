# Abgleich mit den TCCC-Leitlinien (Stand 01.05.2026)

Fachliche Grundlage des Contents:

- **CoTCCC TCCC Guidelines, 01 May 2026** (englisches Original)
- **TCCC-Leitlinien V1.5, deutsche Fassung von TCCC Deutschland / DBRD Akademie**
  (Stand 01.05.2026)
- **TCCC-CLS-Skillcards** (Deployed-Medicine-Format):
  #TCCC-CLS-SC1-04 „Two-Handed (Windlass) Tourniquet Application – CUF" und
  #TCCC-CLS-SC1-24 „Needle Decompression of the Chest (NDC)"

Die PDFs selbst liegen **nicht** im Repository (Urheberrecht); dieser Abgleich
dokumentiert, welcher Leitlinienabschnitt welches Content-Element begründet.

## Abbildung Leitlinie → Content

| Leitlinie | Umsetzung in der App |
|---|---|
| CUF 1–3: Deckung, Selbsthilfe | Aktion `move_to_cover`, Phase CUF, Regel `sr_move_to_cover` |
| CUF 6: TQ über Uniform, „hoch und fest" | `tq_anlegen` in allen Phasen erlaubt, Beschreibung differenziert CUF/TFC |
| CUF 7: Atemweg erst in TFC | Atemwegsaktionen `phases: [TFC, TACEVAC]`, Verstoß → `sr_phase_discipline` |
| TFC 3a: unbemerkte Blutungen suchen | `assess_koerpercheck` (Blood Sweep), Regel `sr_koerpercheck` |
| TFC 3b: Hämostyptikum + 3 min Druck | `wound_packing` (240 s Zeitkosten, Beschreibung) |
| TFC 3d/6b: Schockzeichen (Bewusstsein, Radialispuls) | Befunde `f_pulse_weak`/`f_pulse_absent_radial`, AVPU-Ableitung aus Zuständen |
| TFC 4c: wacher Patient wählt atemwegsschützende Position | **Neu:** `aufrecht_lagern` (erste Wahl in `sr_airway`) |
| TFC 4d: stabile Seitenlage bei Bewusstlosen | `stabile_seitenlage` |
| TFC 5a: Spannungspneu-Verdachtskriterien | Befunde: einseitig abgeschwächtes Atemgeräusch, Tachypnoe, SpO₂-Abfall, Schock |
| TFC 5a: „Chest Seal zuerst lüften/entfernen" | **Neu:** `chest_seal_lueften` (Burping), erste Option auch für CLS |
| TFC 5a: NDC 14G/10G, 5. ICR VAL / 2. ICR MCL | `entlastungspunktion` (Beschreibung, Erfolgs-Feedback „hörbares Entweichen") |
| TFC 5b: Seal sofort, danach auf Spannungspneu überwachen | `chest_seal` + **neue Progressionsregel** `pr_sealed_chest_residual` (Restprogression nach Seal) |
| TFC 6a: TQ-Neubeurteilung, Anlagezeit dokumentieren | **Neu:** `tq_kontrolle` + Regel `sr_tq_reassess` (greift nur nach TQ-Anlage) |
| TFC 6d: TXA 2 g ≤ 3 h; Indikationen Schock/Amputation/penetrierender Thorax/SHT | `txa_geben` mit vier Indikations-Zweigen (`allowControlled` für versorgte Blutungen) |
| TFC 7: Hypothermieprophylaxe früh und aggressiv | `waermeerhalt` (Beschreibung nach 7a–e), Trauma-Triade über `pr_shock_to_hypothermie` |
| TFC 8f: neurologischen Status alle 5–10 min | allgemeine Reassessment-Regel `sr_reassessment` |
| TFC 11: Analgesie CWMP / Ketamin (AVPU dokumentieren, entwaffnen) | **Neu:** `analgesie_cwmp` (alle Rollen), `analgesie_ketamin` (Medic+), Regeln `sr_analgesie_basis`/`sr_analgesie_medic` |
| TFC 17: keine CPR bei penetrierendem Trauma ohne Lebenszeichen | Kreislaufstillstand beendet das Szenario (Outcome „verstorben") |
| Skillcard SC1-24 (CLS): NDC gehört zum CLS-Skillset | `entlastungspunktion` für Rolle `cls` freigegeben; `sr_needle_decomp` gilt rollenübergreifend |

## Skillcards in der App

`content/skillcards.json` enthält die Schritt-für-Schritt-Anleitungen:
die beiden offiziellen Karten (TQ, NDC) übersetzt und fünf weitere, aus den
Leitlinienabschnitten abgeleitete Karten (Chest Seal, Wound Packing, NPA,
Lagerung, Wärmeerhalt). Jede Karte verweist per `actionId` auf ihre Aktion
(Info-Symbol im Simulationsscreen) und erscheint in der Lernübersicht.
Die Illustrationen (`img/skillcards/*.webp`) sind eigene, mit Higgsfield im
Stil der Original-Skillcards erzeugte Grafiken (Stilreferenz: SC1-04).

## Bewusst (noch) nicht umgesetzt

Diese Leitlinieninhalte sind dokumentierte Roadmap-Punkte, keine Lücken aus
Versehen – das Datenmodell trägt sie bereits (neue Zustände/Aktionen/Regeln
genügen):

- Flüssigkeitstherapie und Blutprodukte (TFC 6e), i.v./i.o.-Zugang, Calcium
- Beckenschlinge (TFC 6a), junktionales Tourniquet, iTClamp, XStat
- TQ-Konversion nach 2 h (Fälle sind kürzer als 20 min)
- Koniotomie (TFC 4f), Absaugung, Beutel-Masken-Beatmung als eigene Aktion
- Antibiotika (TFC 12), Augenschutz (TFC 9), Verbrennungen (TFC 15),
  Frakturschienung (TFC 16), abdominelle Eviszeration (TFC 13b)
- TCCC-Karte (DD 1380) als eigenes Dokumentations-Feature
- SHT-Vertiefung (Herniation, hypertone Kochsalzlösung, EtCO₂)
