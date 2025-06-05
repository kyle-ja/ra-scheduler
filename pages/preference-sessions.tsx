import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | '';

interface PreferenceSession {
  id: string;
  name: string;
  schedulable_days: DayOfWeek[];
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  response_count?: number;
}

interface EmployeeResponse {
  id: string;
  employee_name: string;
  employee_email: string | null;
  preferences: DayOfWeek[];
  submitted_at: string;
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PreferenceSessionsPage() {
  const [sessions, setSessions] = useState<PreferenceSession[]>([]);
  const [newSessionName, setNewSessionName] = useState('');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(DAYS_OF_WEEK);
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [responses, setResponses] = useState<EmployeeResponse[]>([]);

  useEffect(() => {
    const loadUserAndSessions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        await fetchSessions(session.user.id);
      }
    };
    loadUserAndSessions();
  }, []);

  const fetchSessions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('preference_sessions')
        .select(`
          *,
          employee_responses(count)
        `)
        .eq('manager_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const sessionsWithCounts = data.map(session => ({
        ...session,
        response_count: session.employee_responses?.[0]?.count || 0
      }));
      
      setSessions(sessionsWithCounts);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim() || !userId) {
      setFeedbackMessage({ type: 'error', message: 'Please enter a session name' });
      return;
    }

    if (selectedDays.length === 0) {
      setFeedbackMessage({ type: 'error', message: 'Please select at least one day' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('preference_sessions')
        .insert([{
          manager_id: userId,
          name: newSessionName.trim(),
          schedulable_days: selectedDays,
          expires_at: expiryDate || null
        }])
        .select()
        .single();

      if (error) throw error;

      await fetchSessions(userId);
      setNewSessionName('');
      setExpiryDate('');
      setFeedbackMessage({ type: 'success', message: 'Session created successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error creating session:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to create session' });
    } finally {
      setLoading(false);
    }
  };

  const toggleSessionStatus = async (sessionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('preference_sessions')
        .update({ is_active: !currentStatus })
        .eq('id', sessionId);

      if (error) throw error;
      await fetchSessions(userId);
    } catch (error) {
      console.error('Error updating session:', error);
    }
  };

  const fetchResponses = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('employee_responses')
        .select('*')
        .eq('session_id', sessionId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setResponses(data || []);
      setSelectedSessionId(sessionId);
    } catch (error) {
      console.error('Error fetching responses:', error);
    }
  };

  const generateShareableLink = (sessionId: string) => {
    return `${window.location.origin}/preference-form/${sessionId}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setFeedbackMessage({ type: 'success', message: 'Link copied to clipboard!' });
    setTimeout(() => setFeedbackMessage(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Employee Preference Collection</h1>
            <p className="mt-2 text-gray-600">Create forms to collect employee schedule preferences</p>
          </div>

          {/* Create New Session */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create New Collection Session</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Name
                </label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="e.g., March 2024 Schedule Preferences"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Days to Include
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <label key={day} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedDays([...selectedDays, day]);
                        } else {
                          setSelectedDays(selectedDays.filter(d => d !== day));
                        }
                      }}
                      className="mr-2"
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateSession}
              disabled={loading}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Session'}
            </button>

            {feedbackMessage && (
              <div className={`mt-4 p-3 rounded ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {feedbackMessage.message}
              </div>
            )}
          </div>

          {/* Existing Sessions */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Your Collection Sessions</h2>
            </div>
            
            {sessions.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No sessions created yet. Create your first session above!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Responses</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sessions.map(session => (
                      <tr key={session.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{session.name}</div>
                            <div className="text-sm text-gray-500">
                              Created {new Date(session.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {session.schedulable_days.join(', ')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {session.response_count || 0} responses
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            session.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {session.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <button
                            onClick={() => copyToClipboard(generateShareableLink(session.id))}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Copy Link
                          </button>
                          <button
                            onClick={() => fetchResponses(session.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            View Responses
                          </button>
                          <button
                            onClick={() => toggleSessionStatus(session.id, session.is_active)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            {session.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Responses View */}
          {selectedSessionId && responses.length > 0 && (
            <div className="mt-8 bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">Employee Responses</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preferences</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {responses.map(response => (
                      <tr key={response.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {response.employee_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {response.employee_email || 'Not provided'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {response.preferences.filter(p => p).join(', ') || 'No preferences'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(response.submitted_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 