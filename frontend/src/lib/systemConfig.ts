import { supabase } from '@/lib/supabaseClient';

let cachedRegistrationsPaused: boolean | null = null;
let lastChecked = 0;

export async function getRegistrationsPaused(): Promise<boolean> {
  // 3 second memory cache to avoid unnecessary DB roundtrips on rapid requests
  if (cachedRegistrationsPaused !== null && Date.now() - lastChecked < 3000) {
    return cachedRegistrationsPaused;
  }

  if (!supabase) return cachedRegistrationsPaused ?? false;

  try {
    const { data } = await supabase
      .from('accounts')
      .select('settings')
      .eq('username', '__meta_system__')
      .eq('bot_name', '__meta_registrations__')
      .limit(1)
      .maybeSingle();

    cachedRegistrationsPaused = Boolean(data?.settings?.paused);
    lastChecked = Date.now();
    return cachedRegistrationsPaused;
  } catch (err) {
    console.error('Failed to get registrations paused status:', err);
    return cachedRegistrationsPaused ?? false;
  }
}

export async function setRegistrationsPaused(paused: boolean): Promise<boolean> {
  cachedRegistrationsPaused = paused;
  lastChecked = Date.now();

  if (!supabase) return true;

  try {
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('username', '__meta_system__')
      .eq('bot_name', '__meta_registrations__')
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('accounts')
        .update({
          settings: { paused },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);

      if (error) throw error;
    } else {
      const { error } = await supabase.from('accounts').insert([
        {
          username: '__meta_system__',
          bot_name: '__meta_registrations__',
          server_host: 'pebbleafk.internal',
          server_port: 19132,
          settings: { paused },
        },
      ]);

      if (error) throw error;
    }

    return true;
  } catch (err) {
    console.error('Failed to update registrations paused status in Supabase:', err);
    return false;
  }
}
