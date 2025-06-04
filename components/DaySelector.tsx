import React from 'react';
import type { DayOfWeek } from '../pages/roster';

const ALL_DAYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DaySelectorProps {
  selectedDays: DayOfWeek[];
  onChange: (selectedDays: DayOfWeek[]) => void;
}

const DaySelector: React.FC<DaySelectorProps> = ({ selectedDays, onChange }) => {
  const handleDayChange = (day: DayOfWeek) => {
    if (day === '') return;

    const newSelectedDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day];
    
    const orderedSelectedDays = ALL_DAYS.filter(d => newSelectedDays.includes(d));
    onChange(orderedSelectedDays);
  };

  return (
    <div className="p-4 border rounded-md shadow-sm mb-4">
      <h3 className="text-lg font-semibold mb-2 text-gray-700">Select Days to Include:</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {ALL_DAYS.map(day => (
          <label key={day} className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={selectedDays.includes(day)}
              onChange={() => handleDayChange(day)}
              className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{day}</span>
          </label>
        ))}
      </div>
      {selectedDays.length === 0 && (
        <p className="text-sm text-red-500 mt-2">
          Warning: No days selected. The solver will not be able to generate a schedule.
        </p>
      )}
      {selectedDays.length > 0 && selectedDays.includes('') && (
        <p className="text-xs text-orange-500 mt-1">
          Note: The empty string '' is part of DayOfWeek type but won't be selectable.
        </p>
      )}
    </div>
  );
};

export default DaySelector; 