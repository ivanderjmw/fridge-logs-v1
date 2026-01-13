<script>
    import { onMount, onDestroy } from 'svelte';
    import { db } from '../firebase';
    import { doc, deleteDoc, collection, addDoc, onSnapshot, updateDoc } from 'firebase/firestore';
    import { uploadBytes } from "firebase/storage";
    import { GoogleGenAI } from "@google/genai";

    // Feature flags
    const enableAILogging = import.meta.env.VITE_ENABLE_AI_LOGGING === 'true';

    // Infinite scroll state
    const ITEMS_PER_PAGE = 20;
    let displayLimit = ITEMS_PER_PAGE;
    let loadingMore = false;

    let items = [];
    let loggerName = '';
    let itemName = '';
    let bestBefore = ''; // Optional field
    let imageURL = '';
    let quantity = 1; // New field
    let type = 'fridge'; // New field
    let shared = false; // New field
    let isSubmitting = false;
    let imageFile = null;
    let finalImageData = null;

    let filterName = ''; // For dropdown filter
    let sortBy = 'dateAdded'; // Sorting: 'qty', 'dateAdded', 'bestBefore'
    let filterFreezer = false; // Filter by freezer
    let filterShared = false; // Filter by shared

    // Predefined list of names
    const names = ["JT", "JK", "AT", "JM", "IJ"];

    // Splash screen state
    let showSplash = true;
    let pinEntered = false;
    let userInput = '';
    let jumbledLetters = [];
    let selectedUser = '';
    let pinError = '';
    const CORRECT_PIN = 'tp';

    // AI Logging state
    let showCameraPopup = false;
    let showVerificationPopup = false;
    let videoStream = null;
    let capturedImageForAI = null;
    let aiAnalyzing = false;
    let aiError = '';

    // Edit popup state
    let showEditPopup = false;
    let editingItem = null;
    let editData = {
        itemName: '',
        bestBefore: '',
        quantity: 1,
        type: 'fridge',
        shared: false
    };
    let aiSuggestedData = {
        itemName: '',
        bestBefore: '',
        quantity: 1,
        type: 'fridge',
        shared: false
    };

    // Cookie functions
    function setCookie(name, value, days = 365) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
    }

    function getCookie(name) {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=');
            return parts[0] === name ? decodeURIComponent(parts[1]) : r;
        }, '');
    }

    function deleteCookie(name) {
        setCookie(name, '', -1);
    }

    // Generate jumbled letters containing 'tp' and 4 random letters
    function generateJumbledLetters() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        const randomLetters = [];
        
        // Add 4 random letters (excluding 't' and 'p')
        const availableLetters = alphabet.split('').filter(l => l !== 't' && l !== 'p');
        for (let i = 0; i < 4; i++) {
            const randomIndex = Math.floor(Math.random() * availableLetters.length);
            randomLetters.push(availableLetters[randomIndex]);
            availableLetters.splice(randomIndex, 1);
        }
        
        // Insert 't' and 'p' at random positions
        const tPosition = Math.floor(Math.random() * (randomLetters.length + 1));
        randomLetters.splice(tPosition, 0, 't');
        
        const pPosition = Math.floor(Math.random() * (randomLetters.length + 1));
        randomLetters.splice(pPosition, 0, 'p');
        
        return randomLetters;
    }

    function selectLetter(letter) {
        if (userInput.length < 2) {
            userInput += letter;
            pinError = '';
        }
    }

    function clearInput() {
        userInput = '';
        pinError = '';
    }

    function verifyPin() {
        if (userInput.toLowerCase() === CORRECT_PIN) {
            pinEntered = true;
            pinError = '';
        } else {
            pinError = 'Incorrect PIN. Please try again.';
            userInput = '';
        }
    }

    function selectUserAndEnter(userName) {
        selectedUser = userName;
        setCookie('fridgeLoggerName', userName);
        showSplash = false;
    }

    function resetUser() {
        deleteCookie('fridgeLoggerName');
        selectedUser = '';
        showSplash = true;
        pinEntered = false;
        userInput = '';
        jumbledLetters = generateJumbledLetters();
    }

    // ------------------------------------------
    // 🔑 NEW: 2A. Image Handling Function
    // ------------------------------------------

    /**
     * Handles file input change and stores the file in state.
     * @param {Event} event
     */
     function handleFileChange(event) {
        // Get the first file from the input (usually only one)
        const file = event.target.files[0]; 
        
        if (file) {
            imageFile = file;
        } else {
            imageFile = null;
        }
    }

    // ------------------------------------------
    // 🔑 UPDATED: 2B. Combined Upload & Log Function
    // ------------------------------------------

    /**
     * Uploads the file to Storage, gets the URL, and logs the item to Firestore.
     * @param {Object} itemData - The item data excluding the image URL
     */
    // NOTE: You will need a utility function to convert a File/Blob to a base64 string.
    // For example:
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Only the base64 part
        reader.onerror = error => reject(error);
    });

    async function getImageBase64() {
        console.log("Get image base64");

        try {
            if (imageFile) {
                // Resize the image before converting (Optional, but highly recommended 
                // due to Firestore's 1MB document size limit)
                const resizedImageFile = await resizeImage(imageFile, 600, 600); // Smaller resize for embedding

                // 1. Convert the resized image File/Blob into a base64 string
                //    This base64 string will represent the "bytes field" you requested.
                finalImageData = await fileToBase64(resizedImageFile); 
                console.log('Image converted to base64 string.', finalImageData);
            }

            return "data:image/jpeg;base64," + finalImageData;
        } catch (error) {
            // Since we removed Firebase Storage calls, errors will mainly be from 
            // resizing, base64 conversion, or the addDoc call.
            console.error("Error converting or logging item:", error);
        }
    }

    /**
     * Resizes an image file to the specified dimensions.
     * @param {File} file - The image file to resize.
     * @param {number} maxWidth - The maximum width of the resized image.
     * @param {number} maxHeight - The maximum height of the resized image.
     * @returns {Promise<File>} - A promise that resolves to the resized image file.
     */
    function resizeImage(file, maxWidth, maxHeight) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let width = img.width;
                    let height = img.height;

                    // Calculate the new dimensions while maintaining the aspect ratio
                    if (width > maxWidth || height > maxHeight) {
                        if (width > height) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        } else {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert the canvas to a Blob
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const resizedFile = new File([blob], file.name, { type: file.type });
                            resolve(resizedFile);
                        } else {
                            reject(new Error("Canvas is empty"));
                        }
                    }, file.type);
                };
                img.onerror = (error) => reject(error);
                img.src = event.target.result;
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }

    async function logItemToFirestore(newItem) {
        if (isSubmitting) return;
        isSubmitting = true;

        try {
            const { id, ...dataToSave } = newItem;
            const docRef = await addDoc(collection(db, "items"), {
                ...dataToSave,
                createdAt: new Date().toISOString(),
                bestBefore: bestBefore || null // Make bestBefore optional
            });
            console.log("Document written with ID: ", docRef.id);

            loggerName = '';
            itemName = '';
            bestBefore = '';
            imageURL = '';
            quantity = 1;
            type = 'fridge';
            shared = false;
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Failed to log item to Firestore.");
        } finally {
            isSubmitting = false;
        }
    }

    async function removeItemFromFirestore(itemId) {
        try {
            const itemRef = doc(db, 'items', itemId);
            await deleteDoc(itemRef);
        } catch (error) {
            console.error('Error removing item:', error);
        }
    }

    async function updateItemQuantity(itemId, newQuantity) {
        try {
            const itemRef = doc(db, 'items', itemId);
            await updateDoc(itemRef, { quantity: newQuantity });
        } catch (error) {
            console.error('Error updating item quantity:', error);
        }
    }

    function openEditPopup(item) {
        editingItem = item;
        editData = {
            itemName: item.itemName,
            bestBefore: item.bestBefore || '',
            quantity: item.quantity,
            type: item.type,
            shared: item.shared
        };
        showEditPopup = true;
    }

    function closeEditPopup() {
        showEditPopup = false;
        editingItem = null;
        editData = {
            itemName: '',
            bestBefore: '',
            quantity: 1,
            type: 'fridge',
            shared: false
        };
    }

    async function saveEdit() {
        if (!editingItem || isSubmitting) return;
        isSubmitting = true;

        try {
            const itemRef = doc(db, 'items', editingItem.id);
            await updateDoc(itemRef, {
                itemName: editData.itemName,
                bestBefore: editData.bestBefore || null,
                quantity: editData.quantity,
                type: editData.type,
                shared: editData.shared
            });
            closeEditPopup();
        } catch (error) {
            console.error('Error updating item:', error);
            alert('Failed to update item.');
        } finally {
            isSubmitting = false;
        }
    }

    function calculateTimeDelta(createdAt) {
        const now = new Date();
        const createdDate = new Date(createdAt);
        const deltaMilliseconds = now - createdDate;

        const deltaDays = Math.floor(deltaMilliseconds / (1000 * 60 * 60 * 24));
        const deltaHours = Math.floor((deltaMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const deltaMinutes = Math.floor((deltaMilliseconds % (1000 * 60 * 60)) / (1000 * 60));

        return `${deltaDays} days, ${deltaHours} hours, ${deltaMinutes} minutes ago`;
    }

    onMount(() => {
        // Check if user is already stored in cookie
        const storedUser = getCookie('fridgeLoggerName');
        if (storedUser && names.includes(storedUser)) {
            selectedUser = storedUser;
            showSplash = false;
        } else {
            // Generate jumbled letters for PIN
            jumbledLetters = generateJumbledLetters();
        }

        const unsubscribe = onSnapshot(collection(db, "items"), (snapshot) => {
            items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timeDelta: calculateTimeDelta(doc.data().createdAt) // Calculate time delta
            }));
            // Sort items by oldest `createdAt`
            items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        });

        // Set up infinite scroll listener
        window.addEventListener('scroll', handleScroll);

        return () => {
            unsubscribe();
            window.removeEventListener('scroll', handleScroll);
        };
    });

    function handleScroll() {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;
        const clientHeight = window.innerHeight;
        
        // Load more when user is within 200px of the bottom
        if (scrollTop + clientHeight >= scrollHeight - 200 && !loadingMore) {
            loadMore();
        }
    }

    function loadMore() {
        const filteredCount = items.filter(item => 
            (!filterName || item.name === filterName) &&
            (!filterFreezer || item.type === 'freezer') &&
            (!filterShared || item.shared)
        ).length;
        
        if (displayLimit < filteredCount) {
            loadingMore = true;
            // Simulate a small delay for smoother UX
            setTimeout(() => {
                displayLimit += ITEMS_PER_PAGE;
                loadingMore = false;
            }, 300);
        }
    }

    function resetDisplayLimit() {
        displayLimit = ITEMS_PER_PAGE;
    }

    // Reset display limit when filters change
    $: filterName, filterFreezer, filterShared, sortBy, resetDisplayLimit();

    async function handleSubmit() {
        if (!loggerName || !itemName || isSubmitting) {
            if (!isSubmitting) {
                alert('Please fill in all required fields.');
            }
            return;
        }

        const newItem = {
            id: Date.now().toString(),
            name: loggerName,
            itemName: itemName,
            bestBefore: bestBefore,
            imageBase64: await getImageBase64(),
            quantity: quantity,
            type: type,
            shared: shared
        };

        logItemToFirestore(newItem);
    }

    function increaseQuantity(item) {
        const newQuantity = item.quantity + 1;
        updateItemQuantity(item.id, newQuantity);
    }

    function decreaseQuantity(item) {
        if (item.quantity > 1) {
            const newQuantity = item.quantity - 1;
            updateItemQuantity(item.id, newQuantity);
        }
    }

    function formatBestBefore(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // AI Logging Functions
    async function openCamera() {
        showCameraPopup = true;
        aiError = '';
        
        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            aiError = 'Camera not supported. Please use HTTPS or a supported browser.';
            showCameraPopup = false;
            return;
        }
        
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            
            // Wait for next tick to ensure video element exists
            setTimeout(() => {
                const videoElement = document.getElementById('camera-video');
                if (videoElement && videoStream) {
                    videoElement.srcObject = videoStream;
                }
            }, 100);
        } catch (error) {
            console.error('Error accessing camera:', error);
            aiError = 'Failed to access camera. Please check permissions.';
            showCameraPopup = false;
        }
    }

    function closeCamera() {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        showCameraPopup = false;
        // Don't clear capturedImageForAI here - it's needed for verification popup
    }

    function captureImage() {
        const videoElement = document.getElementById('camera-video');
        if (!videoElement || !videoElement.videoWidth) {
            aiError = 'Camera not ready. Please try again.';
            return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        capturedImageForAI = imageData;
        closeCamera();
        analyzeImageWithAI(imageData);
    }

    async function analyzeImageWithAI(imageData) {
        aiAnalyzing = true;
        aiError = '';
        
        if (!imageData) {
            aiError = 'No image captured. Please try again.';
            aiAnalyzing = false;
            return;
        }
        
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            if (!apiKey || apiKey === 'your-gemini-api-key-here') {
                throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.');
            }

            // Initialize Google GenAI client
            const ai = new GoogleGenAI({ apiKey });

            // Remove data URL prefix to get base64 string
            const base64Image = imageData.split(',')[1];

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `Analyze this image of a food item and provide the following information in JSON format:
{
  "itemName": "name of the food item",
  "bestBefore": "estimated best before date in YYYY-MM-DD format (estimate based on typical shelf life, use today's date as reference: ${new Date().toISOString().split('T')[0]})",
  "quantity": estimated quantity as a number,
  "type": "fridge" or "freezer" (determine based on the type of food),
  "shared": true or false (guess if this is likely a shared item based on packaging size)
}

Provide ONLY the JSON object, no additional text.`
                            },
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ]
            });

            const textResponse = response.text;

            console.log(response);
            console.log(textResponse);
            
            // Extract JSON from response (may be wrapped in markdown code blocks)
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsedData = JSON.parse(jsonMatch[0]);
                aiSuggestedData = {
                    itemName: parsedData.itemName || '',
                    bestBefore: parsedData.bestBefore || '',
                    quantity: parsedData.quantity || 1,
                    type: parsedData.type || 'fridge',
                    shared: parsedData.shared || false
                };
                showVerificationPopup = true;
            } else {
                throw new Error('Could not parse AI response');
            }
        } catch (error) {
            console.error('Error analyzing image:', error);
            aiError = error.message;
        } finally {
            aiAnalyzing = false;
        }
    }

    function closeVerificationPopup() {
        showVerificationPopup = false;
        capturedImageForAI = null;
        aiSuggestedData = {
            itemName: '',
            bestBefore: '',
            quantity: 1,
            type: 'fridge',
            shared: false
        };
    }

    async function submitAILog() {
        if (isSubmitting) return;
        isSubmitting = true;

        try {
            // Convert the captured image to base64 for storage
            const base64Image = capturedImageForAI;

            const newItem = {
                id: Date.now().toString(),
                name: selectedUser || loggerName,
                itemName: aiSuggestedData.itemName,
                bestBefore: aiSuggestedData.bestBefore,
                imageBase64: base64Image,
                quantity: aiSuggestedData.quantity,
                type: aiSuggestedData.type,
                shared: aiSuggestedData.shared
            };

            const { id, ...dataToSave } = newItem;
            const docRef = await addDoc(collection(db, "items"), {
                ...dataToSave,
                createdAt: new Date().toISOString(),
                bestBefore: aiSuggestedData.bestBefore || null
            });
            console.log("Document written with ID: ", docRef.id);

            closeVerificationPopup();
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Failed to log item to Firestore.");
        } finally {
            isSubmitting = false;
        }
    }
</script>

<style>
    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f4f7f6;
        padding: 10px;
        margin: 0;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }
    
    :global(*) {
        box-sizing: border-box;
    }
    
    :global(button, a, input, select, textarea) {
        touch-action: manipulation;
    }
    
    h1, h2 {
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    
    @media (max-width: 768px) {
        h1 {
            font-size: 1.5em;
        }
        
        h2 {
            font-size: 1.2em;
        }
    }

    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 15px;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        width: 100%;
        overflow-x: hidden;
    }
    
    @media (max-width: 768px) {
        .container {
            padding: 10px;
            border-radius: 0;
        }
    }

    /* --- Form Styles --- */
    .item-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        padding: 20px;
        margin-bottom: 30px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        background-color: #fafafa;
    }
    
    @media (max-width: 768px) {
        .item-form {
            grid-template-columns: 1fr;
            padding: 15px;
            gap: 12px;
        }
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    label {
        font-weight: 600;
        margin-bottom: 5px;
        color: #333;
        font-size: 0.9em;
    }

    input[type="text"],
    input[type="date"],
    button {
        padding: 12px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 16px;
        width: 100%;
        box-sizing: border-box;
        height: 44px;
        line-height: 1.5;
    }
    
    input[type="date"]::-webkit-calendar-picker-indicator {
        cursor: pointer;
    }
    
    @media (max-width: 768px) {
        input[type="text"],
        input[type="date"],
        button {
            padding: 14px;
            font-size: 16px;
            height: 48px;
        }
    }

    button {
        grid-column: 1 / -1; /* Span across both columns */
        background-color: #2196F3;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: background-color 0.3s;
    }

    button:hover {
        background-color: #0b7dda;
    }

    /* --- List Styles --- */
    .item-list {
        list-style: none;
        padding: 0;
        margin: 0;
        width: 100%;
    }

    .item-card {
        display: flex;
        align-items: flex-start;
        margin-bottom: 10px;
        padding: 15px;
        background-color: #ffffff;
        border-bottom: 1px solid #eee;
        flex-wrap: wrap;
        gap: 10px;
    }

    .item-card * {
        margin: 0;
    }
    
    @media (max-width: 768px) {
        .item-card {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            grid-template-rows: repeat(2, 105px);
            gap: 0px 16px;
            padding: 12px;
        }
    }

    .item-image {
        width: 200px;
        height: 200px;
        object-fit: cover;
        border-radius: 4px;
        margin-right: 15px;
        flex-shrink: 0;
    }
    
    @media (max-width: 768px) {
        .item-image {
            width: 100%;
            height: auto;
            max-height: 210px;
            margin-right: 0;
            grid-row: span 2 / span 2;
            align-self: center;
        }
    }

    .item-details {
        flex-grow: 1;
        
        
        min-width: 0;
        border-radius: 1em;
        padding: 1em;
        font-size: small;
    }
    
    @media (max-width: 768px) {
        .item-details {
            padding: 0.5em;
            width: 100%;
        }
    }

    .item-name {
        font-weight: 700;
        font-size: 1.1em;
        color: #1a1a1a;
        margin: 0;
    }
    
    #best-before {
        font-weight: 600;
        color: #d9534f; /* Red for emphasis */
        font-size: 0.9em;
        padding: 0;
    }

    .best-before {
        font-weight: 600;
        color: #d9534f; /* Red for emphasis */
        font-size: 0.9em;
    }

    .logged-by {
        color: #666;
        font-size: 0.85em;
        margin-top: 2px;
    }

    .empty-message {
        text-align: center;
        color: #999;
        padding: 40px;
        border: 1px dashed #ccc;
        border-radius: 4px;
    }

    /* Infinite scroll styles */
    .loading-more {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        color: #667eea;
        font-weight: 500;
    }

    .loading-more span {
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    .load-more-hint {
        text-align: center;
        padding: 15px;
        color: #888;
        font-size: 0.9em;
    }

    select {
        width: 100%;
        padding: 12px;
        margin: 8px 0;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 16px;
        background-color: #fff;
        color: #333;
        height: 44px;
        box-sizing: border-box;
    }

    select:focus {
        outline: none;
        border-color: #007BFF;
        box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
    }
    
    @media (max-width: 768px) {
        select {
            padding: 14px;
            font-size: 16px;
            height: 48px;
        }
    }

    /* Filter controls styles */
    .filter-controls {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
        padding: 15px;
        background-color: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
    }

    .filter-row {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        align-items: center;
    }

    .filter-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
        flex: 1;
        min-width: 120px;
    }

    .filter-group label {
        font-weight: 600;
        font-size: 0.85em;
        color: #555;
    }

    .filter-group select {
        margin: 0;
    }

    .checkbox-filter {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 15px;
        background-color: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
    }

    .checkbox-filter:hover {
        border-color: #007BFF;
        background-color: #f0f7ff;
    }

    .checkbox-filter input[type="checkbox"] {
        margin: 0;
        transform: scale(1.2);
        cursor: pointer;
    }

    .checkbox-filter input[type="checkbox"]:checked + span {
        color: #007BFF;
    }

    @media (max-width: 768px) {
        .filter-row {
            flex-direction: column;
            align-items: stretch;
        }

        .filter-group {
            width: 100%;
        }

        .checkbox-filter {
            justify-content: center;
        }
    }

    /* Checkbox styles */
    .form-group input[type="checkbox"] {
        margin-right: 10px;
        transform: scale(1.2);
        cursor: pointer;
    }

    .form-group label[for="shared"] {
        display: flex;
        align-items: center;
        font-size: 16px;
        color: #333;
    }
    
    /* File input styles */
    .form-group input[type="file"] {
        padding: 8px;
        width: 100%;
        font-size: 14px;
    }
    
    @media (max-width: 768px) {
        .form-group input[type="file"] {
            padding: 10px 8px;
            font-size: 16px;
        }
        
        .form-group input[type="checkbox"] {
            transform: scale(1.5);
        }
    }

    /* Quantity input styles */
    .form-group input[type="number"] {
        width: 100%;
        padding: 12px;
        margin: 8px 0;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 16px;
        background-color: #fff;
        color: #333;
        height: 44px;
        box-sizing: border-box;
    }

    .form-group input[type="number"]:focus {
        outline: none;
        border-color: #007BFF;
        box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
    }
    
    @media (max-width: 768px) {
        .form-group input[type="number"] {
            padding: 14px;
            font-size: 16px;
            height: 48px;
        }
    }

    /* Splash screen styles */
    .splash-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    }

    .splash-content {
        background: white;
        padding: 40px;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
        max-width: 500px;
        width: 90%;
    }
    
    @media (max-width: 768px) {
        .splash-content {
            padding: 25px;
            width: 95%;
            max-width: 100%;
        }
    }

    .splash-content h1 {
        margin-bottom: 30px;
        color: #333;
    }

    .pin-input-display {
        font-size: 2em;
        font-weight: bold;
        letter-spacing: 10px;
        margin: 20px 0;
        min-height: 50px;
        color: #333;
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        border: 2px solid #667eea;
    }

    .letter-buttons {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 10px;
        margin: 20px 0;
        width: 100%;
        box-sizing: border-box;
    }

    .letter-btn {
        padding: 20px 10px;
        font-size: 1.5em;
        font-weight: bold;
        background-color: #ffffff;
        border: 2px solid #495057;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        color: #212529;
        width: 100% !important;
        min-height: 60px;
        box-sizing: border-box;
    }

    .letter-btn:hover {
        background-color: #667eea;
        color: white;
        border-color: #667eea;
    }

    .letter-btn:active {
        transform: scale(0.95);
    }

    .pin-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }

    .pin-actions button {
        flex: 1;
        padding: 12px;
        font-size: 1em;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
    }

    .clear-btn {
        background-color: #ff6b6b;
        color: white;
    }

    .clear-btn:hover {
        background-color: #ee5a52;
    }

    .verify-btn {
        background-color: #51cf66;
        color: white;
    }

    .verify-btn:hover {
        background-color: #40c057;
    }

    .verify-btn:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }

    .user-selection {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 20px;
    }

    .user-btn {
        padding: 15px;
        font-size: 1.2em;
        font-weight: bold;
        background-color: #ffffff;
        border: 2px solid #495057;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        color: #212529;
    }

    .user-btn:hover {
        background-color: #667eea;
        color: white;
        border-color: #667eea;
    }

    .error-message {
        color: #ff6b6b;
        margin-top: 10px;
        font-weight: 600;
    }

    .reset-btn {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        background-color: #868e96;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9em;
        z-index: 100;
        max-width: fit-content;
    }

    .reset-btn:hover {
        background-color: #495057;
    }
    
    @media (max-width: 768px) {
        .reset-btn {
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            font-size: 0.8em;
            height: fit-content;
        }
    }

    /* AI Logging styles */
    .ai-button {
        grid-column: 1 / -1;
        background-color: #9775fa;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: background-color 0.3s;
        padding: 10px;
        border: 1px solid #9775fa;
        border-radius: 4px;
        font-size: 1em;
    }

    .ai-button:hover {
        background-color: #845ef7;
    }


    .popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    }

    .popup-content {
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
        position: relative;
        -webkit-overflow-scrolling: touch;
    }
    
    @media (max-width: 768px) {
        .popup-content {
            padding: 20px;
            max-width: 95%;
            max-height: 95%;
            border-radius: 8px;
        }
    }

    .camera-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
    }

    #camera-video {
        width: 100%;
        max-width: 640px;
        border-radius: 8px;
    }

    .camera-buttons {
        display: flex;
        gap: 10px;
        width: 100%;
    }
    
    @media (max-width: 768px) {
        .camera-buttons {
            flex-direction: column;
        }
    }

    .capture-btn {
        padding: 12px 24px;
        background-color: #51cf66;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1em;
        cursor: pointer;
        min-height: 44px;
    }

    .capture-btn:hover {
        background-color: #40c057;
    }
    
    @media (max-width: 768px) {
        .capture-btn {
            width: 100%;
            padding: 16px;
        }
    }

    .cancel-btn {
        padding: 12px 24px;
        background-color: #868e96;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1em;
        cursor: pointer;
        min-height: 44px;
    }

    .cancel-btn:hover {
        background-color: #495057;
    }
    
    @media (max-width: 768px) {
        .cancel-btn {
            width: 100%;
            padding: 16px;
        }
    }

    .verification-container {
        width: 500px;
        max-width: 90vw;
    }
    
    @media (max-width: 768px) {
        .verification-container {
            width: 100%;
            max-width: 100%;
        }
    }

    .verification-container h2 {
        margin-bottom: 20px;
        color: #333;
    }

    .preview-image {
        width: 100%;
        max-height: 300px;
        object-fit: contain;
        border-radius: 8px;
        margin-bottom: 20px;
    }

    .verification-form {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .verification-form input,
    .verification-form select {
        width: 100%;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1em;
    }

    .verification-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }
    
    @media (max-width: 768px) {
        .verification-actions {
            flex-direction: column;
        }
    }

    .submit-btn {
        flex: 1;
        padding: 12px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1em;
        cursor: pointer;
        font-weight: bold;
        min-height: 44px;
    }

    .submit-btn:hover {
        background-color: #0b7dda;
    }
    
    @media (max-width: 768px) {
        .submit-btn {
            width: 100%;
            padding: 16px;
        }
    }

    .loading-spinner {
        text-align: center;
        padding: 40px;
        color: #667eea;
        font-size: 1.2em;
    }

    .ai-error {
        color: #ff6b6b;
        padding: 15px;
        background-color: #ffe0e0;
        border-radius: 6px;
        margin: 10px 0;
    }
    
    /* Item card action buttons */
    .item-actions {
        display: flex;
        gap: 8px;
        width: 100%;
        margin-top: 10px;
    }
    
    .item-actions button {
        flex: 1;
        padding: 10px;
        font-size: 14px;
        /* min-height: 44px; */
        white-space: nowrap;
    }
    
    @media (max-width: 768px) {
        .item-actions {
            flex-wrap: wrap;
            grid-column-start: 2;
            align-self: end;
        }
        
        .item-actions button {
            min-width: calc(50% - 4px);
            height: 30px;
            padding: 5px;
        }
    }
    
    /* Quantity buttons */
    .quantity-btn {
        background-color: #28a745;
        color: white;
        border: none;
        font-weight: bold;
        font-size: 1.2em;
    }
    
    .quantity-btn:hover {
        background-color: #218838;
    }

    .edit-btn {
        background-color: #ffc107;
        color: white;
        border: none;
        font-weight: bold;
    }
    
    .edit-btn:hover {
        background-color: #e0a800;
    }
    
    .remove-btn {
        background-color: #dc3545;
        color: white;
        border: none;
    }
    
    .remove-btn:hover {
        background-color: #c82333;
    }

    /* Edit popup styles */
    .edit-container {
        display: flex;
        flex-direction: column;
        gap: 15px;
        min-width: 300px;
    }

    .edit-container h2 {
        margin: 0 0 10px 0;
        color: #333;
    }

    .edit-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .edit-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .edit-form label {
        font-weight: 600;
        color: #333;
    }

    .edit-form input,
    .edit-form select {
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1em;
    }

    .edit-actions {
        display: flex;
        gap: 10px;
        margin-top: 15px;
    }

    .edit-actions button {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 6px;
        font-size: 1em;
        cursor: pointer;
        font-weight: bold;
    }

    .save-btn {
        background-color: #28a745;
        color: white;
    }

    .save-btn:hover {
        background-color: #218838;
    }
</style>

{#if showSplash}
    <div class="splash-overlay">
        <div class="splash-content">
            {#if !pinEntered}
                <h1>🔐 Enter PIN</h1>
                <p>Select 2 letters to form the PIN</p>
                
                <div class="pin-input-display">
                    {userInput.toUpperCase() || '_ _'}
                </div>

                <div class="letter-buttons">
                    {#each jumbledLetters as letter}
                        <button class="letter-btn" on:click={() => selectLetter(letter)}>
                            {letter.toUpperCase()}
                        </button>
                    {/each}
                </div>

                {#if pinError}
                    <p class="error-message">{pinError}</p>
                {/if}

                <div class="pin-actions">
                    <button class="clear-btn" on:click={clearInput}>Clear</button>
                    <button class="verify-btn" on:click={verifyPin} disabled={userInput.length !== 2}>Verify</button>
                </div>
            {:else}
                <h1>👤 Select Your Name</h1>
                <p>Choose your name to continue</p>
                
                <div class="user-selection">
                    {#each names as name}
                        <button class="user-btn" on:click={() => selectUserAndEnter(name)}>
                            {name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

{#if !showSplash}
    <button class="reset-btn" on:click={resetUser}>Reset User</button>
{/if}

<div class="container">
    <h1>📦 Fridge & Pantry Logger</h1>

    <form class="item-form" on:submit|preventDefault={handleSubmit}>
        <h2>Log a New Item</h2>

        <div class="form-group">
            <label for="logger-name">Your Name</label>
            <select id="logger-name" bind:value={loggerName}>
                <option value="" disabled selected>Select a name</option>
                {#each names as name}
                    <option value={name}>{name}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label for="item-name">Item Name</label>
            <input id="item-name" type="text" bind:value={itemName} placeholder="E.g., Organic Bananas" required>
        </div>

        <div class="form-group">
            <label for="best-before">Best Before Date</label>
            <input id="best-before" type="date" bind:value={bestBefore}>
        </div>

        <div class="form-group">
            <label for="quantity">Quantity</label>
            <input id="quantity" type="number" bind:value={quantity} min="1" required>
        </div>

        <div class="form-group">
            <label for="type">Type</label>
            <select id="type" bind:value={type}>
                <option value="fridge">Fridge</option>
                <option value="freezer">Freezer</option>
            </select>
        </div>

        <div class="form-group">
            <label for="shared">Shared</label>
            <input id="shared" type="checkbox" bind:checked={shared}>
        </div>

            
        <div class="form-group">
            <label for="image">Image:</label>
            <input type="file" id="image" accept="image/*" on:change={handleFileChange} />
        </div>


        <button type="submit"  class="log-button">Log Item</button>
        {#if enableAILogging}
            <button type="button" class="ai-button" on:click={openCamera}>📸 Log with AI</button>
        {/if}
    </form>

    <hr>

    <h2>Sort & Filter</h2>
    <div class="filter-controls">
        <div class="filter-row">
            <div class="filter-group">
                <label for="sort-by">Sort by:</label>
                <select id="sort-by" bind:value={sortBy}>
                    <option value="dateAdded">Date Added</option>
                    <option value="qty">Quantity</option>
                    <option value="bestBefore">Best Before</option>
                </select>
            </div>
            
            <div class="filter-group">
                <label for="filter-name">Owner:</label>
                <select id="filter-name" bind:value={filterName}>
                    <option value="">All</option>
                    {#each Array.from(new Set(items.map(item => item.name))) as name}
                        <option value={name}>{name}</option>
                    {/each}
                </select>
            </div>
        </div>
        
        <div class="filter-row">
            <label class="checkbox-filter">
                <input type="checkbox" bind:checked={filterFreezer}>
                <span>❄️ Freezer only</span>
            </label>
            
            <label class="checkbox-filter">
                <input type="checkbox" bind:checked={filterShared}>
                <span>👥 Shared only</span>
            </label>
        </div>
    </div>

    <h2>Logged Items ({items.filter(item => 
        (!filterName || item.name === filterName) &&
        (!filterFreezer || item.type === 'freezer') &&
        (!filterShared || item.shared)
    ).length})</h2>

    {#if items.length > 0}
        {@const filteredItems = items
            .filter(item => 
                (!filterName || item.name === filterName) &&
                (!filterFreezer || item.type === 'freezer') &&
                (!filterShared || item.shared)
            )
            .sort((a, b) => {
                if (sortBy === 'qty') return b.quantity - a.quantity;
                if (sortBy === 'bestBefore') {
                    if (!a.bestBefore) return 1;
                    if (!b.bestBefore) return -1;
                    return new Date(a.bestBefore) - new Date(b.bestBefore);
                }
                return new Date(a.createdAt) - new Date(b.createdAt);
            })}
        <ul class="item-list">
            {#each filteredItems.slice(0, displayLimit) as item (item.id)}
                <li class="item-card">
                    <img class="item-image" src={item.imageBase64} alt={item.itemName}>
                    
                    <div class="item-details">
                        <p class="item-name">{item.itemName}</p>
                        <p class="best-before">Best Before: {formatBestBefore(item.bestBefore)}</p>
                        <p class="logged-by">Logged by: {item.name}</p>
                        <p>{item.quantity + " pc" + (item.quantity > 0 ? "s" : "")} / {item.type} / {item.shared ? 'Shared' : 'Personal'}</p>
                        <p>Age: {item.timeDelta}</p>
                    </div>
                    
                    <div class="item-actions">
                        <button class="quantity-btn" on:click={() => decreaseQuantity(item)}>−</button>
                        <button class="quantity-btn" on:click={() => increaseQuantity(item)}>+</button>
                        <button class="edit-btn" on:click={() => openEditPopup(item)}>✏️</button>
                        <button class="remove-btn" on:click={() => removeItemFromFirestore(item.id)}>🗑️</button>
                    </div>
                </li>
            {/each}
        </ul>
        
        {#if loadingMore}
            <div class="loading-more">
                <span>Loading more items...</span>
            </div>
        {/if}
        
        {#if displayLimit < filteredItems.length}
            <div class="load-more-hint">
                <span>Scroll down to load more ({filteredItems.length - displayLimit} remaining)</span>
            </div>
        {/if}
    {:else}
        <p class="empty-message">No items logged yet. Use the form above to add your first item!</p>
    {/if}
</div>

<!-- Camera Popup -->
{#if showCameraPopup}
    <div class="popup-overlay">
        <div class="popup-content">
            <div class="camera-container">
                <h2>📸 Capture Food Item</h2>
                <video id="camera-video" autoplay playsinline></video>
                <div class="camera-buttons">
                    <button class="capture-btn" on:click={captureImage}>Capture</button>
                    <button class="cancel-btn" on:click={closeCamera}>Cancel</button>
                </div>
                {#if aiError}
                    <div class="ai-error">{aiError}</div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- AI Analysis Loading -->
{#if aiAnalyzing}
    <div class="popup-overlay">
        <div class="popup-content">
            <div class="loading-spinner">
                <p>🤖 Analyzing image with AI...</p>
                <p>Please wait...</p>
            </div>
        </div>
    </div>
{/if}

<!-- Edit Popup -->
{#if showEditPopup}
    <div class="popup-overlay">
        <div class="popup-content">
            <div class="edit-container">
                <h2>✏️ Edit Item</h2>
                
                <div class="edit-form">
                    <div class="form-group">
                        <label for="edit-item-name">Item Name</label>
                        <input id="edit-item-name" type="text" bind:value={editData.itemName}>
                    </div>

                    <div class="form-group">
                        <label for="edit-best-before">Best Before Date</label>
                        <input id="edit-best-before" type="date" bind:value={editData.bestBefore}>
                    </div>

                    <div class="form-group">
                        <label for="edit-quantity">Quantity</label>
                        <input id="edit-quantity" type="number" bind:value={editData.quantity} min="1">
                    </div>

                    <div class="form-group">
                        <label for="edit-type">Type</label>
                        <select id="edit-type" bind:value={editData.type}>
                            <option value="fridge">Fridge</option>
                            <option value="freezer">Freezer</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="edit-shared">Shared</label>
                        <input id="edit-shared" type="checkbox" bind:checked={editData.shared}>
                    </div>
                </div>

                <div class="edit-actions">
                    <button class="cancel-btn" on:click={closeEditPopup}>Cancel</button>
                    <button class="save-btn" on:click={saveEdit} disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Verification Popup -->
{#if showVerificationPopup}
    <div class="popup-overlay">
        <div class="popup-content">
            <div class="verification-container">
                <h2>✅ Verify AI Suggestions</h2>
                
                {#if capturedImageForAI}
                    <img class="preview-image" src={capturedImageForAI} alt="Captured item">
                {/if}

                <div class="verification-form">
                    <div class="form-group">
                        <label for="ai-item-name">Item Name</label>
                        <input id="ai-item-name" type="text" bind:value={aiSuggestedData.itemName}>
                    </div>

                    <div class="form-group">
                        <label for="ai-best-before">Best Before Date</label>
                        <input id="ai-best-before" type="date" bind:value={aiSuggestedData.bestBefore}>
                    </div>

                    <div class="form-group">
                        <label for="ai-quantity">Quantity</label>
                        <input id="ai-quantity" type="number" bind:value={aiSuggestedData.quantity} min="1">
                    </div>

                    <div class="form-group">
                        <label for="ai-type">Type</label>
                        <select id="ai-type" bind:value={aiSuggestedData.type}>
                            <option value="fridge">Fridge</option>
                            <option value="freezer">Freezer</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="ai-shared">Shared</label>
                        <input id="ai-shared" type="checkbox" bind:checked={aiSuggestedData.shared}>
                    </div>
                </div>

                {#if aiError}
                    <div class="ai-error">{aiError}</div>
                {/if}

                <div class="verification-actions">
                    <button class="cancel-btn" on:click={closeVerificationPopup}>Cancel</button>
                    <button class="submit-btn" on:click={submitAILog} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}