import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/roster');
      }
    };
    checkSession();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      {/* Hero Section */}
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[var(--primary-blue)] mb-6">
              Preference Scheduler
            </h1>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[var(--primary-black)] mb-6">
              Streamline Your Shift Scheduling
            </h2>
            <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
              Efficiently manage and organize your employee shifts with our intuitive scheduling platform based on employee preferences.
            </p>
            <div className="flex justify-center">
              <Link 
                href="/login" 
                className="bg-[var(--primary-blue)] text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-[var(--primary-blue)]/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-[var(--primary-black)] mb-16">
            Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-3">Easy Scheduling</h3>
              <p className="text-gray-600">Create and manage employee schedules with an intuitive interface.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-3">Conflict Resolution</h3>
              <p className="text-gray-600">Automatically detect and resolve scheduling conflicts to ensure fair distribution.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-xl font-semibold text-[var(--primary-black)] mb-3">Export & Share</h3>
              <p className="text-gray-600">Export schedules to excel and share them with your team instantly.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-gray-600">
          <p>© 2025 Preference Scheduler. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

