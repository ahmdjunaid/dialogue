const brandModel = require('../models/brandModel')

const brandInfo = async (req, res) => {
    try {

        if(!req.session.admin){
            res.redirect('/admin/login')
            return;
        }

        let search = '';
        if(req.query.search){
            search = req.query.search
        }
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const brandData = await brandModel.find({ 
            isDeleted: false,
            name:{$regex:  ".*" + search + ".*",$options: "i"}
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const totalBrands = await brandModel.countDocuments({
            isDeleted: false,
            name:{$regex:  ".*" + search + ".*",$options: "i"}
        })
        const totalPages = Math.ceil(totalBrands / limit)

        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }

        res.render('admin/brands', {
            brand: brandData,
            currentPage: page,
            totalPages: totalPages,
            totalBrands: totalBrands,
            message
        })


    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const addBrand = async (req, res) => {

    if(!req.session.admin){
        res.redirect('/admin/login')
        return;
    }

    let { categoryname, categorydescription, offer } = req.body

    const nameRegex = /^[a-zA-Z0-9\-_&/ ]+$/; // Allows letters, numbers, -, /, _, &, and spaces
    offer=parseFloat(offer)
    
    if (typeof offer !== 'number' || offer < 0 || offer > 100) {
        req.session.admMsg = 'Enter a valid offer percentage (0-100)';
        return res.redirect('/admin/brands');
    }
    
    if (!categoryname.trim() || !categorydescription.trim()) {
        req.session.admMsg = 'All fields are required';
        return res.redirect('/admin/brands');
    }
    
    if (!nameRegex.test(categoryname.trim())) {
        req.session.admMsg = 'Category name can only contain letters, numbers, and (- / _ &) symbols';
        return res.redirect('/admin/brands');
    }    


    try {
        const existingBrand = await brandModel.findOne({ name:categoryname.trim() })
        
        if (existingBrand) {
            if (existingBrand.isDeleted == true) {
                await brandModel.findOneAndUpdate({ name: categoryname }, { $set: { description: categorydescription, brandOffer: offer, isDeleted:false } })
                req.session.admMsg = 'Brand added successfully'
                return res.redirect('/admin/brands')
            }
            req.session.admMsg = 'Brand already exist'
            return res.redirect('/admin/brands')
        }

        const newBrand = new brandModel({
            name: categoryname,
            description: categorydescription,
            brandOffer: offer
        })


        await newBrand.save()
        req.session.admMsg = 'Brand added successfully'
        return res.redirect('/admin/brands')

    } catch (error) {
        console.error(error)
        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/brands')
    }

}

const listBrand = async (req, res) => {
    try {

        if(!req.session.admin){
            res.redirect('/admin/login')
            return;
        }

        let id = req.query.id;

        await brandModel.findOneAndUpdate({ _id: id }, { $set: { isListed: true } })
        res.redirect('/admin/brands')
        return;
    } catch (error) {
        res.redirect('/admin/loaderror')
    }
}

const unlistBrand = async (req, res) => {
    try {

        if(!req.session.admin){
            res.redirect('/admin/login')
            return;
        }

        let id = req.query.id;

        await brandModel.findOneAndUpdate({ _id: id }, { $set: { isListed: false } })
        return res.redirect('/admin/brands')
        
    } catch (error) {
        res.redirect('/admin/loaderror')
    }
}

const editBrand = async (req, res) => {

    try {

        let { categoryname, catdescription, offer, id } = req.body

        if(!req.session.admin){
            res.redirect('/admin/login')
            return;
        }

        const nameRegex = /^[a-zA-Z0-9\-_&/ ]+$/; // Allows letters, numbers, -, /, _, &, and spaces
        offer=parseFloat(offer)
        
        if (typeof offer !== 'number' || offer < 0 || offer > 100) {
            req.session.admMsg = 'Enter a valid offer percentage (0-100)';
            return res.redirect('/admin/brands');
        }
        
        if (!categoryname.trim() || !catdescription.trim()) {
            req.session.admMsg = 'All fields are required';
            return res.redirect('/admin/brands');
        }
        
        if (!nameRegex.test(categoryname.trim())) {
            req.session.admMsg = 'Category name can only contain letters, numbers, and (- / _ &) symbols';
            return res.redirect('/admin/brands');
        }
    
        const existingBrand = await brandModel.findOne({name:categoryname.trim(),isDeleted:false})
    
        if(existingBrand){
            req.session.admMsg = 'Brand already exist!'
            return res.redirect('/admin/brands')
        }
    
        await brandModel.findOneAndUpdate({ _id: id }, { $set: { name: categoryname, description: catdescription, brandOffer: offer } })
    
        req.session.admMsg = 'Brand edited successfully'
        return res.redirect('/admin/brands')

    } catch (error) {
        console.error(error)

        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/brands')
    }

}

const deleteBrand = async (req, res) => {

    try {

        if(!req.session.admin){
            res.redirect('/admin/login')
            return;
        }
    
        const { id } = req.body
    
        await brandModel.findOneAndUpdate({ _id: id }, { $set: { isDeleted: true } })
    
        req.session.admMsg = 'Brand deleted successfully'
        return res.redirect('/admin/brands')
        
    } catch (error) {
        console.error(error)

        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/brands')
    }

}


module.exports = {
    brandInfo,
    addBrand,
    listBrand,
    unlistBrand,
    editBrand,
    deleteBrand
}






