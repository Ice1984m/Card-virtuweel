# Card-virtuweel

Beheer certificaten, licenties en posts met goedkeuringsworkflow en een **sandbox prepaid wallet**.

---

## 📲 App installeren op Android

[![Download APK](https://img.shields.io/badge/⬇%20Download%20APK-installeer%20direct-brightgreen?style=for-the-badge)](https://github.com/Ice1984m/Card-virtuweel/releases/download/card-virtuweel-apk/Card-virtuweel.apk)

**3 stappen, klaar:**

1. Tik op de knop hierboven op uw Android-telefoon → APK wordt gedownload
2. Open het gedownloade bestand en tik op **Installeren**  
   *(eenmalig: Instellingen → sta installatie van onbekende bronnen toe)*
3. Open **Card-virtuweel** vanaf uw startscherm

> De app verbindt automatisch met de live server op `https://card-virtuweel.onrender.com`.

---

## ⚙️ Automatisch live zetten (geen handmatige stappen)

Alles is geautomatiseerd via GitHub Actions en Render.com:

| Actie | Resultaat |
|---|---|
| Push naar `main` | Server deployt automatisch op Render.com |
| Push naar `main` | Nieuwe APK wordt automatisch gebouwd en gepubliceerd |
| Download-URL | `releases/download/card-virtuweel-apk/Card-virtuweel.apk` altijd actueel |

De `render.yaml` in deze repo regelt de Render.com-deployment automatisch zodra u de repository koppelt aan uw Render-account.

### Render.com eenmalig instellen

1. Ga naar [render.com](https://render.com) → **New → Web Service**
2. Koppel **deze GitHub-repository** — Render leest `render.yaml` automatisch
3. Klaar — bij elke push naar `main` deployt de server vanzelf

[![Build APK](https://github.com/Ice1984m/Card-virtuweel/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Ice1984m/Card-virtuweel/actions/workflows/build-apk.yml)

---

## Functionaliteiten

- **Certificaten & Licenties** – Upload en beheer uw certificaten (VOG, KvK, ISO, etc.)
- **Posts & Advertenties** – Maak posts aan die eerst worden goedgekeurd voordat betaling mogelijk is
- **Admin Paneel** – Keur certificaten en posts goed of wijs ze af
- **Betaalgating** – De betaaloptie verschijnt pas na goedkeuring door een admin
- **Sandbox wallet** – Vraag een testkaart aan, laad op via een server-side autorisatieflow en betaal met saldo
- **Auditlog** – Top-ups, bevestigingen en mislukte autorisaties worden bijgehouden
- **PWA** – Ook installeerbaar via Chrome → menu ⋮ → "Toevoegen aan startscherm"

## Sandbox betaalflow

De repository gebruikt geen echte PAN-, CVC-, itsme- of bankgegevens. In plaats daarvan:

1. Open `/wallet` en maak een sandbox prepaid kaart aan
2. Start een top-up en bevestig deze via de sandbox providerpagina
3. Ga naar een goedgekeurde post en start daar de beveiligde betaalautorisatie
4. De app toont pas bevestigd saldo of een voltooide aankoop na server-side verwerking

> Voor productie integreert u een erkende provider voor issuing, SCA en webhooks.

### API checks voor livegang

- `GET /wallet/api/status` toont walletstatus, openstaande bevestigingen en live-goedkeuringschecks
- `GET /wallet/api/invoices` toont alle gegenereerde facturen inclusief betaalstatus
- `POST /wallet/api/invoices` genereert een nieuwe factuur met `description`, `amount` en optioneel `dueDate`
- `POST /wallet/api/invoices/:id/pay` start een sandbox betaalintentie voor een open factuur
- `POST /wallet/api/wallet/bank-account` koppelt een IBAN aan de sandbox wallet met body `{ "iban": "BE..." }`
- `GET /wallet/api/approvals` genereert een sandbox-dev live/Render goedkeuringsrapport
- `GET /wallet/api/intents/:id` toont of een top-up of betaling is gelukt of mislukt
- `POST /wallet/api/intents/:id/confirm` voert een testbevestiging uit met `decision=approve|fail|cancel`

---

## Lokaal ontwikkelen

```bash
npm install
npm start
# App draait op http://localhost:4242
```

Optioneel in `.env`:

```
PORT=4242
APK_DOWNLOAD_URL=https://github.com/Ice1984m/Card-virtuweel/releases/download/card-virtuweel-apk/Card-virtuweel.apk
```
