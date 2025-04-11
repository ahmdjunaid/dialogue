const categoryModel = require('../../models/categoryModel')



const loadCategory = async (req, res) => {
    try {

        let search = '';
        if (req.query.search) {
            search = req.query.search;
        }


        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await categoryModel.find({
            isDeleted: false,
            name: { $regex: ".*" + search + ".*", $options: "i" }
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)

        const totalCategories = await categoryModel.countDocuments({
            isDeleted: false,
            name: { $regex: ".*" + search + ".*", $options: "i" }
        })
        const totalPages = Math.ceil(totalCategories / limit)

        let message;
        if (req.session.admMsg) {
            message = req.session.admMsg
            req.session.admMsg = null
        }

        res.render('admin/category', {
            category: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategory: totalCategories,
            message
        })


    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const addCategory = async (req, res) => {


    try {

        let { categoryname, categorydescription } = req.body

        const nameRegex = /^[a-zA-Z0-9\-_&/ ]+$/; // Allows letters, numbers, -, /, _, &, and spaces

        if (!categoryname.trim() || !categorydescription.trim()) {
            req.session.admMsg = 'All fields are required';
            return res.redirect('/admin/category');
        }

        if (!nameRegex.test(categoryname.trim())) {
            req.session.admMsg = 'Category name can only contain letters, numbers, and (- / _ &) symbols';
            return res.redirect('/admin/category');
        }


        const existingBrand = await categoryModel.findOne({ name: categoryname.trim() })

        if (existingBrand) {
            if (existingBrand.isDeleted == true) {
                await categoryModel.findOneAndUpdate({ name: categoryname }, { $set: { description: categorydescription, isDeleted: false } })
                req.session.admMsg = 'Category added successfully'
                return res.redirect('/admin/category')
            }
            req.session.admMsg = 'Category already exist'
            return res.redirect('/admin/category')
        }

        const newBrand = new categoryModel({
            name: categoryname.trim(),
            description: categorydescription.trim()
        })


        await newBrand.save()
        req.session.admMsg = 'Category added successfully'
        return res.redirect('/admin/category')

    } catch (error) {
        console.error(error)
        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/category')
    }
}

const editCategory = async (req, res) => {

    try {

        let { categoryname, catdescription, id } = req.body


        const nameRegex = /^[a-zA-Z0-9\-_&/ ]+$/; // Allows letters, numbers, -, /, _, &, and spaces

        if (!categoryname.trim() || !catdescription.trim()) {
            req.session.admMsg = 'All fields are required';
            return res.redirect('/admin/category');
        }

        if (!nameRegex.test(categoryname.trim())) {
            req.session.admMsg = 'Category name can only contain letters, numbers, and (- / _ &) symbols';
            return res.redirect('/admin/category');
        }

        const existingCategory = await categoryModel.findOne({
            _id: { $ne: id },
            name: categoryname.trim(),
            isDeleted: false
          });
          

        if (existingCategory) {
            req.session.admMsg = 'Category already exist!'
            return res.redirect('/admin/category')
        }

        await categoryModel.findOneAndUpdate({ _id: id }, { $set: { name: categoryname, description: catdescription} })

        req.session.admMsg = 'Category edited successfully'
        res.redirect('/admin/category')


    } catch (error) {
        console.error(error)

        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/category')
    }
}

const deleteCategory = async (req, res) => {
    try {

        const { id } = req.body

        await categoryModel.findOneAndUpdate({ _id: id }, { $set: { isDeleted: true } })

        req.session.admMsg = 'Category deleted successfully'
        return res.redirect('/admin/category')

    } catch (error) {
        req.session.admMsg = 'Internal server error'
        return res.redirect('/admin/category')
    }

}

const listCategory = async (req, res) => {

    try {

        let id = req.query.id;

        await categoryModel.findOneAndUpdate({ _id: id }, { $set: { isListed: true } })

        return res.redirect('/admin/category')

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}

const unlistCategory = async (req, res) => {

    try {

        let id = req.query.id;

        await categoryModel.findOneAndUpdate({ _id: id }, { $set: { isListed: false } })
        return res.redirect('/admin/category')

    } catch (error) {
        console.error(error)
        res.redirect('/admin/loaderror')
    }
}


module.exports = {
    loadCategory,
    addCategory,
    editCategory,
    deleteCategory,
    listCategory,
    unlistCategory
}



