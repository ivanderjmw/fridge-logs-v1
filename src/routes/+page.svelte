<script>
    import { onMount } from 'svelte';
    import { db } from '../firebase';
    import { doc, deleteDoc, collection, addDoc, onSnapshot, updateDoc } from 'firebase/firestore';

    let items = [];
    let loggerName = '';
    let itemName = '';
    let bestBefore = '';
    let imageURL = '';
    let quantity = 1; // New field
    let type = 'fridge'; // New field
    let shared = false; // New field
    let isSubmitting = false;

    let filterName = ''; // For dropdown filter

    async function logItemToFirestore(newItem) {
        if (isSubmitting) return;
        isSubmitting = true;

        try {
            const { id, ...dataToSave } = newItem;
            const docRef = await addDoc(collection(db, "items"), {
                ...dataToSave,
                createdAt: new Date().toISOString()
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
            console.error('Error updating quantity:', error);
        }
    }

    onMount(() => {
        const unsubscribe = onSnapshot(collection(db, "items"), (snapshot) => {
            items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        });
        return unsubscribe;
    });

    function handleSubmit() {
        if (!loggerName || !itemName || !bestBefore || isSubmitting) {
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
            imageURL: imageURL || 'https://via.placeholder.com/50x50?text=❓',
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
        width: 50px;
        height: 50px;
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
</style>

<div class="container">
    <h1>📦 Fridge & Pantry Logger</h1>

    <form class="item-form" on:submit|preventDefault={handleSubmit}>
        <h2>Log a New Item</h2>

        <div class="form-group">
            <label for="logger-name">Your Name</label>
            <input id="logger-name" type="text" bind:value={loggerName} placeholder="E.g., John" required>
        </div>

        <div class="form-group">
            <label for="item-name">Item Name</label>
            <input id="item-name" type="text" bind:value={itemName} placeholder="E.g., Organic Bananas" required>
        </div>

        <div class="form-group">
            <label for="best-before">Best Before Date</label>
            <input id="best-before" type="date" bind:value={bestBefore} required>
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
                    <img class="item-image" src={item.imageURL} alt={item.itemName}>
                    
                    <div class="item-details">
                        <p class="item-name">{item.itemName}</p>
                        <p class="best-before">Best Before: {formatBestBefore(item.bestBefore)}</p>
                        <p class="logged-by">Logged by: {item.name}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Type: {item.type}</p>
                        <p>Shared: {item.shared ? 'Yes' : 'No'}</p>
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