// src/app/my-team/components/TeamComparisonModal.js
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TeamComparisonModal = ({ onClose, teamData, leagueData, currentUser }) => {
  const [comparisonMetric, setComparisonMetric] = useState('capSpent');
  
  const metrics = [
    { id: 'capSpent', label: 'Cap Space Usage' },
    { id: 'qbSpend', label: 'QB Spending' },
    { id: 'rbSpend', label: 'RB Spending' },
    { id: 'wrSpend', label: 'WR Spending' },
    { id: 'teSpend', label: 'TE Spending' },
    { id: 'teamAge', label: 'Team Age' },
    { id: 'ktcValue', label: 'Team Value' },
    { id: 'valueRatio', label: 'Value Per Dollar' }
  ];
  
  // Format values for display
  const formatValue = (value, metric) => {
    if (metric.includes('Spend') || metric === 'capSpent') {
      return `$${value.toFixed(1)}`;
    } else if (metric === 'teamAge') {
      return value.toFixed(1);
    } else if (metric === 'ktcValue') {
      return value.toLocaleString();
    } else if (metric === 'valueRatio') {
      return value.toFixed(1);
    }
    return value;
  };
  
  // Create chart data based on selected metric
  const getChartData = () => {
    // Convert team data for chart
    // This is a simplified example - in a real app, you'd have actual data
    const chartData = Object.keys(leagueData || {}).map(teamName => {
      const team = leagueData[teamName];
      
      let value;
      switch (comparisonMetric) {
        case 'capSpent':
          value = team.capSpent.curYear;
          break;
        case 'qbSpend':
          value = team.positionSpend.QB;
          break;
        case 'rbSpend':
          value = team.positionSpend.RB;
          break;
        case 'wrSpend':
          value = team.positionSpend.WR;
          break;
        case 'teSpend':
          value = team.positionSpend.TE;
          break;
        case 'teamAge':
          value = team.averageAge;
          break;
        case 'ktcValue':
          // In real app, calculate KTC value from team player list
          value = Math.random() * 50000 + 30000;
          break;
        case 'valueRatio':
          // In real app, calculate from KTC value and cap spent
          value = Math.random() * 10 + 5;
          break;
        default:
          value = 0;
      }
      
      return {
        name: teamName,
        value: value,
        isCurrentUser: teamName === currentUser
      };
    });
    
    // Sort by value
    return chartData.sort((a, b) => b.value - a.value);
  };
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/80 border border-white/20 rounded p-2 text-sm">
          <p className="font-bold">{label}</p>
          <p style={{ color: payload[0].color }}>
            {metrics.find(m => m.id === comparisonMetric)?.label}: {formatValue(payload[0].value, comparisonMetric)}
          </p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#001A2B] border border-white/10 rounded-lg max-w-6xl w-full h-[80vh] shadow-2xl flex flex-col">
        <div className="bg-gradient-to-r from-[#FF4B1F]/20 to-transparent p-4 border-b border-white/10 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">League Comparison</h2>
            <p className="text-white/70 text-sm">
              Compare your team with the rest of the league
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Metric Selection */}
          <div className="flex flex-wrap gap-2 mb-6">
            {metrics.map(metric => (
              <button
                key={metric.id}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  comparisonMetric === metric.id
                    ? 'bg-[#FF4B1F] text-white'
                    : 'bg-black/20 text-white/70 hover:bg-black/30'
                }`}
                onClick={() => setComparisonMetric(metric.id)}
              >
                {metric.label}
              </button>
            ))}
          </div>
          
          {/* Chart */}
          <div className="h-[calc(100%-80px)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={getChartData()}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" horizontal={false} />
                <XAxis type="number" stroke="#fff" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#fff" 
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#3b82f6">
                  {getChartData().map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isCurrentUser ? '#FF4B1F' : '#3b82f6'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="p-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamComparisonModal;