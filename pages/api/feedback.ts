import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, feedback, category, email } = req.body;

    console.log('Received data:', { name, feedback, category, email });

    if (!feedback) {
      return res.status(400).json({ message: 'Feedback is required' });
    }

    console.log('Attempting to insert feedback...');

    // Direct insert without the problematic connection test
    const { data, error } = await supabase
      .from('feedback')
      .insert({
        name: name || null,
        email: email || null,
        category: category || 'General Feedback',
        feedback: feedback
      })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return res.status(500).json({ 
        message: 'Database insert failed',
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
    }

    console.log('Success! Inserted:', data);

    res.status(200).json({ 
      message: 'Feedback saved successfully!',
      data: data
    });

  } catch (error: any) {
    console.error('Unexpected error:', error);
    res.status(500).json({ 
      message: 'Unexpected error',
      error: error.message || String(error)
    });
  }
} 