import { useState, useEffect } from 'react';
import Header from '../components/Header';
import { supabase } from '../lib/supabaseClient';
import 'react-calendar/dist/Calendar.css';
import Calendar from 'react-calendar';

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | '';

interface Employee {
  id: string;
  name: string;
  preferences: DayOfWeek[];
}

interface SavedRoster {
  id: string;
  name: string;
  employees: Employee[];
  user_id: string;
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function RosterPage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [dateError, setDateError] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [savedRosters, setSavedRosters] = useState<SavedRoster[]>([]);
  const [newRosterName, setNewRosterName] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [currentRosterName, setCurrentRosterName] = useState<string>('Unsaved Roster');
  const [currentRosterId, setCurrentRosterId] = useState<string>('');
  const [originalEmployees, setOriginalEmployees] = useState<Employee[]>([]);

  // Load user ID and saved rosters on component mount
  useEffect(() => {
    const loadUserAndRosters = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        const { data: rosters, error } = await supabase
          .from('rosters')
          .select('*')
          .eq('user_id', session.user.id);

        if (error) {
          console.error('Error loading rosters:', error);
        } else {
          setSavedRosters(rosters || []);
        }
      }
    };

    loadUserAndRosters();
  }, []);

  const handleSaveRoster = async () => {
    if (!newRosterName.trim() || !userId) {
      setFeedbackMessage({ type: 'error', message: 'Please enter a roster name' });
      return;
    }

    try {
      const newRoster: Omit<SavedRoster, 'id'> = {
        name: newRosterName.trim(),
        employees: employees,
        user_id: userId
      };

      console.log('Attempting to save roster:', newRoster);

      const { data, error } = await supabase
        .from('rosters')
        .insert([newRoster])
        .select()
        .single();

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('Roster saved successfully:', data);
      setSavedRosters([...savedRosters, data]);
      setNewRosterName('');
      setCurrentRosterName(data.name);
      setCurrentRosterId(data.id);
      setOriginalEmployees(data.employees);
      setFeedbackMessage({ type: 'success', message: 'Roster saved successfully!' });
      
      // Clear success message after 3 seconds
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving roster:', error);
      setFeedbackMessage({ 
        type: 'error', 
        message: `Failed to save roster: ${error.message || 'Unknown error'}` 
      });
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    if (!rosterId || !userId) return;

    try {
      const { error } = await supabase
        .from('rosters')
        .delete()
        .eq('id', rosterId)
        .eq('user_id', userId);

      if (error) throw error;

      setSavedRosters(savedRosters.filter(roster => roster.id !== rosterId));
      if (selectedRosterId === rosterId) {
        setSelectedRosterId('');
        setEmployees([]);
      }
      setFeedbackMessage({ type: 'success', message: 'Roster deleted successfully!' });
      
      // Clear success message after 3 seconds
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting roster:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to delete roster. Please try again.' });
    }
  };

  const handleUpdateRoster = async () => {
    if (!currentRosterId || !userId) return;

    const { error } = await supabase
      .from('rosters')
      .update({ employees: employees })
      .eq('id', currentRosterId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating roster:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to update roster.' });
      return;
    }

    setSavedRosters(savedRosters.map(roster => 
      roster.id === currentRosterId 
        ? { ...roster, employees: employees }
        : roster
    ));
    setOriginalEmployees(employees);
    setFeedbackMessage({ type: 'success', message: 'Roster updated successfully!' });
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleLoadRoster = (rosterId: string) => {
    const selectedRoster = savedRosters.find(roster => roster.id === rosterId);
    if (selectedRoster) {
      setEmployees(selectedRoster.employees);
      setOriginalEmployees(selectedRoster.employees);
      setSelectedRosterId('');
      setCurrentRosterName(selectedRoster.name);
      setCurrentRosterId(selectedRoster.id);
    }
  };

  const validateDates = (start: string, end: string) => {
    if (!start || !end) {
      setDateError('');
      return true;
    }

    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    const [endYear, endMonth, endDay] = end.split('-').map(Number);
    
    const startDateObj = new Date(startYear, startMonth - 1, startDay);
    const endDateObj = new Date(endYear, endMonth - 1, endDay);

    if (endDateObj < startDateObj) {
      setDateError('End date must be after start date.');
      return false;
    } else {
      setDateError('');
      return true;
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    setStartDate(newStartDate);
    validateDates(newStartDate, endDate);
    if (newStartDate) {
      setActiveStartDate(new Date(newStartDate));
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    validateDates(startDate, newEndDate);
  };

  // Helper function to check if a date is in the selected range
  function isDateInRange(date: Date) {
    if (!startDate || !endDate || dateError) return false;

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);

    // Remove time for comparison
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    return current >= startOnly && current <= endOnly;
  }

  const handleAddEmployee = () => {
    setEmployees([
      ...employees,
      {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: '',
        preferences: Array(7).fill(''),
      },
    ]);
  };

  const handleRemoveEmployee = (id: string) => {
    setEmployees(employees.filter(emp => emp.id !== id));
  };

  const handlePreferenceChange = (employeeId: string, index: number, value: DayOfWeek) => {
    setEmployees(employees.map(emp => {
      if (emp.id === employeeId) {
        const newPreferences = [...emp.preferences];
        newPreferences[index] = value;
        return { ...emp, preferences: newPreferences };
      }
      return emp;
    }));
  };

  const getAvailableDays = (currentPreferences: DayOfWeek[], currentIndex: number): DayOfWeek[] => {
    const selectedDays = currentPreferences.filter((day, index) => index !== currentIndex && day !== '');
    return DAYS_OF_WEEK.filter(day => !selectedDays.includes(day));
  };

  const handleDeleteCurrentRoster = async () => {
    if (!currentRosterId || !userId) return;
    try {
      const { error } = await supabase
        .from('rosters')
        .delete()
        .eq('id', currentRosterId)
        .eq('user_id', userId);
      if (error) throw error;
      setSavedRosters(savedRosters.filter(roster => roster.id !== currentRosterId));
      setCurrentRosterId('');
      setCurrentRosterName('Unsaved Roster');
      setEmployees([]);
      setOriginalEmployees([]);
      setFeedbackMessage({ type: 'success', message: 'Roster deleted successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      setFeedbackMessage({ type: 'error', message: 'Failed to delete roster.' });
    }
  };

  const handleNewRoster = () => {
    setCurrentRosterName('Unsaved Roster');
    setCurrentRosterId('');
    setEmployees([{
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      name: '',
      preferences: Array(7).fill(''),
    }]);
    setOriginalEmployees([]);
    setSelectedRosterId('');
    setNewRosterName('');
  };

  // Add useEffect to initialize empty row when component mounts
  useEffect(() => {
    if (!currentRosterId && employees.length === 0) {
      handleNewRoster();
    }
  }, []);

  // Helper function to check if employees have changed
  const hasEmployeesChanged = () => {
    if (!currentRosterId) return false;
    if (employees.length !== originalEmployees.length) return true;
    
    return employees.some((emp, index) => {
      const originalEmp = originalEmployees[index];
      if (!originalEmp) return true;
      if (emp.name !== originalEmp.name) return true;
      return emp.preferences.some((pref, i) => pref !== originalEmp.preferences[i]);
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 p-4">
        <div className="max-w-7xl mx-auto">
          <div style={{
            background: '#fff',
            borderRadius: '1.25rem',
            boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
            padding: '2.5rem 2rem',
          }}>
            <div className="main-content">
              <h1 className="text-2xl font-bold mb-6">Roster Management</h1>

              
              {/* Roster Management Menu */}
              <div className="mb-8 bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1">
                      <select
                        id="loadRoster"
                        value={selectedRosterId}
                        onChange={(e) => handleLoadRoster(e.target.value)}
                        className="w-full"
                      >
                        <option value="">Load Saved Roster</option>
                        {savedRosters.map(roster => (
                          <option key={roster.id} value={roster.id}>
                            {roster.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          id="rosterName"
                          value={newRosterName}
                          onChange={(e) => setNewRosterName(e.target.value)}
                          placeholder="Save Current Roster As..."
                          className="flex-1"
                        />
                        <button
                          onClick={handleSaveRoster}
                          disabled={!newRosterName.trim()}
                          className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {feedbackMessage && (
                  <div className={`${feedbackMessage.type === 'success' ? 'feedback-success' : 'feedback-error'} mt-4`}>
                    {feedbackMessage.message}
                  </div>
                )}
              </div>

              {/* Employee Roster Section */}
              <div className="mb-8">
                <div className="flex items-center mb-1">
                  <h2 className="text-lg font-semibold m-0 mr-16">{currentRosterName}</h2>
                </div>
                <div className="flex gap-x-4 mt-1 mb-8">
                  <button
                    onClick={handleNewRoster}
                    className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                  >
                    New Roster
                  </button>
                  {currentRosterId && hasEmployeesChanged() && (
                    <>
                      <button
                        onClick={handleUpdateRoster}
                        className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                      >
                        Update
                      </button>
                      <button
                        onClick={handleDeleteCurrentRoster}
                        className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {currentRosterId && !hasEmployeesChanged() && (
                    <button
                      onClick={handleDeleteCurrentRoster}
                      className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th></th>
                        <th scope="col">
                          Employee Name
                        </th>
                        {Array.from({ length: 7 }, (_, i) => (
                          <th key={i} scope="col">
                            {i + 1}{getOrdinalSuffix(i + 1)} Preference
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(employees || []).map((employee) => (
                        <tr key={employee.id}>
                          <td style={{ width: 40, textAlign: 'center' }}>
                            <button
                              onClick={() => handleRemoveEmployee(employee.id)}
                              className="bg-psu-blue text-white px-2 py-1 rounded font-semibold"
                              title="Delete employee"
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6.5 7.5V14.5M10 7.5V14.5M13.5 7.5V14.5M3 5.5H17M8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V5.5H7.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5Z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={employee.name}
                              onChange={e => setEmployees(employees.map(emp => emp.id === employee.id ? { ...emp, name: e.target.value } : emp))}
                              placeholder="Enter employee name"
                              className="text-sm font-medium"
                            />
                          </td>
                          {employee.preferences.map((pref, index) => (
                            <td key={index}>
                              <select
                                value={pref}
                                onChange={e => setEmployees(employees.map(emp => {
                                  if (emp.id === employee.id) {
                                    const newPrefs = [...emp.preferences];
                                    newPrefs[index] = e.target.value as DayOfWeek;
                                    return { ...emp, preferences: newPrefs };
                                  }
                                  return emp;
                                }))}
                              >
                                <option value="">Clear Preference</option>
                                {[pref, ...getAvailableDays(employee.preferences, index)].filter((value, i, self) => self.indexOf(value) === i).map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={handleAddEmployee}
                      className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                    >
                      + Add Employee
                    </button>
                  </div>
                </div>
              </div>

              {/* Existing Date Range Section */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-2">Select Date Range</h2>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      value={startDate}
                      onChange={handleStartDateChange}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      value={endDate}
                      onChange={handleEndDateChange}
                      disabled={!startDate}
                      min={startDate}
                      title={!startDate ? "Please select a start date first" : ""}
                    />
                  </div>
                </div>
                {dateError && <p className="feedback-error text-sm mt-2">{dateError}</p>}
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-2">Monthly View</h2>
                <Calendar
                  activeStartDate={activeStartDate}
                  onActiveStartDateChange={({ activeStartDate }) => {
                    if (activeStartDate) {
                      setActiveStartDate(activeStartDate);
                    }
                  }}
                  tileClassName={({ date }) => isDateInRange(date) ? 'date-in-range' : null}
                  className="border rounded-lg shadow-sm"
                  calendarType="gregory"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}


