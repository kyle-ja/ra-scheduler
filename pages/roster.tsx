import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

export default function RosterPage() {
  const router = useRouter();

  type RAPreference = {
    name: string;
    preferences: string[];
  };

  type Schedule = {
    [date: string]: string; // date -> RA name
  };

  type RAStats = {
    [raName: string]: {
      totalShifts: number;
      targetShifts: number;
      preferenceFulfillment: number[];
    };
  };

  type SavedRoster = {
    id: string;
    name: string;
    ras: RAPreference[];
    created_at: string;
    user_id: string;
  };
  
  const [ras, setRAs] = useState<RAPreference[]>([
    { name: '', preferences: ['', '', '', '', ''] },
  ]);

  // Add date range state
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  // Add validation state
  const [dateError, setDateError] = useState('');
  const [schedule, setSchedule] = useState<Schedule>({});
  const [raStats, setRAStats] = useState<RAStats>({});
  const [savedRosters, setSavedRosters] = useState<SavedRoster[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [rosterName, setRosterName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
      } else {
        const email = session.user.email || '';
        setUserEmail(email);
        setWelcomeMessage(`Welcome, ${email}!`);
        setTimeout(() => setWelcomeMessage(null), 3000);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    const loadSavedRosters = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('rosters')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading rosters:', error);
        return;
      }

      setSavedRosters(data || []);
    };

    loadSavedRosters();
  }, []);

  // Function to validate date range
  const validateDateRange = (start: string, end: string) => {
    if (!start || !end) {
      setDateError('Please select both start and end dates');
      return false;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate > endDate) {
      setDateError('End date must be after start date');
      return false;
    }

    // Calculate the difference in days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      setDateError('Date range cannot exceed 90 days');
      return false;
    }

    setDateError('');
    return true;
  };

  // Function to handle date changes
  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const newDateRange = {
      ...dateRange,
      [type === 'start' ? 'startDate' : 'endDate']: value
    };
    setDateRange(newDateRange);
    validateDateRange(
      type === 'start' ? value : dateRange.startDate,
      type === 'end' ? value : dateRange.endDate
    );
  };

  // Function to get all dates in range that fall on Sunday-Thursday
  const getRelevantDates = (start: string, end: string): string[] => {
    const dates: string[] = [];
    let current = new Date(start);
    const endDate = new Date(end);
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek >= 0 && dayOfWeek <= 4) { // Sunday (0) to Thursday (4)
        dates.push(current.toISOString().split('T')[0]);
      }
      // Move to next day (create a new Date object to avoid mutation issues)
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return dates;
  };

  // Function to get RAs who prefer a specific day, sorted by preference level and current stats
  const getPreferredRAs = (day: string, currentStats: RAStats): RAPreference[] => {
    const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].indexOf(day);
    if (dayIndex === -1) return [];

    return ras
      .filter(ra => ra.name) // Filter out empty names
      .map(ra => ({
        ra,
        preferenceLevel: ra.preferences.indexOf(day),
        preferenceFulfillment: currentStats[ra.name]?.preferenceFulfillment[ra.preferences.indexOf(day)] || 0
      }))
      .filter(item => item.preferenceLevel !== -1) // Only include RAs who have this day in preferences
      .sort((a, b) => {
        // First sort by preference level (lower is better)
        if (a.preferenceLevel !== b.preferenceLevel) {
          return a.preferenceLevel - b.preferenceLevel;
        }
        // Then sort by how many times they've gotten this preference level
        return a.preferenceFulfillment - b.preferenceFulfillment;
      })
      .map(item => item.ra);
  };

  // Function to randomly select from equally qualified RAs
  const selectRandomRA = (qualifiedRAs: RAPreference[]): RAPreference => {
    const randomIndex = Math.floor(Math.random() * qualifiedRAs.length);
    return qualifiedRAs[randomIndex];
  };

  // Function to update RA stats after assignment
  const updateRAStats = (
    raName: string,
    assignedDay: string,
    currentStats: RAStats
  ): RAStats => {
    const ra = ras.find(r => r.name === raName);
    if (!ra) return currentStats;

    const preferenceLevel = ra.preferences.indexOf(assignedDay);
    const currentRAStats = currentStats[raName] || {
      totalShifts: 0,
      targetShifts: 0,
      preferenceFulfillment: [0, 0, 0, 0, 0]
    };

    return {
      ...currentStats,
      [raName]: {
        ...currentRAStats,
        totalShifts: currentRAStats.totalShifts + 1,
        preferenceFulfillment: currentRAStats.preferenceFulfillment.map((count, index) =>
          index === preferenceLevel ? count + 1 : count
        )
      }
    };
  };

  const generateSchedule = () => {
    if (!validateDateRange(dateRange.startDate, dateRange.endDate)) {
      return;
    }

    const dates = getRelevantDates(dateRange.startDate, dateRange.endDate);
    const totalShifts = dates.length;
    const activeRAs = ras.filter(ra => ra.name);
    const shiftsPerRA = Math.floor(totalShifts / activeRAs.length);
    const extraShifts = totalShifts % activeRAs.length; // Handle remainder shifts
    
    let newSchedule: Schedule = {};
    let newRAStats: RAStats = {};
    let remainingDates = [...dates];

    // Initialize RA stats with target shifts
    activeRAs.forEach(ra => {
      newRAStats[ra.name] = {
        totalShifts: 0,
        targetShifts: shiftsPerRA + (extraShifts > 0 ? 1 : 0), // Distribute extra shifts
        preferenceFulfillment: [0, 0, 0, 0, 0]
      };
    });

    // Sort dates to process them in order
    remainingDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    while (remainingDates.length > 0) {
      const currentDate = remainingDates[0];
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'][new Date(currentDate).getDay()];
      
      // Get RAs who haven't reached their target shifts
      const availableRAs = activeRAs.filter(ra => 
        (newRAStats[ra.name].totalShifts < newRAStats[ra.name].targetShifts)
      );

      if (availableRAs.length === 0) {
        console.error('No available RAs found for date:', currentDate);
        remainingDates.shift();
        continue;
      }

      // Get preferred RAs from available pool
      const preferredRAs = getPreferredRAs(dayName, newRAStats)
        .filter(ra => availableRAs.some(availableRA => availableRA.name === ra.name));

      // If no RAs have this day in preferences, use all available RAs
      const candidates = preferredRAs.length > 0 ? preferredRAs : availableRAs;

      // Sort candidates by current shift count to prioritize those with fewer shifts
      const sortedCandidates = candidates.sort((a, b) => 
        (newRAStats[a.name].totalShifts - newRAStats[b.name].totalShifts)
      );

      // Get the minimum shift count among candidates
      const minShifts = newRAStats[sortedCandidates[0].name].totalShifts;

      // Filter to only RAs with the minimum shift count
      const finalCandidates = sortedCandidates.filter(
        ra => newRAStats[ra.name].totalShifts === minShifts
      );

      // Randomly select from the final candidates
      const selectedRA = selectRandomRA(finalCandidates);
      
      // Update schedule and stats
      newSchedule[currentDate] = selectedRA.name;
      newRAStats = updateRAStats(selectedRA.name, dayName, newRAStats);
      
      remainingDates.shift();
    }

    setSchedule(newSchedule);
    setRAStats(newRAStats);
  };

  const saveRoster = async () => {
    if (!rosterName.trim()) {
      alert('Please enter a name for the roster');
      return;
    }
    const validRAs = ras.filter(ra => ra.name.trim());
    if (validRAs.length === 0) {
      alert('Please add at least one RA with a name');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('You must be logged in to save rosters');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('rosters')
        .insert([
          {
            name: rosterName.trim(),
            ras: validRAs,
            user_id: session.user.id
          }
        ])
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('No data returned from save operation');
      setSavedRosters([data, ...savedRosters]);
      setRosterName('');
      alert('Roster saved successfully!');
    } catch (error: any) {
      alert('Failed to save roster: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const loadRoster = (rosterId: string) => {
    const roster = savedRosters.find(r => r.id === rosterId);
    if (roster) {
      setRAs(roster.ras);
      setSelectedRosterId(rosterId);
    }
  };

  const deleteRoster = async (rosterId: string) => {
    if (!window.confirm('Are you sure you want to delete this roster? This action cannot be undone.')) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('rosters')
        .delete()
        .eq('id', rosterId);
      if (error) throw error;
      setSavedRosters(savedRosters.filter(r => r.id !== rosterId));
      if (selectedRosterId === rosterId) {
        setSelectedRosterId('');
        setRAs([{ name: '', preferences: ['', '', '', '', ''] }]);
      }
      alert('Roster deleted successfully!');
    } catch (error: any) {
      alert('Failed to delete roster: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateRoster = async () => {
    if (!selectedRosterId) {
      alert('No roster selected to update.');
      return;
    }
    const validRAs = ras.filter(ra => ra.name.trim());
    if (validRAs.length === 0) {
      alert('Please add at least one RA with a name');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('rosters')
        .update({ ras: validRAs })
        .eq('id', selectedRosterId);
      if (error) throw error;
      // Update the local savedRosters state
      setSavedRosters(savedRosters.map(r =>
        r.id === selectedRosterId ? { ...r, ras: validRAs } : r
      ));
      alert('Roster updated successfully!');
    } catch (error: any) {
      alert('Failed to update roster: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-0 bg-psu-gray">
      {/* PSU Gold Accent Bar */}
      <div className="w-full h-2 bg-psu-gold" />
      <div className="max-w-4xl mx-auto p-6">
        {welcomeMessage && (
          <div className="mb-4 p-4 bg-psu-gold text-psu-blue font-bold text-lg rounded shadow text-center animate-fade-in-out">
            {welcomeMessage}
          </div>
        )}
        <h1 className="text-3xl font-bold mb-6 bg-psu-blue text-psu-white rounded-t-lg shadow-lg px-6 py-4 tracking-wide">RA Roster Management</h1>

        {/* Saved Rosters Section */}
        <div className="mb-8 p-4 bg-psu-light-blue rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4 text-psu-gold">Saved Rosters</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="savedRosters" className="block text-sm font-medium text-psu-white mb-1">
                Select Roster
              </label>
              <div className="flex gap-2 items-center">
                <select
                  id="savedRosters"
                  value={selectedRosterId}
                  onChange={(e) => loadRoster(e.target.value)}
                  className="w-full border border-psu-blue p-2 rounded bg-psu-white text-psu-blue focus:ring-psu-gold focus:border-psu-gold"
                  disabled={isSaving}
                >
                  <option value="">Select a saved roster</option>
                  {savedRosters.map((roster) => (
                    <option key={roster.id} value={roster.id}>
                      {roster.name} ({new Date(roster.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {selectedRosterId && (
                  <>
                    <button
                      onClick={() => updateRoster()}
                      className="ml-2 bg-psu-gold text-psu-blue font-bold px-3 py-2 rounded shadow hover:bg-psu-blue hover:text-psu-gold transition-colors disabled:bg-gray-400"
                      disabled={isSaving || ras.filter(ra => ra.name.trim()).length === 0}
                      title="Update this roster"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => deleteRoster(selectedRosterId)}
                      className="ml-2 bg-red-600 text-white px-3 py-2 rounded shadow hover:bg-psu-blue hover:text-red-400 transition-colors disabled:bg-gray-400"
                      disabled={isSaving}
                      title="Delete this roster"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label htmlFor="rosterName" className="block text-sm font-medium text-psu-white mb-1">
                Save Current Roster
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="rosterName"
                  value={rosterName}
                  onChange={(e) => setRosterName(e.target.value)}
                  placeholder="Enter roster name"
                  className="flex-1 border border-psu-blue p-2 rounded bg-psu-white text-psu-blue focus:ring-psu-gold focus:border-psu-gold"
                />
                <button
                  onClick={saveRoster}
                  disabled={isSaving || !rosterName.trim()}
                  className="bg-psu-gold text-psu-blue font-bold px-4 py-2 rounded shadow hover:bg-psu-blue hover:text-psu-gold transition-colors disabled:bg-gray-400"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Date Range Selection */}
        <div className="mb-8 p-4 bg-psu-light-blue rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4 text-psu-gold">Select Schedule Date Range</h2>
          <div className="flex gap-4 items-center">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-psu-white mb-1">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="border border-psu-blue p-2 rounded bg-psu-white text-psu-blue focus:ring-psu-gold focus:border-psu-gold"
                min={new Date().toISOString().split('T')[0]} // Prevent selecting past dates
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-psu-white mb-1">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="border border-psu-blue p-2 rounded bg-psu-white text-psu-blue focus:ring-psu-gold focus:border-psu-gold"
                min={dateRange.startDate || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          {dateError && (
            <p className="text-red-400 text-sm mt-2">{dateError}</p>
          )}
          {dateRange.startDate && dateRange.endDate && !dateError && (
            <p className="text-psu-gold text-sm mt-2">
              Schedule will be generated for {new Date(dateRange.startDate).toLocaleDateString()} to {new Date(dateRange.endDate).toLocaleDateString()}
            </p>
          )}
          <button
            onClick={generateSchedule}
            className="mt-4 bg-psu-gold text-psu-blue font-bold px-4 py-2 rounded shadow hover:bg-psu-blue hover:text-psu-gold transition-colors disabled:bg-gray-400"
            disabled={!dateRange.startDate || !dateRange.endDate || !!dateError}
          >
            Generate Schedule
          </button>
        </div>

        {/* RA Input Section */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-psu-gold">RA List</h2>
          {/* Preference Headings Row */}
          <div className="grid grid-cols-7 gap-4 font-semibold text-sm mb-2">
            <div className="text-left text-psu-blue font-bold">RA Name</div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="text-center text-psu-blue font-bold">
                {i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} Preference
              </div>
            ))}
            <div></div>
          </div>
          {ras.map((ra, index) => (
            <div key={index} className="grid grid-cols-7 gap-4 items-center">
              <input
                type="text"
                className="border-2 border-psu-gold p-2 rounded w-full bg-psu-gold text-psu-blue font-bold focus:ring-psu-blue focus:border-psu-blue placeholder:text-psu-blue/60 shadow-md"
                placeholder="RA Name"
                value={ra.name}
                onChange={(e) => {
                  const newRAs = [...ras];
                  newRAs[index].name = e.target.value;
                  setRAs(newRAs);
                }}
              />
              {[...Array(5)].map((_, prefIndex) => (
                <select
                  key={prefIndex}
                  className="border border-psu-blue p-2 rounded w-full bg-psu-white text-psu-blue focus:ring-psu-gold focus:border-psu-gold"
                  value={ra.preferences[prefIndex]}
                  onChange={(e) => {
                    const selectedDay = e.target.value;
                    const alreadySelected = ra.preferences.includes(selectedDay);
                    if (alreadySelected) {
                      alert('This day has already been selected for this RA.');
                      return;
                    }
                    const newRAs = [...ras];
                    newRAs[index].preferences[prefIndex] = selectedDay;
                    setRAs(newRAs);
                  }}
                >
                  <option value="">Select day</option>
                  <option value="Sunday">Sunday</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                </select>
              ))}
              <button
                type="button"
                className="ml-2 px-2 py-1 rounded bg-red-500 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                onClick={() => {
                  if (ras.length > 1) {
                    setRAs(ras.filter((_, i) => i !== index));
                  }
                }}
                disabled={ras.length === 1}
                title="Delete RA"
              >
                🗑️
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setRAs([...ras, { name: '', preferences: ['', '', '', '', ''] }])
            }
            className="bg-psu-gold text-psu-blue font-bold px-4 py-2 rounded shadow hover:bg-psu-blue hover:text-psu-gold transition-colors disabled:bg-gray-400"
          >
            Add RA
          </button>
        </div>

        {/* Display the generated schedule */}
        {Object.keys(schedule).length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4 text-psu-gold">Generated Schedule</h2>
            {/* Calendar View */}
            <div className="mb-8 bg-white p-4 rounded shadow w-full max-w-4xl mx-auto">
              <Calendar
                value={calendarDate}
                onActiveStartDateChange={({ activeStartDate }) => setCalendarDate(activeStartDate || new Date())}
                tileContent={({ date, view }) => {
                  if (view !== 'month') return null;
                  const dateStr = date.toISOString().split('T')[0];
                  if (schedule[dateStr]) {
                    return (
                      <div className="mt-1 text-xs text-psu-blue font-bold">{schedule[dateStr]}</div>
                    );
                  }
                  return null;
                }}
                tileClassName={({ date, view }) => {
                  if (view !== 'month') return '';
                  const dateStr = date.toISOString().split('T')[0];
                  if (schedule[dateStr]) {
                    return 'bg-psu-gold text-psu-blue rounded-lg border border-psu-blue';
                  }
                  return '';
                }}
                className="w-full text-base"
                calendarType="gregory"
              />
            </div>

            {/* Display RA Statistics */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4 text-psu-gold">RA Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(raStats).map(([raName, stats]) => (
                  <div key={raName} className="border border-psu-blue p-4 rounded bg-psu-white shadow">
                    <div className="font-semibold text-psu-blue">{raName}</div>
                    <div>Total Shifts: <span className="font-bold text-psu-gold">{stats.totalShifts}</span></div>
                    <div className="text-sm text-psu-light-blue">
                      Preference Fulfillment:
                      {stats.preferenceFulfillment.map((count, index) => (
                        <div key={index}>
                          {index + 1}st preference: <span className="font-bold text-psu-gold">{count}</span> times
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-psu-blue mt-4">This is where coordinators will create and manage schedules.</p>
      </div>
    </div>
  );
}

