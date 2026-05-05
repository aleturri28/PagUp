import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechRecognitionModule = {
  start: (options: {
    lang?: string;
    interimResults?: boolean;
    maxAlternatives?: number;
    contextualStrings?: string[];
    continuous?: boolean;
  }) => void;
  stop: () => void;
  abort: () => void;
  getPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  addListener: (
    eventName: 'start' | 'result' | 'error' | 'end',
    listener: (event: ExpoSpeechRecognitionResultEvent | ExpoSpeechRecognitionErrorEvent | null) => void,
  ) => { remove: () => void };
};

let SpeechRecognition: SpeechRecognitionModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SpeechRecognition = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechRecognitionModule;
} catch {
  // Native module non disponibile nella build corrente.
}

export const nativeVoiceAvailable = SpeechRecognition !== null;

const DIRECT_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  uno: 1,
  una: 1,
  un: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
  venti: 20,
  trenta: 30,
  quaranta: 40,
  cinquanta: 50,
  sessanta: 60,
  settanta: 70,
  ottanta: 80,
  novanta: 90,
  cento: 100,
  mille: 1000,
};

const TENS = [
  { full: 'venti', elided: 'vent', value: 20 },
  { full: 'trenta', elided: 'trent', value: 30 },
  { full: 'quaranta', elided: 'quarant', value: 40 },
  { full: 'cinquanta', elided: 'cinquant', value: 50 },
  { full: 'sessanta', elided: 'sessant', value: 60 },
  { full: 'settanta', elided: 'settant', value: 70 },
  { full: 'ottanta', elided: 'ottant', value: 80 },
  { full: 'novanta', elided: 'novant', value: 90 },
] as const;

const FILLER_WORDS = new Set([
  'devo',
  'pagare',
  'sono',
  'circa',
  'importo',
  'totale',
  'dammi',
  'metti',
  'scrivi',
  'per',
  'favore',
  'allora',
  'il',
  'la',
  'lo',
  'gli',
  'le',
  'di',
  'da',
  'del',
  'della',
  'questo',
  'questa',
  'euri',
]);

const DECIMAL_SEPARATORS = ['virgola', 'punto'];

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/€/g, ' euro ')
    .replace(/[^\p{L}\d\s.,]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCompositeWord(word: string): number | null {
  if (!word) {
    return null;
  }

  if (/^\d+$/.test(word)) {
    return Number(word);
  }

  if (DIRECT_NUMBER_WORDS[word] !== undefined) {
    return DIRECT_NUMBER_WORDS[word];
  }

  const milaIndex = word.indexOf('mila');
  if (milaIndex !== -1) {
    const thousandsPart = word.slice(0, milaIndex);
    const rest = word.slice(milaIndex + 4);
    const thousands = thousandsPart ? parseCompositeWord(thousandsPart) : 1;
    const remainder = rest ? parseCompositeWord(rest) ?? 0 : 0;
    return thousands === null ? null : thousands * 1000 + remainder;
  }

  const milleIndex = word.indexOf('mille');
  if (milleIndex !== -1) {
    const prefix = word.slice(0, milleIndex);
    const rest = word.slice(milleIndex + 5);
    const thousands = prefix ? parseCompositeWord(prefix) : 1;
    const remainder = rest ? parseCompositeWord(rest) ?? 0 : 0;
    return thousands === null ? null : thousands * 1000 + remainder;
  }

  const centoIndex = word.indexOf('cento');
  if (centoIndex !== -1) {
    const hundredsPart = word.slice(0, centoIndex);
    const rest = word.slice(centoIndex + 5);
    const hundreds = hundredsPart ? parseCompositeWord(hundredsPart) : 1;
    const remainder = rest ? parseCompositeWord(rest) ?? 0 : 0;
    return hundreds === null ? null : hundreds * 100 + remainder;
  }

  for (const tens of TENS) {
    if (word.startsWith(tens.full)) {
      const rest = word.slice(tens.full.length);
      const unit = rest ? parseCompositeWord(rest) : 0;
      return unit === null ? null : tens.value + unit;
    }

    if (word.startsWith(tens.elided)) {
      const rest = word.slice(tens.elided.length);
      const unit = rest ? parseCompositeWord(rest) : 0;
      return unit === null ? null : tens.value + unit;
    }
  }

  return null;
}

function parsePhraseAsInteger(fragment: string): number | null {
  const normalized = normalizeTranscript(fragment);
  if (!normalized) {
    return null;
  }

  const decimalMatch = normalized.match(/(\d+)\s*(?:virgola|punto|,|\.)\s*(\d{1,2})/);
  if (decimalMatch) {
    const integerPart = Number(decimalMatch[1]);
    const decimalPart = decimalMatch[2].padEnd(2, '0');
    return Number(`${integerPart}.${decimalPart}`);
  }

  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token && !FILLER_WORDS.has(token) && token !== 'e' && token !== 'ed');

  let total = 0;
  let matched = false;

  for (const token of tokens) {
    const parsed = parseCompositeWord(token);
    if (parsed === null) {
      continue;
    }

    total += parsed;
    matched = true;
  }

  return matched ? total : null;
}

function parseCents(fragment: string): number | null {
  const normalized = normalizeTranscript(fragment)
    .replace(/\bcentesimi?\b/g, '')
    .replace(/\bcent\b/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const directDigits = normalized.match(/^\d{1,2}$/);
  if (directDigits) {
    return directDigits[0].length === 1 ? Number(directDigits[0]) * 10 : Number(directDigits[0]);
  }

  const parsed = parsePhraseAsInteger(normalized);
  if (parsed === null || parsed > 99) {
    return null;
  }

  return parsed < 10 ? parsed * 10 : parsed;
}

export function preprocessVoiceInput(transcript: string): number | null {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) {
    return null;
  }

  const directNumeric = normalized.match(/(\d+)\s*(?:virgola|punto|,|\.)\s*(\d{1,2})/);
  if (directNumeric) {
    const integerPart = Number(directNumeric[1]);
    const decimalPart = directNumeric[2].padEnd(2, '0');
    return Number(`${integerPart}.${decimalPart}`);
  }

  const euroMatch = normalized.match(/^(.*?)(?:\s+euro)?(?:\s+e\s+(.*))?$/);
  if (euroMatch) {
    const integerPart = parsePhraseAsInteger(euroMatch[1] ?? '');
    const centsPart = euroMatch[2] ? parseCents(euroMatch[2]) : null;

    if (integerPart !== null && centsPart !== null) {
      return Number((integerPart + centsPart / 100).toFixed(2));
    }

    if (integerPart !== null && normalized.includes('euro')) {
      return Number(integerPart.toFixed(2));
    }
  }

  const explicitSeparator = normalized.match(/^(.*?)(?:\s+|)(virgola|punto|,|\.)(?:\s+|)(.*)$/);
  if (explicitSeparator) {
    const integerPart = parsePhraseAsInteger(explicitSeparator[1] ?? '');
    const centsPart = parseCents(explicitSeparator[3] ?? '');

    if (integerPart !== null && centsPart !== null) {
      return Number((integerPart + centsPart / 100).toFixed(2));
    }
  }

  for (const separator of DECIMAL_SEPARATORS) {
    const separatorIndex = normalized.indexOf(` ${separator} `);
    if (separatorIndex !== -1) {
      const left = normalized.slice(0, separatorIndex);
      const right = normalized.slice(separatorIndex + separator.length + 2);
      const integerPart = parsePhraseAsInteger(left);
      const centsPart = parseCents(right);

      if (integerPart !== null && centsPart !== null) {
        return Number((integerPart + centsPart / 100).toFixed(2));
      }
    }
  }

  const conjunctionMatch = normalized.match(/^(.*?)\s+e\s+(.*?)$/);
  if (conjunctionMatch) {
    const integerPart = parsePhraseAsInteger(conjunctionMatch[1] ?? '');
    const centsPart = parseCents(conjunctionMatch[2] ?? '');

    if (integerPart !== null && centsPart !== null) {
      return Number((integerPart + centsPart / 100).toFixed(2));
    }
  }

  const integerOnly = parsePhraseAsInteger(normalized);
  if (integerOnly !== null) {
    return Number(integerOnly.toFixed(2));
  }

  return null;
}

interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  transcript: string;
  lastResult: number | null;
  microphoneGranted: boolean;
  microphoneCanAskAgain: boolean;
}

interface UseVoiceInputReturn extends VoiceState {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  requestMicrophonePermission: () => Promise<boolean>;
  clearError: () => void;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    error: null,
    transcript: '',
    lastResult: null,
    microphoneGranted: false,
    microphoneCanAskAgain: true,
  });

  const cleanedUp = useRef(false);

  useEffect(() => {
    cleanedUp.current = false;

    SpeechRecognition?.getPermissionsAsync()
      .then((permission) => {
        if (cleanedUp.current) {
          return;
        }

        setState((current) => ({
          ...current,
          microphoneGranted: permission.granted,
          microphoneCanAskAgain: permission.canAskAgain,
        }));
      })
      .catch(() => {});

    return () => {
      cleanedUp.current = true;
      SpeechRecognition?.abort();
    };
  }, []);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (!SpeechRecognition) {
      setState((current) => ({
        ...current,
        error: 'Riconoscimento vocale non disponibile in questa build. Reinstalla la development build aggiornata.',
      }));
      return false;
    }

    const currentPermission = await SpeechRecognition.getPermissionsAsync();
    if (currentPermission.granted) {
      setState((current) => ({
        ...current,
        microphoneGranted: true,
        microphoneCanAskAgain: currentPermission.canAskAgain,
      }));
      return true;
    }

    const response = await SpeechRecognition.requestPermissionsAsync();
    setState((current) => ({
      ...current,
      microphoneGranted: response.granted,
      microphoneCanAskAgain: response.canAskAgain,
      error: response.granted
        ? current.error
        : response.canAskAgain
          ? "Mi serve il microfono per ascoltare l'importo. Puoi autorizzarlo e riprovare."
          : "Il microfono e stato bloccato. Apri le impostazioni dell'app per attivarlo.",
    }));

    return response.granted;
  }, []);

  const finalizeTranscript = useCallback((rawTranscript: string) => {
    const bestTranscript = rawTranscript.trim();
    const price = preprocessVoiceInput(bestTranscript);

    setState((current) => ({
      ...current,
      isListening: false,
      isProcessing: false,
      transcript: bestTranscript,
      lastResult: price,
      error:
        price === null
          ? `Non ho capito "${bestTranscript}". Prova a dire, ad esempio, quindici euro e cinquanta.`
          : null,
    }));

    if (price !== null) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const startListening = useCallback(async () => {
    if (!SpeechRecognition) {
      setState((current) => ({
        ...current,
        error: 'Riconoscimento vocale non disponibile in questa build. Reinstalla la development build aggiornata.',
      }));
      return;
    }

    const permissionGranted = await requestMicrophonePermission();
    if (!permissionGranted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setState((current) => ({
      ...current,
      isListening: true,
      isProcessing: false,
      error: null,
      transcript: '',
      lastResult: null,
    }));

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      SpeechRecognition.start({
        lang: 'it-IT',
        interimResults: true,
        maxAlternatives: 3,
        contextualStrings: ['euro', 'centesimi', 'virgola', 'quindici euro e cinquanta'],
        continuous: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossibile avviare il microfono.';
      setState((current) => ({
        ...current,
        isListening: false,
        isProcessing: false,
        error: message,
      }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [finalizeTranscript, requestMicrophonePermission]);

  const stopListening = useCallback(async () => {
    if (!SpeechRecognition) {
      return;
    }

    try {
      SpeechRecognition.stop();
      setState((current) => ({
        ...current,
        isListening: false,
        isProcessing: current.transcript.length > 0 && current.lastResult === null && current.error === null,
      }));
    } catch {
      setState((current) => ({
        ...current,
        isListening: false,
        isProcessing: false,
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  useEffect(() => {
    if (!SpeechRecognition) {
      return;
    }

    const subscriptions = [
      SpeechRecognition.addListener('start', () => {
        if (cleanedUp.current) return;
        setState((current) => ({ ...current, isListening: true, isProcessing: false }));
      }),
      SpeechRecognition.addListener('result', (event) => {
        if (cleanedUp.current || !event || !('results' in event)) return;
        const transcript = event.results[0]?.transcript ?? '';
        if (event.isFinal) {
          finalizeTranscript(transcript);
          return;
        }
        setState((current) => ({ ...current, transcript }));
      }),
      SpeechRecognition.addListener('error', (event) => {
        if (cleanedUp.current || !event || !('message' in event)) return;
        const message =
          event.error === 'not-allowed'
            ? "Mi serve il microfono e il riconoscimento vocale. Apri le impostazioni dell'app se li hai bloccati."
            : event.message || 'Errore riconoscimento vocale.';
        setState((current) => ({
          ...current,
          isListening: false,
          isProcessing: false,
          error: message,
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }),
      SpeechRecognition.addListener('end', () => {
        if (cleanedUp.current) return;
        setState((current) => ({
          ...current,
          isListening: false,
          isProcessing: current.transcript.length > 0 && current.lastResult === null && current.error === null,
        }));
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [finalizeTranscript]);

  return {
    ...state,
    startListening,
    stopListening,
    requestMicrophonePermission,
    clearError,
  };
}
