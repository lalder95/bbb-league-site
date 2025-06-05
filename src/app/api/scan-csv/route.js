// src/app/api/scan-csv/route.js
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Only scan the public/data directory
    const dir = 'public/data';
    let csvFiles = [];

    try {
      const dirPath = path.join(process.cwd(), dir);
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        if (file.toLowerCase().endsWith('.csv')) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);

          csvFiles.push({
            path: `/data/${file}`,
            absolutePath: filePath,
            size: stats.size,
            directory: dir
          });
        }
      }
    } catch (err) {
      // Skip if directory doesn't exist
      if (err.code !== 'ENOENT') {
        console.error(`Error scanning directory ${dir}:`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      files: csvFiles,
      message: `Found ${csvFiles.length} CSV files`
    });
  } catch (error) {
    console.error('Error scanning for CSV files:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        message: 'Failed to scan for CSV files'
      }, 
      { status: 500 }
    );
  }
}