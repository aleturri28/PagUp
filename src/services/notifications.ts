import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../api/supabase';
import { formatEuro } from '../utils/paymentLogic';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type TutorAlertKind = 'payment' | 'sos';

export interface TutorAlertPayload {
  studentId: string;
  studentName?: string | null;
  kind: TutorAlertKind;
  amount?: number;
}

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  const current = await Notifications.getPermissionsAsync();
  const finalStatus =
    current.status === 'granted'
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    return null;
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } catch (error) {
    console.warn('[Notifications] Token Expo non disponibile:', error);
    return null;
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
      },
      { onConflict: 'user_id,token' },
    );

  if (error) {
    console.warn('[Notifications] Token push non salvato:', error.message);
  }

  return token;
}

async function getStudentName(studentId: string, fallback?: string | null): Promise<string> {
  if (fallback) {
    return fallback;
  }

  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', studentId)
    .single();

  return data?.full_name ?? 'Lo studente';
}

export async function sendTutorPushNotification(payload: TutorAlertPayload): Promise<void> {
  const studentName = await getStudentName(payload.studentId, payload.studentName);

  const { data: links, error: linkError } = await supabase
    .from('tutor_students')
    .select('tutor_id')
    .eq('student_id', payload.studentId);

  if (linkError) {
    console.warn('[Notifications] Tutor associato non trovato:', linkError.message);
    return;
  }

  const tutorIds = [...new Set((links ?? []).map((link) => link.tutor_id))];
  if (tutorIds.length === 0) {
    return;
  }

  const { data: tokens, error: tokenError } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', tutorIds);

  if (tokenError) {
    console.warn('[Notifications] Token tutor non leggibili:', tokenError.message);
    return;
  }

  const title = payload.kind === 'sos' ? 'SOS PagUp' : 'Pagamento completato';
  const body =
    payload.kind === 'sos'
      ? `SOS: ${studentName} ha bisogno di aiuto!`
      : `${studentName} ha appena pagato ${formatEuro(payload.amount ?? 0)}`;

  const messages = (tokens ?? []).map(({ token }) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: {
      studentId: payload.studentId,
      kind: payload.kind,
    },
  }));

  if (messages.length === 0) {
    return;
  }

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.warn('[Notifications] Invio push fallito:', error);
  }
}
