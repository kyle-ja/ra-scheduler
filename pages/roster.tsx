import { useState, useEffect, useMemo } from 'react';
import DaySelector from '../components/DaySelector';
import { supabase } from '../lib/supabaseClient';
import 'react-calendar/dist/Calendar.css';
import Calendar from 'react-calendar';
import * as XLSX from 'xlsx';
// ---------- helpers ----------
import { differenceInCalendarDays, addDays, isWithinInterval } from "date-fns";

// Add custom styles for excluded dates
const excludedDateStyles = `
  .excluded-date {
    background-color: #f3f4f6 !important;
    color: #9ca3af !important;
    cursor: not-allowed !important;
  }
  .excluded-date:hover {
    background-color: #f3f4f6 !important;
  }
  .excluded-date.react-calendar__tile--active {
    background-color: #f3f4f6 !important;
    color: #9ca3af !important;
  }
`;

// Inject the styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = excludedDateStyles;
  document.head.appendChild(styleSheet);
}

/** Inclusive list of every calendar day between two dates. */
const getDatesBetween = (start: Date, end: Date) => {
  const days = differenceInCalendarDays(end, start) + 1;
  return [...Array(days)].map((_, i) => addDays(start, i).toDateString());
};

// Helper: Parse YYYY-MM-DD as local date (no time zone shift)
function parseYYYYMMDDToLocalDate(dateString: string): Date | null {
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day, 12, 0, 0, 0); // noon local time
    }
  }
  return null;
}

// Helper function to get all excluded dates as a Set of date strings
const getExcludedDatesSet = (exclusions: ExclusionEntry[]): Set<string> => {
  const excludedDatesSet = new Set<string>();
  exclusions.forEach(entry => {
    if (!entry.startDate) return;
    const startDate = parseYYYYMMDDToLocalDate(entry.startDate);
    if (!startDate) return;
    if (entry.type === 'single') {
      excludedDatesSet.add(startDate.toDateString());
    } else if (entry.type === 'range' && entry.endDate) {
      const endDate = parseYYYYMMDDToLocalDate(entry.endDate);
      if (!endDate) return;
      const datesInRange = getDatesBetween(startDate, endDate);
      datesInRange.forEach(date => excludedDatesSet.add(date));
    }
  });
  return excludedDatesSet;
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

interface ExclusionEntry {
  id: string;
  type: 'single' | 'range';
  startDate: string;
  endDate?: string;
  title?: string;
}

interface DateSetting {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  excluded_dates: ExclusionEntry[];
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Add this helper for day abbreviations
const DAY_ABBREVIATIONS: { [key in DayOfWeek]: string } = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  '': '',
};

export default function RosterPage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [excludedDates, setExcludedDates] = useState<ExclusionEntry[]>([]);
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
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState<number>(2); // Default to 2
  const [dateSettings, setDateSettings] = useState<DateSetting[]>([]);
  const [newSettingName, setNewSettingName] = useState('');
  const [selectedSettingId, setSelectedSettingId] = useState<string>('');

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

  // Calculate total number of schedulable days
  const totalSchedulableDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    
    const startDateObj = parseYYYYMMDDToLocalDate(startDate);
    const endDateObj = parseYYYYMMDDToLocalDate(endDate);
    if (!startDateObj || !endDateObj) return 0;

    const excludedDatesSet = getExcludedDatesSet(excludedDates);
    let count = 0;
    const cur = new Date(startDateObj.getTime());
    const loopEndDate = new Date(endDateObj.getTime());
    loopEndDate.setDate(loopEndDate.getDate() + 1);

    while (cur < loopEndDate) {
      const currentDayName = DAYS_OF_WEEK[cur.getDay()];
      const dateString = cur.toDateString();
      if (schedulableDays.includes(currentDayName) && !excludedDatesSet.has(dateString)) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [startDate, endDate, schedulableDays, excludedDates]);

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

  // Add this after other useEffect hooks
  useEffect(() => {
    if (userId) {
      fetchDateSettings();
    }
  }, [userId]);

  const fetchDateSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('date_settings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDateSettings(data || []);
    } catch (error) {
      console.error('Error fetching date settings:', error);
    }
  };

  const handleSaveDateSetting = async () => {
    if (!newSettingName.trim()) {
      setFeedbackMessage({ type: 'error', message: 'Please enter a name for the date setting' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('date_settings')
        .insert([
          {
            name: newSettingName,
            start_date: startDate,
            end_date: endDate,
            excluded_dates: excludedDates,
            user_id: userId
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setDateSettings([data, ...dateSettings]);
      setNewSettingName('');
      setFeedbackMessage({ type: 'success', message: 'Date setting saved successfully' });
    } catch (error) {
      console.error('Error saving date setting:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to save date setting' });
    }
  };

  const handleUpdateDateSetting = async (settingId: string) => {
    try {
      const { error } = await supabase
        .from('date_settings')
        .update({
          start_date: startDate,
          end_date: endDate,
          excluded_dates: excludedDates
        })
        .eq('id', settingId);

      if (error) throw error;

      setDateSettings(dateSettings.map(s => 
        s.id === settingId 
          ? { ...s, start_date: startDate, end_date: endDate, excluded_dates: excludedDates }
          : s
      ));
      setFeedbackMessage({ type: 'success', message: 'Date setting updated successfully' });
    } catch (error) {
      console.error('Error updating date setting:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to update date setting' });
    }
  };

  const handleClearSettings = () => {
    setStartDate('');
    setEndDate('');
    setExcludedDates([]);
    setSelectedSettingId('');
    setDateError('');
  };

  const handleLoadDateSetting = async (settingId: string) => {
    const setting = dateSettings.find(s => s.id === settingId);
    if (setting) {
      setStartDate(setting.start_date);
      setEndDate(setting.end_date);
      setExcludedDates(setting.excluded_dates);
      setSelectedSettingId(settingId);
    }
  };

  // Add function to check if a setting has been modified
  const hasSettingChanged = (settingId: string): boolean => {
    const setting = dateSettings.find(s => s.id === settingId);
    if (!setting) return false;

    // Check if dates have changed
    if (setting.start_date !== startDate || setting.end_date !== endDate) return true;

    // Check if excluded dates have changed
    if (setting.excluded_dates.length !== excludedDates.length) return true;

    // Deep compare excluded dates
    return setting.excluded_dates.some((oldExclusion, index) => {
      const newExclusion = excludedDates[index];
      if (!newExclusion) return true;
      return (
        oldExclusion.type !== newExclusion.type ||
        oldExclusion.startDate !== newExclusion.startDate ||
        oldExclusion.endDate !== newExclusion.endDate ||
        oldExclusion.title !== newExclusion.title
      );
    });
  };

  const handleDeleteDateSetting = async (settingId: string) => {
    try {
      const { error } = await supabase
        .from('date_settings')
        .delete()
        .eq('id', settingId);

      if (error) throw error;

      setDateSettings(dateSettings.filter(s => s.id !== settingId));
      setFeedbackMessage({ type: 'success', message: 'Date setting deleted successfully' });
    } catch (error) {
      console.error('Error deleting date setting:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to delete date setting' });
    }
  };

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
      setSchedule(null);
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
    // Clear schedule if it exists
    if (schedule) {
      setSchedule(null);
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    validateDates(startDate, newEndDate);
    // Clear schedule if it exists
    if (schedule) {
      setSchedule(null);
    }
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

  // Add validation function for date range exclusions
  const validateDateRangeExclusion = (startDate: string, endDate: string | undefined, type: 'single' | 'range'): string | null => {
    if (!startDate) return null;
    
    if (type === 'range') {
      if (!endDate) {
        return 'End date is required for date range exclusions';
      }
      
      const start = parseYYYYMMDDToLocalDate(startDate);
      const end = parseYYYYMMDDToLocalDate(endDate);
      
      if (!start || !end) return 'Invalid date format';
      if (end < start) return 'End date must be after start date';
    }
    
    return null;
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
    setSchedule(null);
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

      // Check for incomplete date range exclusions
      const incompleteRangeExclusions = excludedDates.some(entry => 
        entry.type === 'range' && (!entry.startDate || !entry.endDate)
      );
      if (incompleteRangeExclusions) {
        setError("Please complete all date range exclusions by providing both start and end dates.");
        setLoading(false);
        return;
      }

      // Get set of excluded dates
      const excludedDatesSet = getExcludedDatesSet(excludedDates);

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

      // 2) Build the `dates` array, NOW FILTERED by schedulableDays AND excluded dates
      const buildDateRange = (startStr: string, endStr: string) => {
        const out: { date: string; weekday: number }[] = [];
        const startDateObj = parseYYYYMMDDToLocalDate(startStr);
        const endDateObj = parseYYYYMMDDToLocalDate(endStr);
        if (!startDateObj || !endDateObj) return out;
        const cur = new Date(startDateObj.getTime());
        const loopEndDate = new Date(endDateObj.getTime());
        loopEndDate.setDate(loopEndDate.getDate() + 1);
        while (cur < loopEndDate) {
          const currentDayName = DAYS_OF_WEEK[cur.getDay()];
          const dateString = cur.toDateString();
          if (schedulableDays.includes(currentDayName) && !excludedDatesSet.has(dateString)) {
            out.push({
              date: cur.toISOString().slice(0, 10),
              weekday: cur.getDay(),
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
        return out;
      };
      const dates = buildDateRange(startDate, endDate);
      
      // Validate that there are actually dates to schedule after filtering
      if (dates.length === 0) {
        setError("No schedulable days fall within the selected date range based on your day-of-week selection and excluded dates, or the date range itself is invalid. Please adjust your selections.");
        setLoading(false);
        return;
      }

      console.log("Employee data for solver:", JSON.stringify(employeeData));
      console.log("FILTERED Dates for solver:", JSON.stringify(dates));

      // 3) POST to our API with the FILTERED dates list
      const res = await fetch('/api/generateSchedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: employeeData, dates, max_consecutive_days: maxConsecutiveDays }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to generate schedule: ${errorText}`);
      }

      const json = (await res.json()) as { date: string; employee: string; weekday: number }[];
      
      // Validate that we received a valid schedule
      if (!json || !Array.isArray(json) || json.length === 0) {
        throw new Error("No valid schedule could be generated with the current settings. Please adjust your inputs and try again.");
      }

      setSchedule(json);
      console.log('Received schedule:', json);
    } catch (err: any) {
      console.error(err);
      // Show a user-friendly error message if the error contains backend/traceback details
      let userMessage = 'A schedule could not be generated with the current settings. This is usually because there are not enough available days, too many restrictions, or not enough employees to cover the schedule. Please adjust your date range, excluded dates, or employee preferences and try again.';
      if (err && typeof err.message === 'string') {
        // If the error message is a simple string without traceback, show it
        if (!err.message.includes('Traceback') && !err.message.includes('RuntimeError')) {
          userMessage = err.message;
        }
      }
      setError(userMessage);
      setSchedule(null); // Clear any existing schedule on error
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

  // Helper: Compare two dates by year, month, day only
  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  // Helper: Is date in [start, end] inclusive, by day only
  function isDateInRangeInclusive(date: Date, start: Date, end: Date): boolean {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  }

  const handleExportToExcel = () => {
    if (!schedule || schedule.length === 0 || !employees || employees.length === 0) {
      alert("No schedule or employee data available to export.");
      return;
    }

    // 1. Main Schedule Data
    const scheduleSheetData = schedule.map(item => ({
      'Date': item.date,
      'Day of Week': DAYS_OF_WEEK[item.weekday],
      'Employee Name': item.employee,
    }));

    // 2. Roster/Preferences Table Data
    // Assuming preferences are ranked, up to 7 choices
    const rosterSheetData = employees.map(emp => {
      const row: { [key: string]: string } = { 'Employee Name': emp.name };
      emp.preferences.forEach((pref, index) => {
        row[`Preference ${index + 1}`] = pref || 'N/A';
      });
      return row;
    });

    // 3. Summary Table Data
    // Headers for summary table - adjust if needed based on scheduleSummaryData structure
    const summarySheetData = scheduleSummaryData.map(row => ({
      'Employee Name': row.employeeName,
      'Pref 1 Count': row.prefCounts[0],
      'Pref 2 Count': row.prefCounts[1],
      'Pref 3 Count': row.prefCounts[2],
      'Pref 4 Count': row.prefCounts[3],
      'Pref 5 Count': row.prefCounts[4],
      'Pref 6 Count': row.prefCounts[5],
      'Pref 7 Count': row.prefCounts[6],
      'No Preference Count': row.noPreferenceCount,
      'Total Days Assigned': row.totalDaysAssigned,
    }));


    const wb = XLSX.utils.book_new();
    const scheduleWS = XLSX.utils.json_to_sheet(scheduleSheetData);
    const rosterWS = XLSX.utils.json_to_sheet(rosterSheetData);
    const summaryWS = XLSX.utils.json_to_sheet(summarySheetData);

    XLSX.utils.book_append_sheet(wb, scheduleWS, "Schedule");
    XLSX.utils.book_append_sheet(wb, rosterWS, "Roster Preferences");
    XLSX.utils.book_append_sheet(wb, summaryWS, "Summary");

    // 4. Individual Employee Sheets
    if (employees && schedule) {
      employees.forEach(employee => {
        if (employee.name) { // Ensure employee has a name for the sheet
          const employeeAssignments = schedule.filter(item => item.employee === employee.name);
          if (employeeAssignments.length > 0) {
            const employeeSheetData = employeeAssignments.map(item => ({
              'Date': item.date,
              'Day of Week': DAYS_OF_WEEK[item.weekday],
            }));
            const employeeWS = XLSX.utils.json_to_sheet(employeeSheetData);
            
            // Sanitize employee name for sheet name (max 31 chars, remove invalid chars)
            let safeSheetName = employee.name.replace(/[\[\]\*\?\/\\:]/g, "").substring(0, 31);
            // Ensure unique sheet names if sanitization causes collisions (simple counter for now)
            let originalSafeSheetName = safeSheetName;
            let counter = 1;
            while (wb.SheetNames.includes(safeSheetName)) {
              safeSheetName = `${originalSafeSheetName.substring(0, 31 - String(counter).length - 1 )}_${counter}`;
              counter++;
            }

            XLSX.utils.book_append_sheet(wb, employeeWS, safeSheetName);
          }
        }
      });
    }

    // Generate a filename based on the date range or a default
    const fileName = (startDate && endDate) 
      ? `Schedule_Export_${startDate}_to_${endDate}.xlsx` 
      : "Schedule_Export.xlsx";
    XLSX.writeFile(wb, fileName);
  };

  // Add effect to clear schedule when excluded dates change
  useEffect(() => {
    if (schedule) {
      setSchedule(null);
    }
  }, [excludedDates]);

  // Add effect to clear schedule when schedulable days change
  useEffect(() => {
    if (schedule) {
      setSchedule(null);
    }
  }, [schedulableDays]);

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          {/* Roster Management Section */}
          <div className="bg-white rounded-2xl shadow p-8 border border-gray-200">
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
                {employees.some(emp => emp.name && emp.name.trim() !== '') && (
                  <button
                    onClick={handleNewRoster}
                    className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                  >
                    New Roster
                  </button>
                )}
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
                          {i + 1}{getOrdinalSuffix(i + 1)} Pref
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
                              <option value="">Clear</option>
                              {[employee.preferences[index], ...getAvailableDays(employee.preferences, index)]
                                  .filter((value, i, self) => (schedulableDays.includes(value) || value === '') && self.indexOf(value) === i)
                                  .map(day => (
                                      <option key={day || `no-pref-${index}-${employee.id}`} value={day}>{DAY_ABBREVIATIONS[day] || day || 'Not Selected'}</option>
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
          </div>
          {/* Schedule Creation Section */}
          <div className="bg-white rounded-2xl shadow p-8 border border-gray-200">
            <h2 className="text-2xl font-bold mb-6">Schedule Creation</h2>
            {/* Three horizontally aligned cards: Save Date Settings, Set Date Range, Exclude Dates */}
            <div className="flex flex-col md:flex-row gap-6 mb-6">
              {/* Save Date Settings */}
              <div className="flex-1 min-w-[260px] bg-white shadow rounded-lg p-4 mb-4 md:mb-0">
                <h2 className="text-lg font-semibold text-gray-700">Save Date Settings</h2>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    id="settingName"
                    value={newSettingName}
                    onChange={(e) => setNewSettingName(e.target.value)}
                    className="block border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm flex-1"
                    placeholder="Name this setup"
                    style={{ minWidth: 0 }}
                  />
                  <button
                    onClick={handleSaveDateSetting}
                    className="bg-psu-blue text-white px-2 py-2 rounded font-semibold flex items-center justify-center"
                    style={{ minWidth: 0, height: '2.25rem', width: '2.25rem' }}
                    title="Save settings"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 10.5L8.5 14L15 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                {dateSettings.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-md font-semibold text-gray-700 mb-2">Saved Settings</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {dateSettings.map((setting) => (
                        <div key={setting.id} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id={`setting-${setting.id}`}
                              name="dateSetting"
                              checked={selectedSettingId === setting.id}
                              onChange={() => handleLoadDateSetting(setting.id)}
                              className="h-4 w-4 text-psu-blue"
                            />
                            <label htmlFor={`setting-${setting.id}`} className="text-sm text-gray-700">
                              {setting.name}
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            {selectedSettingId === setting.id && hasSettingChanged(setting.id) && (
                              <button
                                onClick={() => handleUpdateDateSetting(setting.id)}
                                className="bg-psu-blue text-white px-3 py-1 rounded font-semibold text-sm"
                                title="Update setting"
                              >
                                Update
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteDateSetting(setting.id)}
                              className="bg-psu-blue text-white px-2 py-1 rounded font-semibold flex items-center justify-center"
                              title="Delete setting"
                              style={{ minWidth: 0, height: '2rem', width: '2rem' }}
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6.5 7.5V14.5M10 7.5V14.5M13.5 7.5V14.5M3 5.5H17M8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V5.5H7.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5Z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={handleClearSettings}
                        className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded font-semibold hover:bg-gray-300"
                      >
                        Clear Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* Set Date Range */}
              <div className="flex-1 min-w-[260px] bg-white shadow rounded-lg p-4 mb-4 md:mb-0">
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
                    min={startDate || undefined}
                    onChange={handleEndDateChange}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                {/* Max Consecutive Days Slider START */}
                <div className="mt-4">
                  <label htmlFor="maxConsecutiveDaysSlider" className="block text-sm font-medium text-gray-700">
                    Most Consecutive Days Allowed: <span className="font-semibold text-psu-blue">{maxConsecutiveDays}</span>
                  </label>
                  <input
                    type="range"
                    id="maxConsecutiveDaysSlider"
                    min="1"
                    max="7" // Or a different reasonable upper limit, e.g., 14
                    value={maxConsecutiveDays}
                    onChange={(e) => setMaxConsecutiveDays(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-1 accent-psu-blue"
                  />
                </div>
                {/* Max Consecutive Days Slider END */}
                {dateError && <p className="text-sm text-red-500">{dateError}</p>}
              </div>
              {/* Exclude Dates */}
              <div className="flex-1 min-w-[260px] bg-white shadow rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-700">Exclude Dates</h2>
                <div className="space-y-4">
                  <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                    {excludedDates.map((entry) => (
                      <div key={entry.id} className="p-3 border border-gray-200 rounded-lg space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id={`single-${entry.id}`}
                              name={`type-${entry.id}`}
                              checked={entry.type === 'single'}
                              onChange={() => {
                                setExcludedDates(excludedDates.map(e => 
                                  e.id === entry.id ? { ...e, type: 'single', endDate: undefined } : e
                                ));
                                // Clear schedule if it exists
                                if (schedule) {
                                  setSchedule(null);
                                }
                              }}
                              className="h-4 w-4 text-psu-blue"
                            />
                            <label htmlFor={`single-${entry.id}`} className="text-sm text-gray-700">Single Day</label>
                            <input
                              type="radio"
                              id={`range-${entry.id}`}
                              name={`type-${entry.id}`}
                              checked={entry.type === 'range'}
                              onChange={() => {
                                setExcludedDates(excludedDates.map(e => 
                                  e.id === entry.id ? { ...e, type: 'range' } : e
                                ));
                                // Clear schedule if it exists
                                if (schedule) {
                                  setSchedule(null);
                                }
                              }}
                              className="h-4 w-4 text-psu-blue ml-4"
                            />
                            <label htmlFor={`range-${entry.id}`} className="text-sm text-gray-700">Date Range</label>
                          </div>
                          <button
                            onClick={() => {
                              setExcludedDates(excludedDates.filter(e => e.id !== entry.id));
                              // Clear schedule if it exists
                              if (schedule) {
                                setSchedule(null);
                              }
                            }}
                            className="bg-psu-blue text-white px-2 py-1 rounded font-semibold"
                            title="Remove exclusion"
                          >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6.5 7.5V14.5M10 7.5V14.5M13.5 7.5V14.5M3 5.5H17M8.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V5.5H7.5V4.5C7.5 3.94772 7.94772 3.5 8.5 3.5Z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Start Date:</label>
                            <input
                              type="date"
                              value={entry.startDate}
                              onChange={(e) => {
                                setExcludedDates(excludedDates.map(ex => 
                                  ex.id === entry.id ? { ...ex, startDate: e.target.value } : ex
                                ));
                                // Clear schedule if it exists
                                if (schedule) {
                                  setSchedule(null);
                                }
                              }}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                          </div>
                          {entry.type === 'range' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700">End Date:</label>
                              <input
                                type="date"
                                value={entry.endDate || ''}
                                min={entry.startDate || undefined}
                                onChange={(e) => {
                                  setExcludedDates(excludedDates.map(ex => 
                                    ex.id === entry.id ? { ...ex, endDate: e.target.value } : ex
                                  ));
                                  // Clear schedule if it exists
                                  if (schedule) {
                                    setSchedule(null);
                                  }
                                }}
                                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              />
                              {validateDateRangeExclusion(entry.startDate, entry.endDate, entry.type) && (
                                <p className="text-sm text-red-500 mt-1">
                                  {validateDateRangeExclusion(entry.startDate, entry.endDate, entry.type)}
                                </p>
                              )}
                            </div>
                          )}
                          {/* Exclusion Title Input */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Title (optional):</label>
                            <input
                              type="text"
                              value={entry.title || ''}
                              onChange={e => {
                                setExcludedDates(excludedDates.map(ex =>
                                  ex.id === entry.id ? { ...ex, title: e.target.value } : ex
                                ));
                                // Clear schedule if it exists
                                if (schedule) {
                                  setSchedule(null);
                                }
                              }}
                              placeholder="e.g. Christmas Break"
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setExcludedDates([
                        ...excludedDates,
                        {
                          id: Date.now().toString(),
                          type: 'single',
                          startDate: '',
                        }
                      ]);
                      // Clear schedule if it exists
                      if (schedule) {
                        setSchedule(null);
                      }
                    }}
                    className="w-full bg-psu-blue text-white px-4 py-2 rounded font-semibold hover:bg-blue-600"
                  >
                    + Add Exclusion
                  </button>
                </div>
              </div>
            </div>
            {/* Generate/Export buttons row */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-row gap-4">
                <button
                  className="rounded bg-primary-blue px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
                  onClick={handleGenerateSchedule}
                  disabled={loading}
                >
                  {loading ? 'Generating…' : `Generate Schedule for ${totalSchedulableDays} Days`}
                </button>
                {schedule && schedule.length > 0 && (
                  <button
                    className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                    onClick={handleExportToExcel}
                    disabled={!schedule || schedule.length === 0}
                  >
                    Export to Excel
                  </button>
                )}
              </div>
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Calendar full width card */}
            <div className="bg-white shadow rounded-lg p-4 w-full max-w-full overflow-x-auto mb-8">
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
                  locale="en-US"
                tileContent={({ date, view }) => {
                  if (view === 'month') {
                      const day = date.getDate();
                    const dateStr = date.toISOString().slice(0, 10);
                    const employeeName = scheduleMap[dateStr];
                    const dayName = getDayName(date);
                    const isSchedulableDayOfWeek = schedulableDays.includes(dayName);
                    const isInRange = inRangeSet.has(date.toDateString());
                      const excludedDatesSet = getExcludedDatesSet(excludedDates);
                      const isExcluded = excludedDatesSet.has(date.toDateString());

                      // Find exclusion entry for this date (for title)
                      let exclusionTitle: string | undefined = undefined;
                      for (const entry of excludedDates) {
                        if (!entry.startDate) continue;
                        const start = parseYYYYMMDDToLocalDate(entry.startDate);
                        if (!start) continue;
                        if (entry.type === 'single') {
                          if (isSameDay(start, date)) exclusionTitle = entry.title;
                        } else if (entry.type === 'range' && entry.endDate) {
                          const end = parseYYYYMMDDToLocalDate(entry.endDate);
                          if (!end) continue;
                          if (isDateInRangeInclusive(date, start, end)) exclusionTitle = entry.title;
                        }
                      }

                    let employeeBadgeContent = null;
                      if (isExcluded && exclusionTitle) {
                        employeeBadgeContent = (
                          <p
                            className="text-xs text-gray-500 p-0.5 mt-0.5 rounded font-semibold leading-tight truncate"
                            style={{ fontSize: '0.65rem' }}
                            title={exclusionTitle}
                          >
                            {exclusionTitle}
                          </p>
                        );
                      } else if (isInRange && isSchedulableDayOfWeek && employeeName && !isExcluded) {
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

                      const dayNumberComponent = (
                        <span 
                          style={{ fontWeight: 500 }}
                          title={isExcluded ? (exclusionTitle || "Excluded Date") : undefined}
                        >
                          {day}
                        </span>
                      );

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
                    const excludedDatesSet = getExcludedDatesSet(excludedDates);

                    // If the date is excluded, return a special class
                    if (excludedDatesSet.has(dateString)) {
                      return 'excluded-date';
                    }

                  // Apply 'range-day' style only if the date is in the selected range AND its day of the week is schedulable
                  if (inRangeSet.has(dateString) && schedulableDays.includes(dayName)) {
                    return 'range-day';
                  }

                  return undefined;
                }}
                className="react-calendar-override"
              />
            </div>
            {/* Schedule Summary full width card */}
            {schedule && schedule.length > 0 && scheduleSummaryData.length > 0 && (
              <div className="bg-white shadow rounded-lg p-4 w-full max-w-full overflow-x-auto">
                <h2 className="text-xl font-semibold mb-4">Schedule Summary</h2>
                <table className="min-w-full w-full max-w-full">
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
            )}
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


