import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | '';

interface PreferenceSession {
  id: string;
  name: string;
  schedulable_days: DayOfWeek[];
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export default function EmployeePreferenceForm() {
  const router = useRouter();
  const { sessionId } = router.query;
  
  const [session, setSession] = useState<PreferenceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Form data
  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [preferences, setPreferences] = useState<DayOfWeek[]>([]);

  // Load session data
  useEffect(() => {
    if (!sessionId || typeof sessionId !== 'string') return;
    
    const fetchSession = async () => {
      try {
        const { data, error } = await supabase
          .from('preference_sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('is_active', true)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            setError('This preference collection form is no longer active or does not exist.');
          } else {
            setError('Failed to load the form. Please check the link and try again.');
          }
          return;
        }

        // Check if expired
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setError('This preference collection form has expired.');
          return;
        }

        setSession(data);
        // Initialize preferences array with empty strings
        setPreferences(new Array(data.schedulable_days.length).fill(''));
      } catch (err) {
        console.error('Error fetching session:', err);
        setError('Failed to load the form. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  const updatePreference = (index: number, day: DayOfWeek) => {
    const newPreferences = [...preferences];
    newPreferences[index] = day;
    setPreferences(newPreferences);
  };

  // Get available days for a specific preference index
  const getAvailableDays = (currentIndex: number) => {
    if (!session) return [];
    
    // Get all currently selected days except for the current index
    const selectedDays = preferences.filter((day, index) => 
      index !== currentIndex && day !== ''
    );
    
    // Return days that haven't been selected yet
    return session.schedulable_days.filter(day => 
      !selectedDays.includes(day)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!employeeName.trim()) {
      setFormError('Please enter your name.');
      return;
    }

    if (!employeeEmail.trim()) {
      setFormError('Please enter your email address.');
      return;
    }

    // Validate that all preferences are filled
    const emptyPreferences = preferences.filter(pref => pref === '').length;
    if (emptyPreferences > 0) {
      setFormError(`Please rank all ${session?.schedulable_days.length} days. You have ${emptyPreferences} unranked day(s).`);
      return;
    }

    if (!session) return;

    setSubmitting(true);
    setFormError(null);

    try {
      // Check if an response already exists for this email and session
      const { data: existingResponse, error: checkError } = await supabase
        .from('employee_responses')
        .select('id')
        .eq('session_id', session.id)
        .eq('employee_email', employeeEmail.trim())
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is what we want
        throw checkError;
      }

      if (existingResponse) {
        setFormError('A response has already been submitted for this email address. Each email can only submit one response per session.');
        return;
      }

      const { error } = await supabase
        .from('employee_responses')
        .insert([{
          session_id: session.id,
          employee_name: employeeName.trim(),
          employee_email: employeeEmail.trim() || null,
          preferences: preferences
        }]);

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting response:', err);
      setFormError('Failed to submit your preferences. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background-white)] flex items-center justify-center p-4" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary-blue)] mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-[var(--primary-black)] mb-2">Loading Form</h2>
          <p className="text-gray-600">Please wait while we load your preference form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background-white)] flex items-center justify-center p-4" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--primary-black)] mb-2">Unable to Load Form</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a 
            href="/" 
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-[var(--primary-blue)] hover:bg-[#1E407C] transition-colors"
          >
            Learn About Preference Scheduler
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--background-white)] flex items-center justify-center p-4" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--primary-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--primary-black)] mb-2">Thank You!</h1>
          <p className="text-gray-600 mb-6">
            Your schedule preferences have been submitted successfully. 
            Your manager will review them when creating the schedule.
          </p>
          <div className="border-t border-gray-200 pt-6">
            <p className="text-sm text-gray-500 mb-3">Interested in managing schedules for your team?</p>
            <a 
              href="/" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-[var(--primary-blue)] hover:bg-[#1E407C] transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Try Preference Scheduler
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[var(--background-white)]" style={{ fontFamily: 'Poppins, Arial, Helvetica, sans-serif' }}>
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-[var(--primary-blue)] rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--primary-black)]">Schedule Preference Form</h1>
              <p className="text-gray-600">Let us know your preferred work days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Form Header */}
            <div className="bg-gradient-to-r from-[var(--primary-blue)] to-[#1E407C] px-8 py-6">
              <h2 className="text-xl font-bold text-white mb-2">{session.name}</h2>
              <div className="flex items-center text-blue-100 text-sm">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0V7a2 2 0 012-2h4a2 2 0 012 2v0M8 7v10a2 2 0 002 2h4a2 2 0 002-2V7" />
                </svg>
                Created {new Date(session.created_at).toLocaleDateString()}
                {session.expires_at && (
                  <>
                    <span className="mx-2">•</span>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Expires {new Date(session.expires_at).toLocaleDateString()}
                  </>
                )}
              </div>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              {/* Personal Information */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--primary-black)] mb-4">Your Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="employeeName" className="block text-sm font-medium text-[var(--primary-black)] mb-2">
                        Full Name <span className="text-[var(--error-red)]">*</span>
                      </label>
                      <input
                        type="text"
                        id="employeeName"
                        value={employeeName}
                        onChange={e => setEmployeeName(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-[var(--primary-blue)] transition-colors"
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div>
                      <label htmlFor="employeeEmail" className="block text-sm font-medium text-[var(--primary-black)] mb-2">
                        Email Address <span className="text-[var(--error-red)]">*</span>
                      </label>
                      <input
                        type="email"
                        id="employeeEmail"
                        value={employeeEmail}
                        onChange={e => setEmployeeEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-[var(--primary-blue)] transition-colors"
                        placeholder="your.email@example.com"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preferences Section */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--primary-black)] mb-2">
                  Schedule Preferences <span className="text-[var(--error-red)]">*</span>
                </h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-[var(--primary-blue)] mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[var(--primary-blue)] mb-1">Instructions</p>
                      <p className="text-sm text-blue-700">
                        Please rank ALL {session.schedulable_days.length} days in order of preference from: <span className="font-medium">{session.schedulable_days.join(', ')}</span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {preferences.map((preference, index) => {
                    const availableDays = getAvailableDays(index);
                    return (
                      <div key={index} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium text-white ${
                            index === 0 ? 'bg-[var(--primary-blue)]' :
                            index === 1 ? 'bg-[#1E407C]' :
                            index === 2 ? 'bg-[#2E508C]' :
                            index === 3 ? 'bg-[#3E609C]' :
                            index === 4 ? 'bg-[#4E70AC] text-white' :
                            index === 5 ? 'bg-[#5E80BC] text-white' :
                            'bg-[#6E90CC] text-white'
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-[var(--primary-black)] mb-2">
                            {index === 0 ? 'Most Preferred Day' :
                             index === 1 ? '2nd Choice' :
                             index === 2 ? '3rd Choice' :
                             index === 3 ? '4th Choice' :
                             index === 4 ? '5th Choice' :
                             index === 5 ? '6th Choice' :
                             'Least Preferred Day'} <span className="text-[var(--error-red)]">*</span>
                          </label>
                          <select
                            value={preference}
                            onChange={(e) => updatePreference(index, e.target.value as DayOfWeek)}
                            className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-[var(--primary-blue)] focus:border-[var(--primary-blue)] ${
                              preference === '' ? 'border-red-300 bg-red-50' : 'border-gray-300'
                            }`}
                            required
                          >
                            <option value="">Select a day (required)</option>
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

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[var(--error-red)] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-[var(--error-red)] font-medium flex-1">{formError}</p>
                    <button
                      onClick={() => setFormError(null)}
                      className="ml-4 inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-[var(--error-red)] bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--error-red)] transition-colors flex-shrink-0"
                      type="button"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-[var(--primary-blue)] to-[#1E407C] text-white py-4 px-6 rounded-lg font-semibold hover:from-[#1E407C] hover:to-[#2E508C] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
                >
                  {submitting ? (
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting Your Preferences...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Submit My Preferences
                    </div>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-3">
                Want to streamline scheduling for your own team?
              </p>
              <a 
                href="/" 
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-[var(--primary-black)] bg-white hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Learn about Preference Scheduler
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 