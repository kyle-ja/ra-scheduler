import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Navbar() {
  // Simulate welcome message state (in real app, use context or prop)
  const [showWelcome, setShowWelcome] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Simulate: show welcome if localStorage flag is set (or on first mount for demo)
    if (typeof window !== 'undefined' && localStorage.getItem('showWelcome') === 'true') {
      setShowWelcome(true);
      setTimeout(() => {
        setShowWelcome(false);
        localStorage.removeItem('showWelcome');
      }, 3000);
    }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
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
      <nav className="w-full bg-white shadow flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold text-psu-blue">Preference Scheduler</span>
          <Link href="/roster" legacyBehavior>
            <a className="text-base font-medium text-gray-700 hover:text-psu-blue transition">Roster Management</a>
          </Link>
          <Link href="/schedule" legacyBehavior>
            <a className="text-base font-medium text-gray-700 hover:text-psu-blue transition">Exports</a>
          </Link>
        </div>
        <button onClick={handleLogout} className="ml-auto bg-psu-blue text-white px-4 py-2 rounded font-semibold hover:bg-psu-light-blue transition">Log Out</button>
      </nav>
    </>
  );
} 