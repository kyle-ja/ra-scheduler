import React, { useEffect, useRef, useState } from 'react';

interface SmoothProgressBarProps {
  taskComplete: boolean;
  duration?: number; // in seconds, default 10
  className?: string;
}

const SmoothProgressBar: React.FC<SmoothProgressBarProps> = ({ taskComplete, duration = 30, className }) => {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (taskComplete) {
      setProgress(100);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    
    setProgress(0);
    const start = Date.now();
    
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      
      // Use an easing function that slows down as it approaches the end
      // This creates a more realistic progression that won't mislead users
      let percent;
      
      if (elapsed < duration * 0.6) {
        // First 60% of the time: progress steadily to 40%
        percent = (elapsed / (duration * 0.6)) * 40;
      } else if (elapsed < duration * 0.8) {
        // Next 20% of the time: progress from 40% to 60%
        const progressInPhase = (elapsed - (duration * 0.6)) / (duration * 0.2);
        percent = 40 + (progressInPhase * 20);
      } else if (elapsed < duration * 0.95) {
        // Next 15% of the time: progress from 60% to 75%
        const progressInPhase = (elapsed - (duration * 0.8)) / (duration * 0.15);
        percent = 60 + (progressInPhase * 15);
      } else {
        // Final 5% of the time: progress very slowly from 75% to 85% and then stop
        const progressInPhase = (elapsed - (duration * 0.95)) / (duration * 0.05);
        percent = Math.min(75 + (progressInPhase * 10), 85);
      }
      
      setProgress(Math.min(percent, 85)); // Cap at 85% until task is complete
      
      // Don't clear the interval - let it continue running slowly at the end
    }, 100); // Update every 100ms for smoother animation
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskComplete, duration]);

  // Jump to 100% when taskComplete
  useEffect(() => {
    if (taskComplete) {
      setProgress(100);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [taskComplete]);

  return (
    <div className={`w-44 h-2 bg-gray-200 rounded-full overflow-hidden ${className || ''}`.trim()}>
      <div
        className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export default SmoothProgressBar; 