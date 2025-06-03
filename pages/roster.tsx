import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import DaySelector from '../components/DaySelector';
import { supabase } from '../lib/supabaseClient';
import 'react-calendar/dist/Calendar.css';
import Calendar from 'react-calendar';
// ---------- helpers ----------
import { differenceInCalendarDays, addDays, isWithinInterval } from "date-fns";

/** Inclusive list of every calendar day between two dates. */
const getDatesBetween = (start: Date, end: Date) => {
  const days = differenceInCalendarDays(end, start) + 1;
  return [...Array(days)].map((_, i) => addDays(start, i).toDateString());
};
// ---------- helpers ----------

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | '';

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
  schedulable_days: DayOfWeek[];
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
  const [schedulableDays, setSchedulableDays] = useState<DayOfWeek[]>(DAYS_OF_WEEK);

  const inRangeSet = useMemo(() => {
    if (!startDate || !endDate) { // startDate and endDate are "YYYY-MM-DD"
      return new Set<string>();
    }

    const parseYYYYMMDDToLocalDate = (dateString: string): Date | null => {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed for Date constructor
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          // Create date at noon local time to avoid DST issues around midnight
          return new Date(year, month, day, 12, 0, 0, 0);
        }
      }
      return null;
    };

    const localStartDate = parseYYYYMMDDToLocalDate(startDate);
    const localEndDate = parseYYYYMMDDToLocalDate(endDate);

    if (!localStartDate || !localEndDate || localEndDate < localStartDate) {
      // console.warn("Invalid date range for inRangeSet:", startDate, endDate, localStartDate, localEndDate);
      return new Set<string>();
    }
    
    return new Set(getDatesBetween(localStartDate, localEndDate));
  }, [startDate, endDate]);

  // Holds the schedule returned by the API
  const [schedule, setSchedule] = useState<
    { date: string; employee: string; weekday: number }[] | null
  >(null);

  // Shows a spinner or error message later
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fast lookup: "YYYY-MM-DD" → employee name
  const scheduleMap = useMemo(() => {
    if (!schedule) return {};
    return schedule.reduce<Record<string, string>>((acc, item) => {
      acc[item.date] = item.employee;
      return acc;
    }, {});
  }, [schedule]);

  interface ScheduleSummaryRow {
    employeeName: string;
    prefCounts: (number | string)[]; // Array of 7 for preferences 1-7. String is "not selected"
    noPreferenceCount: number;
    totalDaysAssigned: number;
  }

  const scheduleSummaryData = useMemo((): ScheduleSummaryRow[] => {
    if (!schedule || !employees || employees.length === 0) {
      return [];
    }
    console.log("Recalculating scheduleSummaryData with schedule:", JSON.parse(JSON.stringify(schedule))); // Add this for debugging
    console.log("Using employees for summary:", JSON.parse(JSON.stringify(employees))); // Add this for debugging

    return employees.map(employee => {
      const summaryRow: ScheduleSummaryRow = {
        employeeName: employee.name || "Unnamed Employee",
        prefCounts: [],
        noPreferenceCount: 0,
        totalDaysAssigned: 0,
      };

      // Initialize prefCounts
      for (let i = 0; i < 7; i++) {
        if (employee.preferences[i] && employee.preferences[i] !== '') {
          summaryRow.prefCounts.push(0);
        } else {
          summaryRow.prefCounts.push("not selected");
        }
      }

      const employeeAssignments = schedule.filter(s => s.employee === employee.name);
      summaryRow.totalDaysAssigned = employeeAssignments.length;

      for (const assignment of employeeAssignments) {
        const assignedWeekdayIndex = assignment.weekday; // 0=Sunday, ..., 6=Saturday
        const assignedWeekdayName = DAYS_OF_WEEK[assignedWeekdayIndex];

        // --- Verification Step ---
        const dateParts = assignment.date.split('-').map(Number);
        // Create date as local, noon, to avoid timezone shifts affecting getDay()
        const localDateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12);
        const actualDayFromDate = localDateObj.getDay(); // 0 for Sunday, 1 for Monday, etc.

        if (actualDayFromDate !== assignedWeekdayIndex) {
          console.warn(
            `MISMATCH for ${employee.name} on ${assignment.date}: ` +
            `Date string implies day ${actualDayFromDate} (${DAYS_OF_WEEK[actualDayFromDate]}), ` +
            `but schedule item's 'weekday' field is ${assignedWeekdayIndex} (${assignedWeekdayName}).`
          );
        }
        // --- End Verification Step ---
        
        let isPreferred = false;
        for (let k = 0; k < employee.preferences.length; k++) {
          if (employee.preferences[k] === assignedWeekdayName) {
            if (typeof summaryRow.prefCounts[k] === 'number') {
              (summaryRow.prefCounts[k] as number)++;
            }
            isPreferred = true;
            break; 
          }
        }

        if (!isPreferred) {
          summaryRow.noPreferenceCount++;
        }
      }
      return summaryRow;
    });
  }, [schedule, employees]);

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
        user_id: userId,
        schedulable_days: schedulableDays
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
      .update({ 
        employees: employees,
        schedulable_days: schedulableDays
      })
      .eq('id', currentRosterId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating roster:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to update roster.' });
      return;
    }

    setSavedRosters(savedRosters.map(roster => 
      roster.id === currentRosterId 
        ? { ...roster, employees: employees, schedulable_days: schedulableDays }
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
      setSchedulableDays(selectedRoster.schedulable_days || DAYS_OF_WEEK);
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
        preferences: Array(schedulableDays.length).fill(''),
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
        // Only allow setting preferences up to the number of schedulable days
        if (index < schedulableDays.length) {
          newPreferences[index] = value;
        }
        return { ...emp, preferences: newPreferences };
      }
      return emp;
    }));
  };

  const getAvailableDays = (currentPreferences: DayOfWeek[], currentIndex: number): DayOfWeek[] => {
    // Start with only the days that are generally schedulable
    let available = [...schedulableDays];

    // Filter out days already selected in other preference slots for this employee
    const selectedByThisEmployee = currentPreferences.filter((day, index) => index !== currentIndex && day !== '');
    available = available.filter(day => !selectedByThisEmployee.includes(day));
    
    return available;
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
    setSchedulableDays(DAYS_OF_WEEK);
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
    
    // Check if schedulable days have changed
    const currentRoster = savedRosters.find(r => r.id === currentRosterId);
    if (currentRoster) {
      const originalSchedulableDays = currentRoster.schedulable_days || DAYS_OF_WEEK;
      if (schedulableDays.length !== originalSchedulableDays.length) return true;
      if (schedulableDays.some(day => !originalSchedulableDays.includes(day))) return true;
      if (originalSchedulableDays.some(day => !schedulableDays.includes(day))) return true;
    }
    
    return employees.some((emp, index) => {
      const originalEmp = originalEmployees[index];
      if (!originalEmp) return true;
      if (emp.name !== originalEmp.name) return true;
      return emp.preferences.some((pref, i) => pref !== originalEmp.preferences[i]);
    });
  };

  const handleGenerateSchedule = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!startDate || !endDate) {
        setError("Please select both a start and end date.");
        setLoading(false);
        return;
      }
      
      if (schedulableDays.length === 0) {
        setError("No schedulable days selected. Please select at least one day of the week to schedule.");
        setLoading(false);
        return;
      }

      // 1) Build the `employees` array (employeeData) - cost logic remains important for preferences on allowed days
      const rankWeights = [0, 20, 40];
      const employeeData = employees.map((emp: Employee) => {
        const cost = Array(7).fill(1000);
        emp.preferences.forEach((preferredDay: DayOfWeek, rankIndex: number) => {
          if (preferredDay && schedulableDays.includes(preferredDay)) {
            const dayIndex = DAYS_OF_WEEK.indexOf(preferredDay);
            if (dayIndex !== -1) {
              cost[dayIndex] = rankWeights[rankIndex] ?? 100;
            }
          }
        });
        for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
          const currentDayName = DAYS_OF_WEEK[i];
          if (schedulableDays.includes(currentDayName)) {
            if (cost[i] === 1000) { 
              cost[i] = 60; 
            }
          } else {
            cost[i] = 1000; 
          }
        }
        return { name: emp.name, weekday_cost: cost };
      });

      // 2) Build the `dates` array, NOW FILTERED by schedulableDays
      const buildDateRange = (startStr: string, endStr: string) => {
        const out: { date: string; weekday: number }[] = [];
        const startDateParts = startStr.split('-').map(Number);
        const cur = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2], 0, 0, 0, 0);
        const endDateParts = endStr.split('-').map(Number);
        const loopEndDate = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2] + 1, 0, 0, 0, 0);
        
        while (cur < loopEndDate) {
          const currentDayName = DAYS_OF_WEEK[cur.getDay()]; // Get the string name of the day
          if (schedulableDays.includes(currentDayName)) { // <<< FILTERING HAPPENS HERE
            out.push({
              date: cur.toISOString().slice(0, 10),
              weekday: cur.getDay(),
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
        return out;
      };
      const dates = buildDateRange(startDate, endDate); // 'dates' now only contains truly schedulable dates
      
      // Validate that there are actually dates to schedule after filtering
      if (dates.length === 0) {
        // This error message now covers cases where the range was valid but no days within it matched schedulableDays
        setError("No schedulable days fall within the selected date range based on your day-of-week selection, or the date range itself is invalid. Please adjust your selections.");
        setLoading(false);
        return;
      }

      console.log("Employee data for solver:", JSON.stringify(employeeData));
      console.log("FILTERED Dates for solver:", JSON.stringify(dates)); // Log the filtered dates

      // 3) POST to our API with the FILTERED dates list
      const res = await fetch('/api/generateSchedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: employeeData, dates }), // 'dates' is now pre-filtered
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }

      const json = (await res.json()) as { date: string; employee: string; weekday: number }[];
      setSchedule(json); // The schedule returned should now only contain assignments for the filtered dates
      console.log('Received schedule (should be for filtered dates only):', json);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Effect to clear invalid preferences when schedulableDays changes
  useEffect(() => {
    setEmployees(prevEmployees => 
      prevEmployees.map(employee => {
        const newPreferences = employee.preferences.map(pref => 
          schedulableDays.includes(pref) ? pref : '' // Clear preference if not in schedulableDays
        ) as DayOfWeek[]; // Cast to DayOfWeek[]
        // Ensure preferences array still has 7 elements, padding with '' if necessary
        // This might not be strictly needed if preferences are always full length
        // but good for safety if an employee could have < 7 preferences initially.
        const fullPreferences = [...newPreferences];
        while (fullPreferences.length < 7) {
          fullPreferences.push('');
        }
        return { ...employee, preferences: fullPreferences.slice(0, 7) }; // Ensure it's exactly 7
      })
    );
  }, [schedulableDays]);

  // Helper function to get day name (e.g., 'Sunday') from a Date object
  const getDayName = (date: Date): DayOfWeek => {
    return DAYS_OF_WEEK[date.getDay()];
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
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

              {/* NEW: Day Selector Component */}
              <div className="mb-8">
                <DaySelector selectedDays={schedulableDays} onChange={setSchedulableDays} />
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
                        {Array.from({ length: schedulableDays.length }, (_, i) => (
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
                          {Array.from({ length: schedulableDays.length }, (_, index) => (
                            <td key={index}>
                              <select
                                value={employee.preferences[index] || ''}
                                onChange={e => handlePreferenceChange(employee.id, index, e.target.value as DayOfWeek)}
                                className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md ${
                                  employee.preferences[index] 
                                    ? 'bg-green-50 border-green-300 text-green-700' 
                                    : 'bg-gray-50 border-gray-300 text-gray-700'
                                }`}
                              >
                                <option value="">Clear Preference</option>
                                {[employee.preferences[index], ...getAvailableDays(employee.preferences, index)]
                                    .filter((value, i, self) => (schedulableDays.includes(value) || value === '') && self.indexOf(value) === i)
                                    .map(day => (
                                        <option key={day || `no-pref-${index}-${employee.id}`} value={day}>{day || 'Not Selected'}</option>
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

              {/* MOVED: Date Range Inputs and Calendar Display - Now after roster sections */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Date Inputs */}
                <div className="md:col-span-1 space-y-4 p-4 bg-white shadow rounded-lg">
                  <h2 className="text-lg font-semibold text-gray-700">Set Date Range</h2>
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Start Date:</label>
                    <input
                      type="date"
                      id="startDate"
                      value={startDate}
                      onChange={handleStartDateChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">End Date:</label>
                    <input
                      type="date"
                      id="endDate"
                      value={endDate}
                      onChange={handleEndDateChange}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  {dateError && <p className="text-sm text-red-500">{dateError}</p>}
                </div>

                {/* Calendar Display */}
                <div className="md:col-span-2 p-4 bg-white shadow rounded-lg flex justify-center">
                  <Calendar
                    onChange={(value: Value) => {
                      if (Array.isArray(value)) {
                        // Range selection, not actively used for single date picking in this setup
                      } else if (value) {
                        // Single date selection if needed, or just use for navigation
                        // setActiveStartDate(value);
                      }
                    }}
                    activeStartDate={activeStartDate}
                    onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setActiveStartDate(activeStartDate)}
                    value={null} 
                    selectRange={false}
                    locale="en-US" // Set locale to make week start on Sunday
                    tileContent={({ date, view }) => {
                      if (view === 'month') {
                        const day = date.getDate(); // The day number, e.g., 1, 5, 25

                        const dateStr = date.toISOString().slice(0, 10);
                        const employeeName = scheduleMap[dateStr];
                        const dayName = getDayName(date);
                        const isSchedulableDayOfWeek = schedulableDays.includes(dayName);
                        const isInRange = inRangeSet.has(date.toDateString());

                        let employeeBadgeContent = null;
                        if (isInRange && isSchedulableDayOfWeek && employeeName) {
                          employeeBadgeContent = (
                            <p 
                              className="text-xs text-white p-0.5 mt-0.5 rounded font-semibold leading-tight truncate"
                              style={{ fontSize: '0.65rem' }}
                              title={employeeName}
                            >
                              {employeeName}
                            </p>
                          );
                        }

                        // The component for the day number. Its color will be determined by CSS on the parent tile.
                        const dayNumberComponent = <span style={{ fontWeight: 500 }}>{day}</span>;

                        return (
                          <div className="flex flex-col items-center justify-start h-full pt-1">
                            {dayNumberComponent}
                            {employeeBadgeContent}
                          </div>
                        );
                      }
                      return null;
                    }}
                    tileDisabled={({ date, view }) => {
                        if (view === 'month') {
                            const dateString = date.toDateString();
                            const dayName = getDayName(date);
                            // Disable if not in the selected date range OR if its day of the week is not schedulable
                            if (!inRangeSet.has(dateString) || !schedulableDays.includes(dayName)) {
                                return true;
                            }
                            return false; // Otherwise, it's enabled
                        }
                        return false;
                    }}
                    tileClassName={({ date, view }) => {
                      if (view !== 'month') return undefined;

                      const dateString = date.toDateString();
                      const dayName = getDayName(date);

                      // Apply 'range-day' style only if the date is in the selected range AND its day of the week is schedulable
                      if (inRangeSet.has(dateString) && schedulableDays.includes(dayName)) {
                        return 'range-day';
                      }

                      // For all other cases (e.g., in range but not a schedulable DayOfWeek, or out of range),
                      // return undefined. These tiles will get base styling from .react-calendar__tile
                      // and default react-calendar styles for neighboring/disabled tiles.
                      return undefined;
                    }}
                    className="react-calendar-override"
                  />
                </div>
              </div>

              {/* Generate Schedule Button and Display */}
              <button
                className="mt-4 rounded bg-primary-blue px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
                onClick={handleGenerateSchedule}
                disabled={loading}
              >
                {loading ? 'Generating…' : 'Generate Schedule'}
              </button>
              {error && <p className="mt-2 text-red-600">{error}</p>}

              {schedule && schedule.length > 0 && scheduleSummaryData.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-semibold mb-4">Schedule Summary</h2>
                  <div className="overflow-x-auto bg-white shadow rounded-lg">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                          {[1, 2, 3, 4, 5, 6, 7].map(n => (
                            <th key={n} className="px-3 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              {n}{getOrdinalSuffix(n)}
                            </th>
                          ))}
                          <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">No Pref</th>
                          <th className="px-3 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Days</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {scheduleSummaryData.map((row, index) => (
                          <tr key={row.employeeName + index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className="px-4 py-3 border-b border-gray-200 whitespace-nowrap text-sm font-medium text-gray-900">{row.employeeName}</td>
                            {row.prefCounts.map((count, i) => (
                              <td key={i} className={`px-3 py-3 border-b border-gray-200 whitespace-nowrap text-sm text-center ${count === "not selected" ? "text-gray-400" : "text-gray-800"}`}>
                                {count}
                              </td>
                            ))}
                            <td className="px-3 py-3 border-b border-gray-200 whitespace-nowrap text-sm text-gray-800 text-center">{row.noPreferenceCount}</td>
                            <td className="px-3 py-3 border-b border-gray-200 whitespace-nowrap text-sm text-gray-800 text-center">{row.totalDaysAssigned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}


