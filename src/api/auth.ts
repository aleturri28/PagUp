import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Database } from './database.types';

export type UserRole = Database['public']['Enums']['user_role'];
export type RoleRoute = 'TutorDashboard' | 'StudentHome';

export interface Profile {
  id: string;
  role: UserRole;
  fullName: string | null;
  username: string;
  avatarUrl: string | null;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, username, avatar_url')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    role: data.role,
    fullName: data.full_name,
    username: data.username,
    avatarUrl: data.avatar_url,
  };
}

export function routeForRole(role: UserRole): RoleRoute {
  return role === 'tutor' ? 'TutorDashboard' : 'StudentHome';
}

export async function resolveRoleRoute(userId: string): Promise<RoleRoute> {
  const profile = await getProfile(userId);
  return routeForRole(profile.role);
}

export async function signInWithPassword(email: string, password: string): Promise<{
  session: Session;
  profile: Profile;
  route: RoleRoute;
}> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }
  if (!data.session || !data.user) {
    throw new Error('Login riuscito ma sessione Supabase assente.');
  }

  const profile = await getProfile(data.user.id);

  return {
    session: data.session,
    profile,
    route: routeForRole(profile.role),
  };
}

export async function signUp(
  email: string,
  password: string,
  role: 'student' | 'tutor' = 'student',
  username?: string,
): Promise<{
  session: Session;
  profile: Profile;
  route: RoleRoute;
}> {
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      data: {
        role,
        username,
      }
    }
  });

  if (error) {
    throw error;
  }
  if (!data.session || !data.user) {
    throw new Error('Registrazione completata! Per favore, conferma la tua email per accedere (se richiesto).');
  }

  const profile = await getProfile(data.user.id);

  return {
    session: data.session,
    profile,
    route: routeForRole(profile.role),
  };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
