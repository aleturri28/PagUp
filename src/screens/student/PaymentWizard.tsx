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
  Image,
  Linking,
  useWindowDimensions,
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
import { ArrowLeft, AlertCircle, Banknote, CheckCircle, Camera, Home, Keyboard, Mic, X, LifeBuoy } from 'lucide-react-native';
import { useWalletStore } from '../../store/useWalletStore';
import { formatEuro, calculateStudentPayment, PaymentMode } from '../../utils/paymentLogic';
import { MoneyItem } from '../../api/database.types';
import { useOCRScanner } from '../../hooks/useOCRScanner';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { supabase } from '../../api/supabase';
import { sendSos } from '../../api/payments';
import { studentTheme as t } from '../../theme';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';

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
// TASTIERINO NUMERICO
// ============================================================
interface NumpadProps {
  onPress: (key: string) => void;
}

function Numpad({ onPress }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

  return (
    <View style={numpadStyles.grid}>
      {keys.map((key) => (
        <TouchableOpacity
          key={key}
          style={[numpadStyles.key, key === '⌫' && numpadStyles.keyDelete]}
          onPress={() => onPress(key)}
          accessible
          accessibilityLabel={key === '⌫' ? 'Cancella' : key}
          accessibilityHint={key === '⌫' ? 'Rimuove l\'ultimo carattere inserito' : key === '.' ? 'Aggiunge il separatore decimale' : 'Aggiunge la cifra all\'importo'}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Text style={[numpadStyles.keyText, key === '⌫' && numpadStyles.keyTextDelete]}>
            {key}
          </Text>
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
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  key: {
    width: '30%',
    minHeight: t.spacing.touchTarget + 16,
    backgroundColor: '#FFFFFF',
    borderRadius: t.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D0D5E0',
  },
  keyDelete: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5E0',
  },
  keyText: {
    fontSize: t.typography.sizeXL,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
  },
  keyTextDelete: {
    color: t.colors.text,
  },
});

// ============================================================
// PULSANTE TORNA INDIETRO
// ============================================================
interface BackButtonProps {
  onPress: () => void;
  label?: string;
  variant?: 'default' | 'confirm' | 'success';
}

function BackButton({ onPress, label = 'Torna indietro', variant = 'default' }: BackButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.backButton,
        variant === 'confirm' && styles.confirmBackButton,
        variant === 'success' && styles.successBackButton,
      ]}
      onPress={onPress}
      accessible
      accessibilityLabel={label}
      accessibilityHint="Torna al passo precedente"
      accessibilityRole="button"
    >
      <ArrowLeft
        size={variant === 'confirm' ? 38 : 28}
        color={variant === 'confirm' ? '#151515' : variant === 'success' ? '#FFFFFF' : t.colors.primary}
      />
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
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const frameWidth = Math.max(220, Math.min(width - 56, 420));

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
                  <View style={[cameraStyles.frame, { width: frameWidth, height: Math.max(120, Math.min(frameWidth * 0.4, 170)) }]} />
                  <Text style={cameraStyles.hint}>Inquadra il totale sullo scontrino</Text>
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
                accessibilityHint="Chiude la fotocamera senza scansionare"
                accessibilityRole="button"
              >
                <X size={32} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[cameraStyles.captureBtn, capturing && cameraStyles.captureBtnDisabled]}
                onPress={handleCapture}
                disabled={capturing || isProcessing}
                accessible
                accessibilityLabel="Scatta foto scontrino"
                accessibilityHint="Scatta la foto e legge automaticamente il totale"
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
              <Camera size={52} color={t.colors.primary} />
            </View>
            <Text style={cameraStyles.permissionTitle}>Serve la fotocamera</Text>
            <Text style={cameraStyles.permissionText}>
              PagUp la usa solo per leggere il totale dallo scontrino.
            </Text>
            <TouchableOpacity
              style={cameraStyles.permissionBtn}
              onPress={() => { onRequestPermission().catch(() => {}); }}
              accessible
              accessibilityLabel="Autorizza fotocamera"
              accessibilityHint="Concede a PagUp il permesso di usare la fotocamera"
              accessibilityRole="button"
            >
              <Text style={cameraStyles.permissionBtnText}>
                {cameraCanAskAgain ? 'Autorizza' : 'Riprova'}
              </Text>
            </TouchableOpacity>
            {!cameraCanAskAgain && (
              <TouchableOpacity
                style={cameraStyles.settingsBtn}
                onPress={() => { Linking.openSettings().catch(() => {}); }}
                accessible
                accessibilityLabel="Apri impostazioni"
                accessibilityHint="Apre le impostazioni del dispositivo per autorizzare la fotocamera"
                accessibilityRole="button"
              >
                <Text style={cameraStyles.settingsBtnText}>Apri impostazioni</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onClose}
              style={cameraStyles.permissionCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              accessibilityHint="Chiude questo pannello e torna all'inserimento importo"
            >
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
  overlay: { flex: 1 },
  topShade:    { flex: 1, backgroundColor: 'rgba(7,14,18,0.68)' },
  bottomShade: { flex: 1, backgroundColor: 'rgba(7,14,18,0.76)' },
  focusArea: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: 'rgba(7,14,18,0.18)',
  },
  frame: {
    width: '86%',
    height: 140,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#FFFFFF',
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    marginTop: 18,
    textAlign: 'center',
  },
  subHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.85)',
    fontSize: t.typography.sizeSM,
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
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    backgroundColor: t.colors.background,
  },
  permissionIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceVariant,
    borderWidth: 3,
    borderColor: t.colors.primary,
  },
  permissionTitle: {
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: t.typography.sizeSM,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    maxWidth: 320,
  },
  permissionBtn: {
    backgroundColor: t.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: t.radius.md,
    minHeight: t.spacing.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: t.colors.onPrimary,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
  },
  settingsBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: t.radius.md,
    borderWidth: 3,
    borderColor: t.colors.primary,
    minHeight: t.spacing.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: {
    color: t.colors.primary,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
  },
  permissionCloseBtn: {
    minHeight: t.spacing.touchTarget,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionCloseText: {
    color: t.colors.textSecondary,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightMedium,
  },
});

// ============================================================
// ANIMAZIONE ONDA SONORA
// ============================================================
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

    return () => { cancelAnimation(height); };
  }, [active, height, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: active ? 1 : 0.35,
  }));

  return <Animated.View style={[waveStyles.bar, animatedStyle]} />;
}

function VoiceWave({ active }: { active: boolean }) {
  return (
    <View style={waveStyles.container} accessible accessibilityLabel="Sto ascoltando..." accessibilityHint="Il microfono è attivo e sta rilevando la tua voce">
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
    gap: 8,
    height: 56,
  },
  bar: {
    width: 8,
    backgroundColor: t.colors.success,
    borderRadius: 4,
  },
});

// ============================================================
// STEP A: INSERISCI L'IMPORTO
// ============================================================
interface StepAmountProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}

type AutoFillSource = 'ocr' | 'voice' | null;

type InputTab = 'keyboard' | 'camera' | 'voice';

function StepAmount({ amount, onAmountChange, onConfirm, onBack }: StepAmountProps) {
  const [tab, setTab] = useState<InputTab>('keyboard');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [autoFillSource, setAutoFillSource] = useState<AutoFillSource>(null);
  const [autoFillLabel, setAutoFillLabel] = useState<string | null>(null);

  const ocr = useOCRScanner();
  const voice = useVoiceInput();
  const amountGlow = useSharedValue(0);

  const amountAccent = autoFillSource === 'ocr' ? t.colors.success : t.colors.primary;
  const amountCardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(amountGlow.value, [0, 1], [t.colors.primary, amountAccent]),
  }), [amountAccent]);

  const applyDetectedAmount = useCallback((value: number, source: Exclude<AutoFillSource, null>) => {
    onAmountChange(value.toFixed(2));
    setAutoFillSource(source);
    setAutoFillLabel(
      source === 'ocr'
        ? 'Totale letto dallo scontrino. Controlla e poi vai avanti.'
        : 'Importo capito dalla voce. Controlla e poi vai avanti.',
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
    if (!ocr.error || cameraVisible) return;
    Alert.alert('Lettura scontrino', ocr.error, [{ text: 'OK', onPress: ocr.clearError }]);
  }, [cameraVisible, ocr.clearError, ocr.error]);

  useEffect(() => {
    if (!voice.error) return;
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

  useEffect(() => {
    if (tab === 'camera') {
      handleOpenCamera().catch(() => {});
    } else if (tab === 'voice') {
      if (!voice.isListening && !voice.isProcessing) {
        Haptics.selectionAsync();
        voice.startListening().catch(() => {});
      }
    } else {
      if (voice.isListening) voice.stopListening().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleKey = useCallback(
    (key: string) => {
      if (key === '⌫') {
        setAutoFillSource(null);
        setAutoFillLabel(null);
        onAmountChange(amount.slice(0, -1));
        Haptics.selectionAsync();
        return;
      }
      const normalised = key === ',' ? '.' : key;
      if (normalised === '.' && amount.includes('.')) return;
      const dotIndex = amount.indexOf('.');
      if (dotIndex !== -1 && amount.length - dotIndex > 2) return;
      const integerPart = amount.split('.')[0] ?? '';
      if (normalised !== '.' && dotIndex === -1 && integerPart.length >= 4) return;
      setAutoFillSource(null);
      setAutoFillLabel(null);
      onAmountChange(amount + normalised);
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

  const displayValue = `€${(amount || '0').replace('.', ',')}`;

  const tabs: { key: InputTab; label: string; icon: React.ReactNode; iconActive: React.ReactNode }[] = [
    {
      key: 'keyboard',
      label: 'Tastiera',
      icon: <Keyboard size={22} color={t.colors.text} />,
      iconActive: <Keyboard size={22} color="#FFFFFF" />,
    },
    {
      key: 'camera',
      label: 'Fotocamera',
      icon: <Camera size={22} color={t.colors.text} />,
      iconActive: <Camera size={22} color="#FFFFFF" />,
    },
    {
      key: 'voice',
      label: 'Voce',
      icon: <Mic size={22} color={t.colors.text} />,
      iconActive: <Mic size={22} color="#FFFFFF" />,
    },
  ];

  return (
    <Animated.View
      style={styles.stepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <BackButton onPress={onBack} />

        {/* Schermo importo */}
        <Animated.View
          style={[styles.amountDisplay, amountCardStyle]}
          accessible
          accessibilityLabel={`Importo: ${displayValue}`}
          accessibilityHint="Mostra l'importo che stai inserendo con il tastierino"
        >
          <Text style={styles.amountLabel}>Quanto devi pagare</Text>
          <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>
            {displayValue}
          </Text>
          {autoFillLabel && (
            <View style={[
              styles.autoFillBadge,
              autoFillSource === 'ocr' ? styles.autoFillBadgeOcr : styles.autoFillBadgeVoice,
            ]}>
              {autoFillSource === 'ocr'
                ? <Camera size={18} color="#FFFFFF" />
                : <Mic size={18} color="#FFFFFF" />
              }
              <Text style={styles.autoFillBadgeText}>{autoFillLabel}</Text>
            </View>
          )}
        </Animated.View>

        {/* Indicatore occupato */}
        {isBusy && (
          <Animated.View
            style={styles.busyRow}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
          >
            {ocr.isScanning ? (
              <><ActivityIndicator color={t.colors.success} size="small" /><Text style={styles.busyText}>{busyLabel}</Text></>
            ) : voice.isListening ? (
              <><VoiceWave active /><Text style={styles.busyText}>{busyLabel}</Text></>
            ) : (
              <><ActivityIndicator color={t.colors.primary} size="small" /><Text style={styles.busyText}>{busyLabel}</Text></>
            )}
          </Animated.View>
        )}

        {/* Tab selector */}
        <View style={styles.tabContainer}>
          {tabs.map((t_item) => (
            <TouchableOpacity
              key={t_item.key}
              style={[styles.tab, tab === t_item.key && styles.tabActive]}
              onPress={() => setTab(t_item.key)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={t_item.label}
              accessibilityState={{ selected: tab === t_item.key }}
            >
              {tab === t_item.key ? t_item.iconActive : t_item.icon}
              <Text style={[styles.tabText, tab === t_item.key && styles.tabTextActive]}>
                {t_item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contenuto per tab */}
        {tab === 'keyboard' && <Numpad onPress={handleKey} />}

        {tab === 'camera' && (
          <View style={styles.altTabContent}>
            <TouchableOpacity
              style={styles.altTabBtn}
              onPress={() => { handleOpenCamera().catch(() => {}); }}
              accessible
              accessibilityLabel="Leggi importo con la fotocamera"
              accessibilityHint="Apre la fotocamera per scansionare il totale dello scontrino"
              accessibilityRole="button"
              disabled={isBusy}
            >
              <Camera size={52} color={t.colors.primary} />
              <Text style={styles.altTabBtnLabel}>Inquadra lo scontrino</Text>
              <Text style={styles.altTabBtnHint}>Punta verso il totale e scatta la foto.</Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === 'voice' && (
          <View style={styles.altTabContent}>
            <VoiceWave active={voice.isListening} />
            <TouchableOpacity
              style={styles.altTabBtn}
              onPress={handleVoiceToggle}
              accessible
              accessibilityLabel={voice.isListening ? 'Ferma ascolto' : 'Dì il numero con la voce'}
              accessibilityHint={voice.isListening ? 'Ferma il riconoscimento vocale' : "Inizia a parlare per inserire l'importo con la voce"}
              accessibilityRole="button"
              disabled={ocr.isScanning}
            >
              <Mic size={52} color={voice.isListening ? t.colors.error : t.colors.primary} />
              <Text style={styles.altTabBtnLabel}>
                {voice.isListening ? 'Sto ascoltando...' : 'Parla adesso'}
              </Text>
              <Text style={styles.altTabBtnHint}>
                {voice.isListening
                  ? 'Premi per fermare.'
                  : "Di' ad esempio: quindici euro e cinquanta."}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pulsante avanti */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btnPrimary, (!isValid || isBusy) && styles.btnDisabled]}
            onPress={isValid && !isBusy ? onConfirm : undefined}
            accessible
            accessibilityLabel={`Vai avanti con ${formatEuro(parsed)}`}
            accessibilityHint="Procede al passo di conferma dell'importo"
            accessibilityRole="button"
            disabled={!isValid || isBusy}
          >
            <CheckCircle size={22} color="#FFFFFF" />
            <Text style={styles.btnPrimaryText}>Continua</Text>
          </TouchableOpacity>
        </View>

        <CameraOverlay
          visible={cameraVisible}
          cameraGranted={ocr.cameraGranted}
          cameraCanAskAgain={ocr.cameraCanAskAgain}
          isProcessing={ocr.isScanning}
          onRequestPermission={ocr.requestCameraPermission}
          onCapture={handleCameraCapture}
          onClose={() => { setCameraVisible(false); setTab('keyboard'); }}
        />
      </ScrollView>
    </Animated.View>
  );
}

// ============================================================
// STEP B: CONFERMA IMPORTO
// ============================================================
interface StepConfirmProps {
  amount: number;
  onYes: () => void;
  onNo: () => void;
  compact: boolean;
}

function StepConfirm({ amount, onYes, onNo, compact }: StepConfirmProps) {
  return (
    <Animated.View
      style={styles.confirmStepContainer}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
    >
      <BackButton onPress={onNo} variant="confirm" />

      <View style={[styles.confirmCenter, compact && styles.confirmCenterCompact]}>
        <Text style={[styles.confirmQuestion, compact && styles.confirmQuestionCompact]}>Devi pagare</Text>
        <Text
          style={[styles.confirmAmount, compact && styles.confirmAmountCompact]}
          accessible
          accessibilityLabel={`${formatEuro(amount)}`}
          accessibilityHint="Importo che stai per confermare"
        >
          {formatEuro(amount)}
        </Text>
        <Text style={[styles.confirmQuestion, compact && styles.confirmQuestionCompact]}>È giusto?</Text>
      </View>

      <View style={[styles.confirmButtons, compact && styles.confirmButtonsCompact]}>
        <TouchableOpacity
          style={[styles.bigButton, compact && styles.bigButtonCompact, styles.btnYes]}
          onPress={onYes}
          accessible
          accessibilityLabel="Sì, è giusto"
          accessibilityHint="Conferma l'importo e procede alle istruzioni di pagamento"
          accessibilityRole="button"
        >
          <Text style={[styles.bigButtonText, compact && styles.bigButtonTextCompact]}>Sì</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigButton, compact && styles.bigButtonCompact, styles.btnNo]}
          onPress={onNo}
          accessible
          accessibilityLabel="No, torna indietro"
          accessibilityHint="Torna al passo precedente per correggere l'importo"
          accessibilityRole="button"
        >
          <Text style={[styles.bigButtonText, compact && styles.bigButtonTextCompact]}>No</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ============================================================
// STEP C: PRENDI I SOLDI
// ============================================================
interface StepInstructionsProps {
  total: number;
  onContinue: (coveredAmount: number) => void;
  onBack: () => void;
  paymentMode: PaymentMode;
  compact: boolean;
}

const MONEY_IMAGE_BY_VALUE: Record<number, string> = {
  50:   'https://commons.wikimedia.org/wiki/Special:FilePath/EUR_50_obverse_(2002_issue).jpg',
  20:   'https://commons.wikimedia.org/wiki/Special:FilePath/EUR_20_obverse_(2002_issue).jpg',
  10:   'https://commons.wikimedia.org/wiki/Special:FilePath/EUR_10_obverse_(2002_issue).jpg',
  5:    'https://commons.wikimedia.org/wiki/Special:FilePath/EUR_5_obverse_(2002_issue).jpg',
  2:    'https://commons.wikimedia.org/wiki/Special:FilePath/2_Euro_common_face_(Old_Design)_(5133941308).jpg',
  1:    'https://commons.wikimedia.org/wiki/Special:FilePath/Reverso_1_euro.jpg',
  0.5:  'https://commons.wikimedia.org/wiki/Special:FilePath/Euro_50_cent.jpg',
  0.2:  'https://commons.wikimedia.org/wiki/Special:FilePath/20_cent_Euro_coins.jpg',
  0.1:  'https://commons.wikimedia.org/wiki/Special:FilePath/Euro_10_cent.gif',
};

function MoneyPhotoRow({ item }: { item: MoneyItem }) {
  const uri = item.imageUri || MONEY_IMAGE_BY_VALUE[item.value];
  return (
    <View
      style={styles.moneyPhotoRow}
      accessible
      accessibilityLabel={`${item.type === 'bill' ? 'Banconota' : 'Moneta'} da ${formatEuro(item.value)}`}
    >
      <View style={[styles.moneyPhotoStage, item.type === 'coin' && styles.moneyCoinStage]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={item.type === 'bill' ? styles.moneyBillImage : styles.moneyCoinImage}
            resizeMode="contain"
            accessible={false}
          />
        ) : (
          <Text style={styles.moneyFallbackText}>{formatEuro(item.value)}</Text>
        )}
      </View>
    </View>
  );
}

function StepInstructions({ total, onContinue, onBack, paymentMode, compact }: StepInstructionsProps) {
  const inventory = useWalletStore((s) => s.inventory);
  const processRealPayment = useWalletStore((s) => s.processRealPayment);
  const toggleBypass = useWalletStore((s) => s.toggleBypass);
  const isBypassActive = useWalletStore((s) => s.isBypassActive);

  const [bypassModalVisible, setBypassModalVisible] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const result = calculateStudentPayment(inventory, total, paymentMode);
  const canPayLess = paymentMode === 'fast';

  const handleContinue = useCallback(async () => {
    setIsCompleting(true);
    try {
      const payResult = await processRealPayment(total, undefined, paymentMode);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onContinue(payResult.coveredAmount);
    } catch (error) {
      Alert.alert('Pagamento non registrato', error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setIsCompleting(false);
    }
  }, [paymentMode, processRealPayment, total, onContinue]);

  const handleBypassSelect = useCallback(
    async (bill: MoneyItem) => {
      setBypassModalVisible(false);
      if (!isBypassActive) toggleBypass();
      setIsCompleting(true);
      try {
        const payResult = await processRealPayment(total, bill.value);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onContinue(payResult.coveredAmount);
      } catch (error) {
        Alert.alert('Pagamento non registrato', error instanceof Error ? error.message : 'Riprova tra poco.');
      } finally {
        setIsCompleting(false);
      }
    },
    [isBypassActive, processRealPayment, toggleBypass, total, onContinue],
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

      <ScrollView contentContainerStyle={[styles.instructionsScroll, compact && styles.instructionsScrollCompact]} showsVerticalScrollIndicator={false}>

        {result.isInsufficient ? (
          <View style={styles.insufficientBox}>
            <AlertCircle size={36} color={t.colors.error} />
            <Text style={styles.insufficientText}>
              Non hai abbastanza soldi nel portafoglio.{'\n'}Usa il tasto qui sotto.
            </Text>
          </View>
        ) : (
          <View style={styles.instructionCard}>
            <Text style={[styles.instructionTitle, compact && styles.instructionTitleCompact]}>Usa questi soldi:</Text>
            <View style={styles.instructionDivider} />
            <View style={styles.moneyPhotoList}>
              {result.selectedItems.map((item) => (
                <MoneyPhotoRow key={item.id} item={item} />
              ))}
            </View>
            <View style={styles.instructionDivider} />
            <View
              style={[styles.coverageTotalRow, compact && styles.coverageTotalRowCompact]}
              accessible
              accessibilityLabel={`Totale da dare ${formatEuro(result.coveredAmount)}`}
            >
              <Text style={[styles.coverageTotalLabel, compact && styles.coverageTotalLabelCompact]}>Totale da dare:</Text>
              <Text style={[styles.coverageTotalValue, compact && styles.coverageTotalValueCompact]}>{formatEuro(result.coveredAmount).replace('€', '').trim()}{'\n'}€</Text>
            </View>
          </View>
        )}

        {!result.isInsufficient && (
          <TouchableOpacity
            style={[styles.btnPrimary, styles.btnContinue, compact && styles.btnContinueCompact, isCompleting && styles.btnDisabled]}
            onPress={() => { handleContinue().catch(() => {}); }}
            disabled={isCompleting}
            accessible
            accessibilityLabel="Ho messo i soldi sul banco"
            accessibilityHint="Registra il pagamento e prosegue al passo successivo"
            accessibilityRole="button"
          >
            {isCompleting
              ? <ActivityIndicator color={t.colors.onPrimary} />
              : <CheckCircle size={26} color={t.colors.onPrimary} />
            }
            <Text style={[styles.btnPrimaryText, compact && styles.btnPrimaryTextCompact, { marginLeft: 10 }]}>
              {isCompleting ? 'Registro...' : 'Ho pagato'}
            </Text>
          </TouchableOpacity>
        )}

        {canPayLess && (
          <TouchableOpacity
            style={[styles.btnBypass, compact && styles.btnBypassCompact]}
            onPress={handleOpenBypass}
            accessible
            accessibilityLabel="Paga meno"
            accessibilityHint="Apre la scelta di una banconota alternativa da usare per pagare"
            accessibilityRole="button"
          >
            <Banknote size={24} color="#17181A" />
            <Text style={[styles.btnBypassText, compact && styles.btnBypassTextCompact]}>Paga meno</Text>
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
              Scegli la banconota che stai per dare alla cassa:
            </Text>

            <View style={styles.modalBills}>
              {BYPASS_BILLS.map((bill) => (
                <TouchableOpacity
                  key={bill.id}
                  style={styles.modalBill}
                  onPress={() => { handleBypassSelect(bill).catch(() => {}); }}
                  accessible
                  accessibilityLabel={`Banconota da ${formatEuro(bill.value)}`}
                  accessibilityHint="Seleziona questa banconota per il pagamento"
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
              accessibilityHint="Chiude questo pannello senza selezionare una banconota"
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
// STEP D: IL PAGAMENTO È ANDATO BENE
// Giant visual feedback — schermo verde enorme per pagamento esatto.
// ============================================================
interface StepChangeProps {
  total: number;
  coveredAmount: number;
  onFinish: () => void;
  compact: boolean;
}

function StepChange({ total, coveredAmount, onFinish, compact }: StepChangeProps) {
  const change = Math.max(0, Math.round((coveredAmount - total) * 100) / 100);
  const displayChange = formatEuro(change);

  return (
    <Animated.View
      style={[styles.stepContainer, styles.successFull]}
      entering={SlideInRight.duration(280)}
      exiting={SlideOutLeft.duration(280)}
      accessible
      accessibilityLabel={`Ricevi ${displayChange} di resto`}
      accessibilityHint="Il pagamento è andato a buon fine"
    >
      <BackButton onPress={onFinish} variant="success" />

      <Text style={[styles.successTitle, compact && styles.successTitleCompact]}>Pagamento{'\n'}completato</Text>

      <View style={[styles.successIconCircle, compact && styles.successIconCircleCompact]}>
        <View style={[styles.successIconInner, compact && styles.successIconInnerCompact]}>
          <CheckCircle size={compact ? 82 : 108} color="#FFFFFF" strokeWidth={2.1} />
        </View>
      </View>

      <Text style={[styles.successSubtitle, compact && styles.successSubtitleCompact]}>Pagamento riuscito con successo.</Text>

      <View style={styles.changeRestoCard}>
        <Text style={[styles.changeRestoLabel, compact && styles.changeRestoLabelCompact]}>Il tuo resto:</Text>
        <Text style={[styles.changeRestoAmount, compact && styles.changeRestoAmountCompact]}>{displayChange}</Text>
      </View>

      <TouchableOpacity
        style={[styles.btnFinish, compact && styles.btnFinishCompact]}
        onPress={onFinish}
        accessible
        accessibilityLabel="Torna alla Home"
        accessibilityHint="Torna alla schermata iniziale per iniziare un nuovo pagamento"
        accessibilityRole="button"
      >
        <Home size={compact ? 24 : 28} color="#1D7A45" />
        <Text style={[styles.btnFinishText, compact && styles.btnFinishTextCompact]}>Torna alla Home</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================
// WIZARD PRINCIPALE
// ============================================================
type Props = StackScreenProps<RootStackParamList, 'PaymentWizard'>;

export default function PaymentWizard({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<WizardStep>('amount');
  const [direction, setDirection] = useState<Direction>('forward');
  const [amountStr, setAmountStr] = useState('');
  const [coveredAmount, setCoveredAmount] = useState(0);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('exact');
  const [isSendingSos, setIsSendingSos] = useState(false);
  const isCompact = width < 390;

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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setStudentId(data.user?.id ?? null);
    }).catch(() => {
      setStudentId(null);
    });
  }, []);

  useEffect(() => {
    if (!studentId) {
      setPaymentMode('exact');
      return;
    }

    let active = true;
    const currentStudentId = studentId;

    async function loadPaymentMode() {
      try {
        const { data } = await supabase
          .from('tutor_students')
          .select('payment_mode')
          .eq('student_id', currentStudentId)
          .limit(1)
          .maybeSingle();

        if (active) {
          setPaymentMode(data?.payment_mode === 'fast' ? 'fast' : 'exact');
        }
      } catch {
        if (active) setPaymentMode('exact');
      }
    }

    loadPaymentMode().catch(() => {});
    return () => {
      active = false;
    };
  }, [studentId]);

  const handleSos = useCallback(async () => {
    if (!studentId || isSendingSos) return;
    setIsSendingSos(true);
    try {
      await sendSos(studentId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('SOS inviato', 'Il tutor ha ricevuto una richiesta di aiuto.');
    } catch (error) {
      Alert.alert('SOS non inviato', error instanceof Error ? error.message : 'Riprova tra poco.');
    } finally {
      setIsSendingSos(false);
    }
  }, [isSendingSos, studentId]);

  // Le animazioni entering/exiting variano in base alla direzione.
  const entering = direction === 'forward' ? SlideInRight.duration(280) : SlideInLeft.duration(280);
  const exiting  = direction === 'forward' ? SlideOutLeft.duration(280) : SlideOutRight.duration(280);

  return (
    <SafeAreaView style={styles.root}>
      {step !== 'confirm' && step !== 'instructions' ? (
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.sosButton, (!studentId || isSendingSos) && styles.sosButtonDisabled]}
            onPress={() => { handleSos().catch(() => {}); }}
            disabled={!studentId || isSendingSos}
            accessible
            accessibilityLabel="Chiedi aiuto al tutor"
            accessibilityHint="Invia una notifica urgente al tuo tutor per chiedere assistenza"
            accessibilityRole="button"
          >
            <LifeBuoy size={20} color="#FFFFFF" />
            <Text style={styles.sosButtonText}>{isSendingSos ? 'Invio...' : 'Aiuto'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Il key forza React a rimontare il componente ad ogni step change,
          attivando le animazioni entering/exiting di Reanimated. */}
      {step === 'amount' && (
        <StepAmount
          key="amount"
          amount={amountStr}
          onAmountChange={setAmountStr}
          onConfirm={handleAmountConfirm}
          onBack={() => navigation.goBack()}
        />
      )}
      {step === 'confirm' && (
        <StepConfirm
          key="confirm"
          amount={total}
          compact={isCompact}
          onYes={handleConfirmYes}
          onNo={() => goBack('amount')}
        />
      )}
      {step === 'instructions' && (
        <StepInstructions
          key="instructions"
          total={total}
          paymentMode={paymentMode}
          compact={isCompact}
          onContinue={handleInstructionsContinue}
          onBack={() => goBack('confirm')}
        />
      )}
      {step === 'change' && (
        <StepChange
          key="change"
          total={total}
          coveredAmount={coveredAmount}
          compact={isCompact}
          onFinish={handleFinish}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================
// STILI GLOBALI — studentTheme, contrasto AAA, touch ≥64dp
// ============================================================
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.colors.surface,
  },

  // Header row
  headerRow: {
    minHeight: 56,
    marginBottom: 0,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E0E4EE',
  },
  sosButton: {
    position: 'absolute',
    right: t.spacing.md,
    minHeight: t.spacing.touchTarget,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sosButtonDisabled: { opacity: 0.4 },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
  },

  // Container step
  stepContainer: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingBottom: t.spacing.lg, backgroundColor: t.colors.surface },

  // Pulsante torna indietro
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: t.spacing.md,
    minHeight: t.spacing.touchTarget,
    gap: t.spacing.sm,
  },
  confirmBackButton: {
    alignSelf: 'flex-start',
    marginLeft: 33,
    marginTop: 24,
    padding: 0,
    width: 56,
    height: 56,
    minHeight: 56,
    justifyContent: 'center',
  },
  successBackButton: {
    alignSelf: 'flex-start',
    marginLeft: 24,
    marginTop: 8,
    padding: 0,
    width: 56,
    height: 56,
    minHeight: 56,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
  },

  // Step A: display importo
  amountDisplay: {
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.lg,
    borderRadius: t.radius.lg,
    borderWidth: 2,
    borderColor: t.colors.primary,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  amountLabel: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightMedium,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  amountValue: {
    fontSize: 72,
    fontWeight: t.typography.weightBold,
    color: t.colors.primary,
    lineHeight: 80,
    textAlign: 'center',
  },
  amountCurrency: {
    fontSize: 36,
    fontWeight: t.typography.weightMedium,
    color: t.colors.textSecondary,
  },

  // Tab selector (Tastiera / Fotocamera / Voce)
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    backgroundColor: '#E8EAF0',
    borderRadius: t.radius.lg,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 72,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: t.colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Contenuto alternativo (camera / voice)
  altTabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: t.spacing.xl,
    gap: t.spacing.md,
  },
  altTabBtn: {
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
  },
  altTabBtnLabel: {
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
    textAlign: 'center',
  },
  altTabBtnHint: {
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightMedium,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
  },
  autoFillBadge: {
    width: '100%',
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  autoFillBadgeOcr:   { backgroundColor: t.colors.success },
  autoFillBadgeVoice: { backgroundColor: t.colors.primary },
  autoFillBadgeText: {
    flex: 1,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    color: '#FFFFFF',
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
  },
  busyRow: {
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    minHeight: 72,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 3,
    borderColor: t.colors.border,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
  },
  busyText: {
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
    textAlign: 'center',
  },
  inputMethodRow: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.sm,
  },
  inputMethodBtn: {
    flex: 1,
    minHeight: 140,
    borderRadius: t.radius.xl,
    borderWidth: 3,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.md,
    gap: t.spacing.sm,
    justifyContent: 'space-between',
  },
  btnCamera: {
    backgroundColor: t.colors.success,
    borderColor: '#0D3D0D',
  },
  btnMic: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primaryVariant,
  },
  btnMicActive: {
    backgroundColor: t.colors.primaryVariant,
    borderColor: '#001540',
  },
  inputMethodLabel: {
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    color: '#FFFFFF',
  },
  inputMethodHint: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: t.typography.weightMedium,
  },

  // Step B: conferma
  confirmStepContainer: {
    flex: 1,
    backgroundColor: '#F8F8F9',
  },
  confirmCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 30,
    gap: 22,
  },
  confirmCenterCompact: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 16,
  },
  confirmQuestion: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    color: '#17181A',
    textAlign: 'center',
  },
  confirmQuestionCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  confirmAmount: {
    fontSize: 72,
    fontWeight: '900',
    color: '#17181A',
    textAlign: 'center',
    lineHeight: 82,
  },
  confirmAmountCompact: {
    fontSize: 56,
    lineHeight: 64,
  },
  confirmButtons: {
    flexDirection: 'column',
    gap: 14,
    paddingHorizontal: 29,
    paddingBottom: 24,
  },
  confirmButtonsCompact: {
    paddingHorizontal: 18,
  },
  bigButton: {
    height: 58,
    borderRadius: 8,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButtonCompact: {
    height: 54,
  },
  bigButtonText: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bigButtonTextCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  btnYes: { backgroundColor: '#126332' },
  btnNo:  { backgroundColor: '#A80000' },

  // Step C: istruzioni
  instructionsScroll: {
    paddingHorizontal: 28,
    paddingTop: 6,
    paddingBottom: 28,
    gap: t.spacing.md,
  },
  instructionsScrollCompact: {
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  instructionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 26,
    borderWidth: 1,
    borderColor: '#D8DDE8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  instructionTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: '#17181A',
    textAlign: 'left',
    marginBottom: 16,
  },
  instructionTitleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  instructionDivider: {
    height: 1,
    backgroundColor: '#E1E5EC',
    marginBottom: 18,
  },
  moneyPhotoList: {
    gap: 18,
    marginBottom: 18,
  },
  moneyPhotoRow: {
    minHeight: 126,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#C8D0DE',
    backgroundColor: '#F9FAFC',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  moneyPhotoStage: {
    width: 220,
    height: 86,
    borderRadius: 8,
    backgroundColor: '#FBEFCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moneyCoinStage: {
    backgroundColor: '#1D4353',
  },
  moneyBillImage: {
    width: 160,
    height: 60,
  },
  moneyCoinImage: {
    width: 138,
    height: 74,
  },
  moneyFallbackText: {
    color: '#17181A',
    fontSize: 24,
    fontWeight: '900',
  },
  coverageTotalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 18,
  },
  coverageTotalRowCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  coverageTotalLabel: {
    flex: 1,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: '#17181A',
  },
  coverageTotalLabelCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  coverageTotalValue: {
    minWidth: 170,
    fontSize: 38,
    lineHeight: 38,
    fontWeight: '900',
    color: '#0A2E73',
    textAlign: 'center',
  },
  coverageTotalValueCompact: {
    minWidth: 0,
    alignSelf: 'stretch',
    fontSize: 32,
    lineHeight: 34,
  },
  insufficientBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    padding: t.spacing.md,
    backgroundColor: '#F8E0DD',
    borderRadius: t.radius.md,
    borderWidth: 3,
    borderColor: t.colors.error,
  },
  insufficientText: {
    flex: 1,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    color: t.colors.error,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
  },
  btnBypass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    backgroundColor: '#E7E7E7',
    borderWidth: 1,
    borderColor: '#C8D0DE',
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 72,
  },
  btnBypassCompact: {
    minHeight: 62,
    paddingHorizontal: 14,
  },
  btnBypassText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#17181A',
  },
  btnBypassTextCompact: {
    fontSize: 20,
  },
  btnContinue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: '#082C6C',
  },
  btnContinueCompact: {
    minHeight: 60,
  },

  // Step D: successo / resto (layout unificato — sfondo verde)
  successFull: {
    flex: 1,
    backgroundColor: '#257642',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 32,
  },
  successIconCircle: {
    width: 232,
    height: 232,
    borderRadius: 116,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    marginTop: 118,
    marginBottom: 62,
  },
  successIconCircleCompact: {
    width: 180,
    height: 180,
    borderRadius: 90,
    marginTop: 64,
    marginBottom: 34,
  },
  successIconInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  successIconInnerCompact: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  successTitle: {
    marginTop: 2,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  successTitleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  successSubtitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 28,
  },
  successSubtitleCompact: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 18,
  },
  changeRestoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 34,
    alignItems: 'center',
    gap: 24,
    shadowColor: '#11351F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  changeRestoLabel: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800',
    color: '#414758',
    textAlign: 'center',
  },
  changeRestoLabelCompact: {
    fontSize: 25,
    lineHeight: 30,
  },
  changeRestoAmount: {
    fontSize: 60,
    lineHeight: 68,
    fontWeight: '900',
    color: '#257642',
    textAlign: 'center',
  },
  changeRestoAmountCompact: {
    fontSize: 48,
    lineHeight: 54,
  },

  // Modal bypass
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: t.colors.background,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    borderWidth: 3,
    borderBottomWidth: 0,
    borderColor: t.colors.text,
    padding: t.spacing.lg,
    gap: t.spacing.md,
  },
  modalTitle: {
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
    color: t.colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightMedium,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  modalBills: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  modalBill: {
    minWidth: 88,
    minHeight: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    borderWidth: 3,
    borderColor: '#5C2D00',
    backgroundColor: '#8B4500',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.sm,
  },
  modalBillText: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    color: '#FFFFFF',
  },
  modalCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.spacing.touchTarget,
  },
  modalCancelText: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    color: t.colors.error,
  },

  // Pulsanti footer
  footer: {
    padding: t.spacing.md,
  },
  btnPrimary: {
    backgroundColor: t.colors.primary,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.spacing.touchTarget,
    flexDirection: 'row',
    gap: t.spacing.sm,
  },
  btnFinish: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 86,
    marginTop: 38,
    flexDirection: 'row',
    gap: 16,
  },
  btnFinishCompact: {
    minHeight: 72,
    marginTop: 24,
    paddingVertical: 14,
    gap: 10,
  },
  btnFinishText: {
    color: '#257642',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  btnFinishTextCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  btnDisabled: {
    backgroundColor: t.colors.textDisabled,
    borderColor: t.colors.border,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    letterSpacing: 0.8,
  },
  btnPrimaryTextCompact: {
    fontSize: 15,
  },
});
