import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.push('/roster');
      }
    };
    checkSession();

    // Check for account deletion message
    if (router.query.message === 'account-deleted') {
      setMessage('Your account and all associated data have been successfully deleted.');
    }
  }, [router.query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isForgotPassword) {
      // Handle forgot password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Check your email for the password reset link.');
      }
      return;
    }

    // Handle regular login/signup
    const { error } = isSignUp
      ? await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`
          }
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      if (isSignUp) {
        setMessage('Check your email to confirm your account.');
      } else {
        router.push('/roster');
      }
    }
  };

  const resetToLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    setMessage('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          background: 'var(--primary-blue)',
          color: '#fff',
          padding: '1rem 2rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          fontWeight: 600,
          zIndex: 1000,
          fontSize: '1.1rem',
        }}>
          Welcome!
        </div>
      )}
      <div style={{
        background: '#fff',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--primary-black)' }}>
          {isForgotPassword ? 'Reset Password' : isSignUp ? 'Sign Up' : 'Log In'}
        </h1>
        
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <input
            style={{ border: '1px solid #d1d5db', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '1rem' }}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          
          {!isForgotPassword && (
            <input
              style={{ border: '1px solid #d1d5db', borderRadius: '0.5rem', padding: '0.75rem 1rem', fontSize: '1rem' }}
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          )}
          
          <button
            type="submit"
            style={{
              background: 'var(--primary-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Log In'}
          </button>
          
          {!isForgotPassword && (
            <>
              <button
                type="button"
                style={{
                  background: 'none',
                  color: 'var(--primary-blue)',
                  border: 'none',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginTop: '0.1rem',
                  fontWeight: 500,
                  padding: '0.1rem 0',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.fontWeight = '600';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.fontWeight = '500';
                }}
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setMessage('');
                }}
              >
                {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
              </button>
              
              <button
                type="button"
                style={{
                  background: 'none',
                  color: '#6b7280',
                  border: 'none',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  marginTop: '0.1rem',
                  fontWeight: 400,
                  padding: '0.1rem 0',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.fontWeight = '500';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.fontWeight = '400';
                }}
                onClick={() => {
                  setIsForgotPassword(true);
                  setMessage('');
                }}
              >
                Forgot your password?
              </button>
            </>
          )}
          
          {isForgotPassword && (
            <button
              type="button"
              style={{
                background: 'none',
                color: 'var(--primary-blue)',
                border: 'none',
                fontSize: '0.95rem',
                cursor: 'pointer',
                marginTop: '0.1rem',
                fontWeight: 500,
                padding: '0.1rem 0',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.fontWeight = '600';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.fontWeight = '500';
              }}
              onClick={resetToLogin}
            >
              Back to login
            </button>
          )}
          
          {message && (
            <p style={{ 
              color: message.includes('Check your email') ? 'var(--primary-blue)' : 'var(--error-red)', 
              fontSize: '0.95rem', 
              marginTop: '-0.5rem' 
            }}>
              {message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
