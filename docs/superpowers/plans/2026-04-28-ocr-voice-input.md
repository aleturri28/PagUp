# OCR & Voice Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `useOCRScanner` and `useVoiceInput` hooks so PagUp can auto-fill the payment amount from a receipt photo or spoken words.

**Architecture:** Two independent hooks wrapping native modules (`@react-native-ml-kit/text-recognition`, `@react-native-voice/voice`). Pure extraction logic lives in separate utility files (`smartExtract`, `italianWordsToAmount`) so it can be unit-tested without native dependencies. The hooks themselves are verified via manual device testing only.

**Tech Stack:** React Native 0.81 / Expo 54, expo-camera (permissions), expo-av (mic permissions), @react-native-ml-kit/text-recognition ^2.0.0, @react-native-voice/voice ^3.2.4, jest-expo (tests), TypeScript strict.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/smartExtract.ts` | **Create** | Pure fn: raw OCR text → best price number |
| `src/utils/italianWordsToAmount.ts` | **Create** | Pure fn: Italian speech transcript → number |
| `src/utils/__tests__/smartExtract.test.ts` | **Create** | Unit tests for smartExtract |
| `src/utils/__tests__/italianWordsToAmount.test.ts` | **Create** | Unit tests for italianWordsToAmount |
| `src/hooks/useOCRScanner.ts` | **Replace stub** | Hook: camera permissions + ML Kit + smartExtract |
| `src/hooks/useVoiceInput.ts` | **Replace stub** | Hook: mic permissions + Voice STT + italianWordsToAmount |

**Do NOT touch** `src/screens/student/PaymentWizard.tsx` — already consumes the hooks correctly.

---

## Task 1: Jest Setup

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd "$(git rev-parse --show-toplevel)"
npx expo install jest-expo @testing-library/react-native @types/jest
```

Expected: packages added to node_modules, package.json updated.

- [ ] **Step 2: Add Jest config to package.json**

Open `package.json`. Add a `"jest"` key alongside `"dependencies"`:

```json
"jest": {
  "preset": "jest-expo",
  "testPathIgnorePatterns": [
    "/node_modules/",
    "\\.worktrees/"
  ],
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native|@react-native-ml-kit|@react-native-voice|react-native-reanimated|react-native-gesture-handler)/)"
  ]
}
```

- [ ] **Step 3: Verify Jest runs**

```bash
npx jest --listTests
```

Expected: empty list (no test files yet). No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jest-expo test setup"
```

---

## Task 2: `smartExtract` utility (TDD)

**Files:**
- Create: `src/utils/smartExtract.ts`
- Create: `src/utils/__tests__/smartExtract.test.ts`

- [ ] **Step 1: Create failing tests**

Create `src/utils/__tests__/smartExtract.test.ts`:

```typescript
import { smartExtract } from '../smartExtract';

describe('smartExtract', () => {
  it('returns null for empty string', () => {
    expect(smartExtract('')).toBeNull();
  });

  it('extracts price with comma separator', () => {
    expect(smartExtract('TOTALE 15,50')).toBe(15.50);
  });

  it('extracts price with dot separator', () => {
    expect(smartExtract('TOTAL 15.50')).toBe(15.50);
  });

  it('prefers TOTALE line over other prices', () => {
    const text = 'Pane 2,50\nFormaggi 8,30\nTOTALE 10,80';
    expect(smartExtract(text)).toBe(10.80);
  });

  it('picks highest value when scores are equal', () => {
    expect(smartExtract('2,50\n8,30\n3,00')).toBe(8.30);
  });

  it('returns null for values over 9999.99', () => {
    expect(smartExtract('TOTALE 10000,00')).toBeNull();
  });

  it('prefers EURO keyword line over plain line', () => {
    expect(smartExtract('5,00\n12,90 EURO')).toBe(12.90);
  });

  it('handles DA PAGARE keyword', () => {
    expect(smartExtract('Subtotale 9,50\nDA PAGARE 9,50')).toBe(9.50);
  });

  it('returns null when no price pattern found', () => {
    expect(smartExtract('Grazie per la visita')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/utils/__tests__/smartExtract.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../smartExtract'`

- [ ] **Step 3: Implement `smartExtract`**

Create `src/utils/smartExtract.ts`:

```typescript
const PRICE_RE = /(\d{1,4}[.,]\d{2})/g;
const TOTAL_RE = /\b(totale|total|tot)\b/i;
const PRIORITY_RE = /\b(euro|eur|da pagare|importo)\b/i;
const MAX_AMOUNT = 9999.99;

interface Candidate {
  value: number;
  score: number;
}

export function smartExtract(rawText: string): number | null {
  const candidates: Candidate[] = [];

  for (const line of rawText.split(/\n|\\n/)) {
    const matches = [...line.matchAll(PRICE_RE)];
    if (!matches.length) continue;

    let score = 0;
    if (TOTAL_RE.test(line)) score += 10;
    else if (PRIORITY_RE.test(line)) score += 5;

    for (const match of matches) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (value > 0 && value <= MAX_AMOUNT) {
        candidates.push({ value, score });
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest src/utils/__tests__/smartExtract.test.ts --no-coverage
```

Expected: PASS — 9/9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/smartExtract.ts src/utils/__tests__/smartExtract.test.ts
git commit -m "feat: add smartExtract utility for receipt OCR amount detection"
```

---

## Task 3: `italianWordsToAmount` utility (TDD)

**Files:**
- Create: `src/utils/italianWordsToAmount.ts`
- Create: `src/utils/__tests__/italianWordsToAmount.test.ts`

- [ ] **Step 1: Create failing tests**

Create `src/utils/__tests__/italianWordsToAmount.test.ts`:

```typescript
import { italianWordsToAmount } from '../italianWordsToAmount';

describe('italianWordsToAmount', () => {
  it('returns null for empty string', () => {
    expect(italianWordsToAmount('')).toBeNull();
  });

  it('parses digit string with comma', () => {
    expect(italianWordsToAmount('15,50')).toBe(15.50);
  });

  it('parses digit string with dot', () => {
    expect(italianWordsToAmount('15.50')).toBe(15.50);
  });

  it('parses digit string with space separator', () => {
    expect(italianWordsToAmount('15 50')).toBe(15.50);
  });

  it('parses whole euro amount', () => {
    expect(italianWordsToAmount('20 euro')).toBe(20.00);
  });

  it('parses "quindici euro e cinquanta"', () => {
    expect(italianWordsToAmount('quindici euro e cinquanta')).toBe(15.50);
  });

  it('parses "venti euro"', () => {
    expect(italianWordsToAmount('venti euro')).toBe(20.00);
  });

  it('parses "due euro e trenta"', () => {
    expect(italianWordsToAmount('due euro e trenta')).toBe(2.30);
  });

  it('parses "quindici virgola cinquanta"', () => {
    expect(italianWordsToAmount('quindici virgola cinquanta')).toBe(15.50);
  });

  it('parses "tre euro e mezzo" as 3.50', () => {
    expect(italianWordsToAmount('tre euro e mezzo')).toBe(3.50);
  });

  it('parses "cento euro"', () => {
    expect(italianWordsToAmount('cento euro')).toBe(100.00);
  });

  it('parses "ventidue euro"', () => {
    expect(italianWordsToAmount('ventidue euro')).toBe(22.00);
  });

  it('returns null for unrecognized words', () => {
    expect(italianWordsToAmount('hello world')).toBeNull();
  });

  it('returns null for value over 9999.99', () => {
    expect(italianWordsToAmount('99999')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/utils/__tests__/italianWordsToAmount.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../italianWordsToAmount'`

- [ ] **Step 3: Implement `italianWordsToAmount`**

Create `src/utils/italianWordsToAmount.ts`:

```typescript
const UNITS: Record<string, number> = {
  zero: 0, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11,
  dodici: 12, tredici: 13, quattordici: 14, quindici: 15,
  sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
};

const TENS: Record<string, number> = {
  venti: 20, trenta: 30, quaranta: 40, cinquanta: 50,
  sessanta: 60, settanta: 70, ottanta: 80, novanta: 90,
};

const COMPOUND_TENS: Record<string, number> = {
  ventidue: 22, ventitré: 23, ventiquattro: 24, venticinque: 25,
  ventisei: 26, ventisette: 27, ventotto: 28, ventinove: 29,
  trentuno: 31, trentadue: 32, trentatré: 33, trentaquattro: 34,
};

const HUNDREDS: Record<string, number> = {
  cento: 100, duecento: 200, trecento: 300, quattrocento: 400,
  cinquecento: 500, seicento: 600, settecento: 700, ottocento: 800,
  novecento: 900,
};

const DECIMAL_SEPARATORS = new Set(['virgola', 'punto']);
const MAX_AMOUNT = 9999.99;

export function italianWordsToAmount(input: string): number | null {
  const normalized = input.toLowerCase().trim();
  if (!normalized) return null;

  // Step 1: direct digit pattern — "15,50" / "15.50" / "15 50"
  const digitSep = normalized.match(/(\d{1,4})[,.\s](\d{2})(?:\s|$)/);
  if (digitSep) {
    const val = parseFloat(`${digitSep[1]}.${digitSep[2]}`);
    return val > 0 && val <= MAX_AMOUNT ? val : null;
  }

  const digitOnly = normalized.match(/^(\d{1,4})(?:\s*euro)?$/);
  if (digitOnly) {
    const val = parseFloat(digitOnly[1]);
    return val > 0 && val <= MAX_AMOUNT ? val : null;
  }

  // Step 2: Italian word parsing
  const tokens = normalized.replace(/\beuro\b/g, '').split(/\s+/).filter(Boolean);

  let integerPart = 0;
  let decimalPart: number | null = null;
  let inDecimal = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (DECIMAL_SEPARATORS.has(token)) {
      inDecimal = true;
      continue;
    }

    // "e" is decimal separator only when followed by a decimal-context word
    if (token === 'e' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (
        next === 'mezzo' ||
        TENS[next] !== undefined ||
        UNITS[next] !== undefined
      ) {
        inDecimal = true;
        continue;
      }
    }

    if (token === 'mezzo') {
      decimalPart = 50;
      inDecimal = true;
      continue;
    }

    const compoundVal = COMPOUND_TENS[token];
    const hundredVal = HUNDREDS[token];
    const tenVal = TENS[token];
    const unitVal = UNITS[token];

    if (!inDecimal) {
      if (compoundVal !== undefined) integerPart += compoundVal;
      else if (hundredVal !== undefined) integerPart += hundredVal;
      else if (tenVal !== undefined) integerPart += tenVal;
      else if (unitVal !== undefined) integerPart += unitVal;
    } else {
      if (tenVal !== undefined) decimalPart = (decimalPart ?? 0) + tenVal;
      else if (unitVal !== undefined) decimalPart = (decimalPart ?? 0) + unitVal;
    }
  }

  if (integerPart === 0 && decimalPart === null) return null;

  const result = integerPart + (decimalPart ?? 0) / 100;
  return result > 0 && result <= MAX_AMOUNT ? Math.round(result * 100) / 100 : null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest src/utils/__tests__/italianWordsToAmount.test.ts --no-coverage
```

Expected: PASS — 14/14 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass (both suites).

- [ ] **Step 6: Commit**

```bash
git add src/utils/italianWordsToAmount.ts src/utils/__tests__/italianWordsToAmount.test.ts
git commit -m "feat: add italianWordsToAmount utility for voice speech-to-amount"
```

---

## Task 4: `useOCRScanner` hook

**Files:**
- Replace: `src/hooks/useOCRScanner.ts`

No unit tests possible (ML Kit is a native module). Verified manually on device.

- [ ] **Step 1: Replace stub with full implementation**

Replace the entire content of `src/hooks/useOCRScanner.ts`:

```typescript
import { useCallback, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as Haptics from 'expo-haptics';
import { smartExtract } from '../utils/smartExtract';

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

export function useOCRScanner(): UseOCRScannerReturn {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    const result = await requestPermission();
    return result.granted;
  }, [requestPermission]);

  const scanImage = useCallback(async (uri: string): Promise<void> => {
    setIsScanning(true);
    setError(null);
    try {
      const recognized = await TextRecognition.recognize(uri);
      const rawText = recognized.blocks.map((b) => b.text).join('\n');
      const amount = smartExtract(rawText);
      if (amount !== null) {
        setLastResult(amount);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError('Nessun importo trovato. Riprova con il totale ben visibile.');
      }
    } catch {
      setError('Errore nella lettura. Riprova.');
    } finally {
      setIsScanning(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isScanning,
    lastResult,
    error,
    cameraGranted: permission?.granted ?? false,
    cameraCanAskAgain: permission?.canAskAgain ?? true,
    requestCameraPermission,
    scanImage,
    clearError,
  };
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "$(git rev-parse --show-toplevel)" && npx tsc --noEmit
```

Expected: no errors related to `useOCRScanner.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useOCRScanner.ts
git commit -m "feat: implement useOCRScanner hook with ML Kit on-device OCR"
```

---

## Task 5: `useVoiceInput` hook

**Files:**
- Replace: `src/hooks/useVoiceInput.ts`

No unit tests possible (Voice is a native module). Verified manually on device.

- [ ] **Step 1: Replace stub with full implementation**

Replace the entire content of `src/hooks/useVoiceInput.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';
import { italianWordsToAmount } from '../utils/italianWordsToAmount';

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

export function useVoiceInput(): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [microphoneCanAskAgain, setMicrophoneCanAskAgain] = useState(true);
  const isListeningRef = useRef(false);

  useEffect(() => {
    const handleResults = (e: SpeechResultsEvent) => {
      setIsListening(false);
      isListeningRef.current = false;

      if (!e.value?.length) {
        setError("Non ho capito l'importo. Prova a dire: quindici euro e cinquanta.");
        return;
      }

      setIsProcessing(true);
      const transcript = e.value[0] ?? '';
      const amount = italianWordsToAmount(transcript);

      if (amount !== null) {
        setLastResult(amount);
      } else {
        setError("Non ho capito l'importo. Prova a dire: quindici euro e cinquanta.");
      }
      setIsProcessing(false);
    };

    const handleError = (_e: SpeechErrorEvent) => {
      setIsListening(false);
      isListeningRef.current = false;
      setIsProcessing(false);
      setError('Errore nel riconoscimento vocale. Riprova.');
    };

    Voice.onSpeechResults = handleResults;
    Voice.onSpeechError = handleError;

    return () => {
      Voice.destroy().catch(() => {});
      Voice.onSpeechResults = undefined;
      Voice.onSpeechError = undefined;
    };
  }, []);

  const startListening = useCallback(async (): Promise<void> => {
    setError(null);
    const { granted, canAskAgain } = await Audio.requestPermissionsAsync();

    if (!granted) {
      setMicrophoneCanAskAgain(canAskAgain);
      setError(
        canAskAgain
          ? "Serve il microfono per l'input vocale."
          : 'Microfono non autorizzato. Aprilo dalle impostazioni.',
      );
      return;
    }

    try {
      await Voice.start('it-IT');
      setIsListening(true);
      isListeningRef.current = true;
    } catch {
      setError('Errore nel riconoscimento vocale. Riprova.');
    }
  }, []);

  const stopListening = useCallback(async (): Promise<void> => {
    try {
      await Voice.stop();
    } finally {
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isListening,
    isProcessing,
    lastResult,
    error,
    microphoneCanAskAgain,
    startListening,
    stopListening,
    clearError,
  };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVoiceInput.ts
git commit -m "feat: implement useVoiceInput hook with @react-native-voice STT it-IT"
```

---

## Task 6: Verify app.json & Rebuild

**Files:**
- Verify: `app.json`

- [ ] **Step 1: Check expo-av plugin in app.json**

Open `app.json`. Confirm the `plugins` array includes `"expo-av"`:

```json
"plugins": [
  "expo-router",
  "expo-camera",
  "expo-av",
  ...
]
```

If `"expo-av"` is missing, add it to the array.

- [ ] **Step 2: If app.json was modified, commit**

```bash
git add app.json
git commit -m "chore: add expo-av plugin to app.json for microphone permissions"
```

If no change needed, skip this step.

- [ ] **Step 3: Rebuild native app**

```bash
# iOS
expo run:ios

# Android
expo run:android
```

Expected: build succeeds, app launches.

- [ ] **Step 4: Manual test — OCR**

On device:
1. Open app → PaymentWizard (Step A)
2. Tap **FOTO**
3. Inquadra uno scontrino con un totale visibile tipo "TOTALE 8,90"
4. Scatta foto
5. Attendi spinner "Sto leggendo lo scontrino..."
6. Verifica: importo si auto-compila nel display con animazione glow verde
7. Badge "Totale letto dallo scontrino" appare sotto il numero

- [ ] **Step 5: Manual test — OCR permission denied**

1. Revoca permesso fotocamera nelle impostazioni iOS/Android
2. Tap **FOTO**
3. Verifica: schermata "Serve la fotocamera" con bottone "Apri impostazioni"

- [ ] **Step 6: Manual test — Voice**

On device:
1. Tap **VOCE**
2. Di' "quindici euro e cinquanta"
3. Verifica: onda sonora animata visibile mentre parli
4. Dopo stop: importo si auto-compila con `15.50`, badge blu "Importo capito dalla tua voce"

- [ ] **Step 7: Manual test — Voice permission denied**

1. Revoca permesso microfono
2. Tap **VOCE**
3. Verifica: Alert "Input vocale" con messaggio appropriato

- [ ] **Step 8: Manual test — confirm gate**

Indipendentemente da come è stato inserito l'importo (digitato, OCR, voce):
1. Tap **AVANTI**
2. Step B mostra l'importo con "È corretto?"
3. Verifica impossibile saltare la conferma

---

## Self-Review Checklist

- [x] `useOCRScanner` interface matches exactly what PaymentWizard destructures
- [x] `useVoiceInput` interface matches exactly what PaymentWizard destructures  
- [x] `smartExtract` exported as named export (matches import in hook)
- [x] `italianWordsToAmount` exported as named export (matches import in hook)
- [x] Error messages match copy in PaymentWizard Alert handlers
- [x] `cameraCanAskAgain` field: `permission?.canAskAgain ?? true` (safe default for before permission is fetched)
- [x] `isListeningRef` used to track listening state synchronously (avoids stale closure in async stopListening)
- [x] `Voice.destroy()` called on cleanup (prevents memory leak on unmount)
- [x] app.json verification included (expo-av needed for mic permissions on Android)
