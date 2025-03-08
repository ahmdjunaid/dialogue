const userModel = require('../models/userModel')

const customerInfo = async (req,res)=>{

    if(!req.session.admin){
        res.redirect('/admin/login')
        return;
    }

    try {

        let search = ''
        if(req.query.search){
            search = req.query.search;
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = 5

        const userData = await userModel.find({
            isAdmin:false,
            $or: [
                {username:{$regex:  ".*" + search + ".*",$options: "i"}},
                {email:{$regex:  ".*" + search + ".*",$options: "i"}},
            ]
        })
        .sort({ createdOn: -1 })
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec()

        const count = await userModel.find({
            isAdmin:false,
            $or: [
                {username:{$regex:  ".*" + search + ".*",$options: "i"}},
                {email:{$regex:  ".*" + search + ".*",$options: "i"}},
            ]
        }).countDocuments()

        res.render('admin/customers',{
            data:userData,
            totalPages:Math.ceil(count/limit),
            currentPage:page,
        })
        
    } catch (error) {
        res.status(500).send('Internal server error')
        console.error(error)
    }
}

const blockUser = async (req,res)=>{

    if(!req.session.admin){
        res.redirect('/admin/login')
        return;
    }


    try {
        let id = req.query.id;
        
        await userModel.findOneAndUpdate({_id:id},{$set:{isBlocked:true}})
        res.redirect('/admin/users')
        return;
    } catch (error) {
        res.redirect('/admin/loaderror')
    }
}

const unblockUser = async (req,res)=>{

    if(!req.session.admin){
        res.redirect('/admin/login')
        return;
    }


    try {
        let id = req.query.id;
        
        await userModel.findOneAndUpdate({_id:id},{$set:{isBlocked:false}})
        res.redirect('/admin/users')
        return;
    } catch (error) {
        res.redirect('/admin/loaderror')
    }
}


module.exports = {
    customerInfo,
    blockUser,
    unblockUser
}