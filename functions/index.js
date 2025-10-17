// functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp();

/**
 * Cloud Function that triggers when a file is uploaded to the 'original' folder
 * in Firebase Storage, resizes it, and saves the optimized version to the 'optimized' folder.
 */
exports.generateThumbnail = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;
    const fileBucket = object.bucket;

    // Exit if this is not an image or it's already an optimized image
    if (!contentType.startsWith('image/') || filePath.startsWith('optimized/')) {
        return null;
    }

    // Get the file and the necessary services
    const bucket = admin.storage().bucket(fileBucket);
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const optimizedFilePath = `optimized/${fileName}`;

    // 1. Download the file locally
    await bucket.file(filePath).download({ destination: tempFilePath });

    // 2. Process the image using Sharp
    await sharp(tempFilePath)
        .resize(300, 300, { // 300x300 pixels max, covering the area
            fit: 'inside',
            withoutEnlargement: true 
        })
        .toFormat('jpeg', { // Convert to optimized JPEG and set quality
            quality: 80
        }) 
        .toFile(tempFilePath + '_optimized.jpeg'); 

    // 3. Upload the optimized file
    const [file] = await bucket.upload(tempFilePath + '_optimized.jpeg', {
        destination: optimizedFilePath,
        metadata: {
            contentType: 'image/jpeg',
            metadata: {
                originalName: fileName
            }
        }
    });

    // 4. Clean up the temporary files
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(tempFilePath + '_optimized.jpeg');

    console.log(`Optimized image uploaded to: ${optimizedFilePath}`);

    // Optional: Delete the original large file if you don't need it
    // await bucket.file(filePath).delete(); 

    return file;
});