document.addEventListener('DOMContentLoaded', () => {
        // Labeling Form Elements
    const voiceList = document.getElementById('voice-list');
    const loadingIndicator = document.getElementById('loading');
    const form = document.getElementById('labeling-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitStatus = document.getElementById('submit-status');
    const voiceItemTemplate = document.getElementById('voice-item-template');

        // Download Section Elements
    const downloadPasswordInput = document.getElementById('download-password');
    const downloadDbBtn = document.getElementById('download-db-btn');
    const downloadStatus = document.getElementById('download-status');

        // Login Section
    const loginSection = document.getElementById('login-section');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const loginStatus = document.getElementById('login-status');

        // Main Content Section
    const mainContentSection = document.getElementById('main-content');
    const loggedInUsernameSpan = document.getElementById('logged-in-username');
    const logoutBtn = document.getElementById('logout-btn');


    // --- Configuration ---
    // Base URL for fetching audio files from Hugging Face dataset viewer
    // Adjust if the dataset path or repo changes.
    const AUDIO_BASE_URL = "public/audio/th/clips/";

    let currentUser = null; // Track logged-in user ('admin' or null)
    
    const labelingForm = document.getElementById('labeling-form');

    // --- Functions ---
    
    function showLoginScreen() {
        loginSection.style.display = 'block';
        mainContentSection.style.display = 'none';
        currentUser = null; // Clear user on showing login
        loginStatus.textContent = ''; // Clear any previous login errors
        usernameInput.value = ''; // Clear fields
        passwordInput.value = '';
    }

    function showMainScreen(username) {
        loginSection.style.display = 'none';
        mainContentSection.style.display = 'block';
        currentUser = username; // Set current user
        loggedInUsernameSpan.textContent = username;
        // Fetch initial voices only when showing main screen
        fetchVoices();
    }
    async function handleLogin(event) {
        event.preventDefault();
        const username = usernameInput.value;
        const password = passwordInput.value;
        loginStatus.textContent = ''; // Clear status
        loginBtn.disabled = true;

        if (!username || !password) {
            loginStatus.textContent = 'Please enter username and password.';
            loginBtn.disabled = false;
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Login successful
                showMainScreen(result.username); // Show main content, pass username
            } else {
                // Login failed
                loginStatus.textContent = result.message || 'Login failed.';
            }
        } catch (error) {
            console.error("Login fetch error:", error);
            loginStatus.textContent = 'Network error during login.';
        } finally {
            loginBtn.disabled = false;
        }
    }

    // Logout Button Click
    function handleLogout() {
        console.log("Logging out...");
        // Simply show the login screen, which clears the user state
        showLoginScreen();
        // Optionally clear voice list etc. if desired
        voiceList.innerHTML = '';
        submitStatus.textContent = '';
        downloadStatus.textContent = '';
    }

        // Function to Initialize sliders for a voice item ---
    function initializeSlidersForItem(voiceItemElement, safeVoiceId) {
        const sliders = voiceItemElement.querySelectorAll('.rating-slider');

        sliders.forEach(slider => {
            const container = slider.closest('.rating-slider-container'); // Find parent container
            const valueDisplay = container?.querySelector('.rating-value');
            const ratingType = slider.dataset.ratingType; // e.g., 'noise'
            // Construct the CORRECT dynamic radio button name base
            const baseRadioName = `${ratingType}-rating-${safeVoiceId}`;

            // Function to update display and check the correct radio button
            const updateRating = (value) => {
                if (valueDisplay) {
                    valueDisplay.textContent = value;
                }
                // Find the specific radio button with the correct dynamic name AND value
                const radioToCheck = voiceItemElement.querySelector(`input[name="${baseRadioName}"][value="${value}"]`);
                if (radioToCheck) {
                    radioToCheck.checked = true;
                    // console.log(`Checked radio: name=${baseRadioName}, value=${value}`); // Debug log
                } else {
                    // console.warn(`Could not find radio: name=${baseRadioName}, value=${value}`); // Debug log
                }
            };

            // Initial setup
            updateRating(slider.value);
            if(valueDisplay) valueDisplay.textContent = slider.value; // Ensure display matches initial value

            // Listener for slider input
            slider.addEventListener('input', function() {
                updateRating(this.value);
                if (valueDisplay) valueDisplay.classList.add('active'); // Show value on interaction
            });

            // Optional: Show/hide value display on hover (keep if you like the effect)
            if (valueDisplay) {
                slider.addEventListener('mouseenter', () => valueDisplay.classList.add('active'));
                slider.addEventListener('mouseleave', () => {
                     // Small delay to allow thumb interaction
                    setTimeout(() => {
                        // Check if slider is still being actively dragged
                        if (!slider.matches(':active')) {
                            valueDisplay.classList.remove('active');
                        }
                    }, 300);
                });
                 // Keep display active while dragging
                slider.addEventListener('mousedown', () => valueDisplay.classList.add('active'));
                slider.addEventListener('mouseup', () => valueDisplay.classList.remove('active'));

            }
        });
    }
    // Function to fetch voices from the backend
    async function fetchVoices() {
        console.log("fetchVoices: Starting...");
        showLoading(true);
        clearStatus();
        voiceList.innerHTML = '';
        submitBtn.disabled = true;
    
        try { // Start Try Block
            console.log("fetchVoices: Inside try block, before fetch."); // Log: Before fetch
            const response = await fetch('/api/voices');
            console.log("fetchVoices: Fetch response received, status:", response.status); // Log: After fetch
    
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const voices = await response.json();
            console.log("fetchVoices: Parsed voices JSON. Number of voices:", voices.length); // Log: After JSON parse
    
            if (voices.length === 0) {
                console.log("fetchVoices: No voices received from server."); // Log: No voices case
                voiceList.innerHTML = '<p>No voices found.</p>';
                 showLoading(false); // Hide loading if no voices
                return;
            }
    
            console.log("fetchVoices: About to start voices.forEach loop."); // Log: Before loop
            voices.forEach((voice, index) => { // Add index for logging
                console.log(`fetchVoices: Starting loop iteration ${index + 1}, Voice ID: ${voice?.id}`); // Log: Loop iteration start
    
                // Check if essential voice data exists
                if (!voice || typeof voice.id === 'undefined' || typeof voice.transcription === 'undefined') {
                    console.error(`fetchVoices: Skipping iteration ${index + 1} due to missing data:`, voice);
                     return; // Skip this iteration
                }

                const safeVoiceId = String(voice.id).replace(/[^a-zA-Z0-9]/g, '_');
                console.log(`fetchVoices: Iteration ${index + 1}: Safe ID = ${safeVoiceId}`);
    
                console.log(`fetchVoices: Iteration ${index + 1}: Cloning template.`); // Log: Before template clone
                const templateClone = voiceItemTemplate.content.cloneNode(true);
    
                console.log(`fetchVoices: Iteration ${index + 1}: Querying elements.`); // Log: Before querySelector
                const voiceItemElement = templateClone.querySelector('.voice-item');
                const audioPlayer = templateClone.querySelector('.audio-player');
                const originalTranscriptionElement = templateClone.querySelector('.original-transcription'); // Use different name temporarily
                const editedTranscription = templateClone.querySelector('.edited-transcription');
                const ratingGroups = templateClone.querySelectorAll('.rating-group');
    
                // Check if elements were found
                if (!voiceItemElement || !audioPlayer || !originalTranscriptionElement || !editedTranscription) {
                    console.error(`fetchVoices: Skipping iteration ${index + 1} because a required element was not found in the template clone.`);
                     return; // Skip this iteration
                }
                 console.log(`fetchVoices: Iteration ${index + 1}: Elements queried successfully.`); // Log: After querySelector
    
                voiceItemElement.dataset.voiceId = voice.id;
    
                const audioUrl = `${AUDIO_BASE_URL}${voice.id}`;
                console.log(`fetchVoices: Iteration ${index + 1}: Setting audio src to: ${audioUrl}`); // Log: Before setting src
                audioPlayer.src = audioUrl;
    
                audioPlayer.onerror = () => {
                    console.error(`ERROR: Failed to load audio from: ${audioUrl}`);
                    const existingErrorMsg = audioPlayer.nextElementSibling;
                    if (!existingErrorMsg || existingErrorMsg.tagName !== 'P' || !existingErrorMsg.textContent.startsWith('Error loading')) {
                        const errorMsg = document.createElement('p');
                        errorMsg.textContent = 'Error loading audio file.';
                        errorMsg.style.color = 'var(--error-color)';
                        audioPlayer.parentNode.insertBefore(errorMsg, audioPlayer.nextSibling);
                    }
                };
    
                console.log(`fetchVoices: Iteration ${index + 1}: Setting original transcription text.`); // Log: Before setting textContent
                originalTranscriptionElement.textContent = voice.transcription; // Use the element variable
    
                console.log(`fetchVoices: Iteration ${index + 1}: Setting edited transcription value.`); // Log: Before setting value
                editedTranscription.value = voice.transcription;
    
                console.log(`fetchVoices: Iteration ${index + 1}: Setting up ratings.`); // Log: Before ratings setup
                ratingGroups.forEach((group) => { // Removed index here as it's not needed
                    const radios = group.querySelectorAll('input[type="radio"]');
                    if (radios.length > 0) { // Check if radios exist before accessing name
                        const baseName = radios[0].name;
                        radios.forEach(radio => {
                             // Make ID filename-safe for names - Ensure voice.id is a string
                            const safeId = String(voice.id).replace(/[^a-zA-Z0-9]/g, '_');
                            radio.name = `${baseName}-${safeId}`;
                        });
                    } else {
                        console.warn(`fetchVoices: Iteration ${index + 1}: No radio buttons found in a rating group.`);
                    }
                });
                initializeSlidersForItem(voiceItemElement, safeVoiceId);
                console.log(`fetchVoices: Iteration ${index + 1}: Appending item to voiceList.`); // Log: Before appendChild
                voiceList.appendChild(templateClone);
                console.log(`fetchVoices: Finished loop iteration ${index + 1}`); // Log: Loop iteration end
            }); // End of voices.forEach
    
            console.log("fetchVoices: Finished voices.forEach loop successfully."); // Log: After loop success
    
        } catch (error) { // Catch Block
            console.error('fetchVoices: Error caught in try block:', error); // Log: Error caught
            // Now log the error object that was caught
            console.error('fetchVoices: The caught error object is:', error); // Explicitly log the error object
            voiceList.innerHTML = '<p style="color: var(--error-color);">Failed to load voices. Please try again later.</p>';
            setStatus('Error loading voices.', true);
        } finally { // Finally Block
            console.log("fetchVoices: Entering finally block."); // Log: Entering finally
            showLoading(false);
            submitBtn.disabled = (voiceList.children.length === 0); // Disable submit only if list is truly empty
             console.log("fetchVoices: Exiting finally block."); // Log: Exiting finally
        }
         console.log("fetchVoices: Function end."); // Log: Function end
    } // End of fetchVoices function
    
    async function handleDownloadDatabase() { // <<<< DEFINITION IS HERE
        const password = downloadPasswordInput.value;
        downloadStatus.textContent = ''; // Clear previous status
        downloadStatus.className = '';

        if (!password) {
            downloadStatus.textContent = 'Please enter the admin password.';
            downloadStatus.className = 'error';
            return;
        }


        const requestUrl = '/api/download-db'; // Store in variable for logging
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
        };
        console.log(`>>> Sending fetch request to: ${requestUrl}`, requestOptions);


        console.log("Attempting DB download...");
        downloadDbBtn.disabled = true; // Disable button during attempt
        downloadStatus.textContent = 'Checking password...';

        try {
            const response = await fetch(requestUrl, requestOptions);;

            if (response.ok) {
                console.log("Password accepted, initiating download...");
                downloadStatus.textContent = 'Password accepted! Downloading...';
                downloadStatus.className = 'success';

                const contentDisposition = response.headers.get('content-disposition');
                let filename = 'database.db';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
                    if (filenameMatch && filenameMatch.length > 1) {
                        filename = filenameMatch[1];
                    }
                }
                console.log("Downloading filename:", filename);

                const blob = await response.blob();
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                downloadStatus.textContent = 'Download initiated successfully!';

            } else {
                const errorData = await response.json().catch(() => ({ message: `Server error (${response.status})` }));
                console.error('Download failed:', response.status, errorData.message);
                downloadStatus.textContent = `Download failed: ${errorData.message || 'Unknown error'}`;
                downloadStatus.className = 'error'; // Ensure error class is set
            }

        } catch (error) {
            console.error('Network error during download attempt:', error);
            downloadStatus.textContent = 'Network error. Could not reach server.';
            downloadStatus.className = 'error'; // Ensure error class is set
        } finally {
            downloadPasswordInput.value = '';
            downloadDbBtn.disabled = false;
        }
    }
    
    async function handleSubmit(event) {
        event.preventDefault();
        console.log("handleSubmit: Entered function, preventDefault called.");
        if (!currentUser) {
            setStatus('Error: Not logged in. Please refresh.', true);
            return; // Should not happen if UI is controlled correctly
    }
        clearStatus();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    
        const ratingsData = [];
        const voiceItems = voiceList.querySelectorAll('.voice-item');
        let allValid = true; // Assume valid initially
    
        console.log("handleSubmit: Starting validation loop...");
        // --- Validation Loop ---
        voiceItems.forEach((item, index) => {
            const voiceId = item.dataset.voiceId;
            const safeVoiceId = String(voiceId).replace(/[^a-zA-Z0-9]/g, '_');
    
            // Check if the checked radio button exists for each group
            const noiseRadio = item.querySelector(`input[name="noise-rating-${safeVoiceId}"]:checked`);
            const naturalnessRadio = item.querySelector(`input[name="naturalness-rating-${safeVoiceId}"]:checked`);
            const pronunciationRadio = item.querySelector(`input[name="pronunciation-rating-${safeVoiceId}"]:checked`);
    
            // Log validation check results
            console.log(`handleSubmit (Validation): Item ${index} (ID: ${voiceId}) - Checked radios found:`, {
                noise: !!noiseRadio,
                naturalness: !!naturalnessRadio,
                pronunciation: !!pronunciationRadio
            });
    
            if (!noiseRadio || !naturalnessRadio || !pronunciationRadio) {
                console.warn(`handleSubmit (Validation): Item ${index} FAILED validation.`);
                item.style.border = '2px solid var(--error-color)';
                allValid = false; // Mark as invalid
                // Keep the loop running to validate and highlight all items
            } else {
                item.style.border = '1px solid var(--border-color)'; // Reset border if valid
            }
        }); // End of Validation Loop
        console.log(`handleSubmit: Finished validation loop. allValid = ${allValid}`);
    
        // --- Check if validation passed overall ---
        if (!allValid) {
            console.log("handleSubmit: Validation failed overall. Aborting.");
            setStatus('Please complete all ratings.', true); // General message now
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Ratings';
            return; // Exit the handler
        }
    
        // --- Data Gathering Loop (Only if allValid is true) ---
        console.log("handleSubmit: All items validated. Starting data gathering loop.");
        let gatheringErrorOccurred = false; // Flag for errors during this specific loop
        voiceItems.forEach((item, index) => {
            // Skip gathering if an error already happened in this phase for robustness
            if (gatheringErrorOccurred) return;
    
            try {
                const voiceId = item.dataset.voiceId;
                console.log(`handleSubmit (Gathering): Processing item ${index} (ID: ${voiceId})`);
                const originalTranscription = item.querySelector('.original-transcription').textContent;
                const editedTranscription = item.querySelector('.edited-transcription').value;
                const safeVoiceId = String(voiceId).replace(/[^a-zA-Z0-9]/g, '_');
    
                // --- Re-query and explicitly check elements before accessing .value ---
                const noiseRatingInput = item.querySelector(`input[name="noise-rating-${safeVoiceId}"]:checked`);
                const naturalnessRatingInput = item.querySelector(`input[name="naturalness-rating-${safeVoiceId}"]:checked`);
                const pronunciationRatingInput = item.querySelector(`input[name="pronunciation-rating-${safeVoiceId}"]:checked`);
    
                // This check SHOULD always pass if allValid was true, but double-check
                if (!noiseRatingInput || !naturalnessRatingInput || !pronunciationRatingInput) {
                    console.error(`handleSubmit (Gathering): CRITICAL ERROR - Missing checked input for item ${index} (ID: ${voiceId}) even though allValid was true! This indicates a bug.`);
                    setStatus(`Internal error processing item #${index + 1}. Please refresh and retry.`, true);
                    gatheringErrorOccurred = true; // Set flag to stop further processing
                    return; // Skip adding this item
                }
    
                // Now it should be safe to access .value
                const noiseRating = noiseRatingInput.value;
                const naturalnessRating = naturalnessRatingInput.value;
                const pronunciationRating = pronunciationRatingInput.value;
    
                console.log(`handleSubmit (Gathering): Item ${index} - Values found:`, { noiseRating, naturalnessRating, pronunciationRating });
    
                ratingsData.push({
                    voice_id: voiceId,
                    original_transcription: originalTranscription,
                    edited_transcription: editedTranscription.trim(),
                    noise_rating: parseInt(noiseRating, 10),
                    naturalness_rating: parseInt(naturalnessRatingInput.value, 10),
                    pronunciation_rating: parseInt(pronunciationRatingInput.value, 10),
                    username: currentUser
                });
                console.log(`handleSubmit (Gathering): Item ${index} pushed. ratingsData length now: ${ratingsData.length}`);
    
            } catch (error) {
                console.error('handleSubmit: Error caught during submission fetch/processing:', error); // << ADD LOG HERE
                setStatus(`Submission failed: ${error.message}`, true);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Ratings';
            }
        }); // End of Data Gathering Loop
        console.log(`handleSubmit: Finished data gathering loop. ratingsData length: ${ratingsData.length}. gatheringErrorOccurred = ${gatheringErrorOccurred}`);
    

        
    
        // --- Final Checks ---
        if (gatheringErrorOccurred) {
            console.log("handleSubmit: Errors occurred during data gathering. Aborting submission.");
            // Status message should have been set during the loop error handling
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Ratings';
            return;
        }
    
        // If no errors occurred during gathering, but the array is empty (and it shouldn't be)
        if (ratingsData.length === 0 && voiceItems.length > 0) {
            console.error("handleSubmit: CRITICAL - Data gathering finished without errors, but ratingsData is empty!");
            setStatus('Internal error: Could not gather rating data.', true);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Ratings';
            return;
        }
    
        // Optional: Warning if counts don't match (might happen if an error occurred but didn't stop everything)
        if (ratingsData.length !== voiceItems.length && !gatheringErrorOccurred) {
            console.warn(`handleSubmit: Warning - Number of items submitted (${ratingsData.length}) does not match number displayed (${voiceItems.length}).`);
        }
    
        console.log("handleSubmit: Proceeding to submit data:", ratingsData);
    
        // --- Proceed with fetch submission ---
        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ratingsData),
            });
    
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown server error' }));
                throw new Error(`HTTP error! Status: ${response.status} - ${errorData.message}`);
            }
    
            const result = await response.json();
            setStatus(result.message || 'Ratings submitted successfully!', false);
            // Fetch new voices only on successful submission
            //await fetchVoices();
            console.log("handleSubmit: Submission successful. fetchVoices() call SKIPPED for debugging.");
    
        } catch (error) {
            console.error('Error submitting ratings:', error);
            setStatus(`Submission failed: ${error.message}`, true);
            submitBtn.disabled = false; // Re-enable button on submission failure
            submitBtn.textContent = 'Submit Ratings';
        }
        // Note: fetchVoices handles button state on successful submission/reload
        console.log("handleSubmit: Reached end of function execution.");
    } // End of handleSubmit function

        
    // Helper to show/hide loading indicator
    function showLoading(isLoading) {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
    }

     // Helper to set status message
    function setStatus(message, isError = false) {
        submitStatus.textContent = message;
        submitStatus.className = isError ? 'error' : 'success';
    }

     // Helper to clear status message
    function clearStatus() {
        submitStatus.textContent = '';
        submitStatus.className = '';
    }
    
    // --- Event Listeners ---
    console.log("DOMContentLoaded: Attaching listeners (checking flags)...");

    // login form listener
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log("Attached 'submit' listener to login form.");
    } else {
        console.error("ERROR: Login form not found!");
    }

    // logout button listener
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        console.log("Attached 'click' listener to logout button.");
    } else {
        console.error("ERROR: Logout button not found!");
    }

        
    

    if (form) { // Check if form exists before adding listener
        form.addEventListener('submit', handleSubmit);
        console.log("Attached 'submit' listener to form.");
    } else {
        console.error("ERROR: Labeling form not found!");
    }

    if (downloadDbBtn) { // Check if button exists before adding listener
        downloadDbBtn.addEventListener('click', () => { // Use arrow function for logging clarity
            console.log("Download DB button clicked!"); // <<<< ADD THIS LOG
            handleDownloadDatabase(); // Call the actual handler
        });
        console.log("Attached 'click' listener to download DB button."); // <<<< ADD THIS LOG
    } else {
        console.error("ERROR: Download DB button not found!");
    }
    // --- Initial Load ---
    showLoginScreen();
    fetchVoices();
});