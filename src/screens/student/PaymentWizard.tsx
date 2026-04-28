import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  SlideInLeft,
  SlideOutRight,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, AlertCircle, CheckCircle, RefreshCcw, Camera, Mic, X } from 'lucide-react-native';
import { useWalletStore } from '../../store/useWalletStore';
import { MoneyVisualizer } from '../../components/money/MoneyVisualizer';
import { formatEuro, calculateOptimalPayment } from '../../utils/paymentLogic';
import { MoneyItem } from '../../api/database.types';
import { useOCRScanner } from '../../hooks/useOCRScanner';
import { useVoiceInput } from '../../hooks/useVoiceInput';

// ============================================================
// TIPI E COSTANTI
// ============================================================
type WizardStep = 'amount' | 'confirm' | 'instructions' | 'change';

const BYPASS_BILLS: MoneyItem[] = [
  { id: 'bypass-5',  value: 5,  type: 'bill', imageUri: '' },
  { id: 'bypass-10', value: 10, type: 'bill', imageUri: '' },
  { id: 'bypass-20', value: 20, type: 'bill', imageUri: '' },
  { id: 'bypass-50', value: 50, type: 'bill', imageUri: '' },
];

// Direzione animazione: avanzamento = da destra, arretramento = da sinistra.
type Direction = 'forward' | 'backward';

// ============================================================
// TASTIERINO NUMERICO CUSTOM
// ============================================================
interface NumpadProps {
  onPress: (key: string) => void;
}

function Numpad({ onPress }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

  return (
    <View style={numpadStyles.grid}>
      {keys.map((key) => (
        <TouchableOpacity
          key={key}
          style={[
            numpadStyles.key,
            key === '⌫' && numpadStyles.keyDelete,
          ]}
          onPress={() => onPress(key)}
          accessible
          accessibilityLabel={key === '⌫' ? 'Cancella' : key}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Text style={numpadStyles.keyText}>{key}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const numpadStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  key: {
    width: '30%',
    minHeight: 72,
    backgroundColor: '#F4F4F4',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  keyDelete: {
    backgroundColor: '#FFE8E8',
    borderColor: '#FFAAAA',
  },
  keyText: {
    fontSize: 30,
    fontWeight: '600',
    color: '#1A1A1A',
  },
});

// ============================================================
// PULSANTE TORNA INDIETRO
// ============================================================
interface BackButtonProps {
  onPress: () => void;
  label?: string;
}

function BackButton({ onPress, label = 'Indietro' }: BackButtonProps) {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      accessible
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <ArrowLeft size={24} color="#1A1A1A" />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ============================================================
// OVERLAY FOTOCAMERA OCR
// ============================================================
interface CameraOverlayProps {
  visible: boolean;
  cameraGranted: boolean;
  cameraCanAskAgain: boolean;
  isProcessing: boolean;
  onRequestPermission: () => Promise<boolean>;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

function CameraOverlay({
  visible,
  cameraGranted,
  cameraCanAskAgain,
  isProcessing,
  onRequestPermission,
  onCapture,
  onClose,
}: CameraOverlayProps) {
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing || isProcessing) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) onCapture(photo.uri);
    } finally {
      setCapturing(false);
    }
  }, [capturing, isProcessing, onCapture]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={cameraStyles.container}>
        {cameraGranted ? (
          <>
            <CameraView ref={cameraRef} style={cameraStyles.camera} facing="back">
              <View style={cameraStyles.overlay}>
                <View style={cameraStyles.topShade} />
                <View style={cameraStyles.focusArea}>
                  <View style={cameraStyles.frame} />
                  <Text style={cameraStyles.hint}>Inquadra la riga del totale</Text>
                  <Text style={cameraStyles.subHint}>Meglio se TOTALE o EURO sono ben visibili.</Text>
                </View>
                <View style={cameraStyles.bottomShade} />
              </View>
            </CameraView>

            <View style={cameraStyles.controls}>
              <TouchableOpacity
                style={cameraStyles.closeBtn}
                onPress={onClose}
                accessible
                accessibilityLabel="Chiudi fotocamera"
                accessibilityRole="button"
              >
                <X size={28} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[cameraStyles.captureBtn, capturing && cameraStyles.captureBtnDisabled]}
                onPress={handleCapture}
                disabled={capturing || isProcessing}
                accessible
                accessibilityLabel="Scatta foto scontrino"
                accessibilityRole="button"
              >
                {capturing || isProcessing ? (
                  <ActivityIndicator color="#FFFFFF" size="large" />
                ) : (
                  <View style={cameraStyles.captureBtnInner} />
                )}
              </TouchableOpacity>

              <View style={{ width: 56 }} />
            </View>
          </>
        ) : (
          <View style={cameraStyles.permissionBox}>
            <View style={cameraStyles.permissionIconWrap}>
              <Camera size={44} color="#0F6F53" />
            </View>
            <Text style={cameraStyles.permissionTitle}>Serve la fotocamera</Text>
            <Text style={cameraStyles.permissionText}>
              PagUp la usa solo per leggere il totale dallo scontrino e proporti l'importo da confermare.
            </Text>
            <TouchableOpacity
              style={cameraStyles.permissionBtn}
              onPress={() => {
                onRequestPermission().catch(() => {});
              }}
              accessible
              accessibilityLabel="Autorizza fotocamera"
              accessibilityRole="button"
            >
              <Text style={cameraStyles.permissionBtnText}>
                {cameraCanAskAgain ? 'Autorizza' : 'Riprova'}
              </Text>
            </TouchableOpacity>
            {!cameraCanAskAgain && (
              <TouchableOpacity
                style={cameraStyles.settingsBtn}
                onPress={() => {
                  Linking.openSettings().catch(() => {});
                }}
                accessible
                accessibilityLabel="Apri impostazioni"
                accessibilityRole="button"
              >
                <Text style={cameraStyles.settingsBtnText}>Apri impostazioni</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={cameraStyles.permissionCloseBtn}>
              <Text style={cameraStyles.permissionCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const cameraStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
  },
  topShade: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 18, 0.68)',
  },
  focusArea: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: 'rgba(7, 14, 18, 0.18)',
  },
  bottomShade: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 18, 0.76)',
  },
  frame: {
    width: '86%',
    height: 140,
    borderWidth: 2.5,
    borderColor: '#F4FFF9',
    borderRadius: 24,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
    textAlign: 'center',
  },
  subHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    backgroundColor: '#081218',
  },
  closeBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
    backgroundColor: '#F6FBF8',
  },
  permissionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF4E7',
  },
  permissionTitle: { fontSize: 24, fontWeight: '800', color: '#143428', textAlign: 'center' },
  permissionText:  { fontSize: 16, color: '#476357', textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  permissionBtn:   { backgroundColor: '#0F6F53', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 },
  permissionBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  settingsBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#0F6F53',
  },
  settingsBtnText: {
    color: '#0F6F53',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionCloseBtn: {
    marginTop: 6,
    paddingVertical: 12,
  },
  permissionCloseText: {
    color: '#5F7068',
    fontSize: 16,
    fontWeight: '600',
  },
});

function WaveBar({ index, active }: { index: number; active: boolean }) {
  const height = useSharedValue(14 + index * 3);

  useEffect(() => {
    const minHeight = 12 + index * 2;
    const maxHeight = 30 + index * 4;
    const duration = 260 + index * 110;

    if (!active) {
      cancelAnimation(height);
      height.value = withTiming(minHeight, { duration: 140 });
      return;
    }

    height.value = withRepeat(
      withSequence(
        withTiming(maxHeight, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(minHeight, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    return () => {
      cancelAnimation(height);
    };
  }, [active, height, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: active ? 1 : 0.35,
  }));

  return <Animated.View style={[waveStyles.bar, animatedStyle]} />;
}

// ============================================================
// ANIMAZIONE ONDA SONORA (voice feedback)
// ============================================================
function VoiceWave({ active }: { active: boolean }) {
  return (
    <View style={waveStyles.container} accessible accessibilityLabel="Sto ascoltando...">
      {Array.from({ length: 5 }).map((_, index) => (
        <WaveBar key={index} index={index} active={active} />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
  },
  bar: {
    width: 6,
    backgroundColor: '#27AE60',
    borderRadius: 3,
  },
});

// ============================================================
// STEP A: INPUT IMPORTO (con OCR e Voice)
// ============================================================
interface StepAmountProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
}

type AutoFillSource = 'ocr' | 'voice' | null;

function StepAmount({ amount, onAmountChange, onConfirm }: StepAmountProps) {
  const [cameraVisible, setCameraVisible] = useState(false);
  const [autoFillSource, setAutoFillSource] = useState<AutoFillSource>(null);
  const [autoFillLabel, setAutoFillLabel] = useState<string | null>(null);

  const ocr = useOCRScanner();
  const voice = useVoiceInput();
  const amountGlow = useSharedValue(0);

  const amountAccent = autoFillSource === 'ocr' ? '#0F6F53' : '#0B6E99';
  const amountCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + amountGlow.value * 0.035 }],
    borderColor: interpolateColor(amountGlow.value, [0, 1], ['#DCE6DD', amountAccent]),
    shadowColor: amountAccent,
    shadowOpacity: 0.08 + amountGlow.value * 0.22,
    shadowRadius: 14 + amountGlow.value * 12,
    elevation: 2 + amountGlow.value * 8,
  }), [amountAccent]);

  const applyDetectedAmount = useCallback((value: number, source: Exclude<AutoFillSource, null>) => {
    onAmountChange(value.toFixed(2));
    setAutoFillSource(source);
    setAutoFillLabel(
      source === 'ocr'
        ? 'Totale letto dallo scontrino. Lo confermi tra un attimo.'
        : 'Importo capito dalla tua voce. Lo confermi tra un attimo.',
    );
    amountGlow.value = 0;
    amountGlow.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(0, { duration: 520 }),
    );
  }, [amountGlow, onAmountChange]);

  useEffect(() => {
    if (ocr.lastResult !== null) {
      applyDetectedAmount(ocr.lastResult, 'ocr');
    }
  }, [applyDetectedAmount, ocr.lastResult]);

  useEffect(() => {
    if (voice.lastResult !== null) {
      applyDetectedAmount(voice.lastResult, 'voice');
    }
  }, [applyDetectedAmount, voice.lastResult]);

  useEffect(() => {
    if (!ocr.error || cameraVisible) {
      return;
    }

    Alert.alert('Lettura scontrino', ocr.error, [{ text: 'OK', onPress: ocr.clearError }]);
  }, [cameraVisible, ocr.clearError, ocr.error]);

  useEffect(() => {
    if (!voice.error) {
      return;
    }

    const actions = [
      !voice.microphoneCanAskAgain
        ? {
            text: 'Impostazioni',
            onPress: () => {
              Linking.openSettings().catch(() => {});
              voice.clearError();
            },
          }
        : null,
      { text: 'OK', onPress: voice.clearError },
    ].filter(Boolean) as Array<{ text: string; onPress: () => void }>;

    Alert.alert('Input vocale', voice.error, actions);
  }, [voice.clearError, voice.error, voice.microphoneCanAskAgain]);

  const handleKey = useCallback(
    (key: string) => {
      if (key === '⌫') {
        setAutoFillSource(null);
        setAutoFillLabel(null);
        onAmountChange(amount.slice(0, -1));
        Haptics.selectionAsync();
        return;
      }
      if (key === '.' && amount.includes('.')) return;
      const dotIndex = amount.indexOf('.');
      if (dotIndex !== -1 && amount.length - dotIndex > 2) return;
      const integerPart = amount.split('.')[0] ?? '';
      if (key !== '.' && dotIndex === -1 && integerPart.length >= 4) return;
      setAutoFillSource(null);
      setAutoFillLabel(null);
      onAmountChange(amount + key);
      Haptics.selectionAsync();
    },
    [amount, onAmountChange],
  );

  const handleOpenCamera = useCallback(async () => {
    Haptics.selectionAsync();
    const granted = ocr.cameraGranted ? true : await ocr.requestCameraPermission();
    setCameraVisible(true);

    if (!granted && !ocr.cameraCanAskAgain) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [ocr]);

  const handleCameraCapture = useCallback(
    async (uri: string) => {
      setCameraVisible(false);
      await ocr.scanImage(uri);
    },
    [ocr],
  );

  const handleVoiceToggle = useCallback(async () => {
    if (voice.isListening) {
      await voice.stopListening();
    } else {
      Haptics.selectionAsync();
      await voice.startListening();
    }
  }, [voice]);

  const parsed = parseFloat(amount) || 0;
  const isValid = parsed > 0;
  const isBusy = ocr.isScanning || voice.isListening || voice.isProcessing;
  const busyLabel = ocr.isScanning
    ? 'Sto leggendo lo scontrino...'
    : voice.isListening
      ? 'Sto ascoltando...'
      : voice.isProcessing
        ? 'Sto trasformando la voce in numeri...'
        : '';
  const displayValue = amount || '0.00';

  return (
    <Animated.View
      style={styles.stepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <Animated.View
        style={[styles.amountDisplay, amountCardStyle]}
        accessible
        accessibilityLabel={`Importo: ${displayValue} euro`}
      >
        <Text style={styles.amountEyebrow}>Step A</Text>
        <Text style={styles.amountLabel}>Quanto devi pagare?</Text>
        <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>
          {displayValue}
          <Text style={styles.amountCurrency}> €</Text>
        </Text>
        {autoFillLabel && (
          <View style={[styles.autoFillBadge, autoFillSource === 'ocr' ? styles.autoFillBadgeOcr : styles.autoFillBadgeVoice]}>
            {autoFillSource === 'ocr' ? <Camera size={16} color="#FFFFFF" /> : <Mic size={16} color="#FFFFFF" />}
            <Text style={styles.autoFillBadgeText}>{autoFillLabel}</Text>
          </View>
        )}
      </Animated.View>

      {isBusy && (
        <Animated.View
          style={styles.busyRow}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          {ocr.isScanning ? (
            <>
              <ActivityIndicator color="#0F6F53" size="small" />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </>
          ) : voice.isListening ? (
            <>
              <VoiceWave active />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </>
          ) : (
            <>
              <ActivityIndicator color="#0B6E99" size="small" />
              <Text style={styles.busyText}>{busyLabel}</Text>
            </>
          )}
        </Animated.View>
      )}

      <Numpad onPress={handleKey} />

      <View style={styles.inputMethodRow}>
        <TouchableOpacity
          style={[styles.inputMethodBtn, styles.btnCamera]}
          onPress={() => {
            handleOpenCamera().catch(() => {});
          }}
          accessible
          accessibilityLabel="Leggi importo con la fotocamera"
          accessibilityRole="button"
          disabled={isBusy}
        >
          <View style={styles.methodIconWrap}>
            <Camera size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.inputMethodLabel}>FOTO</Text>
          <Text style={styles.inputMethodHint}>Legge il totale dallo scontrino.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.inputMethodBtn,
            styles.btnMic,
            voice.isListening && styles.btnMicActive,
          ]}
          onPress={handleVoiceToggle}
          accessible
          accessibilityLabel={voice.isListening ? 'Ferma ascolto' : 'Inserisci importo con la voce'}
          accessibilityRole="button"
          disabled={ocr.isScanning}
        >
          <View style={styles.methodIconWrap}>
            <Mic size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.inputMethodLabel}>{voice.isListening ? 'STOP' : 'VOCE'}</Text>
          <Text style={styles.inputMethodHint}>
            {voice.isListening ? 'Ti sto ascoltando adesso.' : 'Di\' ad esempio: quindici euro e cinquanta.'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnPrimary, (!isValid || isBusy) && styles.btnDisabled]}
          onPress={isValid && !isBusy ? onConfirm : undefined}
          accessible
          accessibilityLabel={`Conferma importo ${formatEuro(parsed)}`}
          accessibilityRole="button"
          disabled={!isValid || isBusy}
        >
          <Text style={styles.btnPrimaryText}>AVANTI →</Text>
        </TouchableOpacity>
      </View>

      <CameraOverlay
        visible={cameraVisible}
        cameraGranted={ocr.cameraGranted}
        cameraCanAskAgain={ocr.cameraCanAskAgain}
        isProcessing={ocr.isScanning}
        onRequestPermission={ocr.requestCameraPermission}
        onCapture={handleCameraCapture}
        onClose={() => setCameraVisible(false)}
      />
    </Animated.View>
  );
}

// ============================================================
// STEP B: CONFERMA INTERMEDIA
// ============================================================
interface StepConfirmProps {
  amount: number;
  onYes: () => void;
  onNo: () => void;
}

function StepConfirm({ amount, onYes, onNo }: StepConfirmProps) {
  return (
    <Animated.View
      style={styles.stepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <BackButton onPress={onNo} />

      <View style={styles.confirmCenter}>
        <Text style={styles.confirmQuestion}>Devi pagare</Text>
        <Text style={styles.confirmAmount}>{formatEuro(amount)}</Text>
        <Text style={styles.confirmQuestion}>È corretto?</Text>
      </View>

      <View style={styles.confirmButtons}>
        <TouchableOpacity
          style={[styles.bigButton, styles.btnNo]}
          onPress={onNo}
          accessible
          accessibilityLabel="No, torna indietro"
          accessibilityRole="button"
        >
          <Text style={styles.bigButtonText}>✗  NO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigButton, styles.btnYes]}
          onPress={onYes}
          accessible
          accessibilityLabel="Sì, importo corretto"
          accessibilityRole="button"
        >
          <Text style={styles.bigButtonText}>✓  SÌ</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ============================================================
// STEP C: ISTRUZIONI DI CONSEGNA
// ============================================================
interface StepInstructionsProps {
  total: number;
  onContinue: (coveredAmount: number) => void;
  onBack: () => void;
}

function StepInstructions({ total, onContinue, onBack }: StepInstructionsProps) {
  const inventory = useWalletStore((s) => s.inventory);
  const processPayment = useWalletStore((s) => s.processPayment);
  const toggleBypass = useWalletStore((s) => s.toggleBypass);
  const isBypassActive = useWalletStore((s) => s.isBypassActive);

  const [bypassModalVisible, setBypassModalVisible] = useState(false);

  // Calcola la selezione ottimale dall'inventory corrente.
  const result = calculateOptimalPayment(inventory, total);

  const handleContinue = useCallback(() => {
    const payResult = processPayment(total);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue(payResult.coveredAmount);
  }, [processPayment, total, onContinue]);

  const handleBypassSelect = useCallback(
    (bill: MoneyItem) => {
      setBypassModalVisible(false);
      toggleBypass();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Usa il valore della banconota scelta come "covered amount".
      onContinue(bill.value);
    },
    [toggleBypass, onContinue],
  );

  const handleOpenBypass = useCallback(() => {
    setBypassModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <Animated.View
      style={styles.stepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <BackButton onPress={onBack} />

      <ScrollView contentContainerStyle={styles.instructionsScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.instructionTitle}>Prendi dal portafoglio</Text>
        <Text style={styles.instructionSubtitle}>
          Consegna questi soldi alla cassa:
        </Text>

        {result.isInsufficient ? (
          <View style={styles.insufficientBox}>
            <AlertCircle size={32} color="#C0392B" />
            <Text style={styles.insufficientText}>
              Non hai abbastanza soldi nel wallet.{'\n'}Usa il tasto qui sotto.
            </Text>
          </View>
        ) : (
          <MoneyVisualizer
            items={result.selectedItems}
            size="large"
            style={styles.moneyList}
          />
        )}

        {!result.isInsufficient && (
          <View style={styles.coverageInfo} accessible accessibilityLabel={`Stai dando ${formatEuro(result.coveredAmount)}, il resto sarà ${formatEuro(result.change)}`}>
            <Text style={styles.coverageText}>
              Darai: <Text style={styles.coverageValue}>{formatEuro(result.coveredAmount)}</Text>
            </Text>
            {result.change > 0 && (
              <Text style={styles.coverageText}>
                Riceverai di resto: <Text style={styles.coverageValue}>{formatEuro(result.change)}</Text>
              </Text>
            )}
          </View>
        )}

        {/* Tasto bypass */}
        <TouchableOpacity
          style={styles.btnBypass}
          onPress={handleOpenBypass}
          accessible
          accessibilityLabel="Non ho questi soldi, usa una banconota diversa"
          accessibilityRole="button"
        >
          <RefreshCcw size={20} color="#7A3E00" />
          <Text style={styles.btnBypassText}>  Non ho questi soldi</Text>
        </TouchableOpacity>

        {!result.isInsufficient && (
          <TouchableOpacity
            style={[styles.btnPrimary, styles.btnContinue]}
            onPress={handleContinue}
            accessible
            accessibilityLabel="Ho consegnato i soldi, vai al passo successivo"
            accessibilityRole="button"
          >
            <CheckCircle size={24} color="#FFFFFF" />
            <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
              HO CONSEGNATO I SOLDI
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modal selezione banconota bypass */}
      <Modal
        visible={bypassModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBypassModalVisible(false)}
        accessibilityViewIsModal
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Quale banconota usi?</Text>
            <Text style={styles.modalSubtitle}>
              Scegli la banconota che stai per consegnare:
            </Text>

            <View style={styles.modalBills}>
              {BYPASS_BILLS.map((bill) => (
                <TouchableOpacity
                  key={bill.id}
                  style={[styles.modalBill, { borderColor: '#E07B00', backgroundColor: '#FFF3CD' }]}
                  onPress={() => handleBypassSelect(bill)}
                  accessible
                  accessibilityLabel={`Banconota da ${formatEuro(bill.value)}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalBillText}>{formatEuro(bill.value)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setBypassModalVisible(false)}
              accessible
              accessibilityLabel="Annulla"
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelText}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ============================================================
// STEP D: IL RESTO
// ============================================================
interface StepChangeProps {
  total: number;
  coveredAmount: number;
  onFinish: () => void;
}

function StepChange({ total, coveredAmount, onFinish }: StepChangeProps) {
  const change = Math.max(0, Math.round((coveredAmount - total) * 100) / 100);
  const isExact = change === 0;

  return (
    <Animated.View
      style={styles.stepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <View style={styles.changeCenter}>
        {isExact ? (
          <>
            <Text style={styles.changeEmoji}>✅</Text>
            <Text style={styles.changeTitle}>Pagamento esatto!</Text>
            <Text style={styles.changeSubtitle}>Non devi ricevere resto.</Text>
          </>
        ) : (
          <>
            <Text style={styles.changeEmoji}>💰</Text>
            <Text style={styles.changeTitle}>Ricevi il resto</Text>
            <Text style={styles.changeAmount}>{formatEuro(change)}</Text>
            <Text style={styles.changeSubtitle}>
              Hai dato {formatEuro(coveredAmount)},{'\n'}
              il costo era {formatEuro(total)}.
            </Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: '#2980B9' }]}
          onPress={onFinish}
          accessible
          accessibilityLabel="Fatto, torna all'inizio"
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>FATTO ✓</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ============================================================
// WIZARD PRINCIPALE
// Gestisce la navigazione tra i 4 step e le animazioni.
// ============================================================
export default function PaymentWizard() {
  const [step, setStep] = useState<WizardStep>('amount');
  const [direction, setDirection] = useState<Direction>('forward');
  const [amountStr, setAmountStr] = useState('');
  const [coveredAmount, setCoveredAmount] = useState(0);

  const total = parseFloat(amountStr) || 0;

  const goForward = useCallback((nextStep: WizardStep) => {
    setDirection('forward');
    setStep(nextStep);
  }, []);

  const goBack = useCallback((prevStep: WizardStep) => {
    setDirection('backward');
    setStep(prevStep);
    Haptics.selectionAsync();
  }, []);

  const handleAmountConfirm = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    goForward('confirm');
  }, [goForward]);

  const handleConfirmYes = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    goForward('instructions');
  }, [goForward]);

  const handleInstructionsContinue = useCallback((covered: number) => {
    setCoveredAmount(covered);
    goForward('change');
  }, [goForward]);

  const handleFinish = useCallback(() => {
    setAmountStr('');
    setCoveredAmount(0);
    setDirection('forward');
    setStep('amount');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Le animazioni entering/exiting variano in base alla direzione.
  const entering = direction === 'forward' ? SlideInRight.duration(280) : SlideInLeft.duration(280);
  const exiting  = direction === 'forward' ? SlideOutLeft.duration(280) : SlideOutRight.duration(280);

  const stepTitles: Record<WizardStep, string> = {
    amount:       'Importo',
    confirm:      'Conferma',
    instructions: 'Prendi i soldi',
    change:       'Resto',
  };

  const stepOrder: WizardStep[] = ['amount', 'confirm', 'instructions', 'change'];
  const stepIndex = stepOrder.indexOf(step);

  return (
    <SafeAreaView style={styles.root}>
      {/* Progress bar */}
      <View style={styles.progressBar} accessible accessibilityLabel={`Step ${stepIndex + 1} di 4: ${stepTitles[step]}`}>
        {stepOrder.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressSegment,
              i <= stepIndex && styles.progressSegmentActive,
            ]}
          />
        ))}
      </View>

      <Text style={styles.stepLabel}>{stepTitles[step]}</Text>

      {/* Il key forza React a rimontare il componente ad ogni step change,
          attivando le animazioni entering/exiting di Reanimated. */}
      {step === 'amount' && (
        <StepAmount
          key="amount"
          amount={amountStr}
          onAmountChange={setAmountStr}
          onConfirm={handleAmountConfirm}
        />
      )}
      {step === 'confirm' && (
        <StepConfirm
          key="confirm"
          amount={total}
          onYes={handleConfirmYes}
          onNo={() => goBack('amount')}
        />
      )}
      {step === 'instructions' && (
        <StepInstructions
          key="instructions"
          total={total}
          onContinue={handleInstructionsContinue}
          onBack={() => goBack('confirm')}
        />
      )}
      {step === 'change' && (
        <StepChange
          key="change"
          total={total}
          coveredAmount={coveredAmount}
          onFinish={handleFinish}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================
// STILI
// Contrasto WCAG AAA, touch target >= 48dp ovunque.
// ============================================================
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Progress bar
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    padding: 16,
    paddingBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
  },
  progressSegmentActive: {
    backgroundColor: '#27AE60',
  },
  stepLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },

  // Container step
  stepContainer: {
    flex: 1,
  },

  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
  },
  backButtonText: {
    fontSize: 18,
    color: '#1A1A1A',
    marginLeft: 8,
    fontWeight: '600',
  },

  // Step A: importo
  amountDisplay: {
    marginHorizontal: 18,
    marginTop: 8,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#DCE6DD',
    backgroundColor: '#FAFDFB',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
  },
  amountEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F6F53',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  amountLabel: {
    fontSize: 19,
    fontWeight: '600',
    color: '#4D5E55',
    marginBottom: 10,
  },
  amountValue: {
    fontSize: 68,
    fontWeight: '900',
    color: '#14211A',
    lineHeight: 76,
  },
  amountCurrency: {
    fontSize: 32,
    fontWeight: '600',
    color: '#4D5E55',
  },
  autoFillBadge: {
    marginTop: 16,
    width: '100%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  autoFillBadgeOcr: {
    backgroundColor: '#0F6F53',
  },
  autoFillBadgeVoice: {
    backgroundColor: '#0B6E99',
  },
  autoFillBadgeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  busyRow: {
    marginHorizontal: 18,
    marginTop: 14,
    minHeight: 64,
    borderRadius: 20,
    backgroundColor: '#F4F8F6',
    borderWidth: 1,
    borderColor: '#D8E4DD',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B4136',
    textAlign: 'center',
  },
  inputMethodRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  inputMethodBtn: {
    flex: 1,
    minHeight: 130,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'space-between',
    shadowColor: '#0A1511',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  btnCamera: {
    backgroundColor: '#0F6F53',
  },
  btnMic: {
    backgroundColor: '#0B6E99',
  },
  btnMicActive: {
    backgroundColor: '#084F70',
  },
  methodIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  inputMethodLabel: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  inputMethodHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.86)',
  },

  // Step B: conferma
  confirmCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmQuestion: {
    fontSize: 28,
    fontWeight: '600',
    color: '#555555',
    textAlign: 'center',
  },
  confirmAmount: {
    fontSize: 80,
    fontWeight: '900',
    color: '#1A1A1A',
    textAlign: 'center',
    marginVertical: 16,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 16,
    padding: 24,
  },
  bigButton: {
    flex: 1,
    minHeight: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButtonText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnYes: { backgroundColor: '#27AE60' },
  btnNo:  { backgroundColor: '#C0392B' },

  // Step C: istruzioni
  instructionsScroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  instructionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  instructionSubtitle: {
    fontSize: 18,
    color: '#444444',
    textAlign: 'center',
    marginTop: 4,
  },
  moneyList: {
    marginVertical: 8,
  },
  insufficientBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#FDEDEC',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E74C3C',
  },
  insufficientText: {
    flex: 1,
    fontSize: 16,
    color: '#C0392B',
    fontWeight: '600',
  },
  coverageInfo: {
    backgroundColor: '#EBF5FB',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  coverageText: {
    fontSize: 16,
    color: '#1A5276',
  },
  coverageValue: {
    fontWeight: '700',
  },
  btnBypass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDF2E9',
    borderWidth: 2,
    borderColor: '#E67E22',
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 56,
  },
  btnBypassText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#784212',
  },
  btnContinue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  // Step D: resto
  changeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  changeEmoji: {
    fontSize: 72,
  },
  changeTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  changeAmount: {
    fontSize: 80,
    fontWeight: '900',
    color: '#27AE60',
    textAlign: 'center',
  },
  changeSubtitle: {
    fontSize: 18,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 26,
  },

  // Modal bypass
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#555555',
    textAlign: 'center',
  },
  modalBills: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  modalBill: {
    width: 80,
    height: 56,
    borderRadius: 12,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBillText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7A3E00',
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 18,
    color: '#C0392B',
    fontWeight: '700',
  },

  // Footer / pulsanti primari
  footer: {
    padding: 20,
  },
  btnPrimary: {
    backgroundColor: '#27AE60',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    flexDirection: 'row',
  },
  btnDisabled: {
    backgroundColor: '#CCCCCC',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
