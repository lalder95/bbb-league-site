// src/utils/csvUtils.js

/**
 * Utility functions for handling CSV files
 */

import Papa from 'papaparse';

/**
 * Read and parse a CSV file with robust error handling
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<{data: Array, errors: Array}>} - Parsed data and any errors
 */
export async function readCSV(filePath) {
  try {
    // Fetch the CSV file
    const response = await fetch(filePath);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${response.status} ${response.statusText}`);
    }
    
    const csvText = await response.text();
    
    if (!csvText || csvText.trim() === '') {
      throw new Error(`CSV file is empty: ${filePath}`);
    }
    
    // Return a promise to handle Papa Parse's callback-based API
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log(`CSV parsed successfully: ${results.data.length} rows, ${results.errors.length} errors`);
          
          // Log sample data for debugging
          if (results.data.length > 0) {
            console.log('Sample headers:', Object.keys(results.data[0]));
            console.log('First row sample:', results.data[0]);
          }
          
          resolve(results);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error in readCSV:', error);
    throw error;
  }
}

/**
 * Process contract data from CSV
 * @param {Array} rawData - Raw data from CSV
 * @returns {Array} - Processed contract data
 */
export function processContractData(rawData) {
  if (!rawData || !Array.isArray(rawData)) {
    console.error('Invalid data provided to processContractData:', rawData);
    return [];
  }
  
  return rawData.map(row => {
    // Log an example row to help debug column names
    if (rawData.indexOf(row) === 0) {
      console.log('Processing row with keys:', Object.keys(row));
    }
    
    // Check for required fields and use safer parsing
    const processedRow = {
      // Always include original data
      ...row,
      
      // Parse numerical values with fallbacks
      ktcValue: parseInt(row['Current KTC Value']) || 0,
      age: parseInt(row['Age']) || 0,
      year1Salary: parseFloat(row['Year 1 Salary']) || 0,
      year2Salary: parseFloat(row['Year 2 Salary']) || 0,
      year3Salary: parseFloat(row['Year 3 Salary']) || 0,
      year4Salary: parseFloat(row['Year 4 Salary']) || 0,
      
      // Handle string values
      position: row['Position'] || '',
      contractType: row['Contract Type'] || '',
      status: row['Status'] || 'Unknown',
      playerName: row['Player Name'] || 'Unknown Player',
      teamDisplayName: row['TeamDisplayName'] || '',
      playerId: row['Player ID'] || `unknown-${Math.random().toString(36).substring(2, 9)}`
    };
    
    return processedRow;
  });
}

/**
 * Get sample team data when real data isn't available
 * @returns {Array} - Sample contract data
 */
export function getSampleTeamData() {
  return [
    {
      playerName: "Patrick Mahomes",
      position: "QB",
      age: 29,
      year1Salary: 60,
      year2Salary: 66,
      year3Salary: 72.6,
      year4Salary: 79.9,
      ktcValue: 7163,
      status: "Active",
      playerId: "4046",
      teamDisplayName: "Sample Team"
    },
    {
      playerName: "Justin Jefferson",
      position: "WR",
      age: 25,
      year1Salary: 41,
      year2Salary: 45.1,
      year3Salary: 49.7,
      year4Salary: 54.7,
      ktcValue: 9570,
      status: "Active",
      playerId: "6794",
      teamDisplayName: "Sample Team"
    },
    {
      playerName: "Bijan Robinson",
      position: "RB",
      age: 23,
      year1Salary: 45,
      year2Salary: 49.5,
      year3Salary: 54.5,
      year4Salary: 60,
      ktcValue: 8080,
      status: "Active",
      playerId: "9509",
      teamDisplayName: "Sample Team"
    }
  ];
}