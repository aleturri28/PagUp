# 💳 PagUp

> **Un'applicazione wallet educativa ed accessibile progettata per persone con disabilità cognitive.**
> Permette di familiarizzare con la gestione del denaro reale e digitale tramite un'interfaccia ad altissimo contrasto (WCAG AAA), feedback aptico strutturato e touch target generosi (>48dp).

---

## 🛠️ Tech Stack & Architettura

*   **Frontend:** React Native (Expo SDK 54) + TypeScript
*   **Database & Auth:** Supabase Client (PostgreSQL)
*   **Stato dell'applicazione:** Zustand con persistenza locale
*   **Accessibilità:** Design inclusivo nativo con descrizioni vocali ed etichette accessibili
*   **Input Avanzato:** Riconoscimento vocale (Speech) ed estrazione testo tramite OCR fotocamera

---

## 🚀 Guida di Configurazione Rapida (Multipiattaforma)

Questa guida ti permetterà di configurare ed eseguire il progetto sia su **macOS** che su **Windows**, risolvendo tutti i conflitti locali grazie alla gestione continua del codice nativo di Expo (CNG).

### 1. Prerequisiti Comuni
Assicurati di aver installato sul tuo computer:
*   [Node.js (LTS v18 o v20)](https://nodejs.org/)
*   [Git](https://git-scm.com/)

---

### 💻 Guida di Installazione per **Windows**

Segui questi passaggi per configurare l'ambiente di sviluppo Android su Windows:

#### A. Installare il Java Development Kit (JDK 17)
1. Scarica e installa **OpenJDK 17 (Temurin)** da [Adoptium](https://adoptium.net/temurin/releases/?version=17).
2. Durante l'installazione, assicurati di selezionare la spunta per **"Add to PATH"** e **"Set JAVA_HOME variable"**.

#### B. Installare Android Studio e l'SDK
1. Scarica e installa [Android Studio](https://developer.android.com/studio).
2. Durante la prima installazione (Setup Wizard), installa:
   * **Android SDK** (raccomandata l'ultima versione disponibile)
   * **Android SDK Platform**
   * **Android Virtual Device (Emulator)**
3. Apri Android Studio, vai in **Settings (o SDK Manager)** > **Languages & Frameworks** > **Android SDK**:
   * Nella scheda **SDK Tools**, verifica che sia spuntato **Android SDK Platform-Tools** e clicca su *Apply*.

#### C. Configurare le Variabili d'Ambiente su Windows
Per consentire a Expo di trovare il tuo emulatore e compilare l'app, devi impostare le variabili d'ambiente di sistema:
1. Nella barra di ricerca di Windows, digita **"Variabili di ambiente"** e seleziona **"Modifica le variabili di ambiente relative al sistema"**.
2. Clicca sul pulsante **Variabili d'ambiente...** in basso a destra.
3. Nella sezione **Variabili dell'utente** (o di sistema), clicca su **Nuova...** e aggiungi:
   * **Nome variabile:** `ANDROID_HOME`
   * **Valore variabile:** `C:\Users\IL_TUO_UTENTE\AppData\Local\Android\Sdk` *(sostituisci IL_TUO_UTENTE con il tuo nome utente Windows)*
4. Nella stessa sezione, trova la variabile chiamata **`Path`** (o `PATH`), selezionala e clicca su **Modifica...**:
   * Clicca su **Nuova** e inserisci: `%ANDROID_HOME%\platform-tools`
   * Clicca su **Nuova** e inserisci: `%ANDROID_HOME%\emulator`
   * Clicca su *OK* per salvare tutto.

---

### 🍏 Guida di Installazione per **macOS**

Segui questi passaggi per configurare l'ambiente iOS e Android su Mac:

#### A. Installare i Prerequisiti con Homebrew
Se usi macOS, ti consigliamo di installare OpenJDK e altre utility tramite [Homebrew](https://brew.sh/):
```bash
# Installa il JDK 17
brew install openjdk@17

# Installa CocoaPods (necessario per i build nativi iOS)
sudo gem install cocoapods
```

#### B. Configurare il Terminale (`~/.zshrc`)
Apri il file di configurazione della shell (`~/.zshrc`) e aggiungi le seguenti righe per mappare l'SDK Android e Java:
```bash
# Java Home (OpenJDK 17)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Android SDK Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```
Salva il file e ricarica il terminale con `source ~/.zshrc`.

---

## 📦 Avvio dell'Applicazione (Tutti i Dispositivi)

Una volta completata la configurazione del sistema, puoi scaricare ed eseguire l'app in pochi secondi:

### 1. Clonare il Progetto e Installare le Dipendenze
```bash
# Clona la repository (se non lo hai già fatto)
git clone https://github.com/tuo-username/PagUp.git
cd PagUp

# Installa le dipendenze del progetto
npm install
```

### 2. Configurare le Variabili d'Ambiente del Progetto
1. Troverai nella cartella principale un file chiamato `.env.example`.
2. Crea una copia di questo file e nominala esattamente `.env` (questo file è protetto da `.gitignore` e rimarrà solo sul tuo computer):
   ```bash
   cp .env.example .env
   ```
3. Apri il file `.env` con un editor di testo e sostituisci i segnaposto con le tue credenziali Supabase personali o condivise:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://lpbghxwqrtsjerdxlaom.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_U_...
   ```

### 3. Eseguire l'App
Assicurati di avere un emulatore avviato (Android Emulator o iOS Simulator) o un dispositivo fisico collegato in modalità Debug USB.

*   **Avvio su Emulatore Android (Windows & Mac):**
    ```bash
    npm run android
    ```
*   **Avvio su Simulatore iOS (Solo macOS):**
    ```bash
    npm run ios
```
*   **Avvio in Modalità Expo Go (Web / Sviluppo rapido):**
    ```bash
    npm run start
    ```

---

## 🧹 Risoluzione dei Problemi & Cache

Se la compilazione nativa dovesse fallire a causa di cache corrotte o modifiche strutturali, esegui il comando di pulizia multipiattaforma:
```bash
npm run clean
```
Questo comando rimuoverà in modo sicuro le cache locali temporanee di Expo e Gradle senza toccare il tuo codice sorgente, consentendoti di effettuare una build pulita al successivo avvio.
