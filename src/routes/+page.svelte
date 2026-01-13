<script>
    import { onMount } from 'svelte';
    import { db } from '../firebase';
    import { doc, deleteDoc, collection, addDoc, onSnapshot, updateDoc } from 'firebase/firestore';
    import { uploadBytes } from "firebase/storage";

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

        return unsubscribe;
    });

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
</script>

<style>
    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f4f7f6;
        padding: 20px;
    }

    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 1em;
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
    }

    .item-card {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        padding: 15px;
        background-color: #ffffff;
        border-bottom: 1px solid #eee;
    }

    .item-image {
        width: 200px;
        height: 200px;
        object-fit: cover;
        border-radius: 4px;
        margin-right: 15px;
        flex-shrink: 0;
    }

    .item-details {
        flex-grow: 1;
    }

    .item-name {
        font-weight: 700;
        font-size: 1.1em;
        color: #1a1a1a;
        margin: 0;
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
    select {
        width: 100%;
        padding: 10px;
        margin: 8px 0;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 16px;
        background-color: #fff;
        color: #333;
    }

    select:focus {
        outline: none;
        border-color: #007BFF;
        box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
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

    /* Quantity input styles */
    .form-group input[type="number"] {
        width: 50%;
        padding: 10px;
        margin: 8px 0;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 16px;
        background-color: #fff;
        color: #333;
    }

    .form-group input[type="number"]:focus {
        outline: none;
        border-color: #007BFF;
        box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
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
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin: 20px 0;
    }

    .letter-btn {
        padding: 20px;
        font-size: 1.5em;
        font-weight: bold;
        background-color: #ffffff;
        border: 2px solid #495057;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        color: #212529;
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
    }

    .reset-btn:hover {
        background-color: #495057;
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


        <button type="submit">Log Item</button>
    </form>

    <hr>

    <h2>Filter Items</h2>
    <select bind:value={filterName}>
        <option value="">All</option>
        {#each Array.from(new Set(items.map(item => item.name))) as name}
            <option value={name}>{name}</option>
        {/each}
    </select>

    <h2>Logged Items ({items.length})</h2>

    {#if items.length > 0}
        <ul class="item-list">
            {#each items.filter(item => !filterName || item.name === filterName) as item (item.id)}
                <li class="item-card">
                    <img class="item-image" src={item.imageBase64} alt={item.itemName}>
                    
                    <div class="item-details">
                        <p class="item-name">{item.itemName}</p>
                        <p class="best-before">Best Before: {formatBestBefore(item.bestBefore)}</p>
                        <p class="logged-by">Logged by: {item.name}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Type: {item.type}</p>
                        <p>Shared: {item.shared ? 'Yes' : 'No'}</p>
                        <p>Age: {item.timeDelta}</p>
                    </div>
                    <button on:click={() => decreaseQuantity(item)}>-</button>
                    <button on:click={() => increaseQuantity(item)}>+</button>
                    <button on:click={() => removeItemFromFirestore(item.id)}>Remove</button>
                </li>
            {/each}
        </ul>
    {:else}
        <p class="empty-message">No items logged yet. Use the form above to add your first item!</p>
    {/if}
</div>