import React, { useState, useEffect, useRef } from 'react';

export const PriceFlash = ({ value, prefix, className }) => {
  const [flash, setFlash] = useState("");
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current || value === null) return;
    setFlash(value > prevValue.current ? "bg-bull/30 text-bull" : "bg-bear/30 text-bear");
    prevValue.current = value;
    
    const t = setTimeout(() => setFlash(""), 300);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span className={`transition-colors duration-300 rounded px-1 -ml-1 ${flash} ${className}`}>
      {prefix}{value !== null && value !== undefined ? value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
    </span>
  );
};
