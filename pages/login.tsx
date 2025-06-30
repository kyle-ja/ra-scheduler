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
  const [isLoading, setIsLoading] = useState(false);

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
    setIsLoading(true);
    
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
      setIsLoading(false);
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
    setIsLoading(false);
  };

  const resetToLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    setMessage('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center" 
         style={{ 
           fontFamily: 'Poppins, Arial, Helvetica, sans-serif',
           background: '#f8fafc'
         }}>

      {showWelcome && (
        <div className="fixed top-6 right-6 z-50"
             style={{
               background: 'var(--primary-blue)',
               color: '#ffffff',
               padding: '12px 20px',
               borderRadius: '8px',
               boxShadow: '0 4px 12px rgba(0,30,68,0.15)',
               fontWeight: 600,
               fontSize: '14px',
             }}>
          Welcome!
        </div>
      )}

      <div className="w-full max-w-md mx-4">
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e2e8f0',
          padding: '48px 32px',
        }}>
          
          {/* Header */}
          <div className="text-center mb-8">
            <h1 style={{ 
              fontSize: '28px', 
              fontWeight: 700, 
              color: 'var(--primary-black)',
              marginBottom: '8px',
              lineHeight: '1.2'
            }}>
              {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Sign In'}
            </h1>
            <p style={{ 
              color: '#64748b', 
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {isForgotPassword 
                ? 'Enter your email to receive a reset link' 
                : isSignUp 
                ? 'Create your account to get started' 
                : 'Enter your credentials to continue'
              }
            </p>
          </div>
          
          <form onSubmit={handleSubmit}>
            {/* Email Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: 500,
                color: 'var(--primary-black)',
                marginBottom: '6px' 
              }}>
                Email
              </label>
              <input
                style={{ 
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: '#ffffff',
                  color: 'var(--primary-black)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => e.target.style.borderColor = 'var(--primary-blue)'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
                required
              />
            </div>
            
            {/* Password Input */}
            {!isForgotPassword && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '14px', 
                  fontWeight: 500,
                  color: 'var(--primary-black)',
                  marginBottom: '6px' 
                }}>
                  Password
                </label>
                <input
                  style={{ 
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    backgroundColor: '#ffffff',
                    color: 'var(--primary-black)',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxSizing: 'border-box'
                  }}
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--primary-blue)'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                  required
                />
              </div>
            )}
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isLoading ? '#9ca3af' : 'var(--primary-blue)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                marginBottom: '20px'
              }}
              onMouseEnter={e => {
                if (!isLoading) {
                  e.target.style.backgroundColor = '#1E407C';
                }
              }}
              onMouseLeave={e => {
                if (!isLoading) {
                  e.target.style.backgroundColor = 'var(--primary-blue)';
                }
              }}
            >
              {isLoading ? 'Processing...' : (
                isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
            
            {/* Message Display */}
            {message && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '20px',
                backgroundColor: message.includes('Check your email') || message.includes('deleted') 
                  ? '#f0f9ff' : '#fef2f2',
                color: message.includes('Check your email') || message.includes('deleted') 
                  ? '#1e40af' : '#dc2626',
                border: `1px solid ${message.includes('Check your email') || message.includes('deleted') 
                  ? '#bfdbfe' : '#fecaca'}`
              }}>
                {message}
              </div>
            )}
          </form>
          
          {/* Action Links */}
          <div className="text-center space-y-3">
            {!isForgotPassword && (
              <>
                <div>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-blue)',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      textDecoration: 'none'
                    }}
                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setMessage('');
                    }}
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </button>
                </div>
                
                <div>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '14px',
                      cursor: 'pointer',
                      textDecoration: 'none'
                    }}
                    onMouseEnter={e => {
                      e.target.style.textDecoration = 'underline';
                      e.target.style.color = 'var(--primary-black)';
                    }}
                    onMouseLeave={e => {
                      e.target.style.textDecoration = 'none';
                      e.target.style.color = '#64748b';
                    }}
                    onClick={() => {
                      setIsForgotPassword(true);
                      setMessage('');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}
            
            {isForgotPassword && (
              <div>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-blue)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.target.style.textDecoration = 'none'}
                  onClick={resetToLogin}
                >
                  ← Back to sign in
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
