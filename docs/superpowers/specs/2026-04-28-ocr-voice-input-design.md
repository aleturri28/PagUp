# OCR & Voice Input — Design Spec
**Date:** 2026-04-28  
**Project:** PagUp — Fase 3  
**Status:** Approved

---

## Context

`PaymentWizard.tsx` è già completamente implementato: camera overlay, wave animation, bottoni FOTO/VOCE, busy states, permission denied flows, auto-fill badge con animazione glow.

**I due hook sono stub vuoti.** Questo spec descrive la loro implementazione.

Dipendenze già installate:
- `@react-native-ml-kit/text-recognition` ^2.0.0
- `@react-native-voice/voice` ^3.2.4
- `expo-camera` ~17.0.10
- `expo-av` ~16.0.8

Permessi già configurati in `app.json` (stringhe in italiano).

---

## Architecture

```
useOCRScanner
  ├── expo-camera  → useCameraPermissions()
  ├── @react-native-ml-kit/text-recognition → TextRecognition.recognize(uri)
  └── smartExtract(rawText) → number | null

useVoiceInput
  ├── expo-av → Audio.requestPermissionsAsync()
  ├── @react-native-voice/voice → Voice.start('it-IT')
  └── italianWordsToAmount(transcript) → number | null
```

Nessuna dipendenza tra i due hook. Ognuno è autonomo su stato, permessi, errori.

---

## `useOCRScanner`

### Interface (già consumata da PaymentWizard)

```ts
interface UseOCRScannerReturn {
  isScanning: boolean;
  lastResult: number | null;
  error: string | null;
  cameraGranted: boolean;
  cameraCanAskAgain: boolean;
  requestCameraPermission: () => Promise<boolean>;
  scanImage: (uri: string) => Promise<void>;
  clearError: () => void;
}
```

### `scanImage` flow

1. `isScanning = true`, `error = null`
2. `TextRecognition.recognize(uri)` → testo grezzo
3. `smartExtract(testo)` → `number | null`
4. Se numero trovato → `lastResult = numero`, haptic `NotificationFeedbackType.Success`
5. Se non trovato → `error = "Nessun importo trovato. Riprova con il totale ben visibile."`
6. `isScanning = false` (in finally)

### `smartExtract` algorithm

```
Per ogni riga del testo:
  1. Cerca tutti i pattern /(\d{1,4}[.,]\d{2})/g
  2. Calcola score della riga:
     +10 se riga contiene "TOTALE" | "TOTAL" | "TOT"
     +5  se riga contiene "EURO" | "EUR" | "DA PAGARE" | "IMPORTO"
  3. Normalizza candidato: sostituisce ',' con '.' → parseFloat
  4. Scarta valori > 9999.99 (impossibili per uno scontrino normale)

Selezione finale:
  - Prende il candidato con score più alto
  - A parità di score: prende il valore più alto (solitamente il totale)
  - Se nessun candidato → restituisce null
```

### Permessi

Usa `useCameraPermissions()` da `expo-camera`:
- `cameraGranted` = `status === 'granted'`
- `cameraCanAskAgain` = `canAskAgain`
- `requestCameraPermission` → chiama `requestPermission()`, restituisce boolean

---

## `useVoiceInput`

### Interface (già consumata da PaymentWizard)

```ts
interface UseVoiceInputReturn {
  isListening: boolean;
  isProcessing: boolean;
  lastResult: number | null;
  error: string | null;
  microphoneCanAskAgain: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  clearError: () => void;
}
```

### Flow

1. `startListening`:
   - Chiede permesso microfono via `Audio.requestPermissionsAsync()`
   - Se negato permanentemente → `microphoneCanAskAgain = false`, `error = "Microfono non autorizzato. Aprilo dalle impostazioni."`
   - Se negato ma richiedibile → `error = "Serve il microfono per l'input vocale."`
   - Se concesso → `Voice.start('it-IT')`, `isListening = true`

2. `onSpeechResults`:
   - `isListening = false`, `isProcessing = true`
   - Prende il primo risultato `results[0]`
   - `italianWordsToAmount(transcript)` → numero
   - Se trovato → `lastResult = numero`
   - Se non trovato → `error = "Non ho capito l'importo. Prova a dire: quindici euro e cinquanta."`
   - `isProcessing = false`

3. `stopListening`:
   - `Voice.stop()`, `isListening = false`

4. Cleanup `useEffect`: `Voice.destroy()` + rimuove listener su unmount.

### `italianWordsToAmount` pre-processor

**Step 1 — regex diretta** (es. utente parla di cifre):
- Pattern `(\d{1,4})[,. ](\d{2})` → `"15,50"` / `"15.50"` / `"15 50"` = `15.50`
- Pattern `(\d{1,4})` solo = `"15"` = `15.00`

**Step 2 — parole italiane** (se step 1 fallisce):
```
Dizionario unità: uno=1 due=2 tre=3 quattro=4 cinque=5 sei=6 sette=7
                  otto=8 nove=9 dieci=10 undici=11 dodici=12 tredici=13
                  quattordici=14 quindici=15 sedici=16 diciassette=17
                  diciotto=18 diciannove=19

Dizionario decine: venti=20 trenta=30 quaranta=40 cinquanta=50
                   sessanta=60 settanta=70 ottanta=80 novanta=90

Centinaia: cento=100 duecento=200 ... novecento=900

Separatori decimali: "virgola" | "punto" | "e mezzo" (=50)
  - "e" = separatore decimale SOLO se token successivo è parola di centesimi. Altrimenti parte intera.

Logica:
  - Split transcript in token
  - Accumula parte intera sommando unità/decine/centinaia
  - Quando trova separatore decimale → switch a parte decimale
  - Parte decimale: due token → "cinquanta" = 50 centesimi
  - Risultato: intero + decimale/100
  - Limite max: 9999.99
```

**Esempi:**
| Utterance | Output |
|---|---|
| "quindici euro e cinquanta" | 15.50 |
| "venti euro" | 20.00 |
| "due euro e trenta" | 2.30 |
| "cento e venti virgola novanta" | 120.90 |
| "15,50" | 15.50 |
| "quindici virgola cinquanta" | 15.50 |

---

## Error Handling

| Scenario | `error` message | `canAskAgain` |
|---|---|---|
| Camera negata, richiedibile | — (UI gestita da CameraOverlay) | true |
| Camera negata permanente | — (UI gestita da CameraOverlay) | false |
| Nessun testo in foto | "Nessun importo trovato. Riprova con il totale ben visibile." | — |
| ML Kit throw | "Errore nella lettura. Riprova." | — |
| Microfono negato richiedibile | "Serve il microfono per l'input vocale." | true |
| Microfono negato permanente | "Microfono non autorizzato. Aprilo dalle impostazioni." | false |
| Voce non capita | "Non ho capito l'importo. Prova a dire: quindici euro e cinquanta." | — |
| Voice engine error | "Errore nel riconoscimento vocale. Riprova." | — |

Tutti gli Alert e le UI di errore sono **già implementati** in PaymentWizard — l'hook deve solo popolare `error`.

---

## Files da creare/modificare

| File | Azione |
|---|---|
| `src/hooks/useOCRScanner.ts` | Implementare (stub attuale: 1 riga) |
| `src/hooks/useVoiceInput.ts` | Implementare (stub attuale: 1 riga) |
| `app.json` | Verificare plugin `expo-av` se non presente |

**Non toccare** `PaymentWizard.tsx` — già completo.

---

## Out of scope

- Cloud OCR
- Whisper API
- Mock per Expo Go
- Test automatici per i hook nativi (Voice/ML Kit non mockabili facilmente in Jest)
