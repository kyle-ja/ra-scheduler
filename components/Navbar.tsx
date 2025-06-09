import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import FeedbackModal from './FeedbackModal';

export default function Navbar() {
  // Simulate welcome message state (in real app, use context or prop)
  const [showWelcome, setShowWelcome] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
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

  const handleLogoutAndGoHome = async (e: React.MouseEvent) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/'; // Redirect to home page after logout
    } catch (error) {
      console.error('Error during logout:', error);
      window.location.href = '/'; // Fallback to home page
    }
  };

  // Hide navbar completely for preference form pages
  if (router.pathname.startsWith('/preference-form/')) {
    return null;
  }

  // Dynamic rendering based on route
  if (router.pathname === '/login') {
    return (
      <nav className="w-full bg-white shadow flex items-center justify-between px-6 py-3">
        <Link href="/" legacyBehavior>
          <a className="text-xl font-bold text-psu-blue cursor-pointer">Preference Scheduler</a>
        </Link>
      </nav>
    );
  }

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
          <a className="text-xl font-bold text-psu-blue cursor-pointer" href="/" onClick={handleLogoutAndGoHome}>Preference Scheduler</a>
          <Link href="/roster" legacyBehavior>
            <a className="text-base font-medium text-gray-700 hover:text-psu-blue transition">Roster Management</a>
          </Link>
          <Link href="/preference-sessions" legacyBehavior>
            <a className="text-base font-medium text-gray-700 hover:text-psu-blue transition">Preference Collection</a>
          </Link>
          {/* <Link href="/export" legacyBehavior>
            <a className="text-base font-medium text-gray-700 hover:text-psu-blue transition">Exports</a>
          </Link> */}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/account" legacyBehavior>
            <a className="bg-gray-100 text-gray-700 px-4 py-2 rounded font-semibold hover:bg-gray-200 transition">
              Account
            </a>
          </Link>
          <button 
            onClick={() => setIsFeedbackModalOpen(true)}
            className="bg-psu-gold text-psu-blue px-4 py-2 rounded font-semibold hover:bg-yellow-400 transition"
          >
            Feedback
          </button>
          <button onClick={handleLogout} className="bg-psu-blue text-white px-4 py-2 rounded font-semibold hover:bg-psu-light-blue transition">Log Out</button>
        </div>
      </nav>
      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)} 
      />
    </>
  );
} 