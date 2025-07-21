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
  
  // Add state for showing/hiding the create form
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Change these to track expanded responses per session
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionResponses, setSessionResponses] = useState<{ [sessionId: string]: EmployeeResponse[] }>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  
  // Track pending deletions
  const [pendingDeletions, setPendingDeletions] = useState<{ [sessionId: string]: string[] }>({});
  const [savingChanges, setSavingChanges] = useState<boolean>(false);
  
  // Track rename values for each session
  const [renameValues, setRenameValues] = useState<{ [sessionId: string]: string }>({});
  
  // Track which sessions are being renamed
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

  // Add state for QR code modal
  const [qrCodeModal, setQrCodeModal] = useState<{
    isOpen: boolean;
    qrCodeDataURL: string | null;
    sessionName: string;
  }>({
    isOpen: false,
    qrCodeDataURL: null,
    sessionName: ''
  });

  // Add state for edit preferences modal
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    response: EmployeeResponse | null;
    sessionId: string;
    availableDays: DayOfWeek[];
    editedPreferences: DayOfWeek[];
    editedName: string;
    editedEmail: string;
    saving: boolean;
  }>({
    isOpen: false,
    response: null,
    sessionId: '',
    availableDays: [],
    editedPreferences: [],
    editedName: '',
    editedEmail: '',
    saving: false
  });

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
      setSelectedDays(DAYS_OF_WEEK);
      setShowCreateForm(false);
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

      // Show the QR code in the modal
      setQrCodeModal({
        isOpen: true,
        qrCodeDataURL,
        sessionName
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

      // Clear the rename state
      setRenamingSessionId(null);
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

  // Add function to open edit modal
  const openEditModal = (response: EmployeeResponse, sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    setEditModal({
      isOpen: true,
      response,
      sessionId,
      availableDays: session.schedulable_days,
      editedPreferences: [...response.preferences],
      editedName: response.employee_name,
      editedEmail: response.employee_email || '',
      saving: false
    });
  };

  // Add function to close edit modal
  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      response: null,
      sessionId: '',
      availableDays: [],
      editedPreferences: [],
      editedName: '',
      editedEmail: '',
      saving: false
    });
  };

  // Add function to update preference in edit modal
  const updateEditedPreference = (index: number, day: DayOfWeek) => {
    const newPreferences = [...editModal.editedPreferences];
    newPreferences[index] = day;
    setEditModal(prev => ({
      ...prev,
      editedPreferences: newPreferences
    }));
  };

  // Add functions to update name and email in edit modal
  const updateEditedName = (name: string) => {
    setEditModal(prev => ({
      ...prev,
      editedName: name
    }));
  };

  const updateEditedEmail = (email: string) => {
    setEditModal(prev => ({
      ...prev,
      editedEmail: email
    }));
  };

  // Add function to get available days for editing (excluding already selected days)
  const getAvailableDaysForEdit = (currentIndex: number) => {
    const selectedDays = editModal.editedPreferences.filter((day, index) => 
      index !== currentIndex && day !== ''
    );
    
    return editModal.availableDays.filter(day => 
      !selectedDays.includes(day)
    );
  };

  // Add function to save edited preferences
  const saveEditedPreferences = async () => {
    if (!editModal.response || !userId) return;

    // Validate required fields
    if (!editModal.editedName.trim()) {
      setFeedbackMessage({ type: 'error', message: 'Employee name is required' });
      return;
    }

    setEditModal(prev => ({ ...prev, saving: true }));

    try {
      // First, verify session ownership by checking if the session belongs to the current user
      const { data: sessionData, error: sessionError } = await supabase
        .from('preference_sessions')
        .select('manager_id')
        .eq('id', editModal.sessionId)
        .single();

      if (sessionError) {
        console.error('Error verifying session ownership:', sessionError);
        throw new Error('Failed to verify session ownership');
      }

      if (sessionData.manager_id !== userId) {
        throw new Error('Unauthorized: You can only edit responses from your own sessions');
      }

      // First, let's verify we can read the response
      console.log('Attempting to update preferences:', {
        responseId: editModal.response.id,
        sessionId: editModal.sessionId,
        newPreferences: editModal.editedPreferences,
        userId: userId
      });

      // Test if we can read the response first
      const { data: readData, error: readError } = await supabase
        .from('employee_responses')
        .select('*')
        .eq('id', editModal.response.id)
        .single();

      console.log('Read test result:', { readData, readError });

      if (readError) {
        console.error('Cannot read the response, likely RLS issue:', readError);
        throw new Error('Cannot access this response. Database permissions may be preventing access.');
      }

      // Now try the update
      const { data, error, count } = await supabase
        .from('employee_responses')
        .update({ 
          preferences: editModal.editedPreferences,
          employee_name: editModal.editedName.trim(),
          employee_email: editModal.editedEmail.trim() || null
        })
        .eq('id', editModal.response.id)
        .select();

      console.log('Supabase update result:', { data, error, count });

      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('No rows were updated. This might indicate a permission issue or the row doesn\'t exist.');
        throw new Error('No rows were updated. Please check if you have permission to edit this response.');
      }

      console.log('Preferences updated successfully in database. Updated data:', data);

      // Update local state
      setSessionResponses(prev => ({
        ...prev,
        [editModal.sessionId]: prev[editModal.sessionId].map(response =>
          response.id === editModal.response!.id
            ? { 
                ...response, 
                preferences: editModal.editedPreferences,
                employee_name: editModal.editedName.trim(),
                employee_email: editModal.editedEmail.trim() || null
              }
            : response
        )
      }));

      setFeedbackMessage({ type: 'success', message: `Response updated for ${editModal.editedName}!` });
      setTimeout(() => setFeedbackMessage(null), 3000);
      closeEditModal();
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      setFeedbackMessage({ type: 'error', message: error.message || 'Failed to update preferences' });
    } finally {
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  const downloadCSV = async (sessionId: string, sessionName: string) => {
    try {
      // Get responses for this session if not already loaded
      let responses = sessionResponses[sessionId];
      
      if (!responses) {
        const { data, error } = await supabase
          .from('employee_responses')
          .select('*')
          .eq('session_id', sessionId)
          .order('submitted_at', { ascending: false });

        if (error) throw error;
        responses = data || [];
      }

      if (responses.length === 0) {
        setFeedbackMessage({ type: 'error', message: 'No responses to download' });
        return;
      }

      // Create CSV content
      const headers = ['Employee Name', 'Email', 'First Preference', 'Second Preference', 'Third Preference', 'Fourth Preference', 'Fifth Preference', 'Sixth Preference', 'Seventh Preference', 'Submitted At'];
      
      const csvRows = [
        headers.join(','),
        ...responses.map(response => {
          const preferences = [...response.preferences];
          // Pad preferences array to 7 items (max days in a week)
          while (preferences.length < 7) {
            preferences.push('');
          }
          
          return [
            `"${response.employee_name.replace(/"/g, '""')}"`,
            `"${response.employee_email || ''}"`,
            ...preferences.slice(0, 7).map(pref => `"${(pref || '').replace(/"/g, '""')}"`),
            `"${new Date(response.submitted_at).toLocaleString()}"`
          ].join(',');
        })
      ];

      const csvContent = csvRows.join('\n');
      
      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${sessionName.replace(/[^a-z0-9]/gi, '_')}_preferences.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setFeedbackMessage({ type: 'success', message: 'CSV file downloaded successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error downloading CSV:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to download CSV file' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          
          {/* Page Header */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Employee Preference Collection</h1>
            <p className="text-gray-600 text-sm">Create forms to collect employee schedule preferences</p>
          </div>

          {/* Existing Sessions */}
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Your Collection Sessions</h2>
                  {sessions.length > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      {sessions.length} session{sessions.length !== 1 ? 's' : ''} created
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-psu-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-psu-blue transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create New Session
                </button>
              </div>
            </div>

            {/* Collapsible Create Form */}
            {showCreateForm && (
              <div className="border-b border-gray-200 rounded-b-xl">
                <div className="px-6 py-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">Create New Collection Session</h3>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewSessionName('');
                        setExpiryDate('');
                        setSelectedDays(DAYS_OF_WEEK);
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Close"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Session Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Session Name
                      </label>
                      <input
                        type="text"
                        value={newSessionName}
                        onChange={e => setNewSessionName(e.target.value)}
                        placeholder="e.g., March 2024 Schedule Preferences"
                        className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                      />
                    </div>
                    
                    {/* Expiry Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expiry Date (Optional)
                      </label>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={e => setExpiryDate(e.target.value)}
                        className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col">
                      <label className="block text-sm font-medium text-gray-700 mb-2 opacity-0">
                        Actions
                      </label>
                      <div className="flex space-x-3 h-10">
                        <button
                          onClick={handleCreateSession}
                          disabled={loading}
                          className="flex-1 h-full bg-psu-blue text-white px-4 rounded font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center"
                        >
                          {loading ? 'Creating...' : 'Create'}
                        </button>
                        <button
                          onClick={() => {
                            setShowCreateForm(false);
                            setNewSessionName('');
                            setExpiryDate('');
                            setSelectedDays(DAYS_OF_WEEK);
                          }}
                          className="h-full px-4 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition-colors flex items-center justify-center"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Day Selector */}
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Available Days
                    </label>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {DAYS_OF_WEEK.map(day => (
                          <label key={day} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedDays.includes(day)}
                              onChange={() => {
                                const newSelectedDays = selectedDays.includes(day)
                                  ? selectedDays.filter(d => d !== day)
                                  : [...selectedDays, day];
                                const orderedSelectedDays = DAYS_OF_WEEK.filter(d => newSelectedDays.includes(d));
                                setSelectedDays(orderedSelectedDays);
                              }}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 font-medium">{day.substring(0, 3)}</span>
                          </label>
                        ))}
                      </div>
                      {selectedDays.length === 0 && (
                        <p className="text-sm text-red-500 mt-3">
                          Please select at least one day for the schedule.
                        </p>
                      )}
                    </div>
                  </div>

                  {feedbackMessage && (
                    <div className={`mt-4 p-3 rounded ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {feedbackMessage.message}
                    </div>
                  )}
                </div>
              </div>
            )}
            
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
                              <div className="flex items-center gap-2 mb-2">
                                {renamingSessionId === session.id ? (
                                  <>
                                    <input
                                      type="text"
                                      value={renameValues[session.id] !== undefined ? renameValues[session.id] : session.name}
                                      onChange={e => setRenameValues(prev => ({ ...prev, [session.id]: e.target.value }))}
                                      className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-psu-blue focus:border-transparent"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleRenameSession(session.id);
                                        } else if (e.key === 'Escape') {
                                          setRenamingSessionId(null);
                                          setRenameValues(prev => {
                                            const updated = { ...prev };
                                            delete updated[session.id];
                                            return updated;
                                          });
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleRenameSession(session.id)}
                                      className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                                      title="Save"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRenamingSessionId(null);
                                        setRenameValues(prev => {
                                          const updated = { ...prev };
                                          delete updated[session.id];
                                          return updated;
                                        });
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                      title="Cancel"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-sm font-semibold text-gray-900">{session.name}</div>
                                    <button
                                      onClick={() => {
                                        setRenamingSessionId(session.id);
                                        setRenameValues(prev => ({ ...prev, [session.id]: session.name }));
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                      title="Rename session"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                Created {new Date(session.created_at).toLocaleDateString()}
                                {session.expires_at && (
                                  <span> • Expires {new Date(session.expires_at).toLocaleDateString()}</span>
                                )}
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
                            <div className="flex flex-col space-y-2">
                              {/* Row 1: Primary actions - larger and more prominent */}
                              <div className="flex justify-center space-x-2">
                                {(session.response_count || 0) > 0 && (
                                  <button
                                    onClick={() => toggleResponses(session.id)}
                                    disabled={loadingResponses === session.id}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                                    title={expandedSessionId === session.id ? 'Hide responses' : 'View responses'}
                                  >
                                    {loadingResponses === session.id ? (
                                      <>
                                        <svg className="animate-spin w-4 h-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Loading...
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedSessionId === session.id ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                        </svg>
                                        {expandedSessionId === session.id ? 'Hide Results' : 'View Results'}
                                      </>
                                    )}
                                  </button>
                                )}
                                
                                <button
                                  onClick={() => toggleSessionStatus(session.id, session.is_active)}
                                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white transition-colors ${
                                    session.is_active 
                                      ? 'bg-red-600 hover:!bg-red-700 focus:ring-red-500' 
                                      : 'bg-green-600 hover:!bg-green-700 focus:ring-green-500'
                                  } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                                >

                                  {session.is_active ? 'Stop Collecting' : 'Start Collecting'}
                                </button>
                              </div>
                              
                              {/* Row 2: Secondary actions - smaller sharing/export functions */}
                              <div className="flex justify-center space-x-1">
                                <button
                                  onClick={() => copyToClipboard(generateShareableLink(session.id))}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-psu-blue hover:text-white hover:border-psu-blue focus:outline-none focus:ring-1 focus:ring-psu-blue transition-colors"
                                  title="Copy shareable link"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Copy Link
                                </button>
                                
                                <button
                                  onClick={() => downloadQRCode(session.id, session.name)}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-psu-blue hover:text-white hover:border-psu-blue focus:outline-none focus:ring-1 focus:ring-psu-blue transition-colors"
                                  title="Download QR code"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  QR Code
                                </button>
                                
                                <button
                                  onClick={() => downloadCSV(session.id, session.name)}
                                  disabled={(session.response_count || 0) === 0}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-psu-blue hover:text-white hover:border-psu-blue focus:outline-none focus:ring-1 focus:ring-psu-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-700 disabled:hover:border-gray-300"
                                  title="Download preferences as spreadsheet file"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Export
                                </button>
                              </div>
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
                                              <div className="flex flex-col space-y-2">
                                                <button
                                                  onClick={() => openEditModal(response, session.id)}
                                                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors shadow-sm"
                                                  title="Edit preferences"
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                  </svg>
                                                </button>
                                                <button
                                                  onClick={() => handleMarkForDeletion(response.id, session.id, response.employee_name)}
                                                  className={`p-2 rounded-md transition-colors shadow-sm ${
                                                    pendingDeletions[session.id]?.includes(response.id)
                                                      ? 'bg-red-600 text-white' 
                                                      : 'bg-red-600 hover:bg-red-700 text-white'
                                                  }`}
                                                  title={pendingDeletions[session.id]?.includes(response.id) ? "Marked for deletion" : "Mark for deletion"}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                  </svg>
                                                </button>
                                              </div>
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
                                                      {i + 1}. {pref.substring(0, 3)}
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

        {/* Edit Preferences Modal */}
        {editModal.isOpen && editModal.response && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Edit Response for {editModal.response.employee_name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Modify the employee information and schedule preferences
                    </p>
                  </div>
                  <button
                    onClick={closeEditModal}
                    className="text-gray-400 hover:text-gray-500"
                    disabled={editModal.saving}
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-6">
                {/* Available Days Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-800 mb-1">Available Days</p>
                      <p className="text-sm text-blue-700">
                        Available days for this session: <span className="font-medium">{editModal.availableDays.join(', ')}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Employee Information */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Employee Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editModal.editedName}
                        onChange={(e) => updateEditedName(e.target.value)}
                        disabled={editModal.saving}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter employee name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={editModal.editedEmail}
                        onChange={(e) => updateEditedEmail(e.target.value)}
                        disabled={editModal.saving}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Tip */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-yellow-800 mb-1">Editing Response</p>
                      <p className="text-sm text-yellow-700">
                        You can modify the employee's name, email, and preferences. Changes will be saved to the database.
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Preferences Form */}
                <div className="space-y-4">
                  {editModal.editedPreferences.map((preference, index) => {
                    const availableDays = getAvailableDaysForEdit(index);
                    return (
                      <div key={index} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium text-white ${
                            index === 0 ? 'bg-green-600' :
                            index === 1 ? 'bg-blue-600' :
                            index === 2 ? 'bg-purple-600' :
                            index === 3 ? 'bg-indigo-600' :
                            index === 4 ? 'bg-pink-600' :
                            index === 5 ? 'bg-red-600' :
                            'bg-gray-600'
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {index === 0 ? 'Most Preferred Day' :
                             index === 1 ? '2nd Choice' :
                             index === 2 ? '3rd Choice' :
                             index === 3 ? '4th Choice' :
                             index === 4 ? '5th Choice' :
                             index === 5 ? '6th Choice' :
                             'Least Preferred Day'}
                          </label>
                          <select
                            value={preference}
                            onChange={(e) => updateEditedPreference(index, e.target.value as DayOfWeek)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            disabled={editModal.saving}
                          >
                            <option value="">Select a day</option>
                            {/* Show current selection even if it would normally be filtered out */}
                            {preference && !availableDays.includes(preference) && (
                              <option key={preference} value={preference}>{preference}</option>
                            )}
                            {/* Show available days */}
                            {availableDays.map(day => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg">
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={closeEditModal}
                    disabled={editModal.saving}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditedPreferences}
                    disabled={editModal.saving}
                    className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {editModal.saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
          </div>
        )}

        {/* QR Code Modal */}
        {qrCodeModal.isOpen && qrCodeModal.qrCodeDataURL && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  QR Code for {qrCodeModal.sessionName}
                </h3>
                <button
                  onClick={() => setQrCodeModal({ isOpen: false, qrCodeDataURL: null, sessionName: '' })}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex justify-center mb-4">
                <img
                  src={qrCodeModal.qrCodeDataURL}
                  alt="QR Code"
                  className="max-w-full h-auto"
                />
              </div>
              <div className="text-center text-sm text-gray-500">
                Scan this QR code to access the preference form
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 