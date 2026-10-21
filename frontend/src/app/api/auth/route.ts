import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { hashPassword, generateSecretCode, USERNAME_REGEX } from '@/lib/authUtils';
import { FRESHSMP_DEFAULT_BOT_SETTINGS } from '@/types';

function createDefaultServerProfile(username: string) {
  return {
    id: 'srv_freshsmp',
    name: 'FreshSMP',
    pebbleUser: username,
    accountId: '',
    assignedAccountIds: [],
    serverHost: 'play.freshsmp.fun',
    serverPort: 19132,
    serverVersion: 'auto',
    authType: 'microsoft',
    autoReconnect: true,
    settings: { ...FRESHSMP_DEFAULT_BOT_SETTINGS },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username')?.trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (supabase) {
      const { data: users, error } = await supabase
        .from('users')
        .select('password_hash, username')
        .ilike('username', username)
        .order('created_at', { ascending: true })
        .limit(1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const user = users?.[0];
      if (user?.password_hash) {
        const secretCode = generateSecretCode(user.username, user.password_hash);
        return NextResponse.json({
          username: user.username,
          secretCode,
        });
      }
    }

    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, username, password } = await req.json();

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const cleanUsername = username.trim();

    if (!USERNAME_REGEX.test(cleanUsername)) {
      return NextResponse.json({
        error: 'Username must be 1 to 16 characters long, using only letters and numbers (no symbols).'
      }, { status: 400 });
    }

    const lowerUser = cleanUsername.toLowerCase();
    const hashedPassword = hashPassword(password);
    const secretCode = generateSecretCode(cleanUsername, hashedPassword);

    if (!supabase) {
      return NextResponse.json({
        error: 'Supabase client is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
      }, { status: 500 });
    }

    if (action === 'register') {
      const { data: existingList, error: checkError } = await supabase
        .from('users')
        .select('username')
        .ilike('username', lowerUser)
        .limit(1);

      if (checkError) {
        return NextResponse.json({ error: `Database error: ${checkError.message}` }, { status: 500 });
      }

      if (existingList && existingList.length > 0) {
        return NextResponse.json({ error: 'This username is already taken. Please choose another or sign in.' }, { status: 400 });
      }

      const { error: insertError } = await supabase.from('users').insert([
        {
          username: cleanUsername,
          password_hash: hashedPassword,
        }
      ]);

      if (insertError) {
        return NextResponse.json({ error: `Failed to create user: ${insertError.message}` }, { status: 500 });
      }

      // A profile is user-editable, but new accounts should never start on an empty server list.
      const defaultProfile = createDefaultServerProfile(cleanUsername);
      const { error: profileError } = await supabase.from('accounts').insert([
        {
          username: cleanUsername,
          bot_name: '__meta_servers__',
          server_host: 'pebbleafk.internal',
          server_port: 19132,
          settings: { servers: [defaultProfile], updatedAt: Date.now() },
        },
      ]);

      if (profileError) {
        // Avoid leaving a successfully registered user with a missing starter profile.
        await supabase.from('users').delete().ilike('username', cleanUsername);
        return NextResponse.json({ error: `Failed to initialize your FreshSMP profile: ${profileError.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        user: { username: cleanUsername, secretCode, isNewUser: true }
      });
    }

    if (action === 'login') {
      const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .ilike('username', lowerUser)
        .limit(1);

      if (fetchError) {
        return NextResponse.json({ error: `Database error: ${fetchError.message}` }, { status: 500 });
      }

      const user = users?.[0];
      if (!user) {
        return NextResponse.json({ error: 'User does not exist. Please register first.' }, { status: 404 });
      }

      if (user.password_hash !== hashedPassword) {
        return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        user: { username: user.username, secretCode }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
