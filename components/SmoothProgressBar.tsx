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
      let percent = Math.min((elapsed / duration) * 95, 95);
      setProgress(percent);
      if (percent >= 95) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 16); // ~60fps
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