'use client';
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const PositionSpendingChart = ({ contracts }) => {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    if (!contracts || contracts.length === 0) {
      setData([]);
      return;
    }
    
    // Calculate spending by position
    const positionTotals = {};
    
    contracts.forEach(contract => {
      const position = contract.Position;
      const value = parseFloat(contract.CurYear) || 0;
      
      if (!positionTotals[position]) {
        positionTotals[position] = 0;
      }
      
      positionTotals[position] += value;
    });
    
    // Convert to array format needed for chart
    const chartData = Object.keys(positionTotals).map(position => ({
      name: position,
      value: positionTotals[position]
    }));
    
    setData(chartData);
  }, [contracts]);
  
  // Position-based colors
  const POSITION_COLORS = {
    'QB': '#ef4444', // red
    'RB': '#3b82f6', // blue
    'WR': '#22c55e', // green
    'TE': '#a855f7', // purple
    'K': '#6b7280',  // gray
    'DEF': '#64748b' // slate
  };
  
  // Default colors for other positions
  const DEFAULT_COLORS = ['#f97316', '#eab308', '#ec4899', '#14b8a6'];
  
  const getPositionColor = (position) => {
    return POSITION_COLORS[position] || DEFAULT_COLORS[0];
  };
  
  // Format currency for the tooltip
  const formatCurrency = (value) => {
    return `$${value.toFixed(1)}`;
  };
  
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#001A2B] border border-white/10 rounded p-3">
          <p className="font-bold">{payload[0].name}</p>
          <p>Amount: {formatCurrency(payload[0].value)}</p>
          <p>Percentage: {((payload[0].value / data.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };
  
  // If no data, show placeholder
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-white/70">No contract data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          fill="#8884d8"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getPositionColor(entry.name)} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          layout="horizontal"
          verticalAlign="bottom"
          align="center"
          formatter={(value) => <span className="text-white">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default PositionSpendingChart;