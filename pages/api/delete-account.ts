import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key for user deletion
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // This is the service role key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Regular client for user verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Verify environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      return res.status(500).json({ 
        message: 'Server configuration error - missing service role key' 
      });
    }

    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized - Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the user's session with the token using regular client
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return res.status(401).json({ message: 'Unauthorized - Invalid token' });
    }

    const userId = user.id;
    const userEmail = user.email;
    console.log('Deleting account for user:', userId, userEmail);

    // Delete all user data from related tables in the correct order
    // Note: We're NOT deleting from the feedback table as requested
    try {
      console.log('Step 1: Deleting employee responses...');
      // Delete employee responses first (they reference preference_sessions)
      const { data: preferenceSessions } = await supabaseAdmin
        .from('preference_sessions')
        .select('id')
        .eq('manager_id', userId);
      
      if (preferenceSessions && preferenceSessions.length > 0) {
        const sessionIds = preferenceSessions.map(session => session.id);
        const { error: responsesError } = await supabaseAdmin
          .from('employee_responses')
          .delete()
          .in('session_id', sessionIds);
        
        if (responsesError) {
          console.error('Error deleting employee responses:', responsesError);
          throw new Error(`Failed to delete employee responses: ${responsesError.message}`);
        }
        console.log(`Deleted employee responses for ${sessionIds.length} sessions`);
      }

      console.log('Step 2: Deleting preference sessions...');
      // Delete preference sessions
      const { error: sessionsError } = await supabaseAdmin
        .from('preference_sessions')
        .delete()
        .eq('manager_id', userId);
      
      if (sessionsError) {
        console.error('Error deleting preference sessions:', sessionsError);
        throw new Error(`Failed to delete preference sessions: ${sessionsError.message}`);
      }

      console.log('Step 3: Deleting rosters...');
      // Delete rosters
      const { error: rostersError } = await supabaseAdmin
        .from('rosters')
        .delete()
        .eq('user_id', userId);
      
      if (rostersError) {
        console.error('Error deleting rosters:', rostersError);
        throw new Error(`Failed to delete rosters: ${rostersError.message}`);
      }

      console.log('Step 4: Deleting date settings...');
      // Delete date settings
      const { error: dateSettingsError } = await supabaseAdmin
        .from('date_settings')
        .delete()
        .eq('user_id', userId);
      
      if (dateSettingsError) {
        console.error('Error deleting date settings:', dateSettingsError);
        throw new Error(`Failed to delete date settings: ${dateSettingsError.message}`);
      }

      console.log('Step 5: Deleting user from auth.users...');
      // Finally, delete the user from Supabase Auth using admin client
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      
      if (deleteUserError) {
        console.error('Error deleting user from auth:', deleteUserError);
        throw new Error(`Failed to delete user from auth: ${deleteUserError.message}`);
      }

      console.log('Successfully deleted user and all associated data:', userId);
      
      res.status(200).json({ 
        message: 'Account and all associated data have been permanently deleted.',
        success: true
      });

    } catch (dbError: any) {
      console.error('Database deletion error:', dbError);
      return res.status(500).json({ 
        message: 'Failed to delete account data',
        error: dbError.message
      });
    }

  } catch (error: any) {
    console.error('Unexpected error in delete-account API:', error);
    res.status(500).json({ 
      message: 'Unexpected error occurred',
      error: error.message || String(error)
    });
  }
} 