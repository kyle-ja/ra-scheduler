import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import DaySelector from '../components/DaySelector';
import QRCode from 'qrcode';

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
  
  // Change these to track expanded responses per session
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionResponses, setSessionResponses] = useState<{ [sessionId: string]: EmployeeResponse[] }>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  
  // Track pending deletions
  const [pendingDeletions, setPendingDeletions] = useState<{ [sessionId: string]: string[] }>({});
  const [savingChanges, setSavingChanges] = useState<boolean>(false);
  
  // Track rename values for each session
  const [renameValues, setRenameValues] = useState<{ [sessionId: string]: string }>({});

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

  const toggleResponses = async (sessionId: string) => {
    // If this session is already expanded, collapse it
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    // If we haven't loaded responses for this session yet, load them
    if (!sessionResponses[sessionId]) {
      setLoadingResponses(sessionId);
      try {
        const { data, error } = await supabase
          .from('employee_responses')
          .select('*')
          .eq('session_id', sessionId)
          .order('submitted_at', { ascending: false });

        if (error) throw error;
        
        setSessionResponses(prev => ({
          ...prev,
          [sessionId]: data || []
        }));
      } catch (error) {
        console.error('Error fetching responses:', error);
        setFeedbackMessage({ type: 'error', message: 'Failed to load responses' });
      } finally {
        setLoadingResponses(null);
      }
    }

    setExpandedSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: string, sessionName: string) => {
    if (!confirm(`Are you sure you want to delete the session "${sessionName}"? This will also delete all employee responses.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('preference_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('manager_id', userId);

      if (error) throw error;

      // Remove from local state
      setSessions(sessions.filter(s => s.id !== sessionId));
      
      // Clean up expanded state if this session was expanded
      if (expandedSessionId === sessionId) {
        setExpandedSessionId(null);
      }
      
      // Remove cached responses
      const { [sessionId]: removed, ...rest } = sessionResponses;
      setSessionResponses(rest);

      setFeedbackMessage({ type: 'success', message: 'Session deleted successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting session:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to delete session' });
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

  const downloadQRCode = async (sessionId: string, sessionName: string) => {
    try {
      const link = generateShareableLink(sessionId);
      
      // Ensure the URL is properly formatted
      const cleanUrl = new URL(link).toString();
      
      const qrCodeDataURL = await QRCode.toDataURL(cleanUrl, {
        width: 512,        // Larger size for better scanning
        margin: 4,         // Good margin for scanning
        errorCorrectionLevel: 'H', // High error correction for better reliability
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Create a download link
      const downloadLink = document.createElement('a');
      downloadLink.href = qrCodeDataURL;
      downloadLink.download = `QR-Code-${sessionName.replace(/[^a-z0-9]/gi, '_')}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setFeedbackMessage({ type: 'success', message: 'QR Code downloaded successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error generating QR code:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to generate QR code' });
    }
  };

  const handleMarkForDeletion = (responseId: string, sessionId: string, employeeName: string) => {
    setPendingDeletions(prev => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), responseId]
    }));

    setFeedbackMessage({ type: 'success', message: `Response from "${employeeName}" marked for deletion. Click "Save Changes" to confirm.` });
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleCancelDeletions = (sessionId: string) => {
    setPendingDeletions(prev => {
      const updated = { ...prev };
      delete updated[sessionId];
      return updated;
    });
    
    setFeedbackMessage({ type: 'success', message: 'Pending deletions cancelled.' });
    setTimeout(() => setFeedbackMessage(null), 2000);
  };

  const handleSaveChanges = async (sessionId: string) => {
    const responsesToDelete = pendingDeletions[sessionId] || [];
    if (responsesToDelete.length === 0) return;

    setSavingChanges(true);
    try {
      // First, verify that the session belongs to the current user
      const { data: sessionData, error: sessionError } = await supabase
        .from('preference_sessions')
        .select('manager_id')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        console.error('Error verifying session ownership:', sessionError);
        throw new Error('Failed to verify session ownership');
      }

      if (sessionData.manager_id !== userId) {
        throw new Error('Unauthorized: You can only delete responses from your own sessions');
      }

      // Delete all marked responses
      const { data, error } = await supabase
        .from('employee_responses')
        .delete()
        .in('id', responsesToDelete)
        .eq('session_id', sessionId);

      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }

      console.log('Delete operation successful, deleted data:', data);

      // Update the local state to remove the deleted responses
      setSessionResponses(prev => ({
        ...prev,
        [sessionId]: prev[sessionId].filter(response => !responsesToDelete.includes(response.id))
      }));

      // Update the session response count in the sessions list
      setSessions(prevSessions => 
        prevSessions.map(session => 
          session.id === sessionId 
            ? { ...session, response_count: Math.max(0, (session.response_count || 0) - responsesToDelete.length) }
            : session
        )
      );

      // Clear pending deletions for this session
      setPendingDeletions(prev => {
        const updated = { ...prev };
        delete updated[sessionId];
        return updated;
      });

      setFeedbackMessage({ type: 'success', message: `${responsesToDelete.length} response${responsesToDelete.length !== 1 ? 's' : ''} deleted successfully!` });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error: any) {
      console.error('Error deleting responses:', error);
      setFeedbackMessage({ type: 'error', message: error.message || 'Failed to delete responses' });
    } finally {
      setSavingChanges(false);
    }
  };

  const handleRenameSession = async (sessionId: string) => {
    const newName = renameValues[sessionId]?.trim();
    if (!newName || !userId) {
      setFeedbackMessage({ type: 'error', message: 'Please enter a valid session name' });
      return;
    }

    try {
      const { error } = await supabase
        .from('preference_sessions')
        .update({ name: newName })
        .eq('id', sessionId)
        .eq('manager_id', userId);

      if (error) throw error;

      // Update local state
      setSessions(prevSessions => 
        prevSessions.map(session => 
          session.id === sessionId 
            ? { ...session, name: newName }
            : session
        )
      );

      // Clear the rename input for this session
      setRenameValues(prev => {
        const updated = { ...prev };
        delete updated[sessionId];
        return updated;
      });

      setFeedbackMessage({ type: 'success', message: 'Session renamed successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error renaming session:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to rename session.' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          
          {/* Page Header */}
          <div className="bg-white rounded-2xl shadow p-8 border border-gray-200">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Preference Collection</h1>
            <p className="text-gray-600">Create forms to collect employee schedule preferences</p>
          </div>

          {/* Create New Session */}
          <div className="bg-white rounded-2xl shadow p-8 border border-gray-200">
            <h2 className="text-2xl font-bold mb-6">Create New Collection Session</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Name
                </label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="e.g., March 2024 Schedule Preferences"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                />
              </div>
            </div>

            <div className="mb-6">
              <DaySelector selectedDays={selectedDays} onChange={setSelectedDays} />
            </div>

            <button
              onClick={handleCreateSession}
              disabled={loading}
              className="bg-psu-blue text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
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
          <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold">Your Collection Sessions</h2>
              {sessions.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''} created
                </p>
              )}
            </div>
            
            {sessions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-lg font-medium">No sessions created yet</p>
                <p className="text-sm">Create your first session above to start collecting employee preferences!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="w-12"></th>
                      <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Session Details</th>
                      <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider">Available Days</th>
                      <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-white uppercase tracking-wider">Responses</th>
                      <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-white uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-white uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {sessions.map((session, index) => (
                      <>
                        <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-4 text-center">
                            <button
                              onClick={() => handleDeleteSession(session.id, session.name)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete session"
                            >
                              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6.5 7.5V14.5M10 7.5V14.5M13.5 7.5V14.5M3 5.5H17M8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V5.5H7.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-semibold text-gray-900 mb-2">{session.name}</div>
                              <div className="text-xs text-gray-500 mb-2">
                                Created {new Date(session.created_at).toLocaleDateString()}
                                {session.expires_at && (
                                  <span> • Expires {new Date(session.expires_at).toLocaleDateString()}</span>
                                )}
                              </div>
                              {/* Rename functionality */}
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={renameValues[session.id] || ''}
                                  onChange={e => setRenameValues(prev => ({ ...prev, [session.id]: e.target.value }))}
                                  placeholder="Enter new name"
                                  className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-psu-blue"
                                />
                                <button
                                  onClick={() => handleRenameSession(session.id)}
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                >
                                  Rename
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {session.schedulable_days.map(day => (
                                <span key={day} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                                  {day.substring(0, 3)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-2xl font-bold text-gray-900">{session.response_count || 0}</span>
                              <span className="text-xs text-gray-500">response{(session.response_count || 0) !== 1 ? 's' : ''}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                              session.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              <span className={`w-2 h-2 rounded-full mr-2 ${
                                session.is_active ? 'bg-green-400' : 'bg-gray-400'
                              }`}></span>
                              {session.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center space-x-2">
                              <button
                                onClick={() => copyToClipboard(generateShareableLink(session.id))}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-psu-blue transition-colors"
                                title="Copy shareable link"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy Link
                              </button>
                              
                              <button
                                onClick={() => downloadQRCode(session.id, session.name)}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-psu-blue transition-colors"
                                title="Download QR code"
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                QR Code
                              </button>
                              
                              {(session.response_count || 0) > 0 && (
                                <button
                                  onClick={() => toggleResponses(session.id)}
                                  disabled={loadingResponses === session.id}
                                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
                                >
                                  {loadingResponses === session.id ? (
                                    <>
                                      <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      Loading...
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedSessionId === session.id ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                      </svg>
                                      {expandedSessionId === session.id ? 'Hide' : 'View'} Responses
                                    </>
                                  )}
                                </button>
                              )}
                              
                              <button
                                onClick={() => toggleSessionStatus(session.id, session.is_active)}
                                className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white transition-colors ${
                                  session.is_active 
                                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
                                    : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                                } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                              >
                                {session.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Expandable responses row */}
                        {expandedSessionId === session.id && sessionResponses[session.id] && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-6 py-6">
                              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 rounded-t-lg">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h4 className="text-lg font-semibold text-gray-900">Employee Responses</h4>
                                      <p className="text-sm text-gray-600 mt-1">
                                        {sessionResponses[session.id].length} response{sessionResponses[session.id].length !== 1 ? 's' : ''} collected
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => setExpandedSessionId(null)}
                                      className="text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                
                                {sessionResponses[session.id].length === 0 ? (
                                  <div className="p-8 text-center text-gray-500">
                                    <div className="text-3xl mb-2">📝</div>
                                    <p className="font-medium">No responses yet</p>
                                    <p className="text-sm">Share the link to start collecting preferences!</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full">
                                      <thead className="bg-psu-blue">
                                        <tr>
                                          <th className="w-12"></th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Employee</th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Contact</th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Preferences</th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Submitted</th>
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white divide-y divide-gray-200">
                                        {sessionResponses[session.id].map((response, responseIndex) => (
                                          <tr key={response.id} className={`transition-colors ${
                                            pendingDeletions[session.id]?.includes(response.id)
                                              ? 'bg-red-50 hover:bg-red-100 opacity-75'
                                              : 'hover:bg-gray-50'
                                          }`}>
                                            <td className="px-3 py-4 text-center">
                                              <button
                                                onClick={() => handleMarkForDeletion(response.id, session.id, response.employee_name)}
                                                className={`p-2 rounded-md transition-colors ${
                                                  pendingDeletions[session.id]?.includes(response.id)
                                                    ? 'text-red-600 bg-red-50' 
                                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                                }`}
                                                title={pendingDeletions[session.id]?.includes(response.id) ? "Marked for deletion" : "Mark for deletion"}
                                              >
                                                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                                  <path d="M6.5 7.5V14.5M10 7.5V14.5M13.5 7.5V14.5M3 5.5H17M8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V5.5H7.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                              </button>
                                            </td>
                                            <td className="px-6 py-4">
                                              <div className="text-sm font-medium text-gray-900">{response.employee_name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                              <div className="text-sm text-gray-500">
                                                {response.employee_email ? (
                                                  <a href={`mailto:${response.employee_email}`} className="text-blue-600 hover:text-blue-800">
                                                    {response.employee_email}
                                                  </a>
                                                ) : (
                                                  <span className="text-gray-400 italic">Not provided</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-6 py-4">
                                              <div className="flex flex-wrap gap-1">
                                                {response.preferences.filter(p => p).length > 0 ? (
                                                  response.preferences.filter(p => p).map((pref, i) => (
                                                    <span key={i} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                                      i === 0 ? 'bg-green-100 text-green-800' :
                                                      i === 1 ? 'bg-blue-100 text-blue-800' :
                                                      i === 2 ? 'bg-purple-100 text-purple-800' :
                                                      'bg-gray-100 text-gray-800'
                                                    }`}>
                                                      {i + 1}. {pref}
                                                    </span>
                                                  ))
                                                ) : (
                                                  <span className="text-gray-400 italic text-sm">No preferences selected</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                              {new Date(response.submitted_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                              })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {/* Save/Cancel buttons for pending deletions */}
                                {pendingDeletions[session.id] && pendingDeletions[session.id].length > 0 && (
                                  <div className="px-6 py-4 bg-amber-50 border-t border-amber-200">
                                    <div className="flex items-center justify-between">
                                      <div className="text-sm text-amber-800">
                                        <strong>{pendingDeletions[session.id].length}</strong> response{pendingDeletions[session.id].length !== 1 ? 's' : ''} marked for deletion
                                      </div>
                                      <div className="flex space-x-3">
                                        <button
                                          onClick={() => handleCancelDeletions(session.id)}
                                          disabled={savingChanges}
                                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleSaveChanges(session.id)}
                                          disabled={savingChanges}
                                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                                        >
                                          {savingChanges ? (
                                            <>
                                              <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                              Saving...
                                            </>
                                          ) : (
                                            'Save Changes'
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 