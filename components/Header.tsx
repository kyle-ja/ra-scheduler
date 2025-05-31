import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="w-full bg-psu-blue text-white p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold text-white">Preference Scheduler</h1>
        <button
          onClick={handleLogout}
          className="bg-psu-light-blue hover:bg-opacity-90 text-white px-4 py-2 rounded transition-colors"
        >
          Log Out
        </button>
      </div>
    </header>
  );
} 