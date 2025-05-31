import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useState, useEffect } from 'react';

export default function Header() {
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Show welcome message when component mounts
    setShowWelcome(true);
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="w-full bg-psu-blue text-white p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold text-white">Preference Scheduler</h1>
        <div className="flex items-center gap-4">
          {showWelcome && (
            <div style={{
              background: '#fff',
              color: 'var(--primary-blue)',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              fontWeight: 600,
              animation: 'slideIn 0.3s ease-out forwards',
            }}>
              Welcome!
            </div>
          )}
          <button
            onClick={handleLogout}
            className="bg-psu-light-blue hover:bg-opacity-90 text-white px-4 py-2 rounded transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
} 