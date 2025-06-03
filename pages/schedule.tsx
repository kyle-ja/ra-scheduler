import { useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import Calendar from 'react-calendar';
import { supabase } from '../lib/supabaseClient';
import { differenceInCalendarDays, addDays } from "date-fns";
import 'react-calendar/dist/Calendar.css';

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
  schedulableDays: DayOfWeek[];
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SchedulePage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeStartDate, setActiveStartDate] = useState<Date>(new Date());
  const [dateError, setDateError] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [savedRosters, setSavedRosters] = useState<SavedRoster[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ date: string; employee: string; weekday: number }[] | null>(null);
  const [schedulableDays, setSchedulableDays] = useState<DayOfWeek[]>(DAYS_OF_WEEK);

  const inRangeSet = useMemo(() => {
    if (!startDate || !endDate) {
      return new Set<string>();
    }

    const parseYYYYMMDDToLocalDate = (dateString: string): Date | null => {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return new Date(year, month, day, 12, 0, 0, 0);
        }
      }
      return null;
    };

    const localStartDate = parseYYYYMMDDToLocalDate(startDate);
    const localEndDate = parseYYYYMMDDToLocalDate(endDate);

    if (!localStartDate || !localEndDate || localEndDate < localStartDate) {
      return new Set<string>();
    }
    
    const days = differenceInCalendarDays(localEndDate, localStartDate) + 1;
    return new Set([...Array(days)].map((_, i) => addDays(localStartDate, i).toDateString()));
  }, [startDate, endDate]);

  const scheduleMap = useMemo(() => {
    if (!schedule) return {};
    return schedule.reduce<Record<string, string>>((acc, item) => {
      acc[item.date] = item.employee;
      return acc;
    }, {});
  }, [schedule]);

  interface ScheduleSummaryRow {
    employeeName: string;
    prefCounts: (number | string)[];
    noPreferenceCount: number;
    totalDaysAssigned: number;
  }

  const scheduleSummaryData = useMemo((): ScheduleSummaryRow[] => {
    if (!schedule || !employees || employees.length === 0) {
      return [];
    }

    return employees.map(employee => {
      const summaryRow: ScheduleSummaryRow = {
        employeeName: employee.name || "Unnamed Employee",
        prefCounts: [],
        noPreferenceCount: 0,
        totalDaysAssigned: 0,
      };

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
        const assignedWeekdayIndex = assignment.weekday;
        const assignedWeekdayName = DAYS_OF_WEEK[assignedWeekdayIndex];
        
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

  const handleLoadRoster = (rosterId: string) => {
    const selectedRoster = savedRosters.find(r => r.id === rosterId);
    if (selectedRoster) {
      setEmployees(selectedRoster.employees);
      setSelectedRosterId(rosterId);
      setSchedulableDays(selectedRoster.schedulable_days || DAYS_OF_WEEK);
    }
  };

  const validateDates = (start: string, end: string) => {
    if (!start || !end) {
      setDateError('Please select both start and end dates');
      return false;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (endDate < startDate) {
      setDateError('End date must be after start date');
      return false;
    }

    setDateError('');
    return true;
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    setStartDate(newStartDate);
    validateDates(newStartDate, endDate);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    setEndDate(newEndDate);
    validateDates(startDate, newEndDate);
  };

  function isDateInRange(date: Date) {
    return inRangeSet.has(date.toDateString());
  }

  const handleGenerateSchedule = async () => {
    if (!validateDates(startDate, endDate)) {
      return;
    }

    if (employees.length === 0) {
      setError('Please load a roster with employees first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedRoster = savedRosters.find(r => r.id === selectedRosterId);
      if (!selectedRoster) {
        throw new Error('Selected roster not found');
      }

      // Build the employee data with cost logic
      const rankWeights = [0, 20, 40];
      const employeeData = employees.map((emp: Employee) => {
        const cost = Array(7).fill(1000);
        emp.preferences.forEach((preferredDay: DayOfWeek, rankIndex: number) => {
          if (preferredDay) {
            const dayIndex = DAYS_OF_WEEK.indexOf(preferredDay);
            if (dayIndex !== -1) {
              cost[dayIndex] = rankWeights[rankIndex] ?? 100;
            }
          }
        });
        return { name: emp.name, weekday_cost: cost };
      });

      // Build the dates array, filtering out non-schedulable days
      const buildDateRange = (startStr: string, endStr: string) => {
        const out: { date: string; weekday: number }[] = [];
        const startDateParts = startStr.split('-').map(Number);
        const cur = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2], 0, 0, 0, 0);
        const endDateParts = endStr.split('-').map(Number);
        const loopEndDate = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2] + 1, 0, 0, 0, 0);
        
        while (cur < loopEndDate) {
          const weekday = cur.getDay();
          const weekdayName = DAYS_OF_WEEK[weekday];
          if (selectedRoster.schedulableDays.includes(weekdayName)) {
            out.push({
              date: cur.toISOString().slice(0, 10),
              weekday: weekday,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
        return out;
      };

      const dates = buildDateRange(startDate, endDate);

      const response = await fetch('/api/generateSchedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employees: employeeData,
          dates,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate schedule');
      }

      const data = await response.json();
      setSchedule(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the schedule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">Load Saved Roster</label>
              <select
                value={selectedRosterId}
                onChange={(e) => handleLoadRoster(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              >
                <option value="">Select a roster</option>
                {savedRosters.map((roster) => (
                  <option key={roster.id} value={roster.id}>
                    {roster.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>

            {dateError && (
              <div className="mb-4 text-red-600 text-sm">{dateError}</div>
            )}

            <button
              onClick={handleGenerateSchedule}
              disabled={loading || !selectedRosterId || !startDate || !endDate}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
            >
              {loading ? 'Generating...' : 'Generate Schedule'}
            </button>

            {error && (
              <div className="mt-4 text-red-600 text-sm">{error}</div>
            )}

            {schedule && (
              <div className="mt-8">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Schedule Summary</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                        {DAYS_OF_WEEK.map((day, index) => (
                          <th key={day} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {day} (Pref {index + 1})
                          </th>
                        ))}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No Preference</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Days</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {scheduleSummaryData.map((row) => (
                        <tr key={row.employeeName}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.employeeName}</td>
                          {row.prefCounts.map((count, index) => (
                            <td key={index} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{count}</td>
                          ))}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.noPreferenceCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.totalDaysAssigned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8">
              <Calendar
                onChange={() => {}}
                value={activeStartDate}
                tileClassName={({ date }) => (isDateInRange(date) ? 'bg-indigo-100' : '')}
                tileContent={({ date }) => {
                  const dateStr = date.toDateString();
                  const employee = scheduleMap[dateStr];
                  return employee ? (
                    <div className="text-xs text-center mt-1">{employee}</div>
                  ) : null;
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 