import { useCallback, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

type OCRTextLine = {
  text: string;
};

type OCRTextBlock = {
  text: string;
  lines?: OCRTextLine[];
};

type OCRTextResult = {
  text: string;
  blocks?: OCRTextBlock[];
};

type TextRecognitionModule = {
  recognize: (uri: string) => Promise<OCRTextResult>;
};

let TextRecognition: TextRecognitionModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TextRecognition = require('@react-native-ml-kit/text-recognition').default as TextRecognitionModule;
} catch {
  // Native module non disponibile in Expo Go.
}

export const nativeOCRAvailable = TextRecognition !== null;

const PRICE_PATTERN = /\d{1,4}(?:[.,]\d{3})*[,.]\d{2}/g;
const PRIORITY_KEYWORDS = ['totale', 'total', 'importo', 'da pagare', 'tot'];
const SUPPORT_KEYWORDS = ['euro', 'eur', '€'];
const NEGATIVE_KEYWORDS = ['iva', 'sconto', 'resto', 'cashback', 'bancomat', 'visa', 'mastercard'];

type PriceCandidate = {
  raw: string;
  value: number;
  score: number;
};

function parsePrice(raw: string): number | null {
  const sanitized = raw.replace(/[^\d.,]/g, '');
  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex <= 0) {
    return null;
  }

  const integerPart = sanitized.slice(0, separatorIndex).replace(/[.,]/g, '');
  const decimalPart = sanitized.slice(separatorIndex + 1).replace(/[^\d]/g, '');

  if (!integerPart || decimalPart.length !== 2) {
    return null;
  }

  const value = Number(`${integerPart}.${decimalPart}`);
  return Number.isFinite(value) ? value : null;
}

function extractLines(rawText: string, blocks?: OCRTextBlock[]): string[] {
  const blockLines = blocks
    ?.flatMap((block) => block.lines?.map((line) => line.text.trim()).filter(Boolean) ?? [])
    .filter(Boolean);

  if (blockLines && blockLines.length > 0) {
    return blockLines;
  }

  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function scoreCandidate(line: string, context: string, value: number): number {
  const normalizedLine = line.toLowerCase();
  const normalizedContext = context.toLowerCase();

  let score = value;

  if (PRIORITY_KEYWORDS.some((keyword) => normalizedLine.includes(keyword))) {
    score += 450;
  }

  if (PRIORITY_KEYWORDS.some((keyword) => normalizedContext.includes(keyword))) {
    score += 220;
  }

  if (SUPPORT_KEYWORDS.some((keyword) => normalizedLine.includes(keyword))) {
    score += 110;
  }

  if (/tot(?:ale)?\s*[:=-]?\s*\d/.test(normalizedLine)) {
    score += 180;
  }

  if (/importo\s*[:=-]?\s*\d/.test(normalizedLine)) {
    score += 140;
  }

  if (NEGATIVE_KEYWORDS.some((keyword) => normalizedLine.includes(keyword))) {
    score -= 140;
  }

  if (line.length <= 28) {
    score += 30;
  }

  return score;
}

export function extractPriceFromText(rawText: string): number | null {
  return extractPriceFromOCRResult({ text: rawText });
}

export function extractPriceFromOCRResult(result: OCRTextResult): number | null {
  const lines = extractLines(result.text, result.blocks);
  const candidates: PriceCandidate[] = [];

  lines.forEach((line, index) => {
    const matches = line.match(PRICE_PATTERN);
    if (!matches) {
      return;
    }

    const previous = lines[index - 1] ?? '';
    const next = lines[index + 1] ?? '';
    const context = `${previous} ${line} ${next}`.trim();

    matches.forEach((raw) => {
      const value = parsePrice(raw);

      if (value === null || value <= 0 || value >= 10000) {
        return;
      }

      candidates.push({
        raw,
        value,
        score: scoreCandidate(line, context, value),
      });
    });
  });

  if (candidates.length === 0) {
    const fallbackMatches = result.text.match(PRICE_PATTERN) ?? [];
    const fallbackValues = fallbackMatches
      .map((match) => parsePrice(match))
      .filter((value): value is number => value !== null && value > 0 && value < 10000);

    if (fallbackValues.length === 0) {
      return null;
    }

    return Math.max(...fallbackValues);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return b.value - a.value;
  });

  return candidates[0]?.value ?? null;
}

interface OCRState {
  isScanning: boolean;
  error: string | null;
  lastResult: number | null;
}

interface UseOCRScannerReturn extends OCRState {
  scanImage: (uri: string) => Promise<number | null>;
  requestCameraPermission: () => Promise<boolean>;
  cameraGranted: boolean;
  cameraCanAskAgain: boolean;
  clearError: () => void;
}

export function useOCRScanner(): UseOCRScannerReturn {
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<OCRState>({
    isScanning: false,
    error: null,
    lastResult: null,
  });

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (cameraPermission?.granted) {
      return true;
    }

    const result = await requestPermission();

    if (!result.granted) {
      setState((current) => ({
        ...current,
        error: result.canAskAgain
          ? 'Senza fotocamera non riesco a leggere lo scontrino. Puoi autorizzarla e riprovare.'
          : "La fotocamera e stata bloccata. Apri le impostazioni dell'app per attivarla e leggere lo scontrino.",
      }));
    }

    return result.granted;
  }, [cameraPermission?.granted, requestPermission]);

  const scanImage = useCallback(async (uri: string): Promise<number | null> => {
    if (!nativeOCRAvailable || !TextRecognition) {
      setState((current) => ({
        ...current,
        error: 'OCR non disponibile in Expo Go. Usa una build dev client per leggere gli scontrini.',
      }));
      return null;
    }

    setState({
      isScanning: true,
      error: null,
      lastResult: null,
    });

    try {
      const result = await TextRecognition.recognize(uri);
      const price = extractPriceFromOCRResult(result);

      if (price === null) {
        setState({
          isScanning: false,
          error: 'Non ho trovato un totale chiaro. Prova a inquadrare meglio la riga con TOTALE o EURO.',
          lastResult: null,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return null;
      }

      setState({
        isScanning: false,
        error: null,
        lastResult: price,
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return price;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore OCR sconosciuto.';
      setState({
        isScanning: false,
        error: message,
        lastResult: null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return null;
    }
  }, []);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return {
    ...state,
    scanImage,
    requestCameraPermission,
    cameraGranted: cameraPermission?.granted ?? false,
    cameraCanAskAgain: cameraPermission?.canAskAgain ?? true,
    clearError,
  };
}
