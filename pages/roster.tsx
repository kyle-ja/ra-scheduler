import React, { useState, useEffect, useMemo, useRef } from 'react';
import DaySelector from '../components/DaySelector';
import { supabase } from '../lib/supabaseClient';
import 'react-calendar/dist/Calendar.css';
import Calendar from 'react-calendar';
import * as XLSX from 'xlsx';
// ---------- helpers ----------
import { differenceInCalendarDays, addDays, isWithinInterval } from "date-fns";
import SmoothProgressBar from '../components/SmoothProgressBar';

// Employee Color Palette - 20 distinct colors for easy visual identification
// You can modify these colors to suit your preferences
const EMPLOYEE_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Mint Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Turquoise
  '#F7DC6F', // Light Yellow
  '#BB8FCE', // Light Purple
  '#85C1E9', // Light Blue
  '#F8C471', // Orange
  '#82E0AA', // Light Green
  '#F1948A', // Light Red
  '#AED6F1', // Sky Blue
  '#D7BDE2', // Lavender
  '#A9DFBF', // Pale Green
  '#F9E79F', // Pale Yellow
  '#F5B7B1', // Pink
  '#A3E4D7', // Aqua
  '#D5A6BD', // Dusty Rose
];

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

// Function to generate dynamic CSS for employee colors
const generateEmployeeColorStyles = () => {
  const cssRules = EMPLOYEE_COLORS.map((color, index) => {
    // Calculate if we need light or dark text based on color brightness
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 128 ? '#000000' : '#FFFFFF';
    
    return `
      .employee-color-${index} {
        background-color: ${color} !important;
        color: ${textColor} !important;
        border-color: ${color} !important;
      }
      .employee-color-${index}:hover {
        background-color: ${color} !important;
        filter: brightness(0.9) !important;
      }
      .employee-color-${index} .employee-name-display {
        color: ${textColor} !important;
      }
      .employee-color-${index} span {
        color: ${textColor} !important;
      }
    `;
  }).join('\n');
  
  return cssRules;
};

// Inject employee color styles
if (typeof document !== 'undefined') {
  const employeeStyleSheet = document.createElement('style');
  employeeStyleSheet.textContent = generateEmployeeColorStyles();
  document.head.appendChild(employeeStyleSheet);
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

// Employee limit configuration - change this value to adjust the limit
const MAX_EMPLOYEES = 20;

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

// Add this new interface for preference sessions in the roster context
interface PreferenceSessionForRoster {
  id: string;
  name: string;
  schedulable_days: DayOfWeek[];
  created_at: string;
  response_count?: number;
}

interface SavedSchedule {
  id: string;
  name: string;
  user_id: string;
  start_date: string;
  end_date: string;
  excluded_dates: ExclusionEntry[];
  employees: Employee[];
  schedulable_days: DayOfWeek[];
  max_consecutive_days: number;
  schedule_data: { date: string; employee: string; weekday: number }[];
  total_schedulable_days: number;
  generation_time_seconds: number | null;
  created_at: string;
  updated_at: string;
}

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
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState<number>(1); // Default to 1
  const [dateSettings, setDateSettings] = useState<DateSetting[]>([]);
  const [newSettingName, setNewSettingName] = useState('');
  const [selectedSettingId, setSelectedSettingId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Add new state for preference sessions
  const [preferenceSessions, setPreferenceSessions] = useState<PreferenceSessionForRoster[]>([]);

  // State for saved schedules
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // State for employee filtering in calendar display
  const [visibleEmployees, setVisibleEmployees] = useState<Set<string>>(new Set());

  // Create employee color mapping - maps employee name to color index
  const employeeColorMap = useMemo(() => {
    const validEmployees = employees.filter(emp => emp.name && emp.name.trim() !== '');
    const colorMap: Record<string, number> = {};
    validEmployees.forEach((employee, index) => {
      if (employee.name) {
        colorMap[employee.name] = index % EMPLOYEE_COLORS.length;
      }
    });
    return colorMap;
  }, [employees]);

  // Function to get employee color class
  const getEmployeeColorClass = (employeeName: string): string => {
    const colorIndex = employeeColorMap[employeeName];
    return colorIndex !== undefined ? `employee-color-${colorIndex}` : 'range-day';
  };

  // Function to toggle employee visibility in calendar
  const toggleEmployeeVisibility = (employeeName: string) => {
    setVisibleEmployees(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeName)) {
        newSet.delete(employeeName);
      } else {
        newSet.add(employeeName);
      }
      return newSet;
    });
  };

  // Function to show all employees
  const showAllEmployees = () => {
    const validEmployeeNames = employees
      .filter(emp => emp.name && emp.name.trim() !== '')
      .map(emp => emp.name);
    setVisibleEmployees(new Set(validEmployeeNames));
  };

  // Function to hide all employees
  const hideAllEmployees = () => {
    setVisibleEmployees(new Set());
  };



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

  // Initialize visible employees when schedule is generated
  useEffect(() => {
    if (schedule && schedule.length > 0) {
      const validEmployeeNames = employees
        .filter(emp => emp.name && emp.name.trim() !== '')
        .map(emp => emp.name);
      setVisibleEmployees(new Set(validEmployeeNames));
    }
  }, [schedule, employees]);

  // Shows a spinner or error message later
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [lastGenerationTime, setLastGenerationTime] = useState<number | null>(null);

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
        
        // Load saved rosters
        const { data: rosters, error: rosterError } = await supabase
          .from('rosters')
          .select('*')
          .eq('user_id', session.user.id);

        if (rosterError) {
          console.error('Error loading rosters:', rosterError);
        } else {
          setSavedRosters(rosters || []);
        }

        // Load preference sessions with response counts
        const { data: sessions, error: sessionError } = await supabase
          .from('preference_sessions')
          .select(`
            id,
            name,
            schedulable_days,
            created_at,
            employee_responses(count)
          `)
          .eq('manager_id', session.user.id)
          .order('created_at', { ascending: false });

        if (sessionError) {
          console.error('Error loading preference sessions:', sessionError);
        } else {
          const sessionsWithCounts = sessions?.map(session => ({
            ...session,
            response_count: session.employee_responses?.[0]?.count || 0
          })) || [];
          setPreferenceSessions(sessionsWithCounts);
        }

        // Load saved schedules
        await fetchSavedSchedules(session.user.id);
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

  const fetchSavedSchedules = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('saved_schedules')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedSchedules(data || []);
    } catch (error) {
      console.error('Error fetching saved schedules:', error);
    }
  };

  const handleLoadSavedSchedule = async (scheduleId: string) => {
    const savedSchedule = savedSchedules.find(s => s.id === scheduleId);
    if (!savedSchedule) return;

    setLoadingSchedule(true);
    
    try {
      // Show immediate feedback
      setFeedbackMessage({ 
        type: 'success', 
        message: `Loading "${savedSchedule.name}"...` 
      });

      // Clear existing schedule and related data first
      setSchedule(null);
      setLastGenerationTime(null);
      
      // Load all data in batches with React's flushSync for immediate updates
      React.startTransition(() => {
        // Load all non-schedule data first
        setStartDate(savedSchedule.start_date);
        setEndDate(savedSchedule.end_date);
        setExcludedDates(savedSchedule.excluded_dates);
        setSchedulableDays(savedSchedule.schedulable_days);
        setMaxConsecutiveDays(savedSchedule.max_consecutive_days);
        setEmployees(savedSchedule.employees);
        setOriginalEmployees(savedSchedule.employees);
        
        // Check if the loaded date settings match any saved date settings
        const matchingSettingId = findMatchingDateSetting(
          savedSchedule.start_date,
          savedSchedule.end_date,
          savedSchedule.excluded_dates
        );
        if (matchingSettingId) {
          setSelectedSettingId(matchingSettingId);
        } else {
          setSelectedSettingId('');
        }
        
        // Clear current roster state
        setCurrentRosterName(`${savedSchedule.name} (Saved Schedule)`);
        setCurrentRosterId('');
        setSelectedRosterId('');
        setSelectedScheduleId('');
        setRenameValue('');
        
        // Set active start date for calendar navigation
        if (savedSchedule.start_date) {
          setActiveStartDate(new Date(savedSchedule.start_date));
        }
      });
      
      // Short delay to ensure React has processed the state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now load the schedule data
      React.startTransition(() => {
        setSchedule(savedSchedule.schedule_data);
        setLastGenerationTime(savedSchedule.generation_time_seconds);
      });

      // Final delay to ensure everything is rendered
      await new Promise(resolve => setTimeout(resolve, 50));
      
      setFeedbackMessage({ 
        type: 'success', 
        message: `Successfully loaded "${savedSchedule.name}"` 
      });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error loading saved schedule:', error);
      setFeedbackMessage({ 
        type: 'error', 
        message: 'Failed to load saved schedule' 
      });
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!newScheduleName.trim() || !userId || !schedule || !startDate || !endDate) {
      setFeedbackMessage({ 
        type: 'error', 
        message: 'Please enter a schedule name and ensure you have a generated schedule to save' 
      });
      return;
    }

    try {
      const newSavedSchedule = {
        name: newScheduleName.trim(),
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        excluded_dates: excludedDates,
        employees: employees,
        schedulable_days: schedulableDays,
        max_consecutive_days: maxConsecutiveDays,
        schedule_data: schedule,
        total_schedulable_days: totalSchedulableDays,
        generation_time_seconds: lastGenerationTime
      };

      console.log('Attempting to save schedule:', newSavedSchedule);

      const { data, error } = await supabase
        .from('saved_schedules')
        .insert([newSavedSchedule])
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

      console.log('Schedule saved successfully:', data);
      setSavedSchedules([data, ...savedSchedules]);
      setNewScheduleName('');
      setFeedbackMessage({ 
        type: 'success', 
        message: `Schedule "${data.name}" saved successfully!` 
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      setFeedbackMessage({ 
        type: 'error', 
        message: `Failed to save schedule: ${error.message || 'Unknown error'}` 
      });
    }
  };

  const handleDeleteSavedSchedule = async (scheduleId: string) => {
    if (!scheduleId || !userId) return;

    // Find the schedule name before deleting
    const scheduleToDelete = savedSchedules.find(schedule => schedule.id === scheduleId);
    const scheduleName = scheduleToDelete?.name || 'Schedule';

    try {
      const { error } = await supabase
        .from('saved_schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('user_id', userId);

      if (error) throw error;

      setSavedSchedules(savedSchedules.filter(schedule => schedule.id !== scheduleId));
      if (selectedScheduleId === scheduleId) {
        setSelectedScheduleId('');
      }
      setFeedbackMessage({ 
        type: 'success', 
        message: `"${scheduleName}" deleted successfully!` 
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting saved schedule:', error);
      setFeedbackMessage({ 
        type: 'error', 
        message: 'Failed to delete saved schedule. Please try again.' 
      });
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

  // Function to compare date settings and find matching saved setting
  const findMatchingDateSetting = (startDate: string, endDate: string, excludedDates: ExclusionEntry[]): string | null => {
    for (const setting of dateSettings) {
      // Compare basic dates
      if (setting.start_date !== startDate || setting.end_date !== endDate) {
        continue;
      }

      // Compare excluded dates - they must match exactly
      if (setting.excluded_dates.length !== excludedDates.length) {
        continue;
      }

      // Deep compare excluded dates
      const excludedDatesMatch = setting.excluded_dates.every((savedExclusion, index) => {
        const loadedExclusion = excludedDates[index];
        if (!loadedExclusion) return false;
        
        return (
          savedExclusion.type === loadedExclusion.type &&
          savedExclusion.startDate === loadedExclusion.startDate &&
          savedExclusion.endDate === loadedExclusion.endDate &&
          savedExclusion.title === loadedExclusion.title
        );
      });

      if (excludedDatesMatch) {
        return setting.id;
      }
    }
    return null;
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

    // Find the roster name before deleting
    const rosterToDelete = savedRosters.find(roster => roster.id === rosterId);
    const rosterName = rosterToDelete?.name || 'Roster';

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
      setFeedbackMessage({ type: 'success', message: `"${rosterName}" deleted successfully!` });
      
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
      clearScheduleAndTime();
      setRenameValue('');
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
      clearScheduleAndTime();
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    validateDates(startDate, newEndDate);
    // Clear schedule if it exists
    if (schedule) {
      clearScheduleAndTime();
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
    if (employees.length >= MAX_EMPLOYEES) {
      setFeedbackMessage({ 
        type: 'error', 
        message: `Employee limit reached. Maximum ${MAX_EMPLOYEES} employees allowed.` 
      });
      return;
    }
    
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
    
    // Store the current roster name before deleting
    const rosterNameToDelete = currentRosterName;
    
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
      setRenameValue('');
      setFeedbackMessage({ type: 'success', message: `"${rosterNameToDelete}" deleted successfully!` });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      setFeedbackMessage({ type: 'error', message: 'Failed to delete roster.' });
    }
  };

  const handleRenameRoster = async () => {
    if (!currentRosterId || !userId || !renameValue.trim()) {
      setFeedbackMessage({ type: 'error', message: 'Please enter a valid roster name' });
      return;
    }

    try {
      const { error } = await supabase
        .from('rosters')
        .update({ name: renameValue.trim() })
        .eq('id', currentRosterId)
        .eq('user_id', userId);

      if (error) throw error;

      // Update local state
      setSavedRosters(savedRosters.map(roster => 
        roster.id === currentRosterId 
          ? { ...roster, name: renameValue.trim() }
          : roster
      ));
      setCurrentRosterName(renameValue.trim());
      setRenameValue('');
      setFeedbackMessage({ type: 'success', message: 'Roster renamed successfully!' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Error renaming roster:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to rename roster.' });
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
    clearScheduleAndTime();
    setRenameValue('');
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

  const clearScheduleAndTime = () => {
    setSchedule(null);
    setLastGenerationTime(null);
  };

  const handleCancelGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      setError('Schedule generation was cancelled.');
      setGenerationProgress(0);
      setElapsedTime(0);
    }
  };

  const handleGenerateSchedule = async () => {
    let timerInterval: NodeJS.Timeout | undefined;
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      setLoading(true);
      setError(null);
      setGenerationProgress(0);
      setElapsedTime(0);
      setLastGenerationTime(null);
      
      // Start the timer
      const startTime = Date.now();
      timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      if (!startDate || !endDate) {
        setError("Please select both a start and end date.");
        setLoading(false);
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }
      
      if (schedulableDays.length === 0) {
        setError("No schedulable days selected. Please select at least one day of the week to schedule.");
        setLoading(false);
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }

      // Check employee limit
      const validEmployees = employees.filter(emp => emp.name && emp.name.trim() !== '');
      if (validEmployees.length > MAX_EMPLOYEES) {
        setError(`Cannot generate schedule with more than ${MAX_EMPLOYEES} employees. Please reduce the number of employees.`);
        setLoading(false);
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }

      if (validEmployees.length === 0) {
        setError("No employees with names found. Please add at least one employee with a name.");
        setLoading(false);
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }

      // Check for incomplete date range exclusions
      const incompleteRangeExclusions = excludedDates.some(entry => 
        entry.type === 'range' && (!entry.startDate || !entry.endDate)
      );
      if (incompleteRangeExclusions) {
        setError("Please complete all date range exclusions by providing both start and end dates.");
        setLoading(false);
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }

      // Get set of excluded dates
      const excludedDatesSet = getExcludedDatesSet(excludedDates);

      // 1) Build the `employees` array (employeeData) - cost logic remains important for preferences on allowed days
      setGenerationProgress(10);
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
      setGenerationProgress(20);
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
        setAbortController(null);
        clearInterval(timerInterval);
        return;
      }

      setGenerationProgress(30);
      console.log("Employee data for solver:", JSON.stringify(employeeData));
      console.log("FILTERED Dates for solver:", JSON.stringify(dates));

      // 3) POST to our API with the FILTERED dates list
      const res = await fetch(`${process.env.NEXT_PUBLIC_SOLVER_API_URL}/generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: employeeData, dates, max_consecutive_days: maxConsecutiveDays }),
        signal: controller.signal,
      });

      setGenerationProgress(70);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to generate schedule: ${errorText}`);
      }

      const json = (await res.json()) as { date: string; employee: string; weekday: number }[];
      
      // Validate that we received a valid schedule
      if (!json || !Array.isArray(json) || json.length === 0) {
        throw new Error("No valid schedule could be generated with the current settings. Please adjust your inputs and try again.");
      }

      setGenerationProgress(90);
      setSchedule(json);
      console.log('Received schedule:', json);
      setGenerationProgress(100);
      
      // Store the generation time for display (capture current elapsed time)
      const finalElapsedTime = Math.floor((Date.now() - startTime) / 1000);
      setLastGenerationTime(finalElapsedTime);
    } catch (err: any) {
      console.error(err);
      
      // Handle abort error separately
      if (err.name === 'AbortError') {
        setError('Schedule generation was cancelled.');
      } else {
        // Show a user-friendly error message if the error contains backend/traceback details
        let userMessage = 'A schedule could not be generated with the current settings. This is usually because there are not enough available days, too many restrictions, or not enough employees to cover the schedule. Please adjust your date range, excluded dates, or employee preferences and try again.';
        if (err && typeof err.message === 'string') {
          // If the error message is a simple string without traceback, show it
          if (!err.message.includes('Traceback') && !err.message.includes('RuntimeError')) {
            userMessage = err.message;
          }
        }
        setError(userMessage);
      }
      clearScheduleAndTime(); // Clear any existing schedule on error
    } finally {
      setLoading(false);
      setAbortController(null);
      clearInterval(timerInterval);
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
    if (!employees || employees.length === 0) {
      alert("No employee data available to export.");
      return;
    }

    if (!startDate || !endDate) {
      alert("No date range selected for export.");
      return;
    }

    // Helper function to get month name
    const getMonthName = (date: Date): string => {
      return date.toLocaleString('default', { month: 'long' });
    };

    // Generate ALL dates in the range (not filtered by schedulable days)
    const generateAllDatesInRange = () => {
      const out: { date: string; weekday: number; month: string }[] = [];
      const startDateObj = parseYYYYMMDDToLocalDate(startDate);
      const endDateObj = parseYYYYMMDDToLocalDate(endDate);
      if (!startDateObj || !endDateObj) return out;
      
      const cur = new Date(startDateObj.getTime());
      const loopEndDate = new Date(endDateObj.getTime());
      loopEndDate.setDate(loopEndDate.getDate() + 1);
      
      while (cur < loopEndDate) {
        out.push({
          date: cur.toISOString().slice(0, 10),
          weekday: cur.getDay(),
          month: getMonthName(cur)
        });
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    };

    // 1. Main Schedule Data - include ALL dates in range
    const allDatesInRange = generateAllDatesInRange();
    console.log('All dates in range generated:', allDatesInRange);
    
    const scheduleMap = schedule ? schedule.reduce<Record<string, string>>((acc, item) => {
      acc[item.date] = item.employee;
      return acc;
    }, {}) : {};
    console.log('Schedule map:', scheduleMap);

    // Get excluded dates for checking
    const excludedDatesSet = getExcludedDatesSet(excludedDates);
    
    const scheduleSheetData = allDatesInRange.map((dateInfo: { date: string; weekday: number; month: string }) => {
      const dateObj = parseYYYYMMDDToLocalDate(dateInfo.date);
      const isExcluded = dateObj ? excludedDatesSet.has(dateObj.toDateString()) : false;
      
      let employeeName = '';
      if (isExcluded) {
        employeeName = '[EXCLUDED DAY]';
      } else {
        employeeName = scheduleMap[dateInfo.date] || ''; // Empty string if no one is scheduled
      }
      
      return {
        'Date': dateInfo.date,
        'Month': dateInfo.month,
        'Day of Week': DAYS_OF_WEEK[dateInfo.weekday],
        'Employee Name': employeeName,
      };
    });
    console.log('Final schedule sheet data:', scheduleSheetData);

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
    const summarySheetData: any[] = scheduleSummaryData.map(row => ({
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
    if (employees && schedule && schedule.length > 0) {
      employees.forEach(employee => {
        if (employee.name) { // Ensure employee has a name for the sheet
          const employeeAssignments = schedule.filter(item => item.employee === employee.name);
          if (employeeAssignments.length > 0) {
            const employeeSheetData = employeeAssignments.map(item => {
              const dateObj = parseYYYYMMDDToLocalDate(item.date);
              return {
                'Date': item.date,
                'Month': dateObj ? getMonthName(dateObj) : '',
                'Day of Week': DAYS_OF_WEEK[item.weekday],
              };
            });
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
      clearScheduleAndTime();
    }
  }, [excludedDates]);

  // Add effect to clear schedule when schedulable days change
  useEffect(() => {
    if (schedule) {
      clearScheduleAndTime();
    }
  }, [schedulableDays]);

  // Add effect to clear schedule when employees/preferences change
  useEffect(() => {
    if (schedule) {
      clearScheduleAndTime();
    }
  }, [employees]);

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('CSV import started, file:', file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      console.log('CSV file read, content:', text);
      
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
      console.log('Parsed rows:', rows);
      
      // Validate headers - now dynamic based on schedulable days
      const headers = rows[0];
      const expectedHeaders = ['Employee Name', ...schedulableDays.map((_, index) => 
        `${index + 1}${getOrdinalSuffix(index + 1)} Pref`
      )];
      console.log('Headers found:', headers);
      console.log('Expected headers:', expectedHeaders);
      
      if (headers.length !== expectedHeaders.length || !headers.every((header, i) => header === expectedHeaders[i])) {
        console.log('Header validation failed');
        setFeedbackMessage({ 
          type: 'error', 
          message: `Invalid CSV format. Expected ${schedulableDays.length} preference columns for currently selected days (${schedulableDays.join(', ')}). Please download the current template.` 
        });
        event.target.value = "";
        return;
      }

      // Process employee data
      const allEmployees = rows.slice(1)
        .filter(row => row[0] && row[0].trim() !== '') // Skip empty rows
        .map(row => {
          // Create preferences array with proper length (match schedulable days)
          const preferences = row.slice(1, schedulableDays.length + 1).map(pref => pref as DayOfWeek);
          // Ensure preferences array has exactly 7 elements, padding the rest with empty strings
          while (preferences.length < 7) {
            preferences.push('');
          }
          return {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: row[0],
            preferences: preferences
          };
        });

      // Limit to MAX_EMPLOYEES
      const newEmployees = allEmployees.slice(0, MAX_EMPLOYEES);
      const wasLimited = allEmployees.length > MAX_EMPLOYEES;

      console.log('Processed employees:', newEmployees);

      if (newEmployees.length === 0) {
        console.log('No valid employees found');
        setFeedbackMessage({ 
          type: 'error', 
          message: 'No valid employee data found in CSV.' 
        });
        event.target.value = "";
        return;
      }

      console.log('Setting employees state with:', newEmployees);
      setEmployees(newEmployees);
      setCurrentRosterName('Unsaved Roster');
      setCurrentRosterId('');
      setOriginalEmployees([]);
      setSelectedRosterId('');
      
      if (wasLimited) {
        setFeedbackMessage({ 
          type: 'error', 
          message: `CSV contained ${allEmployees.length} employees. Only the first ${MAX_EMPLOYEES} were imported due to employee limit.` 
        });
      } else {
        setFeedbackMessage({ 
          type: 'success', 
          message: `Successfully imported ${newEmployees.length} employees.` 
        });
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    // Create dynamic headers based on schedulable days
    const preferenceHeaders = schedulableDays.map((_, index) => 
      `${index + 1}${getOrdinalSuffix(index + 1)} Pref`
    );
    const headers = ['Employee Name', ...preferenceHeaders];
    
    // Create example row with actual schedulable days
    const examplePrefs = schedulableDays.slice(); // Use all schedulable days as examples
    const exampleRow = ['John Doe', ...examplePrefs];
    
    const csvContent = [headers, exampleRow].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee_preferences_template_${schedulableDays.length}days.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Automatically clear feedbackMessage after 3 seconds
  useEffect(() => {
    if (feedbackMessage) {
      const timeout = setTimeout(() => setFeedbackMessage(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [feedbackMessage]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showDropdown && !target.closest('.relative')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Add new function to load preference session responses
  const handleLoadPreferenceSession = async (sessionId: string) => {
    try {
      // Get session details
      const selectedSession = preferenceSessions.find(session => session.id === sessionId);
      if (!selectedSession) return;

      // Fetch all responses for this session
      const { data: responses, error } = await supabase
        .from('employee_responses')
        .select('*')
        .eq('session_id', sessionId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Convert responses to Employee format
      const allEmployeesFromResponses: Employee[] = responses.map(response => ({
        id: response.id,
        name: response.employee_name,
        preferences: response.preferences.concat(Array(7 - response.preferences.length).fill(''))
      }));

      // Limit to MAX_EMPLOYEES
      const employeesFromResponses = allEmployeesFromResponses.slice(0, MAX_EMPLOYEES);
      const wasLimited = allEmployeesFromResponses.length > MAX_EMPLOYEES;

      // Load into state
      setEmployees(employeesFromResponses);
      setOriginalEmployees(employeesFromResponses);
      setSelectedRosterId(''); // Clear selected roster
      setCurrentRosterName(`${selectedSession.name} (${employeesFromResponses.length} responses)`);
      setCurrentRosterId(''); // This is from a session, not a saved roster
      setSchedulableDays(selectedSession.schedulable_days);
      clearScheduleAndTime();
      
      if (wasLimited) {
        setFeedbackMessage({ 
          type: 'error', 
          message: `Preference session had ${allEmployeesFromResponses.length} responses. Only the first ${MAX_EMPLOYEES} were loaded due to employee limit.` 
        });
      } else {
        setFeedbackMessage({ 
          type: 'success', 
          message: `Loaded ${employeesFromResponses.length} employee responses from preference session` 
        });
      }
      setTimeout(() => setFeedbackMessage(null), 3000);

    } catch (error) {
      console.error('Error loading preference session:', error);
      setFeedbackMessage({ type: 'error', message: 'Failed to load preference session responses' });
    }
  };



  return (
    <div className="min-h-screen bg-gray-100">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          {/* Roster Management Section */}
          <div className="bg-white rounded-2xl shadow p-8 border border-gray-200">
            <h2 className="text-2xl font-bold mb-6">Roster Management</h2>
            
            {/* Roster Operations - First Row */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Current Roster: {currentRosterName}</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={selectedRosterId}
                  onChange={e => {
                    const value = e.target.value;
                    setSelectedRosterId(value);
                    
                    // Check if it's a preference session (starts with 'session_')
                    if (value.startsWith('session_')) {
                      const sessionId = value.replace('session_', '');
                      handleLoadPreferenceSession(sessionId);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                >
                  <option value="">Load Saved Roster or Preference Responses</option>
                  
                  {/* Saved Rosters */}
                  {savedRosters.length > 0 && (
                    <optgroup label="📁 Saved Rosters">
                      {savedRosters.map(roster => (
                        <option key={roster.id} value={roster.id}>
                          {roster.name} ({roster.employees.length} employees)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  
                  {/* Preference Sessions */}
                  {preferenceSessions.length > 0 && (
                    <optgroup label="📋 Preference Collection Sessions">
                      {preferenceSessions
                        .filter(session => (session.response_count || 0) > 0)
                        .map(session => (
                          <option key={`session_${session.id}`} value={`session_${session.id}`}>
                            {session.name} ({session.response_count} responses)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                
                {selectedRosterId && !selectedRosterId.startsWith('session_') && (
                  <button
                    onClick={() => handleLoadRoster(selectedRosterId)}
                    className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                  >
                    Load Roster
                  </button>
                )}
                
                {/* Save New Roster */}
                {!currentRosterId && employees.some(emp => emp.name && emp.name.trim() !== '') && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newRosterName}
                      onChange={e => setNewRosterName(e.target.value)}
                      placeholder="Enter roster name"
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                    />
                    <button
                      onClick={handleSaveRoster}
                      className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
                    >
                      Save Roster
                    </button>
                  </div>
                )}
                
                {employees.some(emp => emp.name && emp.name.trim() !== '') && (
                  <button
                    onClick={handleNewRoster}
                    className="bg-gray-600 text-white px-4 py-2 rounded font-semibold"
                  >
                    New Roster
                  </button>
                )}
                
                {currentRosterId && hasEmployeesChanged() && (
                  <button
                    onClick={handleUpdateRoster}
                    className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                  >
                    Update
                  </button>
                )}
                
                {currentRosterId && (
                  <>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        placeholder="Enter new name"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-psu-blue"
                      />
                      <button
                        onClick={handleRenameRoster}
                        className="bg-blue-600 text-white px-4 py-2 rounded font-semibold"
                      >
                        Rename
                      </button>
                    </div>
                    <button
                      onClick={handleDeleteCurrentRoster}
                      className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Employee Data Collection - Second Row */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Employee Data Collection</h3>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={() => window.location.href = '/preference-sessions'}
                  className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
                >
                  📋 Send Preference Form to Employees
                </button>
                
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">or</span>
                </div>
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-psu-blue text-white px-4 py-2 rounded font-semibold"
                >
                  📁 Import CSV
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportCSV}
                  accept=".csv"
                  className="hidden"
                />
                
                <button
                  onClick={e => { e.preventDefault(); downloadTemplate(); }}
                  className="bg-gray-500 text-white px-4 py-2 rounded font-semibold text-sm"
                >
                  ⬇️ Download CSV Template
                </button>
              </div>
              
              {feedbackMessage && (
                <div className={`mt-3 p-3 rounded ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {feedbackMessage.message}
                </div>
              )}
            </div>

            {/* Day Selection - Third Row */}
            <div className="mb-6">
              <DaySelector selectedDays={schedulableDays} onChange={setSchedulableDays} />
              {schedulableDays.length < 7 && (
                <div className="mt-3 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-md p-3">
                  <strong>Note:</strong> Currently only scheduling for: <span className="font-medium text-blue-800">{schedulableDays.join(', ')}</span>. 
                  The CSV template will only include {schedulableDays.length} preference column{schedulableDays.length !== 1 ? 's' : ''} for these days.
                </div>
              )}
            </div>

            {/* Employee Roster Table */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th></th>
                    <th scope="col">Employee Name</th>
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
                              employee.preferences[index] && schedulableDays.includes(employee.preferences[index])
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
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleAddEmployee}
                    disabled={employees.length >= MAX_EMPLOYEES}
                    className={`px-4 py-2 rounded font-semibold ${
                      employees.length >= MAX_EMPLOYEES 
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                        : 'bg-psu-blue text-white hover:bg-blue-700'
                    }`}
                    title={employees.length >= MAX_EMPLOYEES ? `Maximum ${MAX_EMPLOYEES} employees allowed` : 'Add a new employee'}
                  >
                    + Add Employee
                  </button>
                  <span className="text-sm text-gray-600">
                    {employees.length}/{MAX_EMPLOYEES} employees
                  </span>
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
              <div className="flex flex-row gap-4 items-center justify-between w-full">
                {/* Left side: Generate, Cancel, Progress, Export */}
                <div className="flex flex-row gap-4 items-center flex-1 min-w-0">
                  <button
                    className="rounded bg-psu-blue px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
                    onClick={handleGenerateSchedule}
                    disabled={loading}
                  >
                    {loading ? 'Generating…' : `Generate Schedule for ${totalSchedulableDays} Days`}
                  </button>
                  {loading && (
                    <button
                      className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                      onClick={handleCancelGeneration}
                    >
                      Cancel
                    </button>
                  )}
                  {loading && (
                    <div className="flex items-center gap-4">
                      <SmoothProgressBar taskComplete={!loading} duration={50} />
                      <span className="text-sm text-gray-600">
                        {elapsedTime}s
                      </span>
                    </div>
                  )}
                  {schedule && schedule.length > 0 && (
                    <button
                      className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                      onClick={handleExportToExcel}
                    >
                      Export to Excel
                    </button>
                  )}
                  {schedule && lastGenerationTime !== null && (
                    <div className="flex items-center text-sm text-gray-600 bg-green-50 px-3 py-2 rounded-md border border-green-200">
                      <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-green-700 font-medium">
                        Schedule generated in {lastGenerationTime}s
                      </span>
                    </div>
                  )}
                </div>

                {/* Right side: Schedule Manager */}
                <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm">
                  {/* Main Input Group */}
                  <div className="flex items-stretch">
                    <input
                      type="text"
                      value={newScheduleName}
                      onChange={e => setNewScheduleName(e.target.value)}
                      placeholder={schedule ? "Name this schedule..." : "Create a schedule to save it"}
                      disabled={!schedule || loadingSchedule}
                      className={`flex-1 px-4 py-2.5 text-sm border-0 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-psu-blue focus:ring-inset ${
                        !schedule ? 'bg-gray-50 text-gray-400 placeholder-gray-400' : 'bg-white text-gray-900 placeholder-gray-500'
                      } ${loadingSchedule ? 'opacity-60' : ''}`}
                      style={{ minWidth: '200px' }}
                    />
                    
                    {/* Dropdown Toggle - Only show when there are saved schedules */}
                    {savedSchedules.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowDropdown(!showDropdown)}
                        disabled={loadingSchedule}
                        className={`px-3 py-2.5 border-l border-gray-200 bg-gray-50 hover:bg-psu-blue focus:outline-none focus:ring-2 focus:ring-psu-blue focus:ring-inset transition-all duration-200 ${
                          loadingSchedule ? 'opacity-60 cursor-not-allowed' : 'text-gray-600 hover:text-white'
                        }`}
                        title={`Load from ${savedSchedules.length} saved schedule${savedSchedules.length === 1 ? '' : 's'}`}
                      >
                        <svg className={`w-4 h-4 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    
                    {/* Save Button */}
                    <button
                      onClick={handleSaveSchedule}
                      disabled={!schedule || !newScheduleName.trim() || loadingSchedule}
                      className={`px-4 py-2.5 font-medium text-sm rounded-r-lg transition-all duration-200 ${
                        schedule && newScheduleName.trim() && !loadingSchedule
                          ? 'bg-psu-blue text-white hover:bg-blue-700 focus:ring-2 focus:ring-psu-blue focus:ring-offset-2 shadow-sm'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      title={!schedule ? "Generate a schedule first" : !newScheduleName.trim() ? "Enter a name to save" : "Save this schedule"}
                    >
                      {loadingSchedule ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="m15.84 2.016.77-.866c.13-.146.26-.289.36-.44.06-.088.1-.186.1-.29 0-.264-.184-.48-.43-.48-.116 0-.224.048-.305.128l-.863.773c-.143.128-.285.26-.424.396-.1.098-.195.201-.286.308-.084.098-.163.2-.237.306-.069.099-.133.202-.192.308-.055.099-.105.202-.149.308-.042.099-.078.202-.108.308-.028.099-.05.202-.066.308-.015.099-.024.202-.026.308-.002.106.003.213.013.32z"></path>
                        </svg>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Save
                        </>
                      )}
                    </button>
                  </div>

                  {/* Enhanced Dropdown Menu */}
                  {showDropdown && savedSchedules.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
                      {/* Header */}
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">Saved Schedules</span>
                          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                            {savedSchedules.length}
                          </span>
                        </div>
                      </div>
                      
                      {/* Schedule List */}
                      <div className="max-h-64 overflow-y-auto">
                        {savedSchedules.map((savedSchedule, index) => (
                          <div
                            key={savedSchedule.id}
                            className={`group flex items-center justify-between px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors duration-150 ${
                              index !== savedSchedules.length - 1 ? 'border-b border-gray-100' : ''
                            }`}
                            onClick={() => {
                              handleLoadSavedSchedule(savedSchedule.id);
                              setShowDropdown(false);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                  <svg className="w-5 h-5 text-blue-500 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-900" title={savedSchedule.name}>
                                    {savedSchedule.name}
                                  </p>
                                  <p className="text-xs text-gray-500 group-hover:text-blue-600">
                                    {savedSchedule.total_schedulable_days} days • {savedSchedule.employees.length} employees • {new Date(savedSchedule.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete "${savedSchedule.name}"? This cannot be undone.`)) {
                                  handleDeleteSavedSchedule(savedSchedule.id);
                                  setShowDropdown(false);
                                }
                              }}
                              className="ml-3 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                              title={`Delete "${savedSchedule.name}"`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
            <div className="bg-white shadow rounded-lg p-4 w-full max-w-full overflow-x-auto mb-8 relative">
              {loadingSchedule && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
                  <div className="flex items-center text-blue-600">
                    <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m15.84 2.016.77-.866c.13-.146.26-.289.36-.44.06-.088.1-.186.1-.29 0-.264-.184-.48-.43-.48-.116 0-.224.048-.305.128l-.863.773c-.143.128-.285.26-.424.396-.1.098-.195.201-.286.308-.084.098-.163.2-.237.306-.069.099-.133.202-.192.308-.055.099-.105.202-.149.308-.042.099-.078.202-.108.308-.028.099-.05.202-.066.308-.015.099-.024.202-.026.308-.002.106.003.213.013.32z"></path>
                    </svg>
                    <span className="font-medium">Loading calendar...</span>
                  </div>
                </div>
              )}
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
                            style={{ fontSize: '0.95rem' }}
                            title={exclusionTitle}
                          >
                            {exclusionTitle}
                          </p>
                        );
                      } else if (isInRange && isSchedulableDayOfWeek && employeeName && !isExcluded && visibleEmployees.has(employeeName)) {
                      // Get the appropriate text color for this employee
                      const colorIndex = employeeColorMap[employeeName];
                      let textColor = '#ffffff'; // default white
                      if (colorIndex !== undefined) {
                        const bgColor = EMPLOYEE_COLORS[colorIndex];
                        const hex = bgColor.replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16);
                        const g = parseInt(hex.substr(2, 2), 16);
                        const b = parseInt(hex.substr(4, 2), 16);
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        textColor = brightness > 128 ? '#000000' : '#FFFFFF';
                      }
                      
                      employeeBadgeContent = (
                        <p 
                          className="employee-name-display text-xs p-0.5 mt-0.5 rounded font-semibold leading-tight truncate"
                          style={{ fontSize: '0.75rem', color: textColor }}
                          title={employeeName}
                        >
                          {employeeName}
                        </p>
                      );
                    }

                      // Calculate appropriate text color for day number
                      let dayNumberColor = '#001E44'; // default blue
                      if (isInRange && isSchedulableDayOfWeek && employeeName && !isExcluded && visibleEmployees.has(employeeName)) {
                        const colorIndex = employeeColorMap[employeeName];
                        if (colorIndex !== undefined) {
                          const bgColor = EMPLOYEE_COLORS[colorIndex];
                          const hex = bgColor.replace('#', '');
                          const r = parseInt(hex.substr(0, 2), 16);
                          const g = parseInt(hex.substr(2, 2), 16);
                          const b = parseInt(hex.substr(4, 2), 16);
                          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                          dayNumberColor = brightness > 128 ? '#000000' : '#FFFFFF';
                        } else {
                          dayNumberColor = '#ffffff'; // default white for assigned days
                        }
                      } else if (isInRange && isSchedulableDayOfWeek) {
                        dayNumberColor = '#ffffff'; // white for unassigned in-range days (or filtered out employees)
                      } else if (isExcluded) {
                        dayNumberColor = '#9ca3af'; // gray for excluded days
                      }

                      const dayNumberComponent = (
                        <span 
                          style={{ fontWeight: 500, color: dayNumberColor }}
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
                  const dateStr = date.toISOString().slice(0, 10);
                  const employeeName = scheduleMap[dateStr];

                  // If the date is excluded, return a special class
                  if (excludedDatesSet.has(dateString)) {
                    return 'excluded-date';
                  }

                  // If someone is assigned to this date and they are visible, use their specific color
                  if (inRangeSet.has(dateString) && schedulableDays.includes(dayName) && employeeName && visibleEmployees.has(employeeName)) {
                    return getEmployeeColorClass(employeeName);
                  }

                  // Apply default 'range-day' style for unassigned days in range
                  if (inRangeSet.has(dateString) && schedulableDays.includes(dayName)) {
                    return 'range-day';
                  }

                  return undefined;
                }}
                className="react-calendar-override"
              />
            </div>
            
            {/* Employee Color Legend */}
            {schedule && schedule.length > 0 && employees.some(emp => emp.name && emp.name.trim() !== '') && (
              <div className="bg-white shadow rounded-lg p-4 w-full max-w-full overflow-x-auto mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Employee Filter & Color Legend</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={showAllEmployees}
                      className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                      Show All
                    </button>
                    <button
                      onClick={hideAllEmployees}
                      className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                      Hide All
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Click on employee names to show/hide their assigned days on the calendar. This only affects the display - exports will include all data.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {employees
                    .filter(emp => emp.name && emp.name.trim() !== '')
                    .map((employee, index) => {
                      const colorIndex = index % EMPLOYEE_COLORS.length;
                      const color = EMPLOYEE_COLORS[colorIndex];
                      const hex = color.replace('#', '');
                      const r = parseInt(hex.substr(0, 2), 16);
                      const g = parseInt(hex.substr(2, 2), 16);
                      const b = parseInt(hex.substr(4, 2), 16);
                      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                      const textColor = brightness > 128 ? '#000000' : '#FFFFFF';
                      const isVisible = visibleEmployees.has(employee.name);
                      
                      return (
                        <div
                          key={employee.id}
                          onClick={() => toggleEmployeeVisibility(employee.name)}
                          className={`flex items-center space-x-2 p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 transform hover:scale-105 ${
                            isVisible 
                              ? 'border-opacity-100 shadow-md' 
                              : 'border-opacity-30 opacity-50 grayscale'
                          }`}
                          style={{ 
                            backgroundColor: isVisible ? color : '#f3f4f6', 
                            color: isVisible ? textColor : '#6b7280', 
                            borderColor: color 
                          }}
                          title={`Click to ${isVisible ? 'hide' : 'show'} ${employee.name}'s assignments`}
                        >
                          <div 
                            className={`w-4 h-4 rounded-full border-2 transition-all ${
                              isVisible ? '' : 'opacity-50'
                            }`}
                            style={{ 
                              backgroundColor: isVisible ? color : '#d1d5db', 
                              borderColor: isVisible ? textColor : '#9ca3af' 
                            }}
                          ></div>
                          <span className={`text-sm font-medium truncate transition-all ${
                            isVisible ? 'font-semibold' : 'font-normal'
                          }`} title={employee.name}>
                            {employee.name}
                          </span>
                          <div className="ml-auto">
                            {isVisible ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            
            {/* Schedule Summary full width card */}
            {schedule && schedule.length > 0 && scheduleSummaryData.length > 0 && (
              <div className="bg-white shadow rounded-lg p-4 w-full max-w-full overflow-x-auto relative">
                {loadingSchedule && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
                    <div className="flex items-center text-blue-600">
                      <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="m15.84 2.016.77-.866c.13-.146.26-.289.36-.44.06-.088.1-.186.1-.29 0-.264-.184-.48-.43-.48-.116 0-.224.048-.305.128l-.863.773c-.143.128-.285.26-.424.396-.1.098-.195.201-.286.308-.084.098-.163.2-.237.306-.069.099-.133.202-.192.308-.055.099-.105.202-.149.308-.042.099-.078.202-.108.308-.028.099-.05.202-.066.308-.015.099-.024.202-.026.308-.002.106.003.213.013.32z"></path>
                      </svg>
                      <span className="font-medium">Loading summary...</span>
                    </div>
                  </div>
                )}
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
                            <td key={i} className={`px-3 py-3 border-b border-gray-200 whitespace-nowrap text-sm text-gray-800`}>
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


