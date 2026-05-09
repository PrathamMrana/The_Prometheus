import React from 'react';

export const SparkSvg = ({ data, color, fillOpacity = 0.1 }) => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((p, i) => `${(i / (data.length - 1)) * 100},${100 - ((p - min) / range) * 100}`);
    const pathData = `M ${pts.join(' L ')}`;
    const fillData = `${pathData} L 100,100 L 0,100 Z`;
    
    return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible">
            <defs>
                <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={fillOpacity}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
            </defs>
            <path d={fillData} fill={`url(#grad-${color.replace('#', '')})`} stroke="none" />
            <path d={pathData} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};
