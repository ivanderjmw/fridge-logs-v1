// svelte.config.js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        // Use the static adapter for hosting environments like Firebase
        adapter: adapter({
            // The fallback page for single-page applications (SPA). 
            // This is crucial for Firebase Hosting's rewrite rules.
            fallback: 'index.html'
        }),
        
        // 🔑 DISABLE SSR: Force all pages to be static HTML
        prerender: {
        },
        
        // 🔑 DISABLE SSR for the entire app if necessary
        // You might need to add this if using dynamic server-side features.
        // If set to false, it generates the client-side code only.
        // If not set, it defaults to true.
        // This is often not necessary if you are strictly using the static adapter
        // and have no server endpoints, but is a common setting for SPA mode:
        // ssr: false 
    }
};

export default config;