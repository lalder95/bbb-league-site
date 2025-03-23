'use client';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const FutureCapChart = ({ contracts }) => {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    if (!contracts || contracts.length === 0) {
      setData([]);
      return;
    }
    
    // Calculate yearly cap totals
    const yearlyTotals = {
      'Current Year': 0,
      'Year 2': 0,
      'Year 3': 0,
      'Year 4': 0
    };
    
    contracts.forEach(contract => {
      yearlyTotals['Current Year'] += parseFloat(contract.CurYear) || 0;
      yearlyTotals['Year 2'] += parseFloat(contract.Year2) || 0;
      yearlyTotals['Year 3'] += parseFloat(contract.Year3) || 0;
      yearlyTotals['Year 4'] += parseFloat(contract.Year4) || 0;
    });
    
    // Convert to array format needed for chart
    const chartData = [
      {
        name: 'Current Year',
        value: yearlyTotals['Current Year'],
        fill: '#22c55e' // green
      },
      {
        name: 'Year 2',
        value: yearlyTotals['Year 2'],
        fill: '#eab308' // yellow
      },
      {
        name: 'Year 3',
        value: yearlyTotals['Year 3'],
        fill: '#f97316' // orange
      },
      {
        name: 'Year 4',
        value: yearlyTotals['Year 4'],
        fill: '#ef4444' // red
      }
    ];
    
    setData(chartData);
  }, [contracts]);
  
  // Format currency for the tooltip
  const formatCurrency = (value) => {
    return `$${value.toFixed(1)}`;
  };
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#001A2B] border border-white/10 rounded p-3">
          <p className="font-bold">{label}</p>
          <p>Cap Space: {formatCurrency(payload[0].value)}</p>
          <p>% of Cap: {((payload[0].value / 300) * 100).toFixed(1)}%</p>
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
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 20
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
        <XAxis dataKey="name" stroke="#fff" />
        <YAxis 
          stroke="#fff" 
          domain={[0, 300]} 
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar 
          dataKey="value" 
          radius={[4, 4, 0, 0]}
          maxBarSize={60}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
        <Legend formatter={(value) => <span className="text-white">Cap Commitments</span>} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default FutureCapChart;