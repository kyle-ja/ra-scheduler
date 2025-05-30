import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

import { useEffect } from 'react';
import { useRouter } from 'next/router';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');

  const router = useRouter();

    useEffect(() => {
    const checkSession = async () => {
        const {
        data: { session },
        } = await supabase.auth.getSession();

        if (session) {
        router.push('/roster'); // go straight to roster management
        }
    };

    checkSession();
    }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4">{isSignUp ? 'Sign Up' : 'Log In'}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col w-full max-w-sm gap-4">
        <input
          className="border p-2 rounded"
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="border p-2 rounded"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button className="bg-blue-600 text-white py-2 rounded" type="submit">
          {isSignUp ? 'Sign Up' : 'Log In'}
        </button>
        <button
          type="button"
          className="text-sm text-blue-600 underline"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setMessage('');
          }}
        >
          {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </button>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </form>
    </div>
  );
}
