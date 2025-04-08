import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetch } from 'undici'; // Use undici's fetch for reliable fetching, especially in older Node versions. Or use global fetch if on Node 18+
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000; // You can change this port if needed

// --- Configuration ---
const DATABASE_FILE = path.resolve(__dirname, 'database.db');
// URL to the specific TSV file on Hugging Face Hub
const DATASET_TSV_URL = 'https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/transcript/th/test.tsv?download=true';
const NUM_SAMPLES = 5; // Number of voices to fetch at a time
const ADMIN_PASSWORD = 'admin123'; // <<< YOUR ADMIN PASSWORD - VERY INSECURE!

console.log(`[Server Startup] Checking DB path. __dirname: ${__dirname}`);
console.log(`[Server Startup] Absolute path for DATABASE_FILE resolved to: ${DATABASE_FILE}`);

// --- Database Setup ---
const verboseSqlite3 = sqlite3.verbose();
const db = new verboseSqlite3.Database(DATABASE_FILE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voice_id TEXT NOT NULL,
            original_transcription TEXT,
            edited_transcription TEXT,
            transcription_changed INTEGER DEFAULT 0,
            noise_rating INTEGER,
            naturalness_rating INTEGER,
            pronunciation_rating INTEGER,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating table:', err.message);
            else console.log('Ratings table ready.');
        });
    }
});

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = 'admin123';


// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON request bodies
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// --- Dataset Loading (In-memory from TSV) ---
let datasetEntries = []; // Array to hold { path: string, sentence: string }

async function loadDatasetFromTSV() {
    console.log(`Fetching dataset index from: ${DATASET_TSV_URL}`);
    // --- Get token ---
    // Reads from Environment Variable
    const HUGGING_FACE_TOKEN = process.env.HF_TOKEN; // Make sure this line is exactly like this

    // --- Add Logging Here ---
    if (HUGGING_FACE_TOKEN) {
        console.log("Found HF_TOKEN environment variable.");
        // console.log("Token value (first/last chars):", HUGGING_FACE_TOKEN.substring(0, 5) + "..." + HUGGING_FACE_TOKEN.substring(HUGGING_FACE_TOKEN.length - 5)); // Optional: log partial token safely
    } else {
        console.warn("HF_TOKEN environment variable NOT found. Fetch will likely fail if auth is required.");
    }
    // --- End Logging Addition ---

    const headers = {};
    if (HUGGING_FACE_TOKEN) {
        headers['Authorization'] = `Bearer ${HUGGING_FACE_TOKEN}`;
    }

    // --- Add Logging Here ---
    console.log("Headers being sent:", JSON.stringify(headers)); // Log the actual headers object
    // --- End Logging Addition ---


    try {
        // --- Ensure fetch call includes headers ---
        const response = await fetch(DATASET_TSV_URL, {
            headers: headers // CRITICAL: Ensure 'headers: headers' is passed here
        });
        // --- End fetch modification ---

        if (!response.ok) {
            // Log the status text which might give more clues for 401 errors sometimes
            const responseBodyText = await response.text().catch(() => "Could not read error body.");
            // Add the headers to the error message for debugging
            throw new Error(`Failed to fetch TSV: ${response.status} ${response.statusText}. Headers sent: ${JSON.stringify(headers)}. Body: ${responseBodyText}`);
        }
        const tsvData = await response.text();
        console.log('TSV data fetched successfully. Parsing...');

        // ... rest of the function ...
        // Make sure the rest of the parsing logic is still there
        const lines = tsvData.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('TSV file is empty or has no data rows.');
        }
        const headerLine = lines[0];
        const headersMap = headerLine.split('\t').map(h => h.trim()); // Renamed to avoid conflict
        const pathIndex = headersMap.indexOf('path');
        const sentenceIndex = headersMap.indexOf('sentence');
        if (pathIndex === -1 || sentenceIndex === -1) {
            throw new Error(`Required columns 'path' or 'sentence' not found in TSV header: ${headersMap.join(', ')}`);
        }
        datasetEntries = lines.slice(1).map(line => {
            const columns = line.split('\t');
            if (columns.length > Math.max(pathIndex, sentenceIndex)) {
                const path = columns[pathIndex]?.trim();
                const sentence = columns[sentenceIndex]?.trim();
                if (path && sentence) {
                    return { id: path, transcription: sentence };
                }
            }
            return null;
        }).filter(entry => entry !== null);
        if (datasetEntries.length === 0) {
            console.warn("Parsing resulted in zero valid dataset entries.");
        }
        console.log(`Dataset loaded into memory. Found ${datasetEntries.length} valid entries.`);
        // --- End rest of function ---

    } catch (error) {
        console.error('Failed to load and parse dataset TSV:', error); // Error includes headers now
        datasetEntries = [];
    }
}
// --- API Endpoints ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body; // Get username/password from request body

    console.log(`[/api/login] Received login attempt for user: ${username}`);

    // --- BASIC (INSECURE) VALIDATION ---
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        console.log(`[/api/login] Login successful for user: ${username}`);
        // Send success response with username
        res.status(200).json({ success: true, username: username });
    } else {
        console.warn(`[/api/login] Login failed for user: ${username}`);
        // Send failure response
        res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }
});

// GET /api/voices - Retrieve random voice/transcription pairs from memory
app.get('/api/voices', (req, res) => {
    if (datasetEntries.length === 0) {
        // Optionally: Could attempt to reload here if desired: await loadDatasetFromTSV();
         if (datasetEntries.length === 0) { // Check again after potential reload attempt
            console.error("No dataset entries loaded in memory.");
            return res.status(500).json({ message: 'Dataset not loaded or empty. Check server logs.' });
        }
    }

    try {
        const availableIndices = datasetEntries.length;
        const numToSelect = Math.min(NUM_SAMPLES, availableIndices);
        const selectedItems = [];
        const usedIndices = new Set();

        if (numToSelect === 0) {
            return res.json([]);
        }

        while (selectedItems.length < numToSelect) {
            const randomIndex = Math.floor(Math.random() * availableIndices);
            if (!usedIndices.has(randomIndex)) {
                selectedItems.push(datasetEntries[randomIndex]);
                usedIndices.add(randomIndex);
            }
            // Safety break: prevent infinite loop if logic is flawed or dataset is smaller than expected
            if (usedIndices.size >= availableIndices) {
                break;
            }
        }

        console.log(`Sending ${selectedItems.length} voice samples.`);
        res.json(selectedItems);

    } catch (error) {
        console.error('Error selecting random voices:', error);
        res.status(500).json({ message: 'Error retrieving voice data.' });
    }
});
app.post('/api/submit', (req, res) => {
    const ratings = req.body;

    if (!Array.isArray(ratings) || ratings.length === 0) {
        return res.status(400).json({ message: 'Invalid data: Expected a non-empty array of ratings.' });
    }

    // Wrap the database operations in a Promise for better async handling
    const dbAction = new Promise((resolve, reject) => {
        db.serialize(() => {
            // Start Transaction
            db.run("BEGIN TRANSACTION;", (beginErr) => {
                if (beginErr) {
                    console.error("Error beginning transaction:", beginErr);
                    // Reject the promise immediately if BEGIN fails
                    return reject({ status: 500, message: 'Database error starting transaction.', detail: beginErr });
                }

                console.log("Transaction started."); // Log success

                const stmt = db.prepare(`INSERT INTO ratings
                    (voice_id, original_transcription, edited_transcription, transcription_changed,
                    noise_rating, naturalness_rating, pronunciation_rating, username)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`); // total 8 placeholders

                let completed = 0;
                const errors = []; // Track errors specifically from stmt.run

                // Schedule all the insert operations
                ratings.forEach((rating, index) => {
                    const changedFlag = (rating.original_transcription !== rating.edited_transcription) ? 1 : 0;
                    // Basic validation (ensure data exists before binding)
                    if (!rating.voice_id || !rating.original_transcription || rating.edited_transcription === undefined ||
                        rating.noise_rating == null || rating.naturalness_rating == null || rating.pronunciation_rating == null) { // Check for null/undefined ratings too
                        console.warn(`Item ${index}: Skipping due to missing data/rating/username for voice_id: ${rating.voice_id || 'unknown'}`);
                        errors.push(`Item ${index}: Missing data/rating/username for voice_id: ${rating.voice_id || 'unknown'}`);
                        
                        return; // Skip this invalid rating
                    }

                    stmt.run(
                        rating.voice_id,
                        rating.original_transcription,
                        rating.edited_transcription,
                        changedFlag,
                        rating.noise_rating,
                        rating.naturalness_rating,
                        rating.pronunciation_rating,
                        rating.username,
                        function (runErr) { // Use 'function' to access 'this.changes'
                            // This callback runs *after* the specific run completes
                            if (runErr) {
                                errors.push(`Item ${index} (voice_id: ${rating.voice_id}): DB Error - ${runErr.message}`);
                                console.error(`Error inserting rating for ${rating.voice_id}:`, runErr.message);
                                // Note: An error here might implicitly cause a rollback later
                            } else {
                                if (this.changes > 0) completed++;
                            }
                        }
                    );
                }); // End forEach scheduling

                // Finalize the statement AFTER the loop has scheduled all runs
                stmt.finalize((finalizeErr) => {
                     console.log("Statement finalized."); // Log finalize start
                    if (finalizeErr) {
                        // Add finalize error to the list
                        errors.push(`Database Error: Failed to finalize statement - ${finalizeErr.message}`);
                        console.error('Error finalizing statement:', finalizeErr);
                    }

                    // Now, decide whether to commit or rollback based *only* on the errors array
                    if (errors.length > 0) {
                        // Attempt to rollback because errors occurred
                        console.log(`Errors occurred (${errors.length}). Attempting rollback... Details: ${errors.join(', ')}`);
                        db.run("ROLLBACK;", (rollbackErr) => {
                            if (rollbackErr) {
                                console.error("Rollback failed:", rollbackErr);
                                // Reject with original errors + rollback error
                                reject({ status: 500, message: `Submission failed with ${errors.length} error(s) AND rollback also failed.`, detail: errors, rollbackError: rollbackErr });
                            } else {
                                console.log("Rollback successful.");
                                // Reject with original errors
                                reject({ status: 400, message: `Submission failed. ${errors.length} error(s) occurred. No ratings were saved.`, detail: errors });
                            }
                        });
                    } else {
                        // No errors during run or finalize, attempt to commit
                        console.log("No errors detected during inserts/finalize. Attempting commit...");
                        db.run("COMMIT;", (commitErr) => {
                            if (commitErr) {
                                console.error("Commit failed:", commitErr); // This is where the previous error happened
                                // Attempt rollback AFTER failed commit
                                db.run("ROLLBACK;", (rollbackErr) => {
                                    if (rollbackErr) console.error("Rollback failed after commit error:", rollbackErr);
                                     // Reject with commit error details
                                    reject({ status: 500, message: 'Database commit error.', detail: commitErr, rollbackError: rollbackErr });
                                });
                            } else {
                                console.log(`Commit successful. Inserted ${completed} ratings.`);
                                resolve({ message: `Successfully submitted ${completed} ratings.` });
                            }
                        });
                    }
                }); // End stmt.finalize callback
            }); // End BEGIN TRANSACTION callback
        }); // End db.serialize
    }); // End new Promise

    // --- Handle the Promise Outcome ---
    dbAction
        .then(result => {
            // Success case
            res.status(200).json(result);
        })
        .catch(errorInfo => {
            // Failure case (rejected promise)
            console.error("Database action promise rejected:", errorInfo); // Log the whole rejected object
            res.status(errorInfo.status || 500).json({
                message: errorInfo.message || "An unknown database error occurred.",
                errors: errorInfo.detail // Pass detailed errors back to frontend if available
            });
        });
    });

app.post('/api/download-db', (req, res) => {
    console.log('*** /api/download-db Route Handler Entered ***');
    const providedPassword = req.body.password;

    console.log("[/api/download-db] Received request.");

    if (providedPassword !== ADMIN_PASSWORD) {
        console.warn("[/api/download-db] Incorrect password attempt.");
        return res.status(401).json({ message: 'Incorrect admin password.' });
    }

    console.log("[/api/download-db] Admin password accepted.");
    console.log(`[/api/download-db] Attempting to create read stream for: ${DATABASE_FILE}`);

    try {
        // --- REMOVED the fs.existsSync check here ---

        // Set headers for file download
        res.setHeader('Content-Disposition', 'attachment; filename="database.db"');
        res.setHeader('Content-Type', 'application/vnd.sqlite3'); // Or 'application/octet-stream'

        // Create a read stream - if the file doesn't exist or isn't readable,
        // this should trigger the 'error' event below.
        const readStream = fs.createReadStream(DATABASE_FILE);

        // --- Enhanced error handling on the stream ---
        readStream.on('error', (streamErr) => {
            console.error(`[/api/download-db] ERROR ON READ STREAM for ${DATABASE_FILE}:`, streamErr); // Log the full error object

            let statusCode = 500;
            let message = 'Server error reading database file.';

            if (streamErr.code === 'ENOENT') { // Error NO ENTry (File not found)
                statusCode = 404;
                message = 'Database file not found on server (ENOENT).';
                console.error(`[/api/download-db] Confirmed file not found via stream error.`);
            } else if (streamErr.code === 'EACCES') { // Error ACCESs (Permission denied)
                 statusCode = 403; // Forbidden
                message = 'Permission denied reading database file (EACCES).';
                console.error(`[/api/download-db] Confirmed permission error via stream error.`);
            } else {
                // Log other unexpected stream errors
                console.error(`[/api/download-db] Unexpected stream error code: ${streamErr.code}`);
            }

            // Send appropriate error response if headers aren't already sent
            if (!res.headersSent) {
                res.status(statusCode).json({ message: message, code: streamErr.code });
            } else {
                console.warn('[/api/download-db] Headers already sent, cannot send detailed error response. Ending response.');
                 res.end(); // End the response if headers were somehow sent before error
            }
        });

        // Handle the end of the stream (success indication)
        readStream.on('end', () => {
            console.log("[/api/download-db] File stream finished successfully.");
            // Note: We don't explicitly end the response here, piping handles it.
        });


        // Pipe the file stream to the HTTP response stream
        readStream.pipe(res);
        console.log("[/api/download-db] Started piping read stream to response.");

    } catch (error) {
        // Catch synchronous errors during setup (e.g., createReadStream might throw immediately in some rare cases)
        console.error("[/api/download-db] Synchronous error setting up download stream:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error preparing database file for download.' });
        }
    }
    // --- End file streaming block ---
});



// Serve the main HTML file for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
// Load the dataset from TSV first, then start listening
loadDatasetFromTSV().then(() => {
    if (datasetEntries.length === 0) {
         console.warn("Server starting, but dataset is empty or failed to load. /api/voices will return errors.");
    }
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Database file: ${path.resolve(DATABASE_FILE)}`);
        console.log(`Serving static files from: ${__dirname}`);
    });
}).catch(err => {
    console.error("Critical error during initial dataset load. Server cannot start properly.", err);
    process.exit(1); // Exit if the initial load fails critically
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server and DB connection.');
    db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');
        process.exit(0);
    });
});