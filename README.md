# Card-virtuweel

Een Node.js/Express webapplicatie voor het beheren van certificaten, licenties en posts met een goedkeuringsworkflow en **NFC-betaling**.

## 📥 Download

[![Download Source Code](https://img.shields.io/badge/📥%20Download-Source%20Code-brightgreen?style=for-the-badge&logo=github)](https://github.com/Ice1984m/Card-virtuweel/archive/refs/heads/main.zip)

## Functionaliteiten

- **Certificaten & Licenties** – Upload en beheer uw certificaten (VOG, KvK, ISO, etc.) met bestandsupload (PDF/JPG/PNG).
- **Posts & Advertenties** – Maak posts aan die eerst worden goedgekeurd voordat betaling mogelijk is.
- **Admin Paneel** – Keur certificaten en posts goed of wijs ze af.
- **Betaalgating** – De betaaloptie verschijnt pas nadat een post is goedgekeurd door een admin.
- **NFC-betaling** – Betaal via NFC (Web NFC API) op Android-apparaten in Chrome.
- **PWA** – Installeerbaar als app op Android via "Toevoegen aan startscherm" in Chrome.

## NFC-betaling

De NFC-betaalfunctie maakt gebruik van de **[Web NFC API](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API)**.

### Vereisten
- **Chrome voor Android** (versie 89 of hoger)
- NFC ingeschakeld op het apparaat
- Pagina geserveerd via **HTTPS** (of localhost voor ontwikkeling)

### Hoe het werkt
1. Ga naar een goedgekeurde post
2. Kies tabblad "📲 NFC Betalen"
3. Klik op "Start NFC-betaling"
4. Houd uw NFC-kaart of betaalapparaat tegen de achterkant van uw telefoon
5. De betaling wordt bevestigd zodra de NFC-tag is gelezen

> **Let op:** De Web NFC API leest NFC-tags via de browser. Voor echte betalingsverwerking dient u een betaalprovider (bijv. Stripe, Adyen) te integreren.

## PWA installeren (Android)

1. Open de app in Chrome op Android
2. Tik op het menu (⋮) → "Toevoegen aan startscherm"
3. De app wordt geïnstalleerd en is offline beschikbaar

## 📦 APK bouwen en installeren

[![Build APK](https://github.com/Ice1984m/Card-virtuweel/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Ice1984m/Card-virtuweel/actions/workflows/build-apk.yml)

### Stap 1 – Deploy de server (gratis via Render)

De APK opent de Card-virtuweel webserver via een ingebouwde browser (WebView).  
De server moet bereikbaar zijn via een publieke HTTPS-URL.

1. Ga naar [render.com](https://render.com) en maak een gratis account
2. Klik op **New → Web Service** en koppel deze GitHub-repository
3. Stel in:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Kopieer uw Render-URL, bijv. `https://card-virtuweel.onrender.com`

### Stap 2 – URL instellen in de app

Open het bestand `android/app/src/main/res/values/strings.xml` en vervang de URL:

```xml
<string name="app_url">https://JOUW-RENDER-URL.onrender.com</string>
```

### Stap 3 – APK bouwen via GitHub Actions

1. Commit en push uw wijziging naar GitHub
2. Maak een nieuw release-tag aan:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. GitHub Actions bouwt automatisch de APK en maakt een **GitHub Release** aan
4. Download de APK via:  
   👉 **[Releases](https://github.com/Ice1984m/Card-virtuweel/releases/latest)**  
   of direct: [Card-virtuweel.apk](https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk)

### Stap 4 – APK installeren op Android

1. Kopieer de APK naar uw Android-telefoon
2. Ga naar **Instellingen → Apps → Speciale app-toegang → Onbekende apps** en sta installatie toe voor uw bestandsbeheerder
3. Open het APK-bestand en kies **Installeren**
4. Open de geïnstalleerde **Card-virtuweel** app

> **Handmatig bouwen** (lokaal, vereist Android SDK):
> ```bash
> cd android
> gradle wrapper --gradle-version 8.4
> chmod +x gradlew
> ./gradlew assembleDebug
> # APK staat in: android/app/build/outputs/apk/debug/app-debug.apk
> ```

### APK-downloadlink in de webapp tonen

Wilt u een directe APK-downloadlink in de webinterface tonen, stel dan in `.env`:

```
APK_DOWNLOAD_URL=https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk
```

Daarna verschijnt op `/` en `/install` een knop **Download APK** plus de volledige APK-link. Zonder deze variabele blijft de PWA-installatie via Chrome zichtbaar als fallback.

## Installatie

```bash
npm install
```

## Starten

```bash
npm start
```

De applicatie start op **http://localhost:4242** (configureerbaar via `.env`).

## Projectstructuur

```
├── server.js                  # Express entrypoint
├── routes/
│   ├── certificates.js        # Certificaten & licenties routes
│   ├── posts.js               # Posts routes + betaalgating + NFC
│   ├── admin.js               # Admin goedkeuringsroutes
│   ├── layout.js              # Gedeelde HTML layout (PWA meta)
│   └── helpers.js             # Gedeelde hulpfuncties
├── public/
│   ├── style.css              # Stijlblad (incl. NFC animatie)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker
│   └── icons/                 # PWA-iconen (192px, 512px)
├── android/                   # Android WebView APK-project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/cardvirtuweel/app/MainActivity.java
│   │   │   ├── res/values/strings.xml  # ← app_url hier aanpassen
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle
│   ├── build.gradle
│   └── settings.gradle
├── .github/workflows/
│   └── build-apk.yml          # GitHub Actions: bouwt APK bij tag-push
├── data/
│   ├── certificates.json      # Certificaatopslag (JSON)
│   └── posts.json             # Postopslag (JSON)
├── uploads/
│   └── certificates/          # Geüploade bestanden
└── .env                       # Configuratie (PORT=4242)
```

## Workflow

1. **Certificaat toevoegen**: Ga naar `/certificates/new` en vul het formulier in.
2. **Post aanmaken**: Ga naar `/posts/new` en koppel optioneel een goedgekeurd certificaat.
3. **Admin goedkeuring**: Ga naar `/admin` en keur certificaten en posts goed of af.
4. **Betaling**: Na goedkeuring kiest u NFC-betaling of kaartbetaling op de postpagina.

## Configuratie

Bewerk het `.env` bestand:

```
PORT=4242
APK_DOWNLOAD_URL=https://example.com/downloads/Card-virtuweel.apk
```
