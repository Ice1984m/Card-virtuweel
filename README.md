# Card-virtuweel

Beheer certificaten, licenties en posts met goedkeuringsworkflow en **NFC/kaartbetaling**.

---

## 📲 App installeren op Android

[![Download APK](https://img.shields.io/badge/⬇%20Download%20APK-installeer%20direct-brightgreen?style=for-the-badge)](https://card-virtuweel.onrender.com/download/apk)

**3 stappen, klaar:**

1. Tik op de knop hierboven op uw Android-telefoon → APK wordt direct gedownload (of u krijgt automatische installatie-instructies als de release nog niet klaarstaat)
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
| Download-URL | Gebruik `/download/apk` op de live site; deze route downloadt de APK als die bestaat en geeft anders duidelijke fallback-instructies |

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
- **NFC-betaling** – Betaal via NFC (Web NFC API) op Android in Chrome
- **PWA** – Ook installeerbaar via Chrome → menu ⋮ → "Toevoegen aan startscherm"

## NFC-betaling

Vereisten: Chrome voor Android (v89+), NFC ingeschakeld, pagina via HTTPS.

1. Ga naar een goedgekeurde post → tabblad "📲 NFC Betalen"
2. Klik op "Start NFC-betaling" en houd uw NFC-kaart tegen de telefoon

> Voor echte betalingsverwerking integreert u een betaalprovider (bijv. Stripe, Adyen).

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
APK_DOWNLOAD_URL=https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk
```
