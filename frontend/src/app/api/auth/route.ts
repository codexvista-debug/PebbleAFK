import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { hashPassword, generateSecretCode, USERNAME_REGEX } from '@/lib/authUtils';

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
      // Check if username already exists in Supabase
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

      // Insert new user into public.users
      const { error: insertError } = await supabase.from('users').insert([
        {
          username: cleanUsername,
          password_hash: hashedPassword,
        }
      ]);

      if (insertError) {
        return NextResponse.json({ error: `Failed to create user: ${insertError.message}` }, { status: 500 });
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
