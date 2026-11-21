// Camada inicial de autenticação do Belê GYM.
// Usa somente a publishable key do projeto. Nunca colocar service_role no navegador.
import { supabase } from './supabase-client.js';

export async function getAuthSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error('Não foi possível iniciar a sessão.');
  }
  return { user: data.user, session: data.session };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) {
    throw new Error('Sua autenticação existe, mas seu perfil ainda não foi provisionado pela academia.');
  }
  return { authUser: user, profile };
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback({ event, session });
  });
  return () => data.subscription.unsubscribe();
}
