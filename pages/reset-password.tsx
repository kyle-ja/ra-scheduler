import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [hasUpdatedPassword, setHasUpdatedPassword] = useState(false);

  const router = useRouter();

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
        setMessage('Please enter your new password below.');
      }
      // Remove the automatic redirect on SIGNED_IN - we'll handle it manually after password update
    });

    // Check if user is already authenticated (in case they refresh the page)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsValidSession(true);
        setMessage('Please enter your new password below.');
      }
    };
    
    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidSession) {
      setMessage('Invalid or expired reset link. Please request a new password reset.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setMessage(error.message);
        setIsLoading(false);
      } else {
        setHasUpdatedPassword(true);
        setMessage('Password updated successfully! Redirecting to roster...');
        setPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        
        // Now manually redirect after successful password update
        setTimeout(() => {
          router.push('/roster');
        }, 2000);
      }
    } catch (error) {
      setMessage('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const goBackToLogin = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      <div style={{
        background: '#fff',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 700, 
          marginBottom: '1.5rem', 
          color: 'var(--primary-black)',
          textAlign: 'center'
        }}>
          Set New Password
        </h1>

        {!isValidSession ? (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <p style={{ color: 'var(--error-red)', marginBottom: '1.5rem' }}>
              This password reset link is invalid or has expired.
            </p>
            <button
              onClick={goBackToLogin}
              style={{
                background: 'var(--primary-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handlePasswordReset} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <input
              style={{ 
                border: '1px solid #d1d5db', 
                borderRadius: '0.5rem', 
                padding: '0.75rem 1rem', 
                fontSize: '1rem' 
              }}
              type="password"
              placeholder="New Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={hasUpdatedPassword}
            />
            
            <input
              style={{ 
                border: '1px solid #d1d5db', 
                borderRadius: '0.5rem', 
                padding: '0.75rem 1rem', 
                fontSize: '1rem' 
              }}
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={hasUpdatedPassword}
            />

            <button
              type="submit"
              disabled={isLoading || hasUpdatedPassword}
              style={{
                background: (isLoading || hasUpdatedPassword) ? '#9ca3af' : 'var(--primary-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: (isLoading || hasUpdatedPassword) ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {isLoading ? 'Updating Password...' : hasUpdatedPassword ? 'Password Updated!' : 'Update Password'}
            </button>

            {!hasUpdatedPassword && (
              <button
                type="button"
                onClick={goBackToLogin}
                style={{
                  background: 'none',
                  color: 'var(--primary-blue)',
                  border: 'none',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginTop: '-0.5rem',
                  fontWeight: 500,
                  padding: '0.5rem 0',
                }}
              >
                Back to Login
              </button>
            )}

            {message && (
              <p style={{ 
                color: message.includes('successfully') ? 'var(--primary-blue)' : 'var(--error-red)', 
                fontSize: '0.95rem', 
                marginTop: '-0.5rem',
                textAlign: 'center'
              }}>
                {message}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
} 