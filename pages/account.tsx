import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [accountCreated, setAccountCreated] = useState('');
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [userId, setUserId] = useState('');
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

        // Set user info
        setUserId(session.user.id);
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

  const handleDeleteAccount = async () => {
    if (!userId) return;
    
    setDeleteLoading(true);
    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      // Call our API endpoint to delete the account
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete account');
      }

      // Sign out and redirect
      await supabase.auth.signOut();
      router.push('/login?message=account-deleted');
      
    } catch (err: any) {
      console.error('Error deleting account:', err);
      setError(err.message || 'Failed to delete account. Please try again.');
      setDeleteLoading(false);
    }
  };

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
          <button
            onClick={() => setError('')}
            className="mt-4 bg-[var(--primary-blue)] text-white px-4 py-2 rounded-lg font-semibold hover:bg-[var(--primary-blue)]/90 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
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
              
              <div className="pt-4 flex justify-between items-center">
                <button
                  onClick={() => router.back()}
                  className="bg-[var(--primary-blue)] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[var(--primary-blue)]/90 transition-colors"
                >
                  Back
                </button>
                
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-red-600 mb-4">Delete Account</h2>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete your account? This action cannot be undone.
              </p>
              <p className="text-sm text-gray-600 mb-8">
                This will permanently delete:
                <br />• All your saved rosters
                <br />• All preference collection sessions  
                <br />• All employee responses
                <br />• All your saved date settings
                <br />• All associated account data
              </p>
              
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                  className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {deleteLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {deleteLoading ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 