#!/usr/bin/env node
/**
 * Print Agent - Local service that polls the cloud server for print jobs
 * and sends them to the local thermal printer.
 *
 * Usage:
 *   node print-agent.js
 *
 * Environment variables:
 *   API_URL - The cloud server URL (default: https://cloud.homation.us)
 *   PRINTER_IP - The local printer IP address (default: 192.168.8.100)
 *   PRINTER_PORT - The printer port (default: 9100)
 *   POLL_INTERVAL - How often to check for jobs in ms (default: 3000)
 */

const net = require('net');

// Configuration
const API_URL = process.env.API_URL || 'https://cloud.homation.us';
const PRINTER_IP = process.env.PRINTER_IP || '192.168.8.100';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '3000', 10);

console.log('='.repeat(50));
console.log('Print Agent Starting...');
console.log('='.repeat(50));
console.log(`API URL: ${API_URL}`);
console.log(`Printer: ${PRINTER_IP}:${PRINTER_PORT}`);
console.log(`Poll Interval: ${POLL_INTERVAL}ms`);
console.log('='.repeat(50));

// Send content to thermal printer via TCP socket
async function sendToPrinter(content) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Printer connection timeout'));
    }, 10000);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      const buffer = Buffer.from(content, 'utf8');

      socket.write(buffer, () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.destroy();
      reject(err);
    });
  });
}

// Fetch pending print jobs from the server
async function fetchPendingJobs() {
  try {
    const response = await fetch(`${API_URL}/api/print-jobs/pending?printerId=main`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching jobs:', error.message);
    return [];
  }
}

// Mark job as completed
async function markJobComplete(jobId) {
  try {
    const response = await fetch(`${API_URL}/api/print-jobs/${jobId}/complete`, {
      method: 'POST',
    });

    if (!response.ok) {
      console.error(`Failed to mark job ${jobId} complete: ${response.status}`);
    }
  } catch (error) {
    console.error(`Error marking job ${jobId} complete:`, error.message);
  }
}

// Mark job as failed
async function markJobFailed(jobId, errorMessage) {
  try {
    const response = await fetch(`${API_URL}/api/print-jobs/${jobId}/failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errorMessage }),
    });

    if (!response.ok) {
      console.error(`Failed to mark job ${jobId} as failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`Error marking job ${jobId} as failed:`, error.message);
  }
}

// Process a single print job
async function processJob(job) {
  console.log(`\n[${new Date().toLocaleTimeString()}] Processing job: ${job.jobId}`);

  try {
    await sendToPrinter(job.content);
    await markJobComplete(job.jobId);
    console.log(`  ✓ Job ${job.jobId} printed successfully`);
    return true;
  } catch (error) {
    console.error(`  ✗ Job ${job.jobId} failed: ${error.message}`);
    await markJobFailed(job.jobId, error.message);
    return false;
  }
}

// Main polling loop
async function pollForJobs() {
  const jobs = await fetchPendingJobs();

  if (jobs.length > 0) {
    console.log(`\n[${new Date().toLocaleTimeString()}] Found ${jobs.length} pending job(s)`);

    for (const job of jobs) {
      await processJob(job);
      // Small delay between prints
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// Start the agent
async function start() {
  console.log(`\n[${new Date().toLocaleTimeString()}] Agent running. Press Ctrl+C to stop.\n`);

  // Initial poll
  await pollForJobs();

  // Start polling interval
  setInterval(pollForJobs, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down print agent...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down print agent...');
  process.exit(0);
});

// Run the agent
start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
