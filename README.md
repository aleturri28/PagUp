# 💳 PagUp

> Wallet educativo e accessibile per persone con disabilità cognitive. Contrasto WCAG AAA, feedback aptico, touch target ampi (>48dp).

---

## Tech Stack

- React Native (Expo SDK 54) + TypeScript
- Supabase (PostgreSQL + Auth)
- Zustand con persistenza locale
- Input vocale + OCR camera

---

## Setup

**Prerequisiti:** Node.js LTS, Git, JDK 17, Android Studio (Windows/Mac) o Xcode (solo Mac).

```bash
git clone https://github.com/tuo-username/PagUp.git
cd PagUp
npm install
cp .env.example .env   # inserisci le tue credenziali Supabase
```

## Avvio

```bash
npm run android   # Android
npm run ios       # iOS (solo macOS)
npm run start     # Expo Go / web
```

## Problemi di build

```bash
npm run clean
```

Pulisce cache Expo/Gradle senza toccare il codice.
