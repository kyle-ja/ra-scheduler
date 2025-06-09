import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [accountCreated, setAccountCreated] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkSessionAndGetUserInfo = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        // Set user email
        setUserEmail(session.user.email || '');
        
        // Set account creation date
        const createdAt = new Date(session.user.created_at);
        setAccountCreated(createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }));

        setLoading(false);
      } catch (err) {
        console.error('Error fetching user info:', err);
        setError('Failed to load account information');
        setLoading(false);
      }
    };

    checkSessionAndGetUserInfo();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background-white)] py-8" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-[var(--primary-black)] mb-8">Account Information</h1>
          
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Email Address</h2>
              <p className="text-xl text-[var(--primary-black)] bg-gray-50 px-4 py-3 rounded-lg">
                {userEmail}
              </p>
            </div>
            
            <div className="border-b border-gray-200 pb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Account Created</h2>
              <p className="text-xl text-[var(--primary-black)] bg-gray-50 px-4 py-3 rounded-lg">
                {accountCreated}
              </p>
            </div>
            
            <div className="pt-4">
              <button
                onClick={() => router.back()}
                className="bg-[var(--primary-blue)] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[var(--primary-blue)]/90 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 