import { supabase } from './supabase';
import { Json, MoneyItem } from './database.types';
import { formatEuro } from '../utils/paymentLogic';
import { sendTutorPushNotification } from '../services/notifications';

export interface PaymentLogInput {
  studentId: string;
  amount: number;
  coveredAmount: number;
  usedBypass: boolean;
  selectedItems: MoneyItem[];
}

export interface SosLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

async function getTutorIds(studentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('tutor_students')
    .select('tutor_id')
    .eq('student_id', studentId);

  if (error) {
    console.warn('[Payments] Tutor associati non leggibili:', error.message);
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.tutor_id))];
}

async function getStudentName(studentId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', studentId)
    .single();

  return data?.full_name ?? 'Studente';
}

export async function persistWallet(studentId: string, items: MoneyItem[]): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .upsert({ user_id: studentId, items }, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

export async function recordPayment(input: PaymentLogInput): Promise<void> {
  const [tutorIds, studentName] = await Promise.all([
    getTutorIds(input.studentId),
    getStudentName(input.studentId),
  ]);

  const message = input.usedBypass
    ? `${studentName} ha pagato ${formatEuro(input.amount)} usando "Ho altri soldi".`
    : `${studentName} ha pagato ${formatEuro(input.amount)}.`;

  await Promise.all(
    tutorIds.map((tutorId) =>
      supabase.from('activity_logs').insert({
        student_id: input.studentId,
        tutor_id: tutorId,
        kind: 'payment',
        amount: input.amount,
        covered_amount: input.coveredAmount,
        used_bypass: input.usedBypass,
        message,
        metadata: {
          selectedItems: input.selectedItems,
        } as unknown as Json,
      }),
    ),
  );

  await sendTutorPushNotification({
    studentId: input.studentId,
    studentName,
    kind: 'payment',
    amount: input.amount,
  });
}

export async function sendSos(
  studentId: string,
  screenName?: string,
  amount?: number,
  location?: SosLocation | null,
): Promise<void> {
  const [tutorIds, studentName] = await Promise.all([
    getTutorIds(studentId),
    getStudentName(studentId),
  ]);

  await Promise.all(
    tutorIds.map((tutorId) =>
      supabase.from('activity_logs').insert({
        student_id: studentId,
        tutor_id: tutorId,
        kind: 'sos',
        message: `SOS: ${studentName} ha bisogno di aiuto!`,
        metadata: {
          screen_name: screenName ?? null,
          amount: amount ?? null,
          location: location ?? null,
        } as unknown as Json,
      }),
    ),
  );

  await sendTutorPushNotification({
    studentId,
    studentName,
    kind: 'sos',
  });
}
