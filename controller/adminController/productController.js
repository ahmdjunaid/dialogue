const productModel = require('../../models/productModel')
const brandModel = require('../../models/brandModel')
const categoryModel = require('../../models/categoryModel')
const userModel = require('../../models/userModel')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')


const loadAddProduct = async (req, res) => {

    try {

        const brand = await brandModel.find({ isListed: true, isDeleted: false })
        const category = await categoryModel.find({ isListed: true, isDeleted: false })


        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }

        res.render('admin/addproduct', { brand, category, message })

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const addProduct = async (req, res) => {

    try {
        const productData = req.body;

        const trimmedName = productData.productName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

        const productExist = await productModel.findOne({
            isDeleted:false,
            productName: { $regex: `^${trimmedName}$`, $options: 'i' },
        });

        if (productExist) {
            req.session.admMsg = 'Product already exists';
            return res.redirect('/admin/addproduct');
        }

        const newProduct = new productModel({
            productName: productData.productName.trim(),
            description: productData.productDescription,
            brand: productData.brandId,
            category: productData.categoryId,
            regularPrice: Number(productData.productAmount),
            salePrice: Number(productData.offerAmount),
            stock: Number(productData.stockCount),
            storage: productData.storage,
            ram: productData.ram,
            camera: productData.camera,
            cpu: productData.cpu,
            status: 'Available',
            productImage: []
        });

        let images = [];
        for (let i = 1; i <= 4; i++) {
            if (req.files[`image${i}`]) {
                images.push(req.files[`image${i}`][0].filename);
            }
        }

        // Ensure first index (0) is occupied by shifting images if necessary
        if (images.length > 0 && !images[0]) {
            images = images.filter(img => img); // Remove empty slots
        }

        newProduct.productImage = images;

        await newProduct.save();

        req.session.admMsg = 'Product added successfully';
        return res.redirect('/admin/addproduct');

    } catch (error) {
        console.error('Error adding product:', error);
        return res.redirect('/admin/loaderror');
    }
};

const loadProduct = async (req, res) => {

    try {

        let search = '';
        if (req.query.search) {
            search = req.query.search
        }

        const limit = 4
        const page = parseInt(req.query.page) || 1;


        const listedCategories = await categoryModel.find({ isListed: true }).select('_id');
        const listedBrands = await brandModel.find({ isListed: true }).select('_id');

        const totalProducts = await productModel.countDocuments({
            isDeleted: false,
            category: { $in: listedCategories.map(cat => cat._id) },
            brand: { $in: listedBrands.map(brand => brand._id) },
            productName: { $regex: ".*" + search + ".*", $options: "i" }
        });
        const totalPages = Math.ceil(totalProducts / limit)
        const skip = (page - 1) * limit

        

        const products = await productModel.find({
            isDeleted: false,
            category: { $in: listedCategories.map(cat => cat._id) },
            brand: { $in: listedBrands.map(brand => brand._id) },
            productName: { $regex: ".*" + search + ".*", $options: "i" }
        })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .skip(skip)
            .populate('category brand')

        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }
        res.render('admin/products', {
            products,
            message,
            currentPage: page,
            totalPages
        })

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const editProductPage = async (req, res) => {

    try {
        const productId = req.params.id;
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }

        const brand = await brandModel.find({ isListed: true, isDeleted: false });
        const category = await categoryModel.find({ isListed: true, isDeleted: false });

        res.render('admin/editproduct', { product, brand, category });

        
    } catch (error) {
        console.error('Error loading edit product page:', error);
        res.status(500).render('error', { message: 'Server error occurred while loading edit product page' });
    }
};

const updateProduct = async (req, res) => {

    try {
        const productId = req.params.id;
        const { productName, productDescription, brandId, categoryId, productAmount, offerAmount, stockCount, storage, ram, camera, cpu } = req.body;

        const trimmedName = productName.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

        const existing = await productModel.findOne({
            _id: { $ne: productId },
            productName: { $regex: `^${trimmedName}$`, $options: 'i' },
            isDeleted:false
        })



        if(existing){
            req.session.admMsg = 'Product already exist'
            return res.redirect('/admin/products')
        }

        const updatedData = {
            productName:trimmedName,
            description: productDescription,
            brand: brandId,
            category: categoryId,
            regularPrice: productAmount,
            salePrice: offerAmount || null,
            stock: stockCount,
            storage,
            ram,
            camera,
            cpu
        };

        const images = [];
        for (let i = 1; i <= 4; i++) {
            if (req.files[`image${i}`]) {
                images[i - 1] = req.files[`image${i}`][0].filename;
            }
        }


        const product = await productModel.findById(productId);

        if (images.length > 0) {
            images.forEach((image, index) => {
                if (image) {
                    product.productImage[index] = image;
                }
            });
            updatedData.productImage = product.productImage;
        }

        await productModel.findByIdAndUpdate(productId, updatedData, { new: true });

        req.session.admMsg = 'Product edited successfully'
        res.redirect('/admin/products');


    } catch (error) {
        console.error('Error updating product:', error);
        req.session.admMsg = 'Error updating product'
        return res.redirect('/admin/products');
    }
};

const removeProductImage = async (req, res) => {
    try {
        const productId = req.params.productId;
        const imageIndex = parseInt(req.params.imageIndex);

        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (imageIndex < 0 || imageIndex >= product.productImage.length) {
            return res.status(400).json({ success: false, message: 'Invalid image index' });
        }

        product.productImage.splice(imageIndex, 1);

        await product.save();

        res.json({ success: true, message: 'Image removed successfully', updatedImages: product.productImage });
    } catch (error) {
        console.error('Error removing product image:', error);
        res.status(500).json({ success: false, message: 'Server error occurred while removing image' });
    }
};

const deleteProduct = async (req, res) => {
    try {

        const id = req.body.id

        await productModel.findByIdAndUpdate({ _id: id }, { $set: { isDeleted: true } })

        req.session.admMsg = 'Product Deleted Successfully'
        res.redirect('/admin/products')
        return;

    } catch (error) {
        console.error(error);
        req.session.admMsg = 'An error occured while deleting'
        res.redirect('/admin/products')
    }
}


module.exports = {
    loadAddProduct,
    addProduct,
    loadProduct,
    editProductPage,
    updateProduct,
    removeProductImage,
    deleteProduct,
}