// extract_audio.js
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import * as tar from 'tar'; // Keep namespace import
import { fetch } from 'undici';
import { fileURLToPath } from 'url';
import { Readable } from 'stream'; // <--- ADD THIS
import { finished } from 'stream/promises'; // <--- ADD THIS for cleaner handling

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const HUGGING_FACE_TOKEN = process.env.HF_TOKEN; // Read token from environment
const TAR_FILE_URL = 'https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/th/test/th_test_0.tar';
const TEMP_TAR_PATH = path.join(__dirname, 'temp_test.tar'); // Temporary download location
const EXTRACTION_DIR = path.join(__dirname, 'public', 'audio', 'th', 'clips'); // WHERE TO PUT EXTRACTED MP3s
const FILE_TO_CHECK = 'test.tsv'; // From the TSV file, adjust if needed for audio path column
// --- End Configuration ---

async function downloadFile(url, dest) {
    console.log(`Downloading ${url} to ${dest}...`);
    if (!HUGGING_FACE_TOKEN) {
        console.warn("HF_TOKEN environment variable not set. Download might fail if auth is required.");
    }
    const headers = {};
    if (HUGGING_FACE_TOKEN) {
        headers['Authorization'] = `Bearer ${HUGGING_FACE_TOKEN}`;
    }

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
             // Try to get more info from the body on error
             const responseBodyText = await response.text().catch(() => "Could not read error body.");
            throw new Error(`Failed to download TAR: ${response.status} ${response.statusText}. Body: ${responseBodyText}`);
        }
        // Ensure response body exists before proceeding
        if (!response.body) {
            throw new Error('Response body is null or undefined.');
        }

        // --- MODIFIED STREAMING LOGIC ---
        const fileStream = fs.createWriteStream(dest);

        // Convert web stream (response.body) to Node.js stream
        // Readable.fromWeb() is available in Node v16.5.0+
        const nodeReadableStream = Readable.fromWeb(response.body);

        // Use stream/promises 'finished' for cleaner promise-based handling
        // This pipes the node stream to the file stream and waits for completion/error
        await finished(nodeReadableStream.pipe(fileStream));
        // --- END MODIFIED STREAMING LOGIC ---

        console.log(`Downloaded successfully to ${dest}`);
    } catch (error) {
        console.error(`Error during download: ${error}`);
         // Attempt cleanup on error
        if (fs.existsSync(dest)) {
             console.log(`Cleaning up potentially incomplete file: ${dest}`);
             try {
                 fs.unlinkSync(dest);
             } catch (unlinkError) {
                 console.error(`Failed to clean up file: ${unlinkError}`);
             }
         }
        throw error; // Re-throw to stop the process
    }
}

async function extractTar(tarPath, destDir) {
    console.log(`Ensuring extraction directory exists: ${destDir}`);
    await fse.ensureDir(destDir); // Create directory if it doesn't exist

    console.log(`Extracting ${tarPath} to ${destDir}...`);
    try {
        await tar.x({ // Extract
            file: tarPath,
            cwd: destDir, // Change working directory to extraction target
             strip: 1, // IMPORTANT: Assuming files inside tar are like 'clips/common_voice_th_123.mp3', this removes the top 'clips' folder level. ADJUST if structure is different (e.g., strip: 0 if it's just 'common_voice_th_123.mp3' directly inside)
            filter: (filePath) => {
                // Optional: Only extract .mp3 files if the TAR contains other things
                return filePath.toLowerCase().endsWith('.mp3');
            }
        });
        console.log('Extraction complete.');
    } catch (error) {
        console.error(`Error during extraction: ${error}`);
        throw error; // Re-throw
    }
}

async function main() {
    try {
        // 1. Download the TAR file
        await downloadFile(TAR_FILE_URL, TEMP_TAR_PATH);

        // 2. Extract the TAR file
        await extractTar(TEMP_TAR_PATH, EXTRACTION_DIR);

        // 3. Clean up the downloaded TAR file
        console.log(`Cleaning up temporary file: ${TEMP_TAR_PATH}`);
        fs.unlinkSync(TEMP_TAR_PATH);

        console.log('\n-----------------------------------------');
        console.log('Audio files extracted successfully!');
        console.log(`MP3 files should now be in: ${EXTRACTION_DIR}`);
        console.log('You can now start the main server with: node server.js');
        console.log('-----------------------------------------');

    } catch (error) {
        console.error('\n-----------------------------------------');
        console.error('An error occurred during the process:');
        console.error(error.message);
        console.error('Please check the error message and your configuration (e.g., HF_TOKEN).');
         if (fs.existsSync(TEMP_TAR_PATH)) {
             console.error(`Temporary file ${TEMP_TAR_PATH} might still exist and may need manual cleanup.`);
         }
        console.error('-----------------------------------------');
        process.exit(1); // Exit with error code
    }
}

main();