const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const photoStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'aglas/photos',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 200, height: 200, crop: 'fill' }]
    }
});

const materialStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        return {
            folder: 'aglas/materials',
            allowed_formats: ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'zip'],
            resource_type: 'raw',
            public_id: Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')
        };
    }
});

const uploadPhoto = multer({
    storage: photoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadMaterial = multer({
    storage: materialStorage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = { cloudinary, uploadPhoto, uploadMaterial };